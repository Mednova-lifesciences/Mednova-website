"""Build the Pharmacovigilance CE course page for mednovalife.com.

Turns the course as authored (a standalone HTML file, originally a Claude artifact)
into the site page, and writes the answer key the server grades against.

    python tools/pv-ce-course/build.py

Reads   tools/pv-ce-course/source/Pharmacovigilance_CE_Course.html
Writes  frontend/pharmacovigilance-ce-course.html
        frontend/api/course-key.json

Each step below is an exact find-and-replace on the source. If the source changes so a
step no longer matches, the build stops and names the step instead of guessing.
See README.md in this folder.
"""
import sys, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
src = sys.argv[1] if len(sys.argv) > 1 else ROOT / 'tools/pv-ce-course/source/Pharmacovigilance_CE_Course.html'
dst = sys.argv[2] if len(sys.argv) > 2 else ROOT / 'frontend/pharmacovigilance-ce-course.html'
KEY_OUT = ROOT / 'frontend/api/course-key.json'
CONTENT_OUT = ROOT / 'frontend/api/course-content.json'
import re
h = open(src, encoding='utf-8').read()

def sub(old, new, count=1):
    global h
    n = h.count(old)
    if n != count:
        raise SystemExit(f'expected {count} match(es), found {n}: {old[:70]!r}')
    h = h.replace(old, new)

# ---- head: language, SEO basics, self-hosted jsPDF, CSP nonce ----
sub('<!doctype html><html><head>', '<!doctype html><html lang="en"><head>')
sub('<title>Pharmacovigilance CE Course</title>',
    '<title>Pharmacovigilance CE Course | MedNova Lifesciences</title>\n'
    '<meta name="description" content="Free pharmacovigilance continuing education course from MedNova Lifesciences: modules on drug safety foundations, company PV practice and NAFDAC requirements, with knowledge checks, a final assessment and a certificate of completion.">\n'
    '<link rel="canonical" href="https://mednovalife.com/pharmacovigilance-ce-course">')
sub('<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n<script>',
    '<script src="/public/js/vendor/jspdf.umd.min.js"></script>\n<script nonce="mednova-inline-2026">')

# ---- storage: Claude artifact db -> MedNova /api/course (Supabase) ----
start = h.index('/* ---------- optional completion register (shared db) ---------- */')
end = h.index('/* ---------- sign in ---------- */')
h = h[:start] + r'''/* ---------- completion register (MedNova API -> Supabase) ---------- */
const API = "/api/course";
const TOKEN_PREFIX = "pv-ce-token:";
const ADMIN_STORE = "pv-ce-admin-key";
const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
const ssDel = k => { try { sessionStorage.removeItem(k); } catch (e) {} };
let isOwner = false;
function learnerToken() {
  const k = TOKEN_PREFIX + learner.email.toLowerCase();
  let t = lsGet(k);
  if (!t) {
    const a = new Uint8Array(24); crypto.getRandomValues(a);
    t = Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
    lsSet(k, t);
  }
  return t;
}
function initRuntime() {
  const hash = (location.hash || "").replace("#", "");
  isOwner = !!ssGet(ADMIN_STORE) || hash === "register";
}
// Answers are graded again on the server, which alone issues the certificate.
// Unsent answers wait in progress.pending and are retried on the next sync.
// A device the server doesn't know yet (409) joins with a 6-digit code emailed to the learner.
let blocked = false, lastSyncOk = false, syncing = null;
class ApiError extends Error { constructor(status, data) { super(data.error || String(status)); this.status = status; this.data = data; } }
async function api(action, body) {
  const res = await fetch(API + "?action=" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: learner.name, email: learner.email, token: learnerToken(), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) blocked = true;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
// Server results are the record of truth, except answers still waiting to be sent.
function mergeServer(s) {
  if (!s) return;
  const pending = progress.pending || {};
  for (const [k, v] of Object.entries(s.results || {})) {
    if (pending[k]) continue;
    if (/^m\d+$/.test(k)) progress[k] = { done: true, score: v.score };
    else if (k === "final") progress.final = { best: v.best, last: v.last };
  }
  if (s.earnedAt && s.certId) {
    progress.earnedAt = s.earnedAt; progress.certId = s.certId;
    progress.certName = s.certName; progress.certFinalScore = s.certFinalScore;
  }
}
function syncRecord() {
  if (!learner || blocked) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    lastSyncOk = false;
    try {
      progress.pending = progress.pending || {};
      for (const quiz of Object.keys(progress.pending)) {
        mergeServer(await api("submit", { quiz, answers: progress.pending[quiz] }));
        delete progress.pending[quiz]; save();
      }
      mergeServer(await api("sync", {})); save();
      lastSyncOk = true;
    } catch (e) { /* offline or unconfirmed device: pending answers stay queued */ }
    syncing = null;
    renderSyncNote();
    if (document.getElementById("toc")) renderToc(currentView);
  })();
  return syncing;
}
async function recordQuiz(quiz, answers) {
  progress.pending = progress.pending || {};
  progress.pending[quiz] = answers; save();
  await syncRecord();
  if (progress.pending[quiz]) await syncRecord();
}
function renderSyncNote() {
  const box = document.getElementById("sync-note");
  if (!box) return;
  box.hidden = !blocked;
  if (!blocked) return;
  box.innerHTML = `<p>Your progress on this device isn't being saved yet. Confirm your email address with a code to save it.</p><button type="button" class="btn">Confirm your email</button>`;
  box.querySelector("button").addEventListener("click", () => renderCode());
}

/* ---------- confirm the email (first sign-in) or a new device by emailed code ---------- */
function renderCode(isNew) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="signin-wrap"><div class="signin">
      <div class="brand"><div class="eyebrow">Continuing education</div><h1>${isNew ? "Confirm your email" : "Confirm it's you"}</h1></div>
      <p>${isNew
        ? `To start the course, enter the 6-digit code we email to <strong>${esc(learner.email)}</strong>. This confirms the email address is yours, so only you can sign in to your course record and receive your certificate.`
        : `<strong>${esc(learner.email)}</strong> is already registered for the course. To continue on this device, enter the 6-digit code we email you. Your progress and any certificate will load here.`}</p>
      <p class="note" id="code-status" aria-live="polite">Sending your code…</p>
      <form id="code-form" novalidate>
        <div class="field"><label for="code-in">6-digit code</label><input id="code-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required><span class="err" id="code-err"></span></div>
        <button class="btn" type="submit">Continue</button>
      </form>
      <p class="note"><button type="button" class="linkbtn" id="code-resend">Send a new code</button> · <button type="button" class="linkbtn" id="code-other">Use a different email</button></p>
    </div></div>`;
  const status = document.getElementById("code-status"), err = document.getElementById("code-err");
  async function send() {
    status.textContent = "Sending your code…";
    try {
      const r = await api("send-code", {});
      status.textContent = `We sent a code to ${r.to}. It expires in 15 minutes. Check your spam folder if it hasn't arrived.`;
    } catch (e) {
      status.textContent = e instanceof ApiError && e.data.error ? e.data.error : "We couldn't send the code. Check your internet connection and try again.";
    }
  }
  document.getElementById("code-resend").addEventListener("click", send);
  document.getElementById("code-other").addEventListener("click", signOut);
  document.getElementById("code-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const code = document.getElementById("code-in").value.replace(/\D/g, "");
    if (code.length !== 6) { err.textContent = "Enter the 6 digits from the email."; return; }
    err.textContent = "";
    const btn = ev.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const s = await api("verify-code", { code });
      blocked = false;
      loadProgress(); mergeServer(s); save();
      startCourse();
    } catch (e) {
      err.textContent = e instanceof ApiError && e.data.error ? e.data.error : "We couldn't check the code. Check your internet connection and try again.";
      btn.disabled = false;
    }
  });
  send();
  document.getElementById("code-in").focus();
}

''' + h[end:]

sub('<p class="note">Your progress is saved in this browser under your email address. Your name, email and course results may be recorded for the course administrator to confirm completion.</p>',
    '<p class="note">Your progress is saved in this browser under your email address. MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate.</p>')

# startCourse: honour #register for administrators
sub('  if (hash === "certificate") start = CERT;\n',
    '  if (hash === "certificate") start = CERT;\n  if (hash === "register" && isOwner) start = REG;\n')
sub('  if (isOwner && db) {', '  if (isOwner) {')

# ---- certificate: verification line + plain browser downloads ----
sub('  g.font = `600 40px ${BODY}`; g.fillStyle = INK; g.fillText(SIGNATORY, sx, baseY + 82);\n',
    '  g.font = `600 40px ${BODY}`; g.fillStyle = INK; g.fillText(SIGNATORY, sx, baseY + 82);\n'
    '  g.font = `26px ${MONO}`; g.fillStyle = MUTED; g.textAlign = "center";\n'
    '  g.fillText(`MedNova Lifesciences  ·  Verify this certificate at mednovalife.com/pharmacovigilance-ce-course#verify`, W / 2, 1620);\n')
start = h.index('  const downloads = window.claude')
end = h.index('  pdfBtn.addEventListener("click"')
h = h[:start] + '''  if (!window.jspdf) pdfBtn.remove();
  function offer(btn, filename, data) {
    const url = URL.createObjectURL(data);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    msg.textContent = "Downloaded.";
  }
''' + h[end:]
sub('  page.appendChild(el("p", {}, `Congratulations, ${esc(learner.name)}. You completed the course on <strong>${esc(fmtDateTime(progress.earnedAt))}</strong>. Download the PDF to print it or keep a copy.`));',
    '  page.appendChild(el("p", {}, `Congratulations, ${esc(learner.name)}. You completed the course on <strong>${esc(fmtDateTime(progress.earnedAt))}</strong>. Download the PDF to print it or keep a copy. Anyone can confirm it is genuine with certificate ID <strong>${esc(progress.certId)}</strong> at <a href="#verify">mednovalife.com/pharmacovigilance-ce-course#verify</a>.`));')

