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
//   POST /api/course?action=content            module content, or the final assessment questions, for this learner
//   POST /api/course?action=checkout           start a Paystack payment; returns the checkout URL
//   POST /api/course?action=confirm-payment    check a returned payment with Paystack and unlock the course
//   POST /api/course?action=redeem             unlock the course with a partner code
//   POST /api/course?action=paystack-webhook   Paystack event (re-checked with Paystack before anything changes)
//   GET  /api/course?action=verify&id=PVCE-…   public certificate check (name, date, score)
//   Administrator (Authorization: Bearer COURSE_ADMIN_KEY):
//   GET  /api/course?action=register           completion register
//   POST /api/course?action=admin-add          register sponsored learners (bypass payment), optionally invite them
//   POST /api/course?action=admin-revoke       remove a learner's access
//   GET/POST /api/course?action=admin-codes    list, create, switch on/off partner codes
//
// Paid access: Module 1 is a free preview. Every other module and the final assessment need access:
// paid (Paystack), sponsored (added by MedNova or a partner code) or early (enrolled before payments).
// Payments are enforced only when COURSE_REQUIRE_PAYMENT is "true"; until then everyone has access.

const crypto = require('crypto');
const KEY = require('./course-key.json');
const CONTENT = require('./course-content.json');

const COURSE = 'pv-ce';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_KEY = process.env.COURSE_ADMIN_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || '';
const NOTIFY_EMAIL = process.env.COURSE_NOTIFY_EMAIL || '';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_API = (process.env.PAYSTACK_API_URL || 'https://api.paystack.co').replace(/\/$/, '');
const REQUIRE_PAYMENT = process.env.COURSE_REQUIRE_PAYMENT === 'true';
const SITE_URL = 'https://mednovalife.com/pharmacovigilance-ce-course';

const PRICE = { amount: 19999, currency: 'NGN' };   // naira; Paystack takes kobo (amount * 100)
const FREE_MODULES = 1;                             // Module 1 is the free preview
const hasAccess = row => !REQUIRE_PAYMENT || !!row.access;

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
    enrolled: hasAccess(row), access: row.access || null, sponsor: row.access_sponsor || null,
    price: PRICE, paymentsOpen: !!PAYSTACK_SECRET_KEY,
  };
}
const ENROL_MESSAGE = 'Enrol in the full course to continue. Module 1 is a free preview.';

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
  if ((quizKey === 'final' || Number(quizKey.slice(1)) >= FREE_MODULES) && !hasAccess(row)) refuse(402, ENROL_MESSAGE);
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

// Course content is sent only to signed-in learners, module by module: Module 1 to everyone, the rest
// to learners with access, in unlock order. Final assessment questions go without their answer key.
async function content(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const row = await loadLearner(b);
  const results = row.results || {};
  const refuse = (status, message) => { throw new HttpError(status, message, { state: publicState(row) }); };
  if (String(b.module) === 'final') {
    if (!hasAccess(row)) refuse(402, ENROL_MESSAGE);
    if (passedCount(results) < KEY.modules) refuse(403, `Pass all ${KEY.modules} knowledge checks to unlock the final assessment.`);
    return res.status(200).json({ quiz: CONTENT.final.quiz });
  }
  const i = Number(b.module);
  if (!Number.isInteger(i) || i < 0 || i >= KEY.modules) throw new HttpError(400, 'Unknown module.');
  if (i >= FREE_MODULES && !hasAccess(row)) refuse(402, ENROL_MESSAGE);
  for (let j = 0; j < i; j++) {
    if (!modulePassed(results, j)) refuse(403, `Pass the Module ${j + 1} knowledge check to unlock this module.`);
  }
  return res.status(200).json({ salt: CONTENT.salt, module: CONTENT.modules[i] });
}

/* ---------- payments (Paystack) ---------- */
async function paystack(path, init = {}) {
  const r = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.status === false) throw new Error(`Paystack ${r.status}: ${String(data.message || '').slice(0, 200)}`);
  return data.data;
}

