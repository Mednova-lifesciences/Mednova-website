// api/course.js
// Vercel function backing the Pharmacovigilance CE course (/pharmacovigilance-ce-course).
// Stores learner results in the mednova-website Supabase project via the service role key,
// which never leaves the server. Quizzes are graded here and certificates are issued here
// (by the issue_course_certificate database function); the browser only submits answers.
//
// Each browser holds a random device token. Every device, the first one included, joins the learner
// record by entering a 6-digit code emailed to that address, so every record's email is confirmed.
//
//   POST /api/course?action=sync               load the learner record for a confirmed device
//   POST /api/course?action=send-code          email a sign-in code (starts the record on first sign-in)
//   POST /api/course?action=verify-code        confirm the email and add this device to the record
//   POST /api/course?action=submit             grade one knowledge check or the final assessment
//                                              (pass marks, unlock order and the final assessment wait apply)
//   GET  /api/course?action=verify&id=PVCE-…   public certificate check (name, date, score)
//   GET  /api/course?action=register           completion register (Authorization: Bearer COURSE_ADMIN_KEY)

const crypto = require('crypto');
const KEY = require('./course-key.json');

const COURSE = 'pv-ce';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_KEY = process.env.COURSE_ADMIN_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || '';
const NOTIFY_EMAIL = process.env.COURSE_NOTIFY_EMAIL || '';

const MAX_DEVICES = 10;
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_MAX_SENDS = 10;
const CODE_WINDOW_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CERT_RE = /^PVCE-\d{4}-\d{5,}-[A-Z2-9]{4}$/;

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

async function db(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const learnerFilter = email => `course=eq.${COURSE}&email=eq.${encodeURIComponent(email)}`;
const patchLearner = (email, fields) => db(`course_learners?${learnerFilter(email)}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
});

function publicState(row) {
  return {
    name: row.name, results: row.results || {},
    modulesDone: row.modules_done, modulesTotal: row.modules_total, finalBest: row.final_best,
    earnedAt: row.earned_at, certId: row.cert_id, certName: row.cert_name, certFinalScore: row.cert_final_score,
  };
}

function readIdentity(body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const token = String(b.token || '');
  if (!EMAIL_RE.test(email) || email.length > 120 || name.length < 3 || name.length > 80 ||
      token.length < 32 || token.length > 128) {
    throw new HttpError(400, 'Invalid learner details.');
  }
  return { email, name, tokenHash: sha256(token) };
}

const findLearner = async email => (await db(`course_learners?${learnerFilter(email)}&select=*`))[0] || null;

// Loads the learner record for a signed-in device. Every device, including the first one for an
// email, must be confirmed with a code sent to that email: an unknown device gets a 409 telling the
// page to ask for the code, and newLearner says whether the email has a confirmed record yet.
async function loadLearner(body) {
  const { email, name, tokenHash } = readIdentity(body);
  const row = await findLearner(email);
  if (!row || !row.token_hashes.some(h => safeEqual(h, tokenHash))) {
    const newLearner = !row || !row.token_hashes.length;
    throw new HttpError(409, newLearner
      ? 'Confirm your email address with the code we send you to start the course.'
      : 'This email is already registered for the course. Confirm it is you with a code sent to your email.',
    { needsCode: true, newLearner });
  }
  // The name can be corrected until the certificate is issued; after that it is fixed.
  if (row.name !== name && !row.earned_at) {
    const [updated] = await db(`course_learners?${learnerFilter(email)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
    });
    return updated;
  }
  return row;
}

async function sync(req, res) {
  return res.status(200).json(publicState(await loadLearner(req.body)));
}

const maskEmail = e => e.replace(/^(.)(.*)(@.*)$/, (_, a, mid, d) => a + '*'.repeat(Math.min(mid.length, 6)) + d);