# ---- administrator register + public verification ----
start = h.index('/* ---------- administrator register ---------- */')
end = h.index('/* ---------- quiz ---------- */')
h = h[:start] + r'''/* ---------- administrator register ---------- */
function standalonePage() {
  if (document.getElementById("main")) return pageShell();
  document.getElementById("app").innerHTML = `<div class="shell solo"><main id="main" tabindex="-1"></main></div>`;
  return pageShell();
}
function askAdminKey(box, err) {
  box.innerHTML = `<form id="admin-form" novalidate>
    <div class="field"><label for="admin-key">Administrator key</label><input id="admin-key" type="password" autocomplete="current-password" required><span class="err" id="admin-key-err">${err ? esc(err) : ""}</span></div>
    <button class="btn" type="submit">Open register</button></form>`;
  document.getElementById("admin-form").addEventListener("submit", ev => {
    ev.preventDefault();
    const key = document.getElementById("admin-key").value.trim();
    if (!key) { document.getElementById("admin-key-err").textContent = "Enter the administrator key."; return; }
    ssSet(ADMIN_STORE, key); isOwner = true;
    renderRegister(); renderToc(REG);
  });
  document.getElementById("admin-key").focus();
}
async function renderRegister() {
  const page = standalonePage();
  page.innerHTML = `<div class="mod-eyebrow">Administrator</div><h2>Completion register</h2>
    <p>Every learner who has signed in to the course, most recent activity first.</p>`;
  const box = el("div", { class: "reg" });
  page.appendChild(box);
  const key = ssGet(ADMIN_STORE);
  if (!key) return askAdminKey(box);
  box.innerHTML = '<p class="note">Loading…</p>';
  try {
    const res = await fetch(API + "?action=register", { headers: { Authorization: "Bearer " + key } });
    if (res.status === 401) { ssDel(ADMIN_STORE); return askAdminKey(box, "That administrator key was not accepted."); }
    if (!res.ok) throw new Error(String(res.status));
    const rows = (await res.json()).learners || [];
    if (!rows.length) { box.innerHTML = '<p class="note">No learner records yet. Records appear here when learners sign in.</p>'; return; }
    box.innerHTML = `<p class="note">${rows.length} learner${rows.length === 1 ? "" : "s"}, ${rows.filter(r => r.earnedAt).length} certified.</p><div class="tbl"><table><thead><tr><th>Name</th><th>Email</th><th>Modules</th><th>Final</th><th>Completed</th><th>Certificate ID</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name || "")}</td><td>${esc(r.email || "")}</td><td class="num">${esc(r.modulesDone ?? 0)}/${esc(r.modulesTotal ?? N)}</td><td class="num">${r.finalBest == null ? "—" : esc(r.finalBest) + "%"}</td><td class="num">${r.earnedAt ? esc(fmtDateTime(r.earnedAt)) : "—"}</td><td class="num">${esc(r.certId || "—")}</td></tr>`).join("")}</tbody></table></div>`;
  } catch (e) {
    box.innerHTML = '<p class="note">The register could not be loaded. Reload the page to try again.</p>';
  }
}

/* ---------- certificate verification (public) ---------- */
function renderVerify() {
  const page = standalonePage();
  page.innerHTML = `<div class="mod-eyebrow">Certificate verification</div><h2>Verify a certificate</h2>
    <p>Enter the certificate ID printed on a ${esc(COURSE_NAME)} certificate to confirm it was issued by MedNova Lifesciences.</p>
    <form id="verify-form" novalidate>
      <div class="field"><label for="verify-id">Certificate ID</label><input id="verify-id" type="text" maxlength="14" autocomplete="off" placeholder="PVCE-1A2B-3C4D" required><span class="err" id="verify-err"></span></div>
      <button class="btn" type="submit">Verify</button>
    </form>
    <div id="verify-out" aria-live="polite"></div>
    <p><a href="#" id="verify-back">Go to the course</a></p>`;
  document.getElementById("verify-back").addEventListener("click", ev => {
    ev.preventDefault(); history.replaceState(null, "", location.pathname);
    if (learner) startCourse(); else renderSignin();
  });
  document.getElementById("verify-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const id = document.getElementById("verify-id").value.trim().toUpperCase();
    const err = document.getElementById("verify-err"), out = document.getElementById("verify-out");
    out.innerHTML = "";
    if (!/^PVCE-[0-9A-F]{4}-[0-9A-F]{4}$/.test(id)) { err.textContent = "Enter the ID exactly as printed, for example PVCE-1A2B-3C4D."; return; }
    err.textContent = "";
    out.innerHTML = '<p class="note">Checking…</p>';
    try {
      const res = await fetch(API + "?action=verify&id=" + encodeURIComponent(id));
      if (res.status === 404) { out.innerHTML = `<p><span class="pill fail">Not found</span> No certificate with ID <strong>${esc(id)}</strong> has been issued.</p>`; return; }
      if (!res.ok) throw new Error(String(res.status));
      const r = await res.json();
      out.innerHTML = `<p><span class="pill pass">Valid</span> Certificate <strong>${esc(id)}</strong> was issued to <strong>${esc(r.name)}</strong> on ${esc(fmtDateTime(r.earnedAt))}${r.finalBest == null ? "" : `, with a final assessment score of ${esc(r.finalBest)}%`}.</p>`;
    } catch (e) {
      out.innerHTML = '<p class="note">Verification is unavailable right now. Try again shortly.</p>';
    }
  });
}

''' + h[end:]

# ---- server-side grading: certificates come only from the API ----
start = h.index('async function checkEarned() {')
end = h.index('/* ---------- completion register')
h = h[:start] + h[end:]
sub('''    async onDone(score) {
      progress["m" + i] = { done: true, score }; save();
      await checkEarned(); renderToc(i); syncRecord();''',
    '''    async onDone(score, answers) {
      progress["m" + i] = { done: true, score }; save();
      await recordQuiz("m" + i, answers); renderToc(i);''')
sub('''    async onDone(score) {
      const pct''', '''    async onDone(score, answers) {
      const pct''')
sub('      save(); await checkEarned(); renderToc(FINAL); syncRecord();',
    '      save(); await recordQuiz("final", answers); renderToc(FINAL);')
sub('  const results = {};\n', '  const results = {}, answers = {};\n')
sub('    scoreBox.innerHTML = await opts.onDone(score);', '    scoreBox.innerHTML = await opts.onDone(score, answers);')
sub('      results[q.id] = ok;\n', '      results[q.id] = ok;\n      answers[q.id] = order[Number(picked.value)];\n')
sub('''  if (!progress.earnedAt) {
    page.appendChild(el("p", {}, "Your certificate is issued''',
    '''  if (!progress.earnedAt && earned()) {
    const wait = el("p", { class: "note", "aria-live": "polite" }, "You have met both requirements. Confirming your results with MedNova Lifesciences…");
    page.appendChild(wait);
    await syncRecord();
    if (progress.earnedAt) { renderToc(CERT); return renderCert(); }
    wait.textContent = blocked
      ? "We need to confirm your email address with a code before issuing your certificate on this device."
      : lastSyncOk
        ? "Your saved results don't yet meet both requirements. Retake the final assessment, or contact info@mednovalife.com if this persists."
        : "We couldn't reach MedNova Lifesciences to issue your certificate. Check your internet connection and try again.";
    const next = el("button", { type: "button", class: "btn" }, blocked ? "Confirm it's you" : "Try again");
    next.addEventListener("click", () => blocked ? renderCode() : renderCert());
    page.appendChild(next);
    return;
  }
  if (!progress.earnedAt) {
    page.appendChild(el("p", {}, "Your certificate is issued''')
sub('the date and time, as soon as both requirements are met:',
    'the date and time, as soon as both requirements are met and your results are saved:')

# ---- sign in on any device: first device owns the record, others confirm by emailed code ----
sub('  form.addEventListener("submit", ev => {', '  form.addEventListener("submit", async ev => {')
sub('''    learner = { name, email };
    lsSet(LEARNER_KEY, JSON.stringify(learner));
    startCourse();''', '''    learner = { name, email };
    lsSet(LEARNER_KEY, JSON.stringify(learner));
    blocked = false;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Signing in…";
    loadProgress();
    try { mergeServer(await api("sync", {})); save(); }
    catch (e) { if (e instanceof ApiError && e.status === 409) return renderCode(e.data.newLearner); /* offline: continue, sync later */ }
    startCourse();''')
sub('function signOut() {\n  lsDel(LEARNER_KEY);', 'function signOut() {\n  lsDel(LEARNER_KEY);\n  blocked = false;')
sub('<div class="meter"><div class="meter-bar">',
    '<div class="sync-note" id="sync-note" hidden></div>\n        <div class="meter"><div class="meter-bar">')
sub('MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate.</p>',
    "MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate. We'll email you a 6-digit code to confirm your email address, and again when you sign in on another device.</p>")
sub('/* Main column */', '.sync-note { border: 1px solid var(--bad); background: var(--bad-soft); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; font-size: 15px; }\n.sync-note p { margin: 0; }\n/* Main column */')

# ---- certificate: printed name, score and number come from the issued record ----
sub('  const INK = "#142229",', '  const certName = progress.certName || learner.name;\n  const certScore = progress.certFinalScore ?? finalState().best;\n  const INK = "#142229",')
sub('g.font = fit(learner.name, 700, 124, DISPLAY, 1900); g.fillStyle = INK; g.fillText(learner.name, W / 2, 600);',
    'g.font = fit(certName, 700, 124, DISPLAY, 1900); g.fillStyle = INK; g.fillText(certName, W / 2, 600);')
sub('Final assessment score: ${finalState().best}%', 'Final assessment score: ${certScore}%')
sub('block(W / 2, "Certificate ID", progress.certId);', 'block(W / 2, "Certificate No.", progress.certId);')
sub('Congratulations, ${esc(learner.name)}. You completed', 'Congratulations, ${esc(progress.certName || learner.name)}. You completed')
sub('genuine with certificate ID <strong>', 'genuine with certificate number <strong>')
sub('alt: `Certificate of completion for ${learner.name},', 'alt: `Certificate of completion for ${progress.certName || learner.name},')
sub('const fname = `PV-CE-Certificate-${learner.name.replace', 'const fname = `PV-CE-Certificate-${progress.certId}-${(progress.certName || learner.name).replace')

# ---- verification page: new certificate number format ----
sub('Enter the certificate ID printed on', 'Enter the certificate number printed on')
sub('<label for="verify-id">Certificate ID</label><input id="verify-id" type="text" maxlength="14" autocomplete="off" placeholder="PVCE-1A2B-3C4D"',
    '<label for="verify-id">Certificate number</label><input id="verify-id" type="text" maxlength="24" autocomplete="off" placeholder="PVCE-2026-00001-K7QM"')
sub('if (!/^PVCE-[0-9A-F]{4}-[0-9A-F]{4}$/.test(id)) { err.textContent = "Enter the ID exactly as printed, for example PVCE-1A2B-3C4D."; return; }',
    'if (!/^PVCE-\\d{4}-\\d{5,}-[A-Z2-9]{4}$/.test(id)) { err.textContent = "Enter the number exactly as printed, for example PVCE-2026-00001-K7QM."; return; }')
sub('${r.finalBest == null ? "" : `, with a final assessment score of ${esc(r.finalBest)}%`}', '${r.finalScore == null ? "" : `, with a final assessment score of ${esc(r.finalScore)}%`}')
sub('<th>Certificate ID</th>', '<th>Certificate No.</th>')

# ---- boot ----
sub('if (learner) startCourse(); else renderSignin();\ninitRuntime();',
    'initRuntime();\n'
    'const bootHash = (location.hash || "").replace("#", "");\n'
    'if (bootHash === "verify") renderVerify();\n'
    'else if (bootHash === "register" && !learner) renderRegister();\n'
    'else if (learner) startCourse(); else renderSignin();\n'
    'window.addEventListener("hashchange", () => { if (location.hash === "#verify") renderVerify(); });')

