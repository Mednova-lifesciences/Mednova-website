// api/course.js
// Vercel function backing the Pharmacovigilance CE course (/pharmacovigilance-ce-course).
// Stores learner results in the mednova-website Supabase project via the service role key,
// which never leaves the server. Quizzes are graded here and certificates are issued here
// (by the issue_course_certificate database function); the browser only submits answers.
//
// Each browser holds a random device token. The first device to sign in with an email owns the
// record; any other device joins by entering a 6-digit code emailed to that address.
//
//   POST /api/course?action=sync               create or load the learner record
//   POST /api/course?action=send-code          email a sign-in code to a registered address
//   POST /api/course?action=verify-code        add this device to the learner record
//   POST /api/course?action=submit             grade one knowledge check or the final assessment
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

const MAX_DEVICES = 10;
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

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

// Loads the learner record for a signed-in device, creating it on the very first sign-in.
// A device the record doesn't know gets a 409 telling the page to ask for an emailed code.
async function loadLearner(body) {
  const { email, name, tokenHash } = readIdentity(body);
  const row = await findLearner(email);
  if (!row) {
    const [created] = await db('course_learners', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ course: COURSE, email, name, token_hashes: [tokenHash], modules_total: KEY.modules, results: {} }),
    });
    return created;
  }
  if (!row.token_hashes.some(h => safeEqual(h, tokenHash))) {
    throw new HttpError(409, 'This email is already registered for the course. Confirm it is you with a code sent to your email.', { needsCode: true });
  }
  // The name can be corrected until the certificate is issued; after that it is fixed.
  if (row.name !== name && !row.earned_at) {
    await patchLearner(email, { name });
    row.name = name;
  }
  return row;
}

async function sync(req, res) {
  return res.status(200).json(publicState(await loadLearner(req.body)));
}

const maskEmail = e => e.replace(/^(.)(.*)(@.*)$/, (_, a, mid, d) => a + '*'.repeat(Math.min(mid.length, 6)) + d);

async function sendCode(req, res) {
  const { email } = readIdentity(req.body);
  const row = await findLearner(email);
  if (!row) throw new HttpError(404, 'No course record for this email yet. Sign in to start the course.');
  if (row.login_code_sent_at && Date.now() - new Date(row.login_code_sent_at) < CODE_RESEND_MS) {
    throw new HttpError(429, 'A code was sent less than a minute ago. Check your inbox, or wait a minute to send another.');
  }
  if (!RESEND_API_KEY || !FROM_EMAIL) throw new Error('Email is not configured (RESEND_API_KEY / FROM_EMAIL).');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = new Date();
  await patchLearner(email, {
    login_code_hash: sha256(`${email}|${code}`), login_code_attempts: 0,
    login_code_sent_at: now.toISOString(), login_code_expires_at: new Date(+now + CODE_TTL_MS).toISOString(),
  });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `MedNova Lifesciences <${FROM_EMAIL}>`,
      to: [email],
      subject: `${code} is your Pharmacovigilance CE course code`,
      text: `Your sign-in code for the MedNova Pharmacovigilance CE Course is ${code}.\n\nEnter it on the course page to continue on this device. The code expires in 15 minutes.\n\nIf you didn't try to sign in, you can ignore this email.\n\nMedNova Lifesciences\nhttps://mednovalife.com/pharmacovigilance-ce-course`,
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142229"><p>Your sign-in code for the MedNova Pharmacovigilance CE Course is:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p><p>Enter it on the course page to continue on this device. The code expires in 15 minutes.</p><p style="color:#546770">If you didn't try to sign in, you can ignore this email.</p><p>MedNova Lifesciences<br><a href="https://mednovalife.com/pharmacovigilance-ce-course">mednovalife.com/pharmacovigilance-ce-course</a></p></div>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return res.status(200).json({ sent: true, to: maskEmail(email) });
}

async function verifyCode(req, res) {
  const { email, name, tokenHash } = readIdentity(req.body);
  const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
  const row = await findLearner(email);
  if (!row || !row.login_code_hash || new Date(row.login_code_expires_at) < new Date()) {
    throw new HttpError(400, 'That code has expired. Send a new code.', { expired: true });
  }
  if (row.login_code_attempts >= CODE_MAX_ATTEMPTS) {
    throw new HttpError(400, 'Too many incorrect attempts. Send a new code.', { expired: true });
  }
  if (code.length !== 6 || !safeEqual(sha256(`${email}|${code}`), row.login_code_hash)) {
    await patchLearner(email, { login_code_attempts: row.login_code_attempts + 1 });
    throw new HttpError(400, 'That code is not correct. Check the email and try again.');
  }
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

async function submit(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const quizKey = String(b.quiz || '');
  const { score, total } = grade(quizKey, b.answers);
  const row = await loadLearner(b);

  const results = { ...(row.results || {}) };
  if (quizKey === 'final') {
    const pct = Math.round(score / total * 100);
    results.final = { best: Math.max(pct, results.final ? results.final.best : 0), last: pct };
  } else {
    results[quizKey] = { score };
  }
  const update = {
    results,
    modules_done: Object.keys(results).filter(k => /^m\d+$/.test(k)).length,
    modules_total: KEY.modules,
    final_best: results.final ? results.final.best : null,
  };
  await patchLearner(row.email, update);
  let state = { ...row, ...update };
  // Issue the certificate the first time both requirements are met. Number, date, printed name
  // and score are fixed from then on.
  if (!row.earned_at && update.modules_done === KEY.modules && update.final_best >= KEY.passMark) {
    const [cert] = await db('rpc/issue_course_certificate', { method: 'POST', body: JSON.stringify({ p_id: row.id }) });
    state = { ...state, ...cert };
  }
  return res.status(200).json({ score, total, ...publicState(state) });
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
  const rows = await db(`course_learners?course=eq.${COURSE}&select=name,email,modules_done,modules_total,final_best,earned_at,cert_id,cert_name,updated_at&order=updated_at.desc&limit=1000`);
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
