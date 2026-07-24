import pathlib
import re

def add_nonce_to_jsonld(text):
    pattern = re.compile(
        r'(<script\b[^>]*\btype\s*=\s*(?:"application/ld\+json"|\'application/ld\+json\')[^>]*>)',
        re.I,
    )

    def repl(match):
        open_tag = match.group(1)
        if re.search(r'\bnonce\s*=\s*(?:"[^"]*"|\'[^\']*\')', open_tag, re.I):
            return open_tag
        return open_tag[:-1] + ' nonce="mednova-inline-2026">'

    return pattern.sub(repl, text)


def remove_inline_handlers(text):
    text = re.sub(r'\s+onclick\s*=\s*"window\.print\(\)"', '', text, flags=re.I)
    text = re.sub(r"\s+onload\s*=\s*\"this\.media='all'\"", '', text, flags=re.I)
    return text


def normalize_google_fonts_link(text):
    pattern = re.compile(
        r'(<link[^>]*href=\"https://fonts\.googleapis\.com/[^\"]*\"[^>]*?)media=\"print\"([^>]*>)',
        re.I,
    )
    return pattern.sub(lambda m: f"{m.group(1)}media=\"all\"{m.group(2)}", text)


root = pathlib.Path('frontend')
files = sorted(root.rglob('*.html'))
modified = []
for path in files:
    text = path.read_text(encoding='utf-8', errors='ignore')
    new_text = text
    new_text = add_nonce_to_jsonld(new_text)
    new_text = remove_inline_handlers(new_text)
    new_text = normalize_google_fonts_link(new_text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        modified.append(str(path))

print('modified files:', len(modified))
for path in modified:
    print(path)