# solo layout for register/verify pages opened without signing in
sub('/* Main column */', '.shell.solo { grid-template-columns: minmax(0, 1fr); max-width: 980px; }\n/* Main column */')


# ---- Google Analytics (same tag as the rest of mednovalife.com) + course events ----
sub('<link rel="canonical" href="https://mednovalife.com/pharmacovigilance-ce-course">',
    '<link rel="canonical" href="https://mednovalife.com/pharmacovigilance-ce-course">\n'
    '<!-- Google tag (gtag.js) -->\n'
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-70L73W3SD6"></script>\n'
    '<script nonce="mednova-inline-2026">\n'
    '  window.dataLayer = window.dataLayer || [];\n'
    '  function gtag(){dataLayer.push(arguments);}\n'
    "  gtag('js', new Date());\n"
    "  gtag('config', 'G-70L73W3SD6');\n"
    '</script>')
sub('const API = "/api/course";',
    'const API = "/api/course";\n'
    '// Course events for Google Analytics. Never send names, emails or certificate numbers.\n'
    'const track = (name, params) => { try { if (typeof gtag === "function") gtag("event", name, params || {}); } catch (e) {} };')
sub('  if (s.earnedAt && s.certId) {\n    progress.earnedAt',
    '  if (s.issuedNow) track("course_certificate_issued", { score_percent: s.certFinalScore });\n'
    '  if (s.earnedAt && s.certId) {\n    progress.earnedAt')
sub('    catch (e) { if (e instanceof ApiError && e.status === 409) return renderCode(e.data.newLearner); /* offline: continue, sync later */ }\n    startCourse();',
    '    catch (e) { if (e instanceof ApiError && e.status === 409) return renderCode(e.data.newLearner); /* offline: continue, sync later */ }\n'
    '    track("course_sign_in");\n    startCourse();')
sub('      loadProgress(); mergeServer(s); save();\n      startCourse();',
    '      loadProgress(); mergeServer(s); save();\n      track("course_device_confirmed");\n      startCourse();')
sub('      await recordQuiz("m" + i, answers); renderToc(i);',
    '      track("course_module_complete", { module_number: i + 1, score, total: m.quiz.length });\n'
    '      await recordQuiz("m" + i, answers); renderToc(i);')
sub('      save(); await recordQuiz("final", answers); renderToc(FINAL);',
    '      track("course_final_assessment", { score_percent: pct, passed: pct >= F.passMark });\n'
    '      save(); await recordQuiz("final", answers); renderToc(FINAL);')

# ---- privacy: consent at sign-in + course privacy notice (#privacy) ----
sub('        <button class="btn" type="submit">Sign in and continue</button>',
    '        <div class="field check"><label for="signin-consent"><input id="signin-consent" type="checkbox"> <span>I have read the <a href="#privacy" target="_blank" rel="noopener">course privacy notice</a> and agree to MedNova Lifesciences using my details as it describes.</span></label><span class="err" id="signin-consent-err"></span></div>\n'
    '        <button class="btn" type="submit">Sign in and continue</button>')
sub('    if (!ok) return;\n',
    '    const consent = document.getElementById("signin-consent");\n'
    '    document.getElementById("signin-consent-err").textContent = ok && !consent.checked ? "Tick the box to confirm you agree to the privacy notice." : "";\n'
    '    if (ok && !consent.checked) { consent.focus(); ok = false; }\n'
    '    if (!ok) return;\n')
sub('.field .err {',
    '.field.check label { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; font-size: 15px; }\n'
    '.signin .field.check input, .field.check input { width: 20px; height: 20px; flex: 0 0 auto; margin-top: 2px; padding: 0; }\n'
    '.reg-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }\n'
    '.reg-tools input { font: inherit; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); color: var(--ink); flex: 1 1 260px; min-width: 0; }\n'
    '.privacy h3 { margin-top: 8px; }\n.privacy ul { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }\n'
    '.field .err {')

start = h.index('/* ---------- certificate verification (public) ---------- */')
h = h[:start] + r'''/* ---------- course privacy notice (public) ---------- */
function renderPrivacy() {
  const page = standalonePage();
  page.classList.add("privacy");
  page.innerHTML = `<div class="mod-eyebrow">Privacy</div><h2>Course privacy notice</h2>
    <p>This notice explains how MedNova Lifesciences Ltd handles your personal data when you take the ${esc(COURSE_NAME)} at mednovalife.com. It sits alongside the Nigeria Data Protection Act 2023.</p>
    <h3>What we collect</h3>
    <ul>
      <li>Your full name and email address, as you enter them when you sign in.</li>
      <li>Your course results: your score on each knowledge check and on the final assessment, and when you completed the course. We mark the answers you submit but don't keep them.</li>
      <li>Your certificate details: certificate number, the name printed on it, date and time of completion, and final score.</li>
      <li>A random identifier for each device you sign in on, and short-lived sign-in codes we email you to confirm your email address and when you add a new device.</li>
      <li>Anonymous usage statistics through Google Analytics, such as pages viewed and modules completed. We don't send your name, email or certificate number to Google.</li>
    </ul>
    <h3>Why we use it</h3>
    <ul>
      <li>To run the course for you: save your progress, let you continue on other devices, and mark your assessments.</li>
      <li>To issue your certificate and email it to you.</li>
      <li>To confirm, when you or someone you show it to asks, that a certificate number is genuine. The verification page shows the name, completion date and score for a certificate number. It never shows your email address.</li>
      <li>To understand how the course is used so we can improve it.</li>
    </ul>
    <p>We process your details because you ask us to provide the course and certificate, and with your consent, which you give at sign-in.</p>
    <h3>Who handles it</h3>
    <p>Only MedNova Lifesciences staff who administer the course can see learner records. We use these service providers to run it: Vercel (website hosting), Supabase (database, hosted in the European Union), Resend (email delivery) and Google Analytics (usage statistics). Some of these providers may process data outside Nigeria, under their own data protection safeguards. We don't sell your data or use it for marketing without asking you.</p>
    <h3>How long we keep it</h3>
    <p>We keep your course record and certificate details for as long as your certificate may need to be verified. You can ask us to delete your record at any time. If we delete it, we can no longer confirm your certificate is genuine.</p>
    <h3>Your rights</h3>
    <p>You can ask to see the personal data we hold about you, to correct it, to delete it, or to withdraw your consent. Email <a href="mailto:info@mednovalife.com">info@mednovalife.com</a>. If you're unhappy with how we handle your data, you can complain to the Nigeria Data Protection Commission.</p>
    <p class="note">Last updated 10 October 2026.</p>
    <p><a href="#" id="privacy-back">Go to the course</a></p>`;
  document.getElementById("privacy-back").addEventListener("click", ev => {
    ev.preventDefault(); history.replaceState(null, "", location.pathname);
    if (learner) startCourse(); else renderSignin();
  });
}

''' + h[start:]
sub('if (bootHash === "verify") renderVerify();', 'if (bootHash === "verify") renderVerify();\nelse if (bootHash === "privacy") renderPrivacy();')
sub('window.addEventListener("hashchange", () => { if (location.hash === "#verify") renderVerify(); });',
    'window.addEventListener("hashchange", () => { if (location.hash === "#verify") renderVerify(); else if (location.hash === "#privacy") renderPrivacy(); });')
sub('MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate.',
    'MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate (<a href="#privacy" target="_blank" rel="noopener">privacy notice</a>).')

# ---- register: search + CSV export ----
start = h.index('    box.innerHTML = `<p class="note">${rows.length} learner')
end = h.index('\n', start)
h = h[:start] + r'''    box.innerHTML = `<div class="reg-tools"><input id="reg-q" type="search" aria-label="Search learners" placeholder="Search by name, email or certificate number"><button type="button" class="btn ghost" id="reg-csv">Download CSV</button></div>
      <p class="note" id="reg-count" aria-live="polite"></p>
      <div class="tbl"><table><thead><tr><th>Name</th><th>Email</th><th>Modules</th><th>Final</th><th>Completed</th><th>Certificate No.</th></tr></thead><tbody id="reg-body"></tbody></table></div>`;
    const qIn = document.getElementById("reg-q");
    const matches = () => {
      const q = qIn.value.trim().toLowerCase();
      return q ? rows.filter(r => [r.name, r.email, r.certId].some(v => String(v || "").toLowerCase().includes(q))) : rows;
    };
    const draw = () => {
      const list = matches();
      document.getElementById("reg-body").innerHTML = list.map(r => `<tr><td>${esc(r.name || "")}</td><td>${esc(r.email || "")}</td><td class="num">${esc(r.modulesDone ?? 0)}/${esc(r.modulesTotal ?? N)}</td><td class="num">${r.finalBest == null ? "—" : esc(r.finalBest) + "%"}</td><td class="num">${r.earnedAt ? esc(fmtDateTime(r.earnedAt)) : "—"}</td><td class="num">${esc(r.certId || "—")}</td></tr>`).join("") || '<tr><td colspan="6">No learners match your search.</td></tr>';
      document.getElementById("reg-count").textContent = `Showing ${list.length} of ${rows.length} learner${rows.length === 1 ? "" : "s"} · ${rows.filter(r => r.earnedAt).length} certified`;
    };
    qIn.addEventListener("input", draw);
    document.getElementById("reg-csv").addEventListener("click", () => {
      // Quote every cell; prefix formula-like values so spreadsheets don't execute them.
      const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const head = ["Name", "Email", "Modules completed", "Modules total", "Final assessment best (%)", "Completed at (UTC)", "Certificate number", "Last activity (UTC)"];
      const lines = [head, ...matches().map(r => [r.name, r.email, r.modulesDone, r.modulesTotal, r.finalBest, r.earnedAt, r.certId, r.updatedAt])].map(row => row.map(cell).join(","));
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: `pv-ce-register-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
    draw();''' + h[end:]

# ---- signature: scanned image when provided, script lettering otherwise ----
sub('  g.font = `130px ${SCRIPT}`; g.fillStyle = "#1b2f6b"; g.fillText(SIGNATORY.replace(/^Dr\\.?\\s+/, ""), sx, baseY - 10);',
    '  const sig = await loadSignature();\n'
    '  if (sig) {\n'
    '    const sh = 190, sw = Math.min(620, sig.naturalWidth * sh / sig.naturalHeight);\n'
    '    g.drawImage(sig, sx - sw / 2, baseY + 16 - sh, sw, sh);\n'
    '  } else {\n'
    '    g.font = `130px ${SCRIPT}`; g.fillStyle = "#1b2f6b"; g.fillText(SIGNATORY.replace(/^Dr\\.?\\s+/, ""), sx, baseY - 10);\n'
    '  }')
