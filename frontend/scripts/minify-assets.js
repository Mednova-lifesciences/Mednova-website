const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const { minify } = require('terser');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const cssDir = path.join(publicDir, 'css');
const jsDir = path.join(publicDir, 'js');

async function minifyCss(input) {
  const result = await new CleanCSS({}).minify(input);
  return result.styles;
}

async function minifyJs(input) {
  const result = await minify(input, {
    compress: true,
    mangle: true,
    format: { comments: false }
  });
  return result.code;
}

function processFiles(dir, type) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processFiles(fullPath, type);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.css') && type === 'css' && !entry.name.endsWith('.min.css')) {
      const input = fs.readFileSync(fullPath, 'utf8');
      minifyCss(input).then((output) => {
        const outPath = path.join(dir, entry.name.replace(/\.css$/, '.min.css'));
        fs.writeFileSync(outPath, output);
        console.log(`Wrote ${path.relative(root, outPath)}`);
      });
    }
    if (entry.name.endsWith('.js') && type === 'js' && !entry.name.endsWith('.min.js')) {
      const input = fs.readFileSync(fullPath, 'utf8');
      minifyJs(input).then((output) => {
        const outPath = path.join(dir, entry.name.replace(/\.js$/, '.min.js'));
        fs.writeFileSync(outPath, output);
        console.log(`Wrote ${path.relative(root, outPath)}`);
      });
    }
  }
}

(async () => {
  processFiles(cssDir, 'css');
  processFiles(jsDir, 'js');
})();
