# -*- coding: utf-8 -*-
"""raw + research 후보에서 9곳 정확 contentid 선별 → data/places.json.
firstimage 없는 곳(남산·통영)은 detailImage2로 갤러리 이미지 fallback."""
import json, urllib.request, urllib.parse, io, sys, time, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
os.chdir(os.path.dirname(os.path.abspath(__file__)))
KEY = "rP3YYs8oiVOxeBRuchqHlOVdg8VORQtXzPAwF4DYafjKCb4RQLSO/sf26QmJaqnwczTjekA8AAPnrO/k2SS1Ow=="

raw = {p['card']['title']: p['candidates'] for p in json.load(open('data/places-kto-raw.json', encoding='utf-8'))['places']}
research = json.load(open('data/places-kto-research.json', encoding='utf-8'))

# (slug, 카드라벨, 후보, 이름 우선매칭)
PLAN = [
    ('alpensia',   '알펜시아 리조트',   raw.get('알펜시아 리조트', []),     '스키장'),
    ('vivaldi',    '비발디파크',        raw.get('비발디파크', []),          '스키장'),
    ('seoraksan',  '설악산 국립공원',   raw.get('설악산 국립공원', []),     '국립공원'),
    ('konjiam',    '곤지암 리조트',     raw.get('곤지암 리조트', []),       '곤지암리조트'),
    ('seongsan',   '성산일출봉',        raw.get('한라산·성산일출봉', []),   '성산일출봉'),
    ('muju',       '무주덕유산리조트',  research.get('muju', []),           '무주덕유산리조트'),
    ('suncheonman','순천만습지',        research.get('suncheonman', []),    '순천만습지'),
    ('namsan',     '남산서울타워',      research.get('namsan', []),         '남산서울타워'),
    ('tongyeong',  '통영케이블카',      research.get('tongyeong', []),      '통영케이블카'),
]

def detail_image(cid):
    p = {'serviceKey':KEY,'MobileOS':'ETC','MobileApp':'KRideus','_type':'json',
         'contentId':cid,'imageYN':'Y','numOfRows':5,'pageNo':1}
    url = 'https://apis.data.go.kr/B551011/KorService2/detailImage2?' + urllib.parse.urlencode(p)
    d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'KRideus/1.0'}), timeout=20).read().decode('utf-8'))
    body = d['response']['body']; items = body.get('items')
    items = (items.get('item') if isinstance(items, dict) else []) if items else []
    if isinstance(items, dict): items = [items]
    for it in items:
        u = it.get('originimgurl') or it.get('smallimageurl')
        if u: return u
    return ''

GOOD_TYPES = {'12','14','28','32'}  # 관광지·문화·레포츠·숙박 (쇼핑38·음식39 배제)

def pick(cands, prefer):
    good = [c for c in cands if str(c.get('contenttypeid')) in GOOD_TYPES]
    pool = good if good else cands
    img_pool = [c for c in pool if c.get('firstimage')]
    for c in img_pool:                        # 1) 이미지 + 정확 일치
        if c.get('title','') == prefer: return c, c['firstimage']
    for c in img_pool:                        # 2) 이미지 + 이름 포함
        if prefer in c.get('title',''): return c, c['firstimage']
    if img_pool: return img_pool[0], img_pool[0]['firstimage']
    for c in pool:                            # 3) 이미지 없음 → contentid만 (detailImage fallback)
        if prefer in c.get('title',''): return c, ''
    return (pool[0], '') if pool else (None, '')

out, calls = [], 0
for slug, label, cands, prefer in PLAN:
    c, img = pick(cands, prefer)
    if c and not img:
        img = detail_image(c['contentid']); calls += 1; time.sleep(0.3)
    if c:
        out.append({'slug':slug,'card':label,'kto_title':c.get('title'),
                    'contentid':c.get('contentid'),'contenttypeid':c.get('contenttypeid'),
                    'image':img,'mapx':c.get('mapx'),'mapy':c.get('mapy'),'addr1':c.get('addr1')})
        print(f"{slug:12s} {(c.get('title') or '')[:30]:32s} img={'Y' if img else 'N'}")
    else:
        print(f"{slug:12s} (선별 실패)")

json.dump(out, open('data/places.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
print(f"\ndetailImage 추가 호출: {calls}건 / 저장: data/places.json ({len(out)}곳)")