sub('async function drawCertificate() {',
    '// Scanned signature of the signatory. Add a transparent PNG at this path to use it on every certificate.\n'
    'const SIGNATURE_SRC = "/public/images/course/signature.png";\n'
    'function loadSignature() {\n'
    '  return new Promise(resolve => {\n'
    '    const img = new Image();\n'
    '    img.onload = () => resolve(img.naturalWidth ? img : null);\n'
    '    img.onerror = () => resolve(null);\n'
    '    img.src = SIGNATURE_SRC;\n'
    '  });\n'
    '}\n'
    'async function drawCertificate() {')

# ---- pass marks, modules unlock in order, final assessment marked only on submit with a 24-hour wait ----
# The server (frontend/api/course.js) enforces the same rules; these steps make the page show them.
sub('''function doneCount() { return COURSE.modules.filter((_, i) => modState(i) && modState(i).done).length; }
function finalState() { return progress.final || null; }''',
    '''// Each knowledge check is passed at MODULE_PASS_PCT, and modules unlock in order. The final assessment
// unlocks once every check is passed; after a failed attempt it stays locked until progress.final.retryAt.
const MODULE_PASS_PCT = 60;
const FINAL_WAIT_HOURS = 24;
function passScore(i) { return Math.ceil(COURSE.modules[i].quiz.length * MODULE_PASS_PCT / 100); }
function modPassed(i) { const s = modState(i); return !!(s && s.done && s.score >= passScore(i)); }
function doneCount() { return COURSE.modules.filter((_, i) => modPassed(i)).length; }
function firstUnpassed() { return COURSE.modules.findIndex((_, i) => !modPassed(i)); }
function modUnlocked(i) { const f = firstUnpassed(); return f < 0 || i <= f; }
function finalUnlocked() { return doneCount() === N; }
function finalState() { return progress.final || null; }
function finalRetryAt() { const f = finalState(); return f && f.retryAt && new Date(f.retryAt) > new Date() ? f.retryAt : null; }''')

# server results are the record of truth: drop local results the server didn't accept
sub('''  for (const [k, v] of Object.entries(s.results || {})) {
    if (pending[k]) continue;
    if (/^m\\d+$/.test(k)) progress[k] = { done: true, score: v.score };
    else if (k === "final") progress.final = { best: v.best, last: v.last };
  }''', '''  const results = s.results || {};
  for (const k of [...COURSE.modules.map((_, i) => "m" + i), "final"]) {
    if (pending[k]) continue;
    const v = results[k];
    if (!v) delete progress[k];
    else if (k === "final") progress.final = { best: v.best, last: v.last, retryAt: v.retryAt || null };
    else progress[k] = { done: true, score: v.score };
  }''')
sub('''      for (const quiz of Object.keys(progress.pending)) {
        mergeServer(await api("submit", { quiz, answers: progress.pending[quiz] }));
        delete progress.pending[quiz]; save();
      }''', '''      for (const quiz of Object.keys(progress.pending)) {
        try { mergeServer(await api("submit", { quiz, answers: progress.pending[quiz] })); }
        catch (e) {
          // Refused for good (locked, already passed, waiting): drop it. Offline or unconfirmed: keep it queued.
          if (!(e instanceof ApiError) || e.status === 409 || e.status >= 500) throw e;
          delete progress.pending[quiz];
          mergeServer(e.data.state);
        }
        delete progress.pending[quiz]; save();
      }''')

# a locked page drawn from this device's saved progress redraws once the server's results arrive
# (e.g. on a new phone, where the server knows modules this browser hasn't seen yet)
sub('let currentView = OVERVIEW;', 'let currentView = OVERVIEW, showingLocked = false;')
sub('''function pageShell() {
  const main = document.getElementById("main");''', '''function pageShell() {
  showingLocked = false;
  const main = document.getElementById("main");''')
sub('    if (document.getElementById("toc")) renderToc(currentView);\n',
    '    if (document.getElementById("toc")) renderToc(currentView);\n'
    '    if (showingLocked && document.getElementById("toc")) go(currentView);\n')

# sidebar: pass/fail per module, padlocks on locked steps
sub('''      const s = modState(i);
      const st = s && s.done ? `<span class="st done">${s.score}/${COURSE.modules[i].quiz.length}</span>` : "";''',
    '''      const s = modState(i);
      const st = !modUnlocked(i) ? LOCK
        : s && s.done ? `<span class="st ${modPassed(i) ? "done" : "fail"}">${s.score}/${COURSE.modules[i].quiz.length}</span>` : "";''')
sub('''  toc.appendChild(tocButton("Final assessment", "FA", FINAL, current, f ? `<span class="st ${finalPassed() ? "done" : ""}">${f.best}%</span>` : ""));''',
    '''  toc.appendChild(tocButton("Final assessment", "FA", FINAL, current, !finalUnlocked() ? LOCK : f ? `<span class="st ${finalPassed() ? "done" : "fail"}">${f.best}%</span>` : ""));''')
sub('function renderToc(current) {',
    'const LOCK = \'<span class="st lock"><span aria-hidden="true">🔒</span><span class="sr-only">Locked</span></span>\';\n'
    'function renderToc(current) {')
sub('${d} of ${N} knowledge checks completed', '${d} of ${N} knowledge checks passed')
sub('.toc .st.done { color: var(--ok); }',
    '.toc .st.done { color: var(--ok); }\n.toc .st.fail { color: var(--bad); }\n.toc button[aria-current="true"] .st.fail { color: inherit; }\n'
    '.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }\n'
    '.summary-grid .s.fail { color: var(--bad); }\n'
    '.score p { flex-basis: 100%; margin: 0; }\n.score p strong { font-family: inherit; font-size: inherit; }\n'
    '.quiz .q-foot.submit { flex-wrap: wrap; }\n'
    '.cert-name { border: 1px solid var(--accent); border-radius: 8px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }\n'
    '.cert-name p { margin: 0; }\n.cert-name .field { margin: 0; }')

# overview
sub('''      <li>Work through the modules in order. Part 1 builds the foundations; Part 2 applies them to company PV practice and NAFDAC requirements in Nigeria.</li>
      <li>Answer the knowledge check at the end of each module. Each answer is marked right or wrong as soon as you check it. If you miss a question, reread the module and retake the check.</li>
      <li>When every knowledge check is complete, take the final assessment. A score of ${COURSE.final.passMark}% or more issues your certificate automatically, dated and timed, ready to download and print.</li>''',
    '''      <li>Work through the modules in order. Part 1 builds the foundations; Part 2 applies them to company PV practice and NAFDAC requirements in Nigeria.</li>
      <li>Pass the knowledge check at the end of each module to unlock the next one. You need ${MODULE_PASS_PCT}% to pass (3 of 5 or 5 of 8). Each answer is marked right or wrong as soon as you check it. If you don't pass, reread the module and retake the check as often as you need. Your best score counts.</li>
      <li>When every knowledge check is passed, the final assessment unlocks. Answer all ${COURSE.final.quiz.length} questions and submit to see your score. A score of ${COURSE.final.passMark}% or more issues your certificate automatically, dated and timed, ready to download and print. If you score below ${COURSE.final.passMark}%, you can retake it after ${FINAL_WAIT_HOURS} hours.</li>''')
sub('''      b.innerHTML = `<span class="n">Module ${pad(i + 1)}</span><span>${m.short}</span><span class="s ${s && s.done ? "done" : ""}">${s && s.done ? `Completed · ${s.score} of ${m.quiz.length} correct` : "Not started"}</span>`;''',
    '''      const [cls, label] = modPassed(i) ? ["done", `Passed · ${s.score} of ${m.quiz.length} correct`]
        : !modUnlocked(i) ? ["", "Locked"]
        : s && s.done ? ["fail", `Not passed yet · ${s.score} of ${m.quiz.length} correct`] : ["", "Not started"];
      b.innerHTML = `<span class="n">Module ${pad(i + 1)}</span><span>${m.short}</span><span class="s ${cls}">${label}</span>`;''')
sub('''  const next = COURSE.modules.findIndex((_, i) => !(modState(i) && modState(i).done));
  pager(page, null, null,''', '''  const next = firstUnpassed();
  pager(page, null, null,''')

# module page: locked until the previous check is passed; pass/fail message after the check
sub('''function renderModule(i) {
  const m = COURSE.modules[i];
  const page = pageShell();''', '''function renderLocked(page, eyebrow, title, message, target) {
  showingLocked = true;
  page.innerHTML = `<div class="mod-eyebrow">${eyebrow}</div><h2>${title}</h2>
    <p><span class="pill todo"><span aria-hidden="true">🔒</span> Locked</span></p><p>${message}</p>`;
  pager(page, "← Overview", OVERVIEW, `Go to Module ${target + 1}`, target);
}
function renderModule(i) {
  const m = COURSE.modules[i];
  const page = pageShell();
  if (!modUnlocked(i)) {
    const f = firstUnpassed();
    return renderLocked(page, `${esc(m.track)} · Module ${pad(i + 1)} of ${N}`, m.title,
      `Pass the Module ${f + 1} knowledge check to unlock this module. Modules unlock in order, and each knowledge check needs ${MODULE_PASS_PCT}% to pass.`, f);
  }''')
sub('''    wrongNote: "Review the module content and examples, then retake the check.",
    async onDone(score, answers) {
      progress["m" + i] = { done: true, score }; save();
      track("course_module_complete", { module_number: i + 1, score, total: m.quiz.length });
      await recordQuiz("m" + i, answers); renderToc(i);
      return `<div><div class="verdict-note">Knowledge check complete</div><strong>${score} of ${m.quiz.length} correct</strong></div>`;
    },''', '''    wrongNote: "Review the module content and examples, then retake the check.",
    async onDone(score, answers) {
      const prev = modState(i), need = passScore(i), total = m.quiz.length, pass = score >= need;
      progress["m" + i] = { done: true, score: Math.max(score, prev && prev.done ? prev.score : 0) }; save();
      track("course_module_complete", { module_number: i + 1, score, total, passed: pass });
      await recordQuiz("m" + i, answers); renderToc(i);
      const next = i < N - 1 ? `Module ${i + 2} is unlocked.` : "The final assessment is unlocked.";
      if (pass) return `<div><div class="verdict-note">Knowledge check passed</div><strong>${score} of ${total} correct</strong> <span class="pill pass">Passed</span></div><p>Well done. You needed ${need} of ${total} to pass. ${next}</p>`;
      if (modPassed(i)) return `<div><div class="verdict-note">Knowledge check complete</div><strong>${score} of ${total} correct</strong> <span class="pill fail">Below pass mark</span></div><p>Your best score of ${modState(i).score} of ${total} still counts, so this module stays passed. ${next}</p>`;
      return `<div><div class="verdict-note">Knowledge check not passed</div><strong>${score} of ${total} correct</strong> <span class="pill fail">Not passed</span></div><p>You need ${need} of ${total} to pass and unlock ${i < N - 1 ? `Module ${i + 2}` : "the final assessment"}. Review the module content and examples, then retake the check.</p>`;
    },''')

