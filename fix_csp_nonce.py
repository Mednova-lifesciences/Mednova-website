from pathlib import Path
import re

root = Path('.')
files_to_update = []
for pattern in ['_headers', 'frontend/_headers', 'frontend/public/_headers', 'public/_headers', 'vercel.json', 'frontend/vercel.json']:
    p = root / pattern
    if p.exists():
        files_to_update.append(p)

for p in files_to_update:
    text = p.read_text(encoding='utf-8')
    new_text = text.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'nonce-mednova-inline-2026'")
    if new_text != text:
        p.write_text(new_text, encoding='utf-8')

html_files = []
for path in [root / 'frontend', root / 'frontend' / 'src' / 'pages']:
    if path.exists():
        html_files.extend(path.rglob('*.html'))

for p in html_files:
    text = p.read_text(encoding='utf-8')
    new_text = re.sub(r'<script(?![^>]*\bnonce=)(?![^>]*\bsrc=)(?![^>]*\btype=["\']application/ld\+json["\'])', '<script nonce="mednova-inline-2026"', text)
    if new_text != text:
        p.write_text(new_text, encoding='utf-8')