async function sendCode(req, res) {
  const { email, name } = readIdentity(req.body);
  // A first sign-in gets an unconfirmed record (no devices) that holds the code; verify-code confirms it.
  await db('course_learners?on_conflict=course,email', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ course: COURSE, email, name, token_hashes: [], modules_total: KEY.modules, results: {} }),
  });
  const row = await findLearner(email);
  if (row.login_code_sent_at && Date.now() - new Date(row.login_code_sent_at) < CODE_RESEND_MS) {
    throw new HttpError(429, 'A code was sent less than a minute ago. Check your inbox, or wait a minute to send another.');
  }
  const now = new Date();
  const windowOpen = row.login_code_window_start && now - new Date(row.login_code_window_start) < CODE_WINDOW_MS;
  if (windowOpen && row.login_code_sends >= CODE_MAX_SENDS) {
    throw new HttpError(429, 'Too many codes have been sent to this email today. Try again tomorrow, or contact info@mednovalife.com.');
  }
  if (!RESEND_API_KEY || !FROM_EMAIL) throw new Error('Email is not configured (RESEND_API_KEY / FROM_EMAIL).');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await patchLearner(email, {
    login_code_hash: sha256(`${email}|${code}`), login_code_attempts: 0,
    login_code_sent_at: now.toISOString(), login_code_expires_at: new Date(+now + CODE_TTL_MS).toISOString(),
    login_code_window_start: windowOpen ? row.login_code_window_start : now.toISOString(),
    login_code_sends: windowOpen ? row.login_code_sends + 1 : 1,
  });
  await sendEmail({
    to: [email],
    subject: `${code} is your Pharmacovigilance CE course code`,
    text: `Your sign-in code for the MedNova Pharmacovigilance CE Course is ${code}.\n\nEnter it on the course page to continue on this device. The code expires in 15 minutes.\n\nIf you didn't try to sign in, you can ignore this email.\n\nMedNova Lifesciences\nhttps://mednovalife.com/pharmacovigilance-ce-course`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142229"><p>Your sign-in code for the MedNova Pharmacovigilance CE Course is:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p><p>Enter it on the course page to continue on this device. The code expires in 15 minutes.</p><p style="color:#546770">If you didn't try to sign in, you can ignore this email.</p><p>MedNova Lifesciences<br><a href="https://mednovalife.com/pharmacovigilance-ce-course">mednovalife.com/pharmacovigilance-ce-course</a></p></div>`,
  });
  return res.status(200).json({ sent: true, to: maskEmail(email) });
}

async function verifyCode(req, res) {
  const { email, name, tokenHash } = readIdentity(req.body);
  const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
  // Each check atomically uses up one attempt first, so parallel guesses can't exceed the limit.
  const codeHash = await db('rpc/claim_course_code_attempt', {
    method: 'POST',
    body: JSON.stringify({ p_course: COURSE, p_email: email, p_max_attempts: CODE_MAX_ATTEMPTS }),
  });
  if (!codeHash) {
    throw new HttpError(400, 'That code has expired or had too many incorrect attempts. Send a new code.', { expired: true });
  }
  if (code.length !== 6 || !safeEqual(sha256(`${email}|${code}`), codeHash)) {
    throw new HttpError(400, 'That code is not correct. Check the email and try again.');
  }
  const row = await findLearner(email);
  const tokens = row.token_hashes.filter(h => h !== tokenHash).concat(tokenHash).slice(-MAX_DEVICES);
  const fields = { token_hashes: tokens, login_code_hash: null, login_code_expires_at: null, login_code_attempts: 0 };
  if (!row.earned_at) fields.name = name;
  await patchLearner(email, fields);
  return res.status(200).json(publicState({ ...row, ...fields }));
}

function grade(quizKey, answers) {
  const quiz = KEY.quizzes[quizKey];
  if (!quiz || !answers || typeof answers !== 'object') throw new HttpError(400, 'Unknown quiz.');
  let score = 0;
  for (const q of quiz) {
    const text = answers[q.id];
    if (typeof text !== 'string' || text.length > 1000) throw new HttpError(400, 'Answer every question.');
    if (sha256(`${KEY.salt}|${q.id}|${text}`) === q.h) score++;
  }
  return { score, total: quiz.length };
}

