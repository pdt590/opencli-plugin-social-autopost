#!/usr/bin/env python3
"""Keep a caption plain text: letters (including Vietnamese), digits, whitespace and ASCII punctuation.

  clean-caption.py check FILE   exit 0 when clean; exit 1 and list offending characters otherwise
  clean-caption.py fix FILE     rewrite FILE in place: map common typographic symbols to ASCII,
                                drop emoji (except number keycaps like 1️⃣) and every other disallowed character, tidy spaces,
                                then print the same report as `check`
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ASCII_PUNCT = set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')
REPLACE = {
    '–': '-', '—': '-', '−': '-', '•': '-', '●': '-', '▪': '-', '·': '-',
    '→': '->', '⇒': '=>', '←': '<-', '…': '...',
    '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '«': '"', '»': '"',
    ' ': ' ', ' ': ' ', ' ': ' ',
}


def allowed(char):
    if char in ' \n' or char in ASCII_PUNCT:
        return True
    category = unicodedata.category(char)
    return category[0] in 'LN' or (category in ('Mn', 'Mc') and not 0xFE00 <= ord(char) <= 0xFE0F)


# Number keycap emoji (0️⃣-9️⃣, 🔟) are the only emoji kept, for numbered lists.
KEYCAP = re.compile('[0-9]\ufe0f?\u20e3|\U0001F51F')


def offending(text):
    found = {}
    for char in KEYCAP.sub('', text):
        if not allowed(char):
            found[f'U+{ord(char):04X}'] = unicodedata.name(char, 'UNKNOWN')
    return found


def clean(text):
    text = unicodedata.normalize('NFC', text.replace('\r\n', '\n'))
    # Keep number keycaps (1️⃣, 🔟) intact; clean everything between them.
    parts, last = [], 0
    for match in KEYCAP.finditer(text):
        parts.append(''.join(c for c in map(lambda c: REPLACE.get(c, c), text[last:match.start()]) for c in c if allowed(c)))
        parts.append(match[0])
        last = match.end()
    parts.append(''.join(c for c in ''.join(REPLACE.get(c, c) for c in text[last:]) if allowed(c)))
    text = ''.join(parts)
    text = re.sub(r'[ ]{2,}', ' ', text)
    text = '\n'.join(line.strip() for line in text.split('\n'))
    return re.sub(r'\n{3,}', '\n\n', text).strip() + '\n'


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('check', 'fix'):
        print(__doc__)
        return 2
    path = Path(sys.argv[2])
    text = path.read_text(encoding='utf-8')
    if sys.argv[1] == 'fix':
        text = clean(text)
        path.write_text(text, encoding='utf-8')
    bad = offending(text)
    print(json.dumps({'file': str(path), 'clean': not bad, 'offending': bad, 'words': len(text.split())}, ensure_ascii=False))
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main())
