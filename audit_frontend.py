import json
import re
from pathlib import Path

root = Path('frontend')
pages = sorted(root.rglob('*.html'))
report = {'pages': [], 'broken_links': []}

for p in pages:
    text = p.read_text(encoding='utf-8', errors='ignore')
    anchors = re.findall(r'<a[^>]*href=["\']([^"\']+)["\']', text, re.I)
    titles = re.findall(r'<title>(.*?)</title>', text, re.I | re.S)
    headers = re.findall(r'<h([1-6])[^>]*>', text, re.I)

    report['pages'].append({
        'page': str(p),
        'anchors': len(anchors),
        'forms': len(re.findall(r'<form[^>]*>', text, re.I)),
        'imgs': len(re.findall(r'<img[^>]*>', text, re.I)),
        'title': titles[0].strip() if titles else '',
        'h1': headers.count('1'),
        'h2': headers.count('2'),
        'canonical': bool(re.search(r'<link[^>]*rel=["\']canonical["\']', text, re.I)),
        'meta_description': bool(re.search(r'<meta[^>]*name=["\']description["\']', text, re.I)),
        'og': bool(re.search(r'<meta[^>]*property=["\']og:', text, re.I)),
        'twitter': bool(re.search(r'<meta[^>]*name=["\']twitter:', text, re.I)),
    })

    for href in anchors:
        if href.startswith('/') and not href.startswith('//'):
            clean = href.split('?')[0].split('#')[0]
            target = Path('frontend/index.html') if clean == '/' else Path('frontend' + clean)
            if clean and not target.exists():
                report['broken_links'].append({'page': str(p), 'href': href, 'target': str(target)})
        elif href and not href.startswith(('mailto:', 'tel:', 'http://', 'https://', '#', 'javascript:', '//')):
            clean = href.split('?')[0].split('#')[0]
            target = (p.parent / clean).resolve()
            if clean and not target.exists():
                report['broken_links'].append({'page': str(p), 'href': href, 'target': str(target)})

Path('audit_frontend.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print('audit_frontend.json written with', len(report['pages']), 'pages and', len(report['broken_links']), 'broken links.')
