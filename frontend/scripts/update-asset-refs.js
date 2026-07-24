const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cssDir = path.join(root, 'public', 'css');
const jsDir = path.join(root, 'public', 'js');

function hasMinifiedAsset(type, name) {
  const dir = type === 'css' ? cssDir : jsDir;
  return fs.existsSync(path.join(dir, `${name}.min.${type}`));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      let text = fs.readFileSync(fullPath, 'utf8');
      const original = text;

      text = text.replace(/\/public\/css\/([^"'\s]+)\.css/g, (match, name) => {
        return hasMinifiedAsset('css', name) ? `/public/css/${name}.min.css` : match;
      });
      text = text.replace(/\.\/public\/css\/([^"'\s]+)\.css/g, (match, name) => {
        return hasMinifiedAsset('css', name) ? `./public/css/${name}.min.css` : match;
      });
      text = text.replace(/\/css\/([^"'\s]+)\.css/g, (match, name) => {
        return hasMinifiedAsset('css', name) ? `/css/${name}.min.css` : match;
      });

      text = text.replace(/\/public\/js\/([^"'\s]+)\.js/g, (match, name) => {
        return hasMinifiedAsset('js', name) ? `/public/js/${name}.min.js` : match;
      });
      text = text.replace(/\.\/public\/js\/([^"'\s]+)\.js/g, (match, name) => {
        return hasMinifiedAsset('js', name) ? `./public/js/${name}.min.js` : match;
      });
      text = text.replace(/\/js\/([^"'\s]+)\.js/g, (match, name) => {
        return hasMinifiedAsset('js', name) ? `/js/${name}.min.js` : match;
      });

      if (text !== original) {
        fs.writeFileSync(fullPath, text);
        console.log(`Updated ${path.relative(root, fullPath)}`);
      }
    }
  }
}

walk(root);
