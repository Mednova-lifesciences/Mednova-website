import pathlib
import re
root = pathlib.Path('frontend')
script_re = re.compile(r'<script\b([^>]*)>(.*?)</script>', re.I | re.S)
nonce_re = re.compile(r"\bnonce\s*=\s*(?:\"[^\"]*\"|\'[^\']*\')", re.I)
jsonld_re = re.compile(r"type\s*=\s*(?:\"application/ld\+json\"|\'application/ld\+json\')", re.I)
event_re = re.compile(r"\bon(?:click|load|change|submit|mouseover|mouseout|focus|blur|input|keydown|keypress|keyup|dblclick|contextmenu|mouseenter|mouseleave|mousedown|mouseup)\s*=", re.I)

files = sorted(root.rglob('*.html'))

with open('audit_nonce_event_results.txt', 'w', encoding='utf-8') as out:
    total = 0
    missing = []
    jsonld_missing = []
    event_handlers = []
    for path in files:
        text = path.read_text(encoding='utf-8', errors='ignore')
        for m in script_re.finditer(text):
            total += 1
            attrs = m.group(1)
            external = 'src=' in attrs.lower()
            has_nonce = bool(nonce_re.search(attrs))
            jsonld = bool(jsonld_re.search(attrs))
            line = text.count('\n', 0, m.start()) + 1
            if not external and not has_nonce:
                missing.append((path, line, 'jsonld' if jsonld else 'inline', attrs.strip()))
                if jsonld:
                    jsonld_missing.append((path, line, attrs.strip()))
        for i, line_text in enumerate(text.splitlines(), 1):
            if event_re.search(line_text):
                event_handlers.append((path, i, line_text.strip()))
    out.write(f'TOTAL_HTML_FILES: {len(files)}\n')
    out.write(f'TOTAL_SCRIPT_TAGS: {total}\n')
    out.write(f'TOTAL_MISSING_NONCE: {len(missing)}\n')
    out.write(f'TOTAL_JSONLD_MISSING: {len(jsonld_missing)}\n')
    out.write(f'TOTAL_EVENT_HANDLERS: {len(event_handlers)}\n\n')
    out.write('MISSING NONCE SCRIPTS:\n')
    for path, line, kind, attrs in missing:
        out.write(f'{path}:{line}: {kind} attrs={attrs}\n')
    out.write('\nEVENT HANDLERS:\n')
    for path, line, text in event_handlers:
        out.write(f'{path}:{line}: {text}\n')