async function checkout(req, res) {
  const row = await loadLearner(req.body);
  if (row.access) return res.status(200).json({ alreadyEnrolled: true, ...publicState(row) });
  if (!PAYSTACK_SECRET_KEY) throw new HttpError(503, 'Online payment is not available yet. To enrol now, email info@mednovalife.com.');
  const reference = `PVCE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const amount = PRICE.amount * 100;
  await db('course_payments', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ reference, course: COURSE, email: row.email, amount, currency: PRICE.currency }),
  });
  const tx = await paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: row.email, amount, currency: PRICE.currency, reference, callback_url: SITE_URL,
      metadata: { course: COURSE, learner_id: row.id, custom_fields: [
        { display_name: 'Course', variable_name: 'course', value: 'Pharmacovigilance CE Course' },
        { display_name: 'Learner', variable_name: 'learner', value: row.name },
      ] },
    }),
  });
  return res.status(200).json({ url: tx.authorization_url, reference });
}

// Checks one payment with Paystack and, the first time it is confirmed, unlocks the course for the
// payer. Safe to call any number of times, from the learner's return or from the webhook.
async function settlePayment(reference) {
  const ref = encodeURIComponent(reference);
  const [pay] = await db(`course_payments?reference=eq.${ref}&select=*`);
  if (!pay) return { status: 'unknown' };
  if (pay.status === 'success') return { status: 'success', pay };
  const tx = await paystack(`/transaction/verify/${ref}`);
  if (tx.status !== 'success') {
    if (tx.status === 'failed' || tx.status === 'abandoned') {
      await db(`course_payments?reference=eq.${ref}&status=eq.pending`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: tx.status, updated_at: new Date().toISOString() }),
      });
    }
    return { status: tx.status || 'pending', pay };
  }
  if (tx.reference !== reference || tx.amount !== pay.amount || tx.currency !== pay.currency) {
    console.error('[course] payment does not match its record:', reference, tx.amount, tx.currency);
    return { status: 'mismatch', pay };
  }
  const won = await db(`course_payments?reference=eq.${ref}&status=neq.success`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'success', paystack_id: tx.id, channel: tx.channel || null, paid_at: tx.paid_at || new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (won.length) {
    // Learners who already have access (for example sponsored) keep it as it is.
    const granted = await db(`course_learners?${learnerFilter(pay.email)}&access=is.null`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ access: 'paid', access_granted_at: new Date().toISOString(), access_payment_ref: reference, updated_at: new Date().toISOString() }),
    });
    if (granted.length) await sendPaymentEmails(granted[0], pay);
  }
  return { status: 'success', pay };
}

async function confirmPayment(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const row = await loadLearner(b);
  const reference = String(b.reference || '');
  if (!/^PVCE-[A-Z0-9-]{6,40}$/.test(reference)) throw new HttpError(400, 'Unknown payment reference.');
  if (!PAYSTACK_SECRET_KEY) throw new HttpError(503, 'Online payment is not available yet.');
  const result = await settlePayment(reference);
  if (result.pay && result.pay.email !== row.email) throw new HttpError(404, 'Unknown payment reference.');
  const fresh = await findLearner(row.email);
  return res.status(200).json({ paymentStatus: result.status, ...publicState(fresh) });
}

// Paystack calls this after a payment. Its content is never trusted: the reference is checked with
// Paystack's API (settlePayment) before anything changes, so a forged call can't unlock anything.
async function paystackWebhook(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const sig = String(req.headers['x-paystack-signature'] || '');
  const expected = PAYSTACK_SECRET_KEY ? crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(b)).digest('hex') : '';
  if (!sig || !safeEqual(sig, expected)) console.warn('[course] Paystack webhook signature did not match; verifying with Paystack anyway');
  const reference = b.data && typeof b.data.reference === 'string' ? b.data.reference : '';
  if (PAYSTACK_SECRET_KEY && b.event === 'charge.success' && /^PVCE-[A-Z0-9-]{6,40}$/.test(reference)) {
    try { await settlePayment(reference); } catch (e) { console.error('[course] webhook settle failed:', e.message); return res.status(500).json({ ok: false }); }
  }
  return res.status(200).json({ ok: true });
}

async function redeem(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const row = await loadLearner(b);
  const code = String(b.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new HttpError(400, 'Enter the partner code exactly as you received it.');
  const r = await db('rpc/redeem_course_code', { method: 'POST', body: JSON.stringify({ p_course: COURSE, p_email: row.email, p_code: code }) });
  if (!r.ok) {
    const msg = {
      already: 'Your course is already unlocked.',
      too_many: 'Too many incorrect codes. Try again tomorrow, or contact info@mednovalife.com.',
    }[r.reason] || "That code isn't valid. It may have expired or have no places left. Check it with whoever gave it to you.";
    throw new HttpError(r.reason === 'too_many' ? 429 : 400, msg, { state: publicState(row) });
  }
  return res.status(200).json(publicState(await findLearner(row.email)));
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

const naira = n => `₦${Number(n).toLocaleString('en-NG')}`;
const emailBox = inner => `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#142229;max-width:560px">${inner}<p>MedNova Lifesciences</p></div>`;
const button = (href, label) => `<p><a href="${href}" style="display:inline-block;background:#1d5f86;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${label}</a></p>`;

// Access is already saved; an email failure is logged, never surfaced.
async function sendPaymentEmails(learner, pay) {
  if (!RESEND_API_KEY || !FROM_EMAIL) return;
  const amount = naira(pay.amount / 100);
  const jobs = [sendEmail({
    to: [learner.email],
    subject: 'You are enrolled: Pharmacovigilance CE Course',
    text: `Thank you, ${learner.name}. Your payment of ${amount} was received and the full Pharmacovigilance CE Course is unlocked, with lifetime access.\n\nPayment reference: ${pay.reference}\n\nContinue the course: ${SITE_URL}\n(Sign in with this email address. On a new device we'll email you a code.)\n\nMedNova Lifesciences`,
    html: emailBox(`<p>Thank you, ${esc(learner.name)}.</p><p>Your payment of <strong>${esc(amount)}</strong> was received and the full <strong>Pharmacovigilance CE Course</strong> is unlocked, with lifetime access.</p><p style="color:#546770">Payment reference: <span style="font-family:monospace">${esc(pay.reference)}</span></p>${button(SITE_URL, 'Continue the course')}<p style="color:#546770;font-size:14px">Sign in with this email address. On a new device we'll email you a code.</p>`),
  })];
  if (NOTIFY_EMAIL) {
    jobs.push(sendEmail({
      to: [NOTIFY_EMAIL],
      subject: `PV CE course payment: ${learner.name} (${amount})`,
      text: `A learner paid for the Pharmacovigilance CE course.\n\nName: ${learner.name}\nEmail: ${learner.email}\nAmount: ${amount}\nReference: ${pay.reference}\n\nRegister: ${SITE_URL}#register`,
    }));
  }
  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === 'rejected') console.error('[course] payment email failed:', r.reason && r.reason.message);
  }
}