# final assessment: unlocked by passing every module; answers marked only as a total on submit;
# a failed attempt locks it for 24 hours; no retakes after passing
start = h.index('function renderFinal() {')
end = h.index('/* ---------- certificate ---------- */')
h = h[:start] + r'''function renderFinal() {
  const page = pageShell();
  const F = COURSE.final, f = finalState();
  page.innerHTML = `<div class="mod-eyebrow">Assessment</div><h2>Final assessment</h2>`;
  if (!finalUnlocked()) {
    const nx = firstUnpassed();
    return renderLocked(page, "Assessment", "Final assessment",
      `The final assessment unlocks when you have passed all ${N} knowledge checks. You have passed ${doneCount()} of ${N}.`, nx);
  }
  if (finalPassed()) {
    page.appendChild(el("div", { class: "score", role: "status" }, `<div><div class="verdict-note">Final assessment passed</div><strong>You scored ${f.best}%</strong> <span class="pill pass">Passed</span></div>
      <p>Congratulations. The pass mark for the certificate is ${F.passMark}%, and you passed. ${progress.earnedAt ? "Your certificate is ready." : "Your certificate is being issued."}</p>`));
    pager(page, `← Module ${N}`, N - 1, progress.earnedAt ? "View your certificate →" : "Certificate →", CERT);
    return;
  }
  const retryAt = finalRetryAt();
  if (f && retryAt) {
    page.appendChild(el("div", { class: "score", role: "status" }, `<div><div class="verdict-note">Final assessment not passed</div><strong>You scored ${f.last}%</strong> <span class="pill fail">Below pass mark</span></div>
      <p>You need ${F.passMark}% or more for the certificate. You can retake the assessment from <strong>${esc(fmtDateTime(retryAt))}</strong>. Use the time to review the modules.</p>`));
    pager(page, "← Review the modules", OVERVIEW, null);
    return;
  }
  page.appendChild(el("p", {}, `${F.quiz.length} questions drawn from all ${N} modules. Answer every question, then submit. You'll see your total score when you submit; individual answers aren't marked. The pass mark is ${F.passMark}%. If you score below it, you can retake the assessment after ${FINAL_WAIT_HOURS} hours.`));
  if (f) page.appendChild(el("p", { class: "note" }, `Your last attempt scored ${f.last}%.`));
  page.appendChild(renderExam(F.quiz));
  pager(page, `← Module ${N}`, N - 1, null);
}

// Final assessment form: nothing is marked in the browser. The server grades the whole attempt.
function renderExam(quiz) {
  const form = el("form", { class: "quiz", novalidate: "" });
  const answers = {};
  quiz.forEach((q, qi) => {
    const box = el("div", { class: "q" });
    const fs = el("fieldset");
    fs.appendChild(el("legend", {}, `<span class="qn">${qi + 1}.</span>${q.q}`));
    const order = q.tf ? q.o : shuffled(q.o);
    const name = `${q.id}-${Math.random().toString(36).slice(2, 7)}`;
    order.forEach((text, oi) => {
      const id = `${name}-${oi}`;
      const lab = el("label", { class: "opt", for: id });
      lab.appendChild(el("input", { type: "radio", name, id, value: String(oi) }));
      lab.appendChild(el("span", {}, text));
      fs.appendChild(lab);
    });
    fs.addEventListener("change", () => { const p = fs.querySelector("input:checked"); if (p) answers[q.id] = order[Number(p.value)]; });
    box.appendChild(fs);
    form.appendChild(box);
  });
  // The name is printed on the certificate and fixed once it is issued, so the learner confirms it here.
  const nameBox = el("div", { class: "cert-name" });
  const drawName = editing => {
    nameBox.innerHTML = editing
      ? `<div class="field"><label for="cert-name-in">Full name for your certificate</label><input id="cert-name-in" type="text" autocomplete="name" maxlength="80" value="${esc(learner.name)}"><span class="err" id="cert-name-err"></span></div>
         <div class="q-foot"><button type="button" class="btn" id="cert-name-save">Save name</button><button type="button" class="btn ghost" id="cert-name-cancel">Cancel</button></div>`
      : `<p>Your certificate will be issued to: <strong>${esc(learner.name)}</strong> <button type="button" class="linkbtn" id="cert-name-edit">Change</button></p>
         <div class="field check"><label for="cert-name-ok"><input id="cert-name-ok" type="checkbox"> <span>This is my name exactly as it should appear on my certificate. I understand it can't be changed after the certificate is issued.</span></label></div>`;
    if (!editing) {
      nameBox.querySelector("#cert-name-edit").addEventListener("click", () => { drawName(true); nameBox.querySelector("#cert-name-in").focus(); });
      return;
    }
    nameBox.querySelector("#cert-name-cancel").addEventListener("click", () => drawName(false));
    nameBox.querySelector("#cert-name-save").addEventListener("click", async () => {
      const name = nameBox.querySelector("#cert-name-in").value.trim().replace(/\s+/g, " ");
      const err = nameBox.querySelector("#cert-name-err");
      if (name.length < 3 || !/\s/.test(name)) { err.textContent = "Enter your full name (first name and surname)."; return; }
      learner.name = name;
      lsSet(LEARNER_KEY, JSON.stringify(learner));
      const who = document.querySelector(".who b");
      if (who) who.textContent = name;
      drawName(false);
      nameBox.querySelector("#cert-name-ok").focus();
      syncRecord(); // the new name is also sent with the submission
    });
  };
  drawName(false);
  form.appendChild(nameBox);
  const foot = el("div", { class: "q-foot submit" });
  const btn = el("button", { type: "submit", class: "btn" }, "Submit assessment");
  const out = el("p", { class: "note", "aria-live": "polite" });
  foot.append(btn, out);
  form.appendChild(foot);
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const missing = quiz.findIndex(q => !(q.id in answers));
    if (missing >= 0) {
      out.textContent = `Answer every question before you submit. Question ${missing + 1} has no answer yet.`;
      form.querySelectorAll("fieldset")[missing].querySelector("input").focus();
      return;
    }
    const nameOk = nameBox.querySelector("#cert-name-ok");
    if (!nameOk || !nameOk.checked) {
      out.textContent = nameOk ? "Confirm the name for your certificate before you submit." : "Save the name for your certificate before you submit.";
      (nameOk || nameBox.querySelector("input")).focus();
      return;
    }
    btn.disabled = true; out.textContent = "Submitting your answers…";
    try {
      const s = await api("submit", { quiz: "final", answers });
      const pct = Math.round(s.score / s.total * 100);
      track("course_final_assessment", { score_percent: pct, passed: pct >= COURSE.final.passMark });
      mergeServer(s); save();
      go(FINAL);
    } catch (e) {
      btn.disabled = false;
      if (e instanceof ApiError && e.status === 409) { renderSyncNote(); out.textContent = "Confirm it's you before you submit. Use the button in the course menu. Your answers stay selected."; return; }
      if (e instanceof ApiError && e.data.state) { mergeServer(e.data.state); save(); go(FINAL); return; }
      out.textContent = e instanceof ApiError && e.status < 500 && e.data.error ? e.data.error
        : "We couldn't submit your answers. Check your internet connection and try again. Your answers stay selected.";
    }
  });
  return form;
}

''' + h[end:]

# certificate requirements
sub('<span>Complete all ${N} knowledge checks (${d} of ${N} done)</span>',
    '<span>Pass all ${N} knowledge checks with ${MODULE_PASS_PCT}% or more (${d} of ${N} passed)</span>')
sub('d < N ? COURSE.modules.findIndex((_, i) => !(modState(i) && modState(i).done)) : FINAL);', 'd < N ? firstUnpassed() : FINAL);')

# privacy notice: the final assessment wait uses the time of the last attempt
sub('your score on each knowledge check and on the final assessment, and when you completed the course.',
    'your score on each knowledge check and on the final assessment, when you last took the final assessment, and when you completed the course.')
sub('Last updated 10 October 2026.', 'Last updated 11 October 2026.')

# ---- certificate: no email address (certificates are shared publicly) ----
sub('  g.font = `34px ${MONO}`; g.fillStyle = MUTED; g.fillText(learner.email, W / 2, 712);\n', '')

# ---- site icons, social sharing (Open Graph / Twitter) and structured data, as on the rest of the site ----
OG_TITLE = 'Pharmacovigilance CE Course with Certificate | MedNova Lifesciences'
OG_DESC = ('Online pharmacovigilance continuing education course: 17 modules on drug safety foundations, '
           'company PV practice and NAFDAC requirements, with knowledge checks, a final assessment and a verifiable '
           'certificate of completion. Start with Module 1 free.')
# Kept small (JPEG, ~60 KB): WhatsApp drops preview images near its ~300 KB limit.
OG_IMAGE = 'https://mednovalife.com/public/images/course/pv-ce-course-share-2.jpg'
URL = 'https://mednovalife.com/pharmacovigilance-ce-course'
course_ld = {
    '@context': 'https://schema.org', '@type': 'Course', 'name': 'Pharmacovigilance Continuing Education Course Series',
    'description': OG_DESC, 'url': URL, 'inLanguage': 'en', 'isAccessibleForFree': False,
    'offers': {'@type': 'Offer', 'category': 'Paid', 'price': 19999, 'priceCurrency': 'NGN', 'url': URL},
    'educationalCredentialAwarded': 'Certificate of completion',
    'provider': {'@type': 'Organization', 'name': 'MedNova Lifesciences', 'url': 'https://mednovalife.com'},
}
sub('<!-- Google tag (gtag.js) -->',
    '<meta name="theme-color" content="#0f3d2e">\n'
    '<meta name="robots" content="index,follow,max-image-preview:large">\n'
    '<link rel="icon" href="/favicon.ico" sizes="any">\n'
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n'
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n'
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n'
    '<link rel="manifest" href="/public/site.webmanifest">\n'
    f'<meta property="og:title" content="{OG_TITLE}">\n'
    f'<meta property="og:description" content="{OG_DESC}">\n'
    '<meta property="og:type" content="website">\n'
    f'<meta property="og:url" content="{URL}">\n'
    f'<meta property="og:image" content="{OG_IMAGE}">\n'
    f'<meta property="og:image:secure_url" content="{OG_IMAGE}">\n'
    '<meta property="og:image:type" content="image/jpeg">\n'
    '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
    '<meta property="og:image:alt" content="MedNova Lifesciences Pharmacovigilance CE Course: Module 1 free, 17 modules, final assessment, verifiable certificate">\n'
    '<meta property="og:site_name" content="MedNova Lifesciences">\n'
    '<meta name="twitter:card" content="summary_large_image">\n'
    f'<meta name="twitter:title" content="{OG_TITLE}">\n'
    f'<meta name="twitter:description" content="{OG_DESC}">\n'
    f'<meta name="twitter:image" content="{OG_IMAGE}">\n'
    '<meta name="twitter:image:alt" content="MedNova Lifesciences Pharmacovigilance CE Course: Module 1 free, 17 modules, final assessment, verifiable certificate">\n'
    '<script nonce="mednova-inline-2026" type="application/ld+json">' + json.dumps(course_ld) + '</script>\n'
    '<!-- Google tag (gtag.js) -->')

