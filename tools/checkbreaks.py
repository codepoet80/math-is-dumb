"""Detect section headings stranded at the foot of a printed column or page.

A heading is 'stranded' when no rule body follows it in the same column. Rule
bodies are identified by their WHY label, which every rule has.

Works off real PDF geometry, so unlike a CSS-emulation test it sees page breaks.
"""
import re, subprocess, sys, xml.etree.ElementTree as ET
NS = '{http://www.w3.org/1999/xhtml}'

def check(pdf):
    xml = subprocess.run(['pdftotext','-bbox-layout',pdf,'-'],
                         capture_output=True, text=True).stdout
    root = ET.fromstring(xml)
    problems, headings = [], []
    for pi, page in enumerate(root.iter(NS+'page'), 1):
        mid = float(page.get('width')) / 2
        lines = []
        for line in page.iter(NS+'line'):
            txt = ' '.join(w.text or '' for w in line.iter(NS+'word')).strip()
            if txt:
                lines.append((float(line.get('xMin')), float(line.get('yMin')), txt))
        for colname, sel in (('left', lambda x: x < mid), ('right', lambda x: x >= mid)):
            col = sorted([l for l in lines if sel(l[0])], key=lambda t: t[1])
            for idx, (x, y, txt) in enumerate(col):
                # Safari emits the number as its own run ("10"); Chrome merges it
                # with the title ("10The Coordinate Plane"). Accept both.
                m = re.match(r'^(\d{2})(?=[A-Za-z])(.*)$', txt) 
                if m:
                    title = re.sub(r'\s+', '', m.group(2))[:40]
                elif re.fullmatch(r'\d{2}', txt):
                    title = re.sub(r'\s+', '',
                        next((t for xx, yy, t in col if abs(yy - y) < 2 and t != txt), '?'))[:40]
                else:
                    continue
                headings.append((pi, colname, txt, title))
                if not any(re.match(r'^WHY\b', t) for _, _, t in col[idx+1:]):
                    problems.append('page %d, %s column: %s' % (pi, colname, title))
    return headings, problems

for pdf in sys.argv[1:]:
    h, probs = check(pdf)
    print('\n%s' % pdf.split('/')[-1])
    print('  section headings located: %d' % len(h))
    if probs:
        print('  *** STRANDED: %d ***' % len(probs))
        for p in probs: print('      - ' + p)
    else:
        print('  stranded headings: 0')
