// api/course.js
// Vercel function backing the Pharmacovigilance CE course (/pharmacovigilance-ce-course).
// Stores learner results in the mednova-website Supabase project via the service role key,
// which never leaves the server. Quizzes are graded here and certificates are issued here;
// the browser only submits answers.
//
//   POST /api/course?action=sync               create or refresh the learner record (learner token required)
//   POST /api/course?action=submit             grade one knowledge check or the final assessment
//   GET  /api/course?action=verify&id=PVCE-…   public certificate check
//   GET  /api/course?action=register           completion register (Authorization: Bearer COURSE_ADMIN_KEY)

const crypto = require('crypto');
const KEY = require('./course-key.json');

const COURSE = 'pv-ce';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_KEY = process.env.COURSE_ADMIN_KEY || '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CERT_RE = /^PVCE-[0-9A-F]{4}-[0-9A-F]{4}$/;

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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
  if (!res.ok) {
    const err = new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    err.pgConflict = res.status === 409;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

const learnerFilter = email => `course=eq.${COURSE}&email=eq.${encodeURIComponent(email)}`;

function publicState(row) {
  return {
    modulesDone: row.modules_done, modulesTotal: row.modules_total, finalBest: row.final_best,
    earnedAt: row.earned_at, certId: row.cert_id,
  };
}

// Finds the learner's record, creating it on first sign-in. The record belongs to the browser
// that created it (its random token); any other browser gets a 409.
async function loadLearner(body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const token = String(b.token || '');
  if (!EMAIL_RE.test(email) || email.length > 120 || name.length < 3 || name.length > 80 ||
      token.length < 32 || token.length > 128) {
    throw new HttpError(400, 'Invalid learner details.');
  }
  const tokenHash = sha256(token);
  const [row] = await db(`course_learners?${learnerFilter(email)}&select=*`);
  if (row) {
    if (!safeEqual(row.token_hash, tokenHash)) {
      throw new HttpError(409, 'This email is already registered from another browser.');
    }
    if (row.name !== name && !row.earned_at) {
      await db(`course_learners?${learnerFilter(email)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
      });
      row.name = name;
    }
    return row;
  }
  const [created] = await db('course_learners', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ course: COURSE, email, name, token_hash: tokenHash, modules_total: KEY.modules, results: {} }),
  });
  return created;
}

async function sync(req, res) {
  const row = await loadLearner(req.body);
  return res.status(200).json(publicState(row));
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

const newCertId = () => {
  const h = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PVCE-${h.slice(0, 4)}-${h.slice(4, 8)}`;
};

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
  const modulesDone = Object.keys(results).filter(k => /^m\d+$/.test(k)).length;
  const finalBest = results.final ? results.final.best : null;
  const update = {
    results, modules_done: modulesDone, modules_total: KEY.modules, final_best: finalBest,
    updated_at: new Date().toISOString(),
  };
  // Issue the certificate once, the first time both requirements are met. Date and ID never change after.
  const issuing = !row.earned_at && modulesDone === KEY.modules && finalBest !== null && finalBest >= KEY.passMark;
  for (let attempt = 0; ; attempt++) {
    if (issuing) { update.earned_at = update.updated_at; update.cert_id = newCertId(); }
    try {
      await db(`course_learners?${learnerFilter(row.email)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(update),
      });
      break;
    } catch (err) {
      if (!(issuing && err.pgConflict && attempt < 3)) throw err; // certificate ID collision: draw again
    }
  }
  return res.status(200).json({ score, total, ...publicState({ ...row, ...update }) });
}

async function verify(req, res) {
  const id = String(req.query.id || '').trim().toUpperCase();
  if (!CERT_RE.test(id)) return res.status(400).json({ error: 'Enter a certificate ID like PVCE-1A2B-3C4D.' });
  const [row] = await db(`course_learners?course=eq.${COURSE}&cert_id=eq.${id}&select=name,earned_at,final_best`);
  if (!row) return res.status(404).json({ valid: false });
  return res.status(200).json({ valid: true, name: row.name, earnedAt: row.earned_at, finalBest: row.final_best });
}

async function register(req, res) {
  const auth = String(req.headers.authorization || '');
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!ADMIN_KEY || !key || !safeEqual(sha256(key), sha256(ADMIN_KEY))) {
    return res.status(401).json({ error: 'Incorrect administrator key.' });
  }
  const rows = await db(`course_learners?course=eq.${COURSE}&select=name,email,modules_done,modules_total,final_best,earned_at,cert_id,updated_at&order=updated_at.desc&limit=1000`);
  return res.status(200).json({
    learners: rows.map(r => ({
      name: r.name, email: r.email, modulesDone: r.modules_done, modulesTotal: r.modules_total,
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
    if (req.method === 'POST' && action === 'submit') return await submit(req, res);
    if (req.method === 'GET' && action === 'verify') return await verify(req, res);
    if (req.method === 'GET' && action === 'register') return await register(req, res);
    return res.status(404).json({ error: 'Not found.' });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('[course]', err.message);
    return res.status(500).json({ error: 'Course storage is unavailable. Try again shortly.' });
  }
};