// A knowledge check is passed at MODULE_PASS_PCT, and modules unlock in order. The final assessment
// unlocks once every module is passed, and a failed attempt locks it for FINAL_WAIT_MS.
const MODULE_PASS_PCT = 60;
const FINAL_WAIT_MS = 24 * 60 * 60 * 1000;
const passScore = quizKey => Math.ceil(KEY.quizzes[quizKey].length * MODULE_PASS_PCT / 100);
const modulePassed = (results, i) => !!(results[`m${i}`] && results[`m${i}`].score >= passScore(`m${i}`));
const passedCount = results => Array.from({ length: KEY.modules }, (_, i) => modulePassed(results, i)).filter(Boolean).length;

async function submit(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const quizKey = String(b.quiz || '');
  const { score, total } = grade(quizKey, b.answers);
  const row = await loadLearner(b);
  const refuse = (status, message) => { throw new HttpError(status, message, { state: publicState(row) }); };

  const results = { ...(row.results || {}) };
  if (quizKey === 'final') {
    const prev = results.final;
    if (passedCount(results) < KEY.modules) refuse(403, `Pass all ${KEY.modules} knowledge checks to unlock the final assessment.`);
    if (prev && prev.best >= KEY.passMark) refuse(400, 'You have already passed the final assessment.');
    if (prev && prev.retryAt && new Date(prev.retryAt) > new Date()) {
      refuse(429, `You can retake the final assessment from ${fmtDate(prev.retryAt)}.`);
    }
    const pct = Math.round(score / total * 100);
    results.final = { best: Math.max(pct, prev ? prev.best : 0), last: pct, lastAt: new Date().toISOString() };
    if (pct < KEY.passMark) results.final.retryAt = new Date(Date.now() + FINAL_WAIT_MS).toISOString();
  } else {
    const i = Number(quizKey.slice(1));
    for (let j = 0; j < i; j++) {
      if (!modulePassed(results, j)) refuse(403, `Pass the Module ${j + 1} knowledge check to unlock this module.`);
    }
    // The best score counts, so a weaker retake never un-passes a module.
    const prev = results[quizKey];
    results[quizKey] = { score: Math.max(score, prev ? prev.score : 0), last: score };
  }
  const update = {
    results,
    modules_done: passedCount(results),
    modules_total: KEY.modules,
    final_best: results.final ? results.final.best : null,
  };
  // Only save over the version we read, so two submissions at once can't skip the final assessment wait.
  const saved = await db(`course_learners?${learnerFilter(row.email)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...update, updated_at: new Date().toISOString() }),
  });
  if (!saved.length) throw new HttpError(503, 'Another submission was being saved at the same time. Try again.');
  let state = saved[0];
  // Issue the certificate the first time both requirements are met. Number, date, printed name
  // and score are fixed from then on.
  let issuedNow = false;
  if (!row.earned_at && update.modules_done === KEY.modules && update.final_best >= KEY.passMark) {
    const [cert] = await db('rpc/issue_course_certificate', { method: 'POST', body: JSON.stringify({ p_id: row.id }) });
    state = { ...state, ...cert };
    issuedNow = true;
    await sendCertificateEmails(state);
  }
  return res.status(200).json({ score, total, issuedNow, ...publicState(state) });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos', timeZoneName: 'short',
}).format(new Date(iso));

async function sendEmail(message) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `MedNova Lifesciences <${FROM_EMAIL}>`, ...message }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// The certificate is already issued and saved; an email failure is logged, never surfaced.
async function sendCertificateEmails(s) {
  if (!RESEND_API_KEY || !FROM_EMAIL) return;
  const when = fmtDate(s.earned_at);
  const verifyUrl = 'https://mednovalife.com/pharmacovigilance-ce-course#verify';
  const courseUrl = 'https://mednovalife.com/pharmacovigilance-ce-course#certificate';
  const jobs = [sendEmail({
    to: [s.email],
    subject: `Your certificate of completion: ${s.cert_id}`,
    text: `Congratulations, ${s.cert_name}.\n\nYou have completed the MedNova Pharmacovigilance Continuing Education Course Series.\n\nCertificate number: ${s.cert_id}\nCompleted: ${when}\nFinal assessment score: ${s.cert_final_score}%\n\nDownload or print your certificate: ${courseUrl}\n(Sign in with this email address. On a new device we'll email you a code.)\n\nAnyone can confirm your certificate is genuine by entering its number at ${verifyUrl}\n\nMedNova Lifesciences`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142229;max-width:560px"><p>Congratulations, ${esc(s.cert_name)}.</p><p>You have completed the <strong>MedNova Pharmacovigilance Continuing Education Course Series</strong>.</p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:4px 16px 4px 0;color:#546770">Certificate number</td><td style="padding:4px 0;font-family:monospace;font-size:17px"><strong>${esc(s.cert_id)}</strong></td></tr><tr><td style="padding:4px 16px 4px 0;color:#546770">Completed</td><td style="padding:4px 0">${esc(when)}</td></tr><tr><td style="padding:4px 16px 4px 0;color:#546770">Final assessment</td><td style="padding:4px 0">${esc(s.cert_final_score)}%</td></tr></table><p><a href="${courseUrl}" style="display:inline-block;background:#1d5f86;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Download your certificate</a></p><p style="color:#546770;font-size:14px">Sign in with this email address. On a new device we'll email you a code.</p><p>Anyone can confirm your certificate is genuine by entering its number at <a href="${verifyUrl}">mednovalife.com/pharmacovigilance-ce-course#verify</a>.</p><p>MedNova Lifesciences</p></div>`,
  })];
  if (NOTIFY_EMAIL) {
    jobs.push(sendEmail({
      to: [NOTIFY_EMAIL],
      subject: `PV CE certificate issued: ${s.cert_name} (${s.cert_id})`,
      text: `A Pharmacovigilance CE course certificate was issued.\n\nName: ${s.cert_name}\nEmail: ${s.email}\nCertificate number: ${s.cert_id}\nCompleted: ${when}\nFinal assessment score: ${s.cert_final_score}%\n\nFull register: https://mednovalife.com/pharmacovigilance-ce-course#register`,
    }));
  }
  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === 'rejected') console.error('[course] certificate email failed:', r.reason && r.reason.message);
  }
}