function sendInviteEmail(name, email, sponsor) {
  return sendEmail({
    to: [email],
    subject: 'You have been enrolled in the Pharmacovigilance CE Course',
    text: `Hello ${name},\n\n${sponsor} has enrolled you in the MedNova Pharmacovigilance Continuing Education Course. Your place is paid for: there is nothing to pay.\n\nStart the course: ${SITE_URL}\nSign in with this email address (${email}). We'll email you a 6-digit code to confirm it.\n\nThe course has 17 modules with knowledge checks, a final assessment and a certificate of completion.\n\nMedNova Lifesciences`,
    html: emailBox(`<p>Hello ${esc(name)},</p><p>${esc(sponsor)} has enrolled you in the <strong>MedNova Pharmacovigilance Continuing Education Course</strong>. Your place is paid for: there is nothing to pay.</p>${button(SITE_URL, 'Start the course')}<p>Sign in with this email address (<strong>${esc(email)}</strong>). We'll email you a 6-digit code to confirm it.</p><p style="color:#546770">The course has 17 modules with knowledge checks, a final assessment and a certificate of completion.</p>`),
  });
}

/* ---------- administrator ---------- */
function requireAdmin(req) {
  const auth = String(req.headers.authorization || '');
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!ADMIN_KEY || !key || !safeEqual(sha256(key), sha256(ADMIN_KEY))) throw new HttpError(401, 'Incorrect administrator key.');
}
const cleanText = (v, max) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);

// Registers sponsored learners: they skip payment. A learner who already has a record keeps their
// progress; one who already has access is left unchanged.
async function adminAdd(req, res) {
  requireAdmin(req);
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const sponsor = cleanText(b.sponsor, 120), note = cleanText(b.note, 500) || null;
  const list = Array.isArray(b.learners) ? b.learners.slice(0, 200) : [];
  if (!sponsor) throw new HttpError(400, 'Enter the sponsor or partner name.');
  if (!list.length) throw new HttpError(400, 'Add at least one learner.');
  const out = [];
  for (const l of list) {
    const name = cleanText(l && l.name, 80), email = String((l && l.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 120) { out.push({ email, result: 'invalid email' }); continue; }
    if (name.length < 3) { out.push({ email, result: 'name missing' }); continue; }
    await db('course_learners?on_conflict=course,email', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ course: COURSE, email, name, token_hashes: [], modules_total: KEY.modules, results: {} }),
    });
    const granted = await db(`course_learners?${learnerFilter(email)}&access=is.null`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ access: 'sponsored', access_granted_at: new Date().toISOString(), access_sponsor: sponsor, access_note: note, updated_at: new Date().toISOString() }),
    });
    if (!granted.length) { out.push({ email, result: 'already has access' }); continue; }
    let result = 'added';
    if (b.invite && RESEND_API_KEY && FROM_EMAIL) {
      try { await sendInviteEmail(granted[0].name, email, sponsor); result = 'added and invited'; }
      catch (e) { console.error('[course] invite failed:', e.message); result = 'added (invitation email failed)'; }
    }
    out.push({ email, result });
  }
  return res.status(200).json({ results: out });
}

