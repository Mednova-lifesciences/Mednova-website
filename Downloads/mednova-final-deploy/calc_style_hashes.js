const crypto = require('crypto');
const fs = require('fs');

// Read the HTML file
const html = fs.readFileSync('./frontend/index.html', 'utf-8');

// Find all <style> tags and extract their content
const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
let match;
let styleIndex = 0;

console.log('Found inline styles:\n');

while ((match = styleRegex.exec(html)) !== null) {
  const styleContent = match[1];
  // For non-JSON-LD styles, calculate hash
  if (!styleContent.includes('@context')) {
    styleIndex++;
    const digest = crypto.createHash('sha256').update(styleContent).digest('base64');
    const hash = `'sha256-${digest}'`;
    console.log(`Style Block ${styleIndex} Hash:`);
    console.log(hash);
    console.log(`Content length: ${styleContent.length} chars`);
    console.log('---');
  }
}
