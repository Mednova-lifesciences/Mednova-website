import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.join(__dirname, '..', 'config.js');

const apiBaseUrl = process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || '';
const frontendUrl = process.env.FRONTEND_URL || '';

const configContent = [
  '(function () {',
  `  const apiBaseUrl = ${JSON.stringify(apiBaseUrl)};`,
  `  const frontendUrl = ${JSON.stringify(frontendUrl)};`,
  '',
  '  window.MEDNOVA_CONFIG = {',
  '    apiBaseUrl,',
  '    frontendUrl,',
  '    getApiUrl(path) {',
  "      const normalizedPath = String(path || '').replace(/^\\/+/, '');",
  '      if (!apiBaseUrl) {',
  "        return `/${normalizedPath}`;",
  '      }',
  "      return `${apiBaseUrl.replace(/\\/$/, '')}/${normalizedPath}`;",
  '    }',
  '  };',
  '',
  '  window.getApiUrl = function getApiUrl(path) {',
  '    return window.MEDNOVA_CONFIG.getApiUrl(path);',
  '  };',
  '})();',
  ''
].join('\n');

fs.writeFileSync(outputPath, configContent, 'utf8');
