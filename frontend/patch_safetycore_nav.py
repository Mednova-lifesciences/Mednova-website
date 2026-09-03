import pathlib
import re

root = pathlib.Path('.')
changed = []
for path in sorted(root.rglob('*.html')):
    text = path.read_text(encoding='utf-8')
    orig = text
    if '<div class="navlinks">' in text:
        # add SafetyCore only if not already present
        if 'href="/safetycore.html"' not in text:
            text = text.replace('<div class="navlinks">', '<div class="navlinks">\n      <a href="/safetycore.html">SafetyCore</a>', 1)
    if '<div class="footer-links">' in text and 'href="safetycore.html"' not in text:
        text = text.replace('<div class="footer-links">', '<div class="footer-links">\n      <a href="safetycore.html">SafetyCore</a>', 1)
    if text != orig:
        path.write_text(text, encoding='utf-8')
        changed.append(path)
print('Updated', len(changed), 'files')
for path in changed:
    print(path)
