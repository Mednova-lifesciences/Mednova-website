from pathlib import Path
import re
root = Path('final-deploy/frontend')
nav_pat = re.compile(r'(<div class="navlinks">)(.*?)(</div>)', re.S)
foot_pat = re.compile(r'(<div class="footer-links">)(.*?)(</div>)', re.S)
changed = []

def add_link(match):
    block = match.group(0)
    if 'SafetyCore' in block:
        return block
    return match.group(1) + match.group(2) + '<a href="/safetycore.html">SafetyCore</a>' + match.group(3)

for p in sorted(root.rglob('*.html')):
    txt = p.read_text(encoding='utf-8', errors='ignore')
    new = nav_pat.sub(add_link, txt)
    new = foot_pat.sub(add_link, new)
    if new != txt:
        p.write_text(new, encoding='utf-8')
        changed.append(str(p))

print('updated', len(changed), 'files')
for f in changed:
    print(f)