async function adminRevoke(req, res) {
  requireAdmin(req);
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Invalid email.');
  const rows = await db(`course_learners?${learnerFilter(email)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ access: null, access_granted_at: null, access_sponsor: null, access_note: null, access_code: null, updated_at: new Date().toISOString() }),
  });
  if (!rows.length) throw new HttpError(404, 'No learner with that email.');
  return res.status(200).json({ ok: true });
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function adminCodes(req, res) {
  requireAdmin(req);
  if (req.method === 'GET') {
    return res.status(200).json({ codes: await db(`course_codes?course=eq.${COURSE}&select=code,sponsor,seats,used,active,expires_at,note,created_at&order=created_at.desc`) });
  }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (b.op === 'set-active') {
    const rows = await db(`course_codes?course=eq.${COURSE}&code=eq.${encodeURIComponent(String(b.code || '').toUpperCase())}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ active: !!b.active }),
    });
    if (!rows.length) throw new HttpError(404, 'No such code.');
    return res.status(200).json({ code: rows[0] });
  }
  const sponsor = cleanText(b.sponsor, 120), seats = Number(b.seats);
  if (!sponsor) throw new HttpError(400, 'Enter the sponsor or partner name.');
  if (!Number.isInteger(seats) || seats < 1 || seats > 10000) throw new HttpError(400, 'Enter the number of places (1 to 10,000).');
  // A readable prefix from the sponsor plus 6 random characters, so codes can't be guessed.
  const prefix = sponsor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PARTNER';
  const custom = String(b.code || '').trim().toUpperCase();
  if (custom && !/^[A-Z0-9-]{8,40}$/.test(custom)) throw new HttpError(400, 'A custom code needs 8 to 40 letters, numbers or hyphens.');
  const code = custom || `${prefix}-${Array.from(crypto.randomBytes(6), x => CODE_CHARS[x % CODE_CHARS.length]).join('')}`;
  const expires = b.expiresAt ? new Date(b.expiresAt) : null;
  if (expires && isNaN(expires)) throw new HttpError(400, 'Invalid expiry date.');
  try {
    const [row] = await db('course_codes', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ code, course: COURSE, sponsor, seats, expires_at: expires ? expires.toISOString() : null, note: cleanText(b.note, 500) || null }),
    });
    return res.status(200).json({ code: row });
  } catch (e) {
    if (/duplicate key|23505/.test(e.message)) throw new HttpError(409, 'That code already exists.');
    throw e;
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
  requireAdmin(req);
  // Confirmed learners (at least one confirmed device) and learners registered by MedNova who
  // haven't signed in yet; other unconfirmed sign-ups are left out.
  const rows = await db(`course_learners?course=eq.${COURSE}&or=(token_hashes.neq.{},access.not.is.null)&select=name,email,token_hashes,modules_done,modules_total,final_best,earned_at,cert_id,cert_name,access,access_sponsor,access_payment_ref,access_code,access_granted_at,updated_at&order=updated_at.desc&limit=1000`);
  return res.status(200).json({
    paymentRequired: REQUIRE_PAYMENT,
    learners: rows.map(r => ({
      name: r.cert_name || r.name, email: r.email, signedIn: r.token_hashes.length > 0,
      modulesDone: r.modules_done, modulesTotal: r.modules_total,
      finalBest: r.final_best, earnedAt: r.earned_at, certId: r.cert_id, updatedAt: r.updated_at,
      access: r.access, sponsor: r.access_sponsor, paymentRef: r.access_payment_ref, code: r.access_code, accessSince: r.access_granted_at,
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
    if (req.method === 'POST' && action === 'content') return await content(req, res);
    if (req.method === 'POST' && action === 'checkout') return await checkout(req, res);
    if (req.method === 'POST' && action === 'confirm-payment') return await confirmPayment(req, res);
    if (req.method === 'POST' && action === 'redeem') return await redeem(req, res);
    if (req.method === 'POST' && action === 'paystack-webhook') return await paystackWebhook(req, res);
    if (req.method === 'GET' && action === 'verify') return await verify(req, res);
    if (req.method === 'GET' && action === 'register') return await register(req, res);
    if (req.method === 'POST' && action === 'admin-add') return await adminAdd(req, res);
    if (req.method === 'POST' && action === 'admin-revoke') return await adminRevoke(req, res);
    if ((req.method === 'GET' || req.method === 'POST') && action === 'admin-codes') return await adminCodes(req, res);
    return res.status(404).json({ error: 'Not found.' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    console.error('[course]', err.message);
    return res.status(500).json({ error: 'Course storage is unavailable. Try again shortly.' });
  }
};
