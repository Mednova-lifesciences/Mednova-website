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
  box.innerHTML = `<p>This email is already registered for the course, so your progress on this device isn't being saved yet.</p><button type="button" class="btn">Confirm it's you</button>`;
  box.querySelector("button").addEventListener("click", () => renderCode());
}

/* ---------- confirm a new device by emailed code ---------- */
function renderCode() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="signin-wrap"><div class="signin">
      <div class="brand"><div class="eyebrow">Continuing education</div><h1>Confirm it's you</h1></div>
      <p><strong>${esc(learner.email)}</strong> is already registered for the course. To continue on this device, enter the 6-digit code we email you. Your progress and any certificate will load here.</p>
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
      ? "Your email is already registered for the course, so we need to confirm it's you before issuing your certificate on this device."
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
    catch (e) { if (e instanceof ApiError && e.status === 409) return renderCode(); /* offline: continue, sync later */ }
    startCourse();''')
sub('function signOut() {\n  lsDel(LEARNER_KEY);', 'function signOut() {\n  lsDel(LEARNER_KEY);\n  blocked = false;')
sub('<div class="meter"><div class="meter-bar">',
    '<div class="sync-note" id="sync-note" hidden></div>\n        <div class="meter"><div class="meter-bar">')
sub('MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate.</p>',
    "MedNova Lifesciences records your name, email and course results to confirm completion and to verify your certificate. To continue on another device, sign in there with the same email and we'll email you a code.</p>")
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
sub('    catch (e) { if (e instanceof ApiError && e.status === 409) return renderCode(); /* offline: continue, sync later */ }\n    startCourse();',
    '    catch (e) { if (e instanceof ApiError && e.status === 409) return renderCode(); /* offline: continue, sync later */ }\n'
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
      <li>A random identifier for each device you sign in on, and short-lived sign-in codes we email you when you add a new device.</li>
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


# ---- answer key for server-side grading (frontend/api/course-key.json) ----
line = next(l for l in h.split('\n') if l.startswith('const COURSE = '))
course = json.loads(line[len('const COURSE = '):].rstrip().rstrip(';'))
key = {'salt': course['salt'], 'passMark': course['final']['passMark'], 'modules': len(course['modules']), 'quizzes': {}}
for i, m in enumerate(course['modules']):
    key['quizzes'][f'm{i}'] = [{'id': q['id'], 'h': q['h']} for q in m['quiz']]
key['quizzes']['final'] = [{'id': q['id'], 'h': q['h']} for q in course['final']['quiz']]
pathlib.Path(KEY_OUT).write_text(json.dumps(key, indent=1) + '\n', encoding='utf-8', newline='\n')

assert 'window.claude' not in h, 'leftover window.claude reference'
assert 'cdnjs' not in h
open(dst, 'w', encoding='utf-8', newline='\n').write(h)
print(f'wrote {dst} ({len(h):,} bytes) and {KEY_OUT}')
