# -*- coding: utf-8 -*-
"""place-map.html 카드 일괄 변환:
 1) pcard__region(meta 안) → pcard__loc(제목 위), 가운데점 띄어쓰기
 2) have 알펜시아·비발디: img src → KTO webp 교체
 3) soon 7곳: placeholder(.pcard__ph) → .pcard__img (pin 앞, 준비중 배지/grayscale 유지)
"""
import re, io, sys, shutil, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
os.chdir(os.path.dirname(os.path.abspath(__file__)))

SRC = 'place-map.html'
shutil.copy(SRC, SRC + '.bak')

# 카드 title → slug (KTO 이미지 보유 9곳)
REPLACE = {'알펜시아 리조트':'alpensia', '비발디파크':'vivaldi'}            # have: src 교체
FILL = {'설악산 국립공원':'seoraksan', '곤지암 리조트':'konjiam',
        '순천만 국가정원·습지':'suncheonman', '한라산·성산일출봉':'seongsan',
        '남산·N서울타워':'namsan', '통영·남해 한려수도':'tongyeong',
        '무주 덕유산 리조트':'muju'}                                       # soon: ph→img

lines = open(SRC, encoding='utf-8').read().split('\n')
n_loc = n_repl = n_fill = 0

for i, line in enumerate(lines):
    if 'class="pcard' not in line:
        continue
    # title 추출
    tm = re.search(r'<h3 class="pcard__title">([^<]+)</h3>', line)
    title = tm.group(1) if tm else ''

    # 1) region → loc (제목 위)
    rm = re.search(r'<span class="pcard__region">([^<]+)</span>', line)
    if rm:
        region = rm.group(1).replace('·', ' · ')
        line = line.replace(rm.group(0), '')                              # meta에서 제거
        line = line.replace('<h3 class="pcard__title">',
                            f'<span class="pcard__loc">{region}</span><h3 class="pcard__title">', 1)
        n_loc += 1

    # 2) have 이미지 교체
    if title in REPLACE:
        slug = REPLACE[title]
        line = re.sub(r'(<img class="pcard__img" )src="[^"]*"',
                      rf'\1src="img/place_{slug}.webp"', line, count=1)
        n_repl += 1

    # 3) soon placeholder → img
    if title in FILL:
        slug = FILL[title]
        line = re.sub(r'<span class="pcard__ph">[^<]*</span>', '', line)   # ph 제거
        line = re.sub(r'(<div class="pcard__media"[^>]*>)',
                      rf'\1<img class="pcard__img" src="img/place_{slug}.webp" alt="{title}" loading="lazy">',
                      line, count=1)
        n_fill += 1

    lines[i] = line

open(SRC, 'w', encoding='utf-8').write('\n'.join(lines))
print(f"loc 이동: {n_loc}곳 / have 이미지 교체: {n_repl}곳 / soon 채움: {n_fill}곳")
print(f"백업: {SRC}.bak")