# ---- paid access: Module 1 is a free preview; content comes from the server, module by module ----
# The page keeps only the course outline (COURSE, rewritten at the end of this script); module content and
# quizzes are in frontend/api/course-content.json and sent by /api/course?action=content to learners with access.
sub('async function isCorrect(q, text) { return (await digest(COURSE.salt + "|" + q.id + "|" + text)) === q.h; }',
    'let quizSalt = "";  // sent with each module\'s content\n'
    'async function isCorrect(q, text) { return (await digest(quizSalt + "|" + q.id + "|" + text)) === q.h; }')
sub('COURSE.modules[i].quiz.length', 'COURSE.modules[i].quizLen', count=2)
sub('of ${m.quiz.length} correct', 'of ${m.quizLen} correct', count=2)
sub('COURSE.final.quiz.length', 'COURSE.final.count', count=2)
sub('${F.quiz.length} questions drawn from all', '${F.count} questions drawn from all')
sub('function earned() { return doneCount() === N && finalPassed(); }',
    '''function earned() { return doneCount() === N && finalPassed(); }
// Paid access (the server decides; progress.access mirrors it). Module 1 is a free preview.
const FREE_MODULES = 1;
const ENROL = -5;
function enrolled() { return !!(progress.access && progress.access.enrolled); }
function needsEnrol(i) { return i >= FREE_MODULES && !enrolled(); }
const priceText = () => "₦" + Number((progress.access && progress.access.price && progress.access.price.amount) || 19999).toLocaleString("en-NG");''')
sub('  if (s.issuedNow) track("course_certificate_issued"',
    '  if (s.enrolled !== undefined) {\n'
    '    progress.access = { enrolled: !!s.enrolled, type: s.access, sponsor: s.sponsor, paymentsOpen: !!s.paymentsOpen, price: s.price };\n'
    '  }\n'
    '  if (s.issuedNow) track("course_certificate_issued"')

# content loading (cached for this page visit only)
sub('async function recordQuiz(quiz, answers) {',
    '''const contentCache = {};
async function loadContent(key) {
  if (!contentCache[key]) {
    const r = await api("content", { module: key });
    if (r.salt) quizSalt = r.salt;
    contentCache[key] = r;
  }
  return contentCache[key];
}
async function recordQuiz(quiz, answers) {''')

# sidebar and overview: enrol entry, padlocks on paid modules
sub('      const st = !modUnlocked(i) ? LOCK', '      const st = !modUnlocked(i) || needsEnrol(i) ? LOCK')
sub('current, !finalUnlocked() ? LOCK : f ?', 'current, !finalUnlocked() || !enrolled() ? LOCK : f ?')
sub('  toc.appendChild(tocButton("Start here", "··", OVERVIEW, current));\n',
    '  toc.appendChild(tocButton("Start here", "··", OVERVIEW, current));\n'
    '  if (!enrolled()) toc.appendChild(tocButton("Enrol in the full course", "₦", ENROL, current));\n')
sub('  else if (idx === REG) renderRegister();\n', '  else if (idx === REG) renderRegister();\n  else if (idx === ENROL) renderEnrolPage();\n')
sub('  if (hash === "certificate") start = CERT;\n', '  if (hash === "certificate") start = CERT;\n  if (hash === "enrol") start = ENROL;\n')
sub('        : !modUnlocked(i) ? ["", "Locked"]\n',
    '        : needsEnrol(i) ? ["", "Full course · enrol to unlock"]\n        : !modUnlocked(i) ? ["", "Locked"]\n')
sub('always confirm against the current version from NAFDAC before applying them.</p>`;\n',
    'always confirm against the current version from NAFDAC before applying them.</p>`;\n'
    '  if (!enrolled()) page.appendChild(enrolCallout());\n')

# module page: free preview, enrol page for paid modules, content from the server
start = h.index('function renderModule(i) {')
end = h.index('function renderFinal() {')
old_module = h[start:end]
render_body = old_module[old_module.index('  page.innerHTML = `\n    <div class="mod-eyebrow">'):]
h = h[:start] + r'''async function renderModule(i) {
  let m = COURSE.modules[i];
  const page = pageShell();
  if (needsEnrol(i)) return renderEnrol(page, `Module ${i + 1} is part of the full course.`);
  if (!modUnlocked(i)) {
    const f = firstUnpassed();
    return renderLocked(page, `${esc(m.track)} · Module ${pad(i + 1)} of ${N}`, m.title,
      `Pass the Module ${f + 1} knowledge check to unlock this module. Modules unlock in order, and each knowledge check needs ${MODULE_PASS_PCT}% to pass.`, f);
  }
  page.innerHTML = `<div class="mod-eyebrow">${esc(m.track)} · Module ${pad(i + 1)} of ${N}</div><h2>${m.title}</h2><p class="note" aria-live="polite">Loading the module…</p>`;
  let c;
  try { c = await loadContent(i); }
  catch (e) {
    if (currentView !== i) return;
    if (e instanceof ApiError && e.data.state) { mergeServer(e.data.state); save(); renderToc(i); return renderModule(i); }
    if (e instanceof ApiError && e.status === 409) { renderSyncNote(); page.querySelector(".note").textContent = "Confirm your email address to open this module. Use the button in the course menu."; return; }
    page.querySelector(".note").textContent = "We couldn't load this module. Check your internet connection, then try again.";
    const retry = el("button", { type: "button", class: "btn" }, "Try again");
    retry.addEventListener("click", () => renderModule(i));
    page.appendChild(retry);
    return;
  }
  if (currentView !== i) return;
  m = { ...m, ...c.module };
''' + render_body + h[end:]
sub('    intro: `${m.quiz.length} questions. Choose one answer', '    intro: `${m.quizLen} questions. Choose one answer')
sub('      const next = i < N - 1 ? `Module ${i + 2} is unlocked.` : "The final assessment is unlocked.";',
    '      const next = i < N - 1 ? (needsEnrol(i + 1) ? `Enrol in the full course to continue with Module ${i + 2}.` : `Module ${i + 2} is unlocked.`) : "The final assessment is unlocked.";')
sub('const prev = modState(i), need = passScore(i), total = m.quiz.length, pass', 'const prev = modState(i), need = passScore(i), total = m.quizLen, pass')

# final assessment: needs access; questions come from the server
sub('function renderFinal() {\n  const page = pageShell();\n  const F = COURSE.final, f = finalState();\n  page.innerHTML = `<div class="mod-eyebrow">Assessment</div><h2>Final assessment</h2>`;\n',
    'async function renderFinal() {\n  const page = pageShell();\n  const F = COURSE.final, f = finalState();\n'
    '  if (!enrolled()) return renderEnrol(page, "The final assessment and certificate are part of the full course.");\n'
    '  page.innerHTML = `<div class="mod-eyebrow">Assessment</div><h2>Final assessment</h2>`;\n')
sub('''  page.appendChild(renderExam(F.quiz));
  pager(page, `← Module ${N}`, N - 1, null);
}''', '''  const loading = el("p", { class: "note", "aria-live": "polite" }, "Loading the assessment…");
  page.appendChild(loading);
  let quiz;
  try { quiz = (await loadContent("final")).quiz; }
  catch (e) {
    if (currentView !== FINAL) return;
    if (e instanceof ApiError && e.data.state) { mergeServer(e.data.state); save(); renderToc(FINAL); return renderFinal(); }
    loading.textContent = "We couldn't load the assessment. Check your internet connection, then try again.";
    return;
  }
  if (currentView !== FINAL) return;
  loading.remove();
  page.appendChild(renderExam(quiz));
  pager(page, `← Module ${N}`, N - 1, null);
}''')

