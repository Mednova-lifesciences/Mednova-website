from pathlib import Path
import re

root = Path('.')
patterns = [
    re.compile(x) for x in [
        r'training-consulting\.html',
        r'MedNova-NAFDAC-QPPV-Compliance-Checklist\.pdf',
        r'resources/glossary/adverse-drug-reaction\.html',
        r'resources/glossary/good-pharmacovigilance-practice\.html',
        r'resources/glossary/risk-management-plan\.html',
    ]
]
missing = []
for path in sorted(root.rglob('*.html')):
    text = path.read_text(encoding='utf-8', errors='ignore')
    if not any(p.search(text) for p in patterns):
        missing.append(path)
print(len(missing))
for p in missing:
    print(p)
