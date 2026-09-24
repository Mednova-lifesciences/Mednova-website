const crypto = require('crypto');

// Simple GA script from other HTML pages (cro.html, regulatory.html, etc.)
const simple_ga = `  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-70L73W3SD6');`;

function hashContent(content) {
  const digest = crypto.createHash('sha256').update(content).digest('base64');
  return `'sha256-${digest}'`;
}

console.log('Simple GA Script Hash:');
console.log(hashContent(simple_ga));