# enrol page, payment return, partner codes, course terms
start = h.index('/* ---------- certificate ---------- */')
h = h[:start] + r'''/* ---------- enrolment: Paystack payment or partner code ---------- */
function enrolCallout() {
  const box = el("div", { class: "enrol-callout" });
  box.innerHTML = `<p><strong>You're on the free preview:</strong> the course overview and Module 1. Enrol for ${esc(priceText())}, once, for lifetime access to all ${N} modules, the final assessment and your certificate.</p>`;
  const b = el("button", { type: "button", class: "btn" }, "Enrol in the full course");
  b.addEventListener("click", () => go(ENROL));
  box.appendChild(b);
  return box;
}
function renderEnrolPage() { renderEnrol(pageShell(), ""); }
function renderEnrol(page, reason) {
  showingLocked = true;
  const a = progress.access || {};
  page.innerHTML = `<div class="mod-eyebrow">Enrol</div><h2>Unlock the full course</h2>
    <p>${reason ? esc(reason) + " " : ""}You're on the free preview: the course overview and Module 1.</p>
    <div class="enrol-card">
      <div class="enrol-price"><strong>${esc(priceText())}</strong><span>one payment · lifetime access</span></div>
      <ul>
        <li>All ${N} modules, with knowledge checks</li>
        <li>The final assessment</li>
        <li>A certificate of completion with a number anyone can verify</li>
        <li>Lifetime access, on any device</li>
      </ul>
      <div class="field check"><label for="enrol-terms"><input id="enrol-terms" type="checkbox"> <span>I agree to the <a href="#terms" target="_blank" rel="noopener">course terms</a>, including that payments are non-refundable.</span></label></div>
      <div class="q-foot"><button type="button" class="btn" id="enrol-pay">Pay ${esc(priceText())}</button></div>
      <p class="note" id="enrol-msg" aria-live="polite">${a.paymentsOpen ? "Payments are processed securely by Paystack: card, bank transfer or USSD." : "Online payment opens soon. To enrol now, email <a href=\"mailto:info@mednovalife.com\">info@mednovalife.com</a>."}</p>
    </div>
    <h3>Have a partner code?</h3>
    <form id="redeem-form" class="enrol-code" novalidate>
      <div class="field"><label for="partner-code">Partner code</label><input id="partner-code" type="text" autocomplete="off" autocapitalize="characters" maxlength="40"><span class="err" id="partner-code-err"></span></div>
      <div class="q-foot"><button type="submit" class="btn ghost">Apply code</button></div>
    </form>
    <p class="note">If your organisation has enrolled you, your course unlocks when you sign in with the email address they registered. Questions: <a href="mailto:info@mednovalife.com">info@mednovalife.com</a>.</p>`;
  const pay = page.querySelector("#enrol-pay"), msg = page.querySelector("#enrol-msg"), terms = page.querySelector("#enrol-terms");
  if (!a.paymentsOpen) pay.disabled = true;
  pay.addEventListener("click", async () => {
    if (!terms.checked) { msg.textContent = "Tick the box to agree to the course terms first."; terms.focus(); return; }
    pay.disabled = true; msg.textContent = "Taking you to Paystack…";
    try {
      const r = await api("checkout", {});
      if (r.alreadyEnrolled) { mergeServer(r); save(); renderToc(currentView); return go(currentView === ENROL ? OVERVIEW : currentView); }
      track("begin_checkout", { currency: "NGN", value: (a.price && a.price.amount) || 19999 });
      location.href = r.url;
    } catch (e) {
      pay.disabled = false;
      msg.textContent = e instanceof ApiError && e.status === 409 ? "Confirm your email address first: use the button in the course menu."
        : e instanceof ApiError && e.status < 500 && e.data.error ? e.data.error
        : "We couldn't start the payment. Check your internet connection, then try again.";
      if (e instanceof ApiError && e.status === 409) renderSyncNote();
    }
  });
  page.querySelector("#redeem-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const input = page.querySelector("#partner-code"), err = page.querySelector("#partner-code-err");
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) { err.textContent = "Enter the code exactly as you received it."; input.focus(); return; }
    err.textContent = "Checking…";
    try {
      const s = await api("redeem", { code });
      mergeServer(s); save();
      track("course_code_redeemed");
      renderToc(currentView);
      renderWelcome(`Your partner code worked${s.sponsor ? `: your place is sponsored by ${esc(s.sponsor)}` : ""}. The full course is unlocked.`);
    } catch (e) {
      err.textContent = e instanceof ApiError && e.status === 409 ? "Confirm your email address first: use the button in the course menu."
        : e instanceof ApiError && e.data.error ? e.data.error : "We couldn't check the code. Check your internet connection, then try again.";
      if (e instanceof ApiError && e.status === 409) renderSyncNote();
    }
  });
}
function renderWelcome(message) {
  const page = pageShell();
  page.innerHTML = `<div class="mod-eyebrow">Enrolled</div><h2>Welcome to the full course</h2>
    <div class="score" role="status"><div><div class="verdict-note">Enrolment confirmed</div><strong>Lifetime access</strong> <span class="pill pass">Unlocked</span></div><p>${message}</p></div>`;
  const next = firstUnpassed();
  pager(page, "← Overview", OVERVIEW, next < 0 ? "Final assessment →" : `Continue with Module ${next + 1} →`, next < 0 ? FINAL : next);
}
// Back from Paystack (?reference=…): the server checks the payment with Paystack before unlocking.
async function confirmPaymentReturn(reference) {
  const page = pageShell();
  page.innerHTML = `<div class="mod-eyebrow">Payment</div><h2>Confirming your payment</h2><p class="note" aria-live="polite">Checking your payment with Paystack…</p>`;
  const note = page.querySelector(".note");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const s = await api("confirm-payment", { reference });
      mergeServer(s); save(); renderToc(currentView);
      if (s.paymentStatus === "success" || s.enrolled && s.access) {
        track("purchase", { currency: "NGN", value: (s.price && s.price.amount) || 19999 });
        return renderWelcome("Payment received. Thank you. We've emailed you a confirmation.");
      }
      if (s.paymentStatus === "failed" || s.paymentStatus === "abandoned") {
        page.querySelector("h2").textContent = "Payment not completed";
        note.textContent = "The payment didn't go through, and you haven't been charged for it. You can try again.";
        return pager(page, "← Overview", OVERVIEW, "Try again", ENROL);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { renderSyncNote(); note.textContent = "Confirm your email address on this device to finish: use the button in the course menu."; return; }
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  note.textContent = "We haven't received confirmation from Paystack yet. If you were charged, your course unlocks automatically within a few minutes; reload this page then. If it doesn't, email info@mednovalife.com with your payment reference: " + reference + ".";
}

/* ---------- course terms (public) ---------- */
function renderTerms() {
  const page = standalonePage();
  page.classList.add("privacy");
  page.innerHTML = `<div class="mod-eyebrow">Terms</div><h2>Course terms</h2>
    <p>These terms apply to the ${esc(COURSE_NAME)} offered by MedNova Lifesciences Ltd at mednovalife.com.</p>
    <h3>Price and access</h3>
    <ul>
      <li>The course overview and Module 1 are free. The full course costs ₦19,999, paid once.</li>
      <li>Payment gives you lifetime access to all ${N} modules, the final assessment and a certificate of completion when you pass, on any device where you sign in with the same email address.</li>
      <li>Access is personal to the email address that enrolled and can't be transferred or shared.</li>
    </ul>
    <h3>Payment</h3>
    <ul>
      <li>Payments are processed by Paystack. MedNova Lifesciences never sees or stores your card or bank details.</li>
      <li><strong>All payments are final and non-refundable.</strong> Try Module 1 free before you pay to make sure the course is right for you.</li>
      <li>If you were charged but your course didn't unlock, email info@mednovalife.com with your payment reference and we'll sort it out.</li>
    </ul>
    <h3>Sponsored places and partner codes</h3>
    <ul>
      <li>An organisation can pay for its staff or members. MedNova may register them directly, or give the organisation a partner code with a set number of places.</li>
      <li>A partner code unlocks the course for one learner per place, until its places run out or it expires. Partner codes have no cash value.</li>
    </ul>
    <h3>Certificates</h3>
    <p>A certificate is issued when you pass all ${N} knowledge checks and score ${COURSE.final.passMark}% or more on the final assessment. The certificate records the course completed; it isn't a licence or regulatory qualification.</p>
    <p>Questions: <a href="mailto:info@mednovalife.com">info@mednovalife.com</a>. See also the <a href="#privacy">course privacy notice</a>.</p>
    <p class="note">Last updated 11 October 2026.</p>
    <p><a href="#" id="terms-back">Go to the course</a></p>`;
  document.getElementById("terms-back").addEventListener("click", ev => {
    ev.preventDefault(); history.replaceState(null, "", location.pathname);
    if (learner) startCourse(); else renderSignin();
  });
}

''' + h[start:]
sub('else if (bootHash === "privacy") renderPrivacy();',
    'else if (bootHash === "privacy") renderPrivacy();\nelse if (bootHash === "terms") renderTerms();')
sub('else if (location.hash === "#privacy") renderPrivacy(); });',
    'else if (location.hash === "#privacy") renderPrivacy(); else if (location.hash === "#terms") renderTerms(); });')
sub('else if (learner) startCourse(); else renderSignin();\n',
    '''else if (learner) {
  // Back from Paystack: ?trxref=…&reference=… is added to the course URL.
  const payRef = new URLSearchParams(location.search).get("reference");
  if (payRef) history.replaceState(null, "", location.pathname);
  startCourse();
  if (payRef) confirmPaymentReturn(payRef);
} else renderSignin();
''')

# register: access column, sponsored learners, partner codes
sub('    const rows = (await res.json()).learners || [];\n'
    '    if (!rows.length) { box.innerHTML = \'<p class="note">No learner records yet. Records appear here when learners sign in.</p>\'; return; }',
    '    const regData = await res.json();\n'
    '    const rows = regData.learners || [];\n'
    '    if (!rows.length) { box.innerHTML = \'<p class="note">No learner records yet. Records appear here when learners sign in or you add them below.</p>\'; renderAdminTools(page, regData.paymentRequired); return; }')
