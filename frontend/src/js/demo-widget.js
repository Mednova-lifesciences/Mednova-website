// Shared demo widget logic — expects each page to define:
// - a <div class="demo-questions"> of <button class="demo-q-btn" data-q="...">
// - a <div id="demoOutput">
// - a <script> tag setting window.DEMO_CONTEXT to one of:
//   'general' | 'regulatory' | 'clinical' | 'safety'
(function () {
  const demoButtons = document.querySelectorAll('.demo-q-btn');
  const demoOutput = document.getElementById('demoOutput');
  if (!demoButtons.length || !demoOutput) return;

  const context = window.DEMO_CONTEXT || 'general';

  async function askDemo(btn) {
    const question = btn.dataset.q;
    demoButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    demoButtons.forEach((b) => (b.disabled = true));
    demoOutput.textContent = 'Thinking...';
    try {
      const res = await fetch(window.getApiUrl('/api/assistant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Request failed');
      }
      const data = await res.json();
      demoOutput.textContent = data.text || 'No response received.';
    } catch (err) {
      demoOutput.textContent = "Couldn't reach the assistant right now — please try again shortly.";
    } finally {
      demoButtons.forEach((b) => (b.disabled = false));
    }
  }

  demoButtons.forEach((btn) => btn.addEventListener('click', () => askDemo(btn)));
})();