async function verify(req, res) {
  const id = String(req.query.id || '').trim().toUpperCase();
  if (!CERT_RE.test(id)) return res.status(400).json({ error: 'Enter the certificate number exactly as printed, for example PVCE-2026-00001-K7QM.' });
  const [row] = await db(`course_learners?course=eq.${COURSE}&cert_id=eq.${encodeURIComponent(id)}&select=cert_id,cert_name,earned_at,cert_final_score`);
  if (!row) return res.status(404).json({ valid: false });
  return res.status(200).json({
    valid: true, certId: row.cert_id, name: row.cert_name, earnedAt: row.earned_at,
    finalScore: row.cert_final_score, course: 'Pharmacovigilance Continuing Education Course Series',
  });
}

async function register(req, res) {
  const auth = String(req.headers.authorization || '');
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!ADMIN_KEY || !key || !safeEqual(sha256(key), sha256(ADMIN_KEY))) {
    return res.status(401).json({ error: 'Incorrect administrator key.' });
  }
  // Only confirmed learners (at least one confirmed device); unconfirmed sign-ups are left out.
  const rows = await db(`course_learners?course=eq.${COURSE}&token_hashes=neq.{}&select=name,email,modules_done,modules_total,final_best,earned_at,cert_id,cert_name,updated_at&order=updated_at.desc&limit=1000`);
  return res.status(200).json({
    learners: rows.map(r => ({
      name: r.cert_name || r.name, email: r.email, modulesDone: r.modules_done, modulesTotal: r.modules_total,
      finalBest: r.final_best, earnedAt: r.earned_at, certId: r.cert_id, updatedAt: r.updated_at,
    })),
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'Course storage is not configured.' });
  const action = String(req.query.action || '');
  try {
    if (req.method === 'POST' && action === 'sync') return await sync(req, res);
    if (req.method === 'POST' && action === 'send-code') return await sendCode(req, res);
    if (req.method === 'POST' && action === 'verify-code') return await verifyCode(req, res);
    if (req.method === 'POST' && action === 'submit') return await submit(req, res);
    if (req.method === 'GET' && action === 'verify') return await verify(req, res);
    if (req.method === 'GET' && action === 'register') return await register(req, res);
    return res.status(404).json({ error: 'Not found.' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    console.error('[course]', err.message);
    return res.status(500).json({ error: 'Course storage is unavailable. Try again shortly.' });
  }
};