sub('<th>Name</th><th>Email</th><th>Modules</th>', '<th>Name</th><th>Email</th><th>Access</th><th>Modules</th>')
sub('<td>${esc(r.email || "")}</td><td class="num">${esc(r.', '<td>${esc(r.email || "")}</td><td>${esc(accessLabel(r))}</td><td class="num">${esc(r.')
sub('colspan="6">No learners match', 'colspan="7">No learners match')
sub('[r.name, r.email, r.certId]', '[r.name, r.email, r.certId, r.sponsor, r.code, r.paymentRef]')
sub('const head = ["Name", "Email", ', 'const head = ["Name", "Email", "Access", "Sponsor", "Payment reference", "Partner code", "Signed in", ')
sub('matches().map(r => [r.name, r.email, ', 'matches().map(r => [r.name, r.email, r.access || "preview", r.sponsor, r.paymentRef, r.code, r.signedIn ? "yes" : "no", ')
sub('    draw();\n  } catch (e) {', '    draw();\n    renderAdminTools(page, regData.paymentRequired);\n  } catch (e) {')
start = h.index('/* ---------- course privacy notice (public) ---------- */')
h = h[:start] + r'''/* ---------- administrator: access, sponsored learners, partner codes ---------- */
async function adminApi(action, method, body) {
  const r = await fetch(API + "?action=" + action, {
    method, headers: { Authorization: "Bearer " + ssGet(ADMIN_STORE), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, d);
  return d;
}
function accessLabel(r) {
  const base = r.access === "paid" ? "Paid" : r.access === "sponsored" ? `Sponsored${r.sponsor ? " · " + r.sponsor : ""}`
    : r.access === "early" ? "Early access" : "Free preview";
  return r.signedIn ? base : base + " (not signed in yet)";
}
const adminErr = (e, fallback) => e instanceof ApiError && e.data.error ? e.data.error : fallback;
function renderAdminTools(page, paymentRequired) {
  const box = el("section", { class: "adm" });
  box.innerHTML = `<h3>Course access</h3>
    <p class="note">${paymentRequired
      ? "Payments are switched on. Beyond Module 1, learners need to pay, be added as sponsored learners or use a partner code."
      : "Payments are switched off, so every signed-in learner has the full course. Sponsored learners and partner codes added now keep working when payments are switched on."}</p>
    <h3>Add sponsored learners</h3>
    <p class="note">Sponsored learners skip payment. Their course unlocks when they sign in with the email you add. One learner per line: full name, a comma, then email.</p>
    <form id="adm-add" novalidate>
      <div class="row">
        <div class="field"><label for="adm-sponsor">Sponsor or partner</label><input id="adm-sponsor" type="text" maxlength="120" placeholder="e.g. Acme Pharma Ltd"></div>
        <div class="field"><label for="adm-note">Note (optional)</label><input id="adm-note" type="text" maxlength="500"></div>
      </div>
      <div class="field"><label for="adm-list">Learners</label><textarea id="adm-list" placeholder="Adaeze Okafor, adaeze@example.com&#10;Tunde Bello, tunde@example.com"></textarea></div>
      <div class="field check"><label for="adm-invite"><input id="adm-invite" type="checkbox" checked> <span>Email each learner an invitation with the course link</span></label></div>
      <div class="q-foot"><button class="btn" type="submit">Add learners</button></div>
      <div id="adm-add-out" class="note" aria-live="polite"></div>
    </form>
    <h3>Partner codes</h3>
    <p class="note">A code unlocks the course for one learner per place. Give it to the partner; learners enter it on the enrol page.</p>
    <form id="adm-code" novalidate>
      <div class="row">
        <div class="field"><label for="code-sponsor">Sponsor or partner</label><input id="code-sponsor" type="text" maxlength="120"></div>
        <div class="field"><label for="code-seats">Places</label><input id="code-seats" type="number" min="1" max="10000" value="10"></div>
        <div class="field"><label for="code-expires">Expires (optional)</label><input id="code-expires" type="date"></div>
        <div class="field"><label for="code-custom">Custom code (optional)</label><input id="code-custom" type="text" maxlength="40" placeholder="Leave blank to generate one"></div>
      </div>
      <div class="q-foot"><button class="btn" type="submit">Create code</button></div>
      <div id="adm-code-out" class="note" aria-live="polite"></div>
    </form>
    <div class="tbl"><table><thead><tr><th>Code</th><th>Sponsor</th><th>Places used</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody id="codes-body"><tr><td colspan="6">Loading…</td></tr></tbody></table></div>
    <h3>Remove access</h3>
    <p class="note">For mistakes, for example a sponsored learner added with the wrong email. Progress and certificates are kept.</p>
    <form id="adm-revoke" novalidate>
      <div class="field"><label for="revoke-email">Learner's email</label><input id="revoke-email" type="text" autocomplete="off"></div>
      <div class="field check"><label for="revoke-ok"><input id="revoke-ok" type="checkbox"> <span>Yes, remove this learner's access to the full course</span></label></div>
      <div class="q-foot"><button class="btn ghost" type="submit">Remove access</button></div>
      <div id="adm-revoke-out" class="note" aria-live="polite"></div>
    </form>`;
  page.appendChild(box);
  const q = s => box.querySelector(s);
  const reloadButton = () => { const b = el("button", { type: "button", class: "btn ghost" }, "Reload the register"); b.addEventListener("click", () => renderRegister()); return b; };

  q("#adm-add").addEventListener("submit", async ev => {
    ev.preventDefault();
    const out = q("#adm-add-out"), sponsor = q("#adm-sponsor").value.trim();
    const learners = q("#adm-list").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
      const m = /^(.*?)[,;\t]\s*([^\s,;]+@[^\s,;]+)$/.exec(line);
      return m ? { name: m[1].trim(), email: m[2] } : { name: "", email: line };
    });
    if (!sponsor) { out.textContent = "Enter the sponsor or partner name."; q("#adm-sponsor").focus(); return; }
    if (!learners.length) { out.textContent = "Add at least one learner: full name, a comma, then email."; q("#adm-list").focus(); return; }
    out.textContent = "Adding…";
    try {
      const r = await adminApi("admin-add", "POST", { sponsor, note: q("#adm-note").value, invite: q("#adm-invite").checked, learners });
      out.innerHTML = `<ul>${r.results.map(x => `<li>${esc(x.email || "(blank)")}: ${esc(x.result)}</li>`).join("")}</ul>`;
      out.appendChild(reloadButton());
    } catch (e) { out.textContent = adminErr(e, "Couldn't add the learners. Try again."); }
  });

  async function loadCodes() {
    const body = q("#codes-body");
    try {
      const { codes } = await adminApi("admin-codes", "GET");
      body.innerHTML = codes.length ? "" : '<tr><td colspan="6">No partner codes yet.</td></tr>';
      for (const c of codes) {
        const expired = c.expires_at && new Date(c.expires_at) < new Date();
        const status = !c.active ? "Switched off" : expired ? "Expired" : c.used >= c.seats ? "All places used" : "Active";
        const tr = el("tr", {}, `<td class="num">${esc(c.code)}</td><td>${esc(c.sponsor)}</td><td class="num">${esc(c.used)} of ${esc(c.seats)}</td><td class="num">${c.expires_at ? esc(fmtDateTime(c.expires_at)) : "—"}</td><td>${esc(status)}</td><td></td>`);
        const b = el("button", { type: "button", class: "linkbtn" }, c.active ? "Switch off" : "Switch on");
        b.addEventListener("click", async () => {
          b.disabled = true;
          try { await adminApi("admin-codes", "POST", { op: "set-active", code: c.code, active: !c.active }); loadCodes(); }
          catch (e) { b.disabled = false; q("#adm-code-out").textContent = adminErr(e, "Couldn't change the code. Try again."); }
        });
        tr.lastChild.appendChild(b);
        body.appendChild(tr);
      }
    } catch (e) { body.innerHTML = '<tr><td colspan="6">Partner codes could not be loaded. Reload the page to try again.</td></tr>'; }
  }
  loadCodes();

  q("#adm-code").addEventListener("submit", async ev => {
    ev.preventDefault();
    const out = q("#adm-code-out"), sponsor = q("#code-sponsor").value.trim(), seats = Number(q("#code-seats").value);
    const expires = q("#code-expires").value;
    if (!sponsor) { out.textContent = "Enter the sponsor or partner name."; q("#code-sponsor").focus(); return; }
    if (!Number.isInteger(seats) || seats < 1) { out.textContent = "Enter the number of places."; q("#code-seats").focus(); return; }
    out.textContent = "Creating…";
    try {
      // An expiry date runs to the end of that day, Lagos time.
      const r = await adminApi("admin-codes", "POST", { sponsor, seats, code: q("#code-custom").value.trim(), expiresAt: expires ? expires + "T23:59:59+01:00" : null });
      out.innerHTML = `Created <strong>${esc(r.code.code)}</strong> for ${esc(r.code.sponsor)}, ${esc(r.code.seats)} place${r.code.seats === 1 ? "" : "s"}. Send this code to the partner.`;
      q("#adm-code").reset(); q("#code-seats").value = "10";
      loadCodes();
    } catch (e) { out.textContent = adminErr(e, "Couldn't create the code. Try again."); }
  });

  q("#adm-revoke").addEventListener("submit", async ev => {
    ev.preventDefault();
    const out = q("#adm-revoke-out"), email = q("#revoke-email").value.trim();
    if (!email) { out.textContent = "Enter the learner's email."; return; }
    if (!q("#revoke-ok").checked) { out.textContent = "Tick the box to confirm."; return; }
    out.textContent = "Removing…";
    try { await adminApi("admin-revoke", "POST", { email }); out.textContent = `Access removed for ${email}.`; out.appendChild(reloadButton()); q("#adm-revoke").reset(); }
    catch (e) { out.textContent = adminErr(e, "Couldn't remove access. Try again."); }
  });
}

''' + h[start:]

# privacy notice: payments
sub('<li>Your certificate details: certificate number',
    '<li>If you pay for the course: the payment reference, amount, date and status, from Paystack. We never see or store your card or bank details. If an organisation sponsors your place, its name.</li>\n      <li>Your certificate details: certificate number')
sub('We use these service providers to run it: Vercel (website hosting), Supabase (database, hosted in the European Union), Resend (email delivery) and Google Analytics (usage statistics).',
    'We use these service providers to run it: Vercel (website hosting), Supabase (database, hosted in the European Union), Resend (email delivery), Paystack (payments) and Google Analytics (usage statistics).')
sub('<li>To issue your certificate and email it to you.</li>', '<li>To take your payment, or record your sponsored place, and to issue your certificate and email it to you.</li>')

# styles
sub('.cert-name { border:',
    '.enrol-callout, .enrol-card { border: 1px solid var(--accent); border-radius: 8px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }\n'
    '.enrol-callout p, .enrol-card p, .enrol-card ul { margin: 0; }\n'
    '.enrol-card ul { padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }\n'
    '.enrol-price { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }\n'
    '.enrol-price strong { font-family: var(--font-display); font-size: 36px; }\n'
    '.enrol-price span { color: var(--muted); }\n'
    '.enrol-code { display: flex; flex-direction: column; gap: 8px; max-width: 420px; }\n'
    '.enrol-code .field { margin: 0; }\n'
    '.adm { border-top: 1px solid var(--rule); padding-top: 16px; margin-top: 8px; display: flex; flex-direction: column; gap: 12px; }\n'
    '.adm textarea, .adm input[type=text], .adm input[type=number], .adm input[type=date] { font: inherit; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); color: var(--ink); width: 100%; box-sizing: border-box; }\n'
    '.adm textarea { min-height: 120px; }\n'
    '.adm .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 10px; }\n'
    '.cert-name { border:')

# ---- document structure: the exported source closes <head> on line 1, which left the title, meta and
# Open Graph tags in <body>. WhatsApp only reads tags in <head>, so end the head after the course styles.
sub('<meta charset=utf8>', '<meta charset="utf-8">')
sub('</style></head><body>\n<title>', '</style>\n<title>')
sub('</style>\n\n<div id="app"></div>', '</style>\n</head>\n<body>\n<div id="app"></div>')

# ---- answer key for server-side grading (frontend/api/course-key.json) ----
line = next(l for l in h.split('\n') if l.startswith('const COURSE = '))
course = json.loads(line[len('const COURSE = '):].rstrip().rstrip(';'))
key = {'salt': course['salt'], 'passMark': course['final']['passMark'], 'modules': len(course['modules']), 'quizzes': {}}
for i, m in enumerate(course['modules']):
    key['quizzes'][f'm{i}'] = [{'id': q['id'], 'h': q['h']} for q in m['quiz']]
key['quizzes']['final'] = [{'id': q['id'], 'h': q['h']} for q in course['final']['quiz']]
pathlib.Path(KEY_OUT).write_text(json.dumps(key, indent=1) + '\n', encoding='utf-8', newline='\n')

# ---- course content for the server (frontend/api/course-content.json); the page keeps only the outline ----
# Module content and quizzes are sent by /api/course?action=content to learners with access. Final
# assessment questions go without answer hashes: only the server marks the final assessment.
HEAVY = ('objectives', 'content', 'takeaways', 'sources', 'quiz')
content_out = {
    'salt': course['salt'],
    'modules': [{k: m[k] for k in HEAVY if k in m} for m in course['modules']],
    'final': {'quiz': [{k: v for k, v in q.items() if k != 'h'} for q in course['final']['quiz']]},
}
pathlib.Path(CONTENT_OUT).write_text(json.dumps(content_out, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
outline = {
    'modules': [{**{k: v for k, v in m.items() if k not in HEAVY}, 'quizLen': len(m['quiz'])} for m in course['modules']],
    'final': {'passMark': course['final']['passMark'], 'count': len(course['final']['quiz'])},
}
h = h.replace(line, 'const COURSE = ' + json.dumps(outline, ensure_ascii=False).replace('</', '<\\/') + ';', 1)
page_course = json.dumps(outline)
assert '"h"' not in page_course and '"content"' not in page_course and 'salt' not in page_course, 'course content left in the page'

assert 'window.claude' not in h, 'leftover window.claude reference'
assert 'cdnjs' not in h
open(dst, 'w', encoding='utf-8', newline='\n').write(h)
print(f'wrote {dst} ({len(h):,} bytes), {KEY_OUT} and {CONTENT_OUT}')
