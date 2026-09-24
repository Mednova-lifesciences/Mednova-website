from pathlib import Path
import re
root = Path(r'c:\Users\DELL\Downloads\mednova-final-deploy\final-deploy\frontend')
html_files = sorted([p for p in root.rglob('*.html') if 'src/pages' not in str(p) and 'public' not in str(p)])
for p in html_files:
    text = p.read_text(encoding='utf-8', errors='ignore')
    checks = {
        'title': bool(re.search(r'<title>.*?</title>', text, re.I | re.S)),
        'desc': bool(re.search(r'<meta\s+name=["\']description["\']', text, re.I)),
        'canonical': bool(re.search(r'<link\s+rel=["\']canonical["\']', text, re.I)),
        'og': bool(re.search(r'<meta\s+property=["\']og:title["\']', text, re.I)),
        'twitter': bool(re.search(r'<meta\s+name=["\']twitter:card["\']', text, re.I)),
        'robots': bool(re.search(r'<meta\s+name=["\']robots["\']', text, re.I)),
        'lang': bool(re.search(r'<html[^>]+lang=', text, re.I)),
        'viewport': bool(re.search(r'<meta\s+name=["\']viewport["\']', text, re.I)),
        'charset': bool(re.search(r'<meta\s+charset=', text, re.I)),
        'breadcrumbs': 'data-breadcrumbs' in text or 'BreadcrumbList' in text,
        'schema': 'application/ld+json' in text,
    }
    missing = [k for k,v in checks.items() if not v]
    if missing:
        print(str(p.relative_to(root)) + ' MISSING ' + ', '.join(missing))
