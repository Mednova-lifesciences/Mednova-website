// api/course.js
// Vercel function backing the Pharmacovigilance CE course (/pharmacovigilance-ce-course.html).
// Stores learner progress in the mednova-website Supabase project via the service role key,
// which never leaves the server.
//
//   POST /api/course?action=sync               learner progress upsert (learner token required)
//   GET  /api/course?action=verify&id=PVCE-…   public certificate check
//   GET  /api/course?action=register           completion register (Authorization: Bearer COURSE_ADMIN_KEY)

const crypto = require('crypto');

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

function intOrNull(v, min, max) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

async function sync(req, res) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  const token = String(b.token || '');
  const modulesTotal = intOrNull(b.modulesTotal, 1, 100);
  const modulesDone = intOrNull(b.modulesDone, 0, modulesTotal || 0);
  const finalBest = intOrNull(b.finalBest, 0, 100);
  const earnedAt = b.earnedAt ? new Date(b.earnedAt) : null;
  const certId = b.certId ? String(b.certId) : null;

  if (!EMAIL_RE.test(email) || email.length > 120 || name.length < 3 || name.length > 80 ||
      token.length < 32 || token.length > 128 || !modulesTotal || modulesDone == null ||
      modulesDone === undefined || finalBest === undefined ||
      (earnedAt && isNaN(earnedAt)) || (certId && !CERT_RE.test(certId))) {
    return res.status(400).json({ error: 'Invalid learner record.' });
  }

  const tokenHash = sha256(token);
  const record = {
    name, modules_done: modulesDone, modules_total: modulesTotal, final_best: finalBest,
    earned_at: earnedAt ? earnedAt.toISOString() : null, cert_id: certId,
    updated_at: new Date().toISOString(),
  };

  const filter = `course=eq.${COURSE}&email=eq.${encodeURIComponent(email)}`;
  const [existing] = await db(`course_learners?${filter}&select=token_hash,earned_at,cert_id`);
  if (!existing) {
    await db('course_learners', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ course: COURSE, email, token_hash: tokenHash, ...record }),
    });
    return res.status(200).json({ ok: true });
  }
  // The record belongs to the browser that created it; another browser can't overwrite it.
  if (!safeEqual(existing.token_hash, tokenHash)) {
    return res.status(409).json({ error: 'This email is already registered from another browser.' });
  }
  // A certificate, once issued, keeps its original date and ID.
  if (existing.earned_at) { delete record.earned_at; delete record.cert_id; }
  await db(`course_learners?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(record),
  });
  return res.status(200).json({ ok: true });
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
    if (req.method === 'GET' && action === 'verify') return await verify(req, res);
    if (req.method === 'GET' && action === 'register') return await register(req, res);
    return res.status(404).json({ error: 'Not found.' });
  } catch (err) {
    console.error('[course]', err.message);
    return res.status(500).json({ error: 'Course storage is unavailable. Try again shortly.' });
  }
};
