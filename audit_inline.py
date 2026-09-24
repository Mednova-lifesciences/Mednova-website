import os, re
root=os.path.join(os.getcwd(),'final-deploy','frontend')
script_re=re.compile(r'<script([^>]*)>(.*?)</script>', re.S|re.I)
attr_re=re.compile(r'\b(on[a-z]+)\s*=\s*(["\"][^"\"]*["\"]|[^\s>]+)', re.I)
files=[]
for dirpath, dirnames, filenames in os.walk(root):
    for fn in filenames:
        if fn.lower().endswith('.html'):
            files.append(os.path.join(dirpath, fn))
files.sort()
inline_scripts=[]
event_handlers=[]
for path in files:
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        text=f.read()
    for m in script_re.finditer(text):
        attrs=m.group(1)
        body=m.group(2)
        line=text[:m.start()].count('\n')+1
        has_src=re.search(r'\bsrc\s*=\s*', attrs, re.I) is not None
        has_nonce=re.search(r'\bnonce\s*=\s*["\"][^"\"]+["\"]', attrs, re.I) is not None
        inline = not has_src
        if inline:
            inline_scripts.append((path, line, attrs.strip(), body.strip()[:120].replace('\n',' '), has_nonce, 'application/ld+json' in attrs.lower()))
    for i, l in enumerate(text.splitlines(),1):
        for a in attr_re.finditer(l):
            name=a.group(1).lower()
            if name in ('onclick','onload','onchange','onmouseover','onsubmit','onmouseenter','onmouseleave','onkeyup','onkeydown','onfocus','onblur','oninput'):
                event_handlers.append((path, i, name, a.group(0), l.strip()))
print('INLINE SCRIPTS WITHOUT SRC:')
for p,l,a,b,has_nonce,is_json in inline_scripts:
    print(f'{p}:{l}: nonce={has_nonce} jsonld={is_json} attrs={a} body={b[:80]}')
print('\nEVENT HANDLERS:')
for p,l,name,attr,line in event_handlers:
    print(f'{p}:{l}: {name} {attr} line={line}')
