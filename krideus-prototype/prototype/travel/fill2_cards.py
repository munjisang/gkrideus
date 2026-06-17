# -*- coding: utf-8 -*-
"""남은 6곳(시티투어3·명동쇼핑·전주한옥·제주아울렛) placeholder → 대표 POI 이미지.
soon 상태·준비중 배지 유지. loc은 이미 변환됨(미접촉)."""
import re, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
os.chdir(os.path.dirname(os.path.abspath(__file__)))
SRC = 'place-map.html'

FILL = {'서울 시티투어':'seoul_city', '명동·강남 쇼핑투어':'myeongdong',
        '경주 역사 시티투어':'gyeongju_city', '부산 시티투어':'busan_city',
        '전주 한옥마을':'jeonju', '제주 프리미엄 아울렛':'jeju_outlet'}

lines = open(SRC, encoding='utf-8').read().split('\n')
n = 0
for i, line in enumerate(lines):
    if 'class="pcard' not in line:
        continue
    tm = re.search(r'<h3 class="pcard__title">([^<]+)</h3>', line)
    title = tm.group(1) if tm else ''
    if title in FILL:
        slug = FILL[title]
        line = re.sub(r'<span class="pcard__ph">[^<]*</span>', '', line)
        line = re.sub(r'(<div class="pcard__media"[^>]*>)',
                      rf'\1<img class="pcard__img" src="img/place_{slug}.webp" alt="{title}" loading="lazy">',
                      line, count=1)
        n += 1; lines[i] = line
open(SRC, 'w', encoding='utf-8').write('\n'.join(lines))
print(f"채움: {n}곳")
