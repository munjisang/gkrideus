# -*- coding: utf-8 -*-
"""
한국관광공사 국문관광정보(KorService2) — place-map 25곳 1회씩 수집 → 로컬 JSON 저장.
트래픽: 장소당 searchKeyword2 1건. 한 번 받으면 재호출 금지(파일 재사용).
"""
import urllib.request, urllib.parse, json, time, io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# 문서의 Encoding 키 → 디코딩 형태(urlencode가 다시 인코딩)
KEY = "rP3YYs8oiVOxeBRuchqHlOVdg8VORQtXzPAwF4DYafjKCb4RQLSO/sf26QmJaqnwczTjekA8AAPnrO/k2SS1Ow=="
BASE = "https://apis.data.go.kr/B551011/KorService2/searchKeyword2"

# (카드 title, region, type, status, 검색 키워드)
PLACES = [
    ("모나 용평 리조트","gangwon","리조트","have","용평리조트"),
    ("하이원 리조트","gangwon","리조트","have","하이원리조트"),
    ("알펜시아 리조트","gangwon","리조트","have","알펜시아"),
    ("비발디파크","gangwon","리조트","have","비발디파크"),
    ("레고랜드 코리아","gangwon","테마파크","have","레고랜드"),
    ("오션월드","gangwon","테마파크","have","오션월드"),
    ("설악산 국립공원","gangwon","자연","soon","설악산"),
    ("롯데월드","seoul","테마파크","have","롯데월드"),
    ("서울 시티투어","seoul","시티투어","soon","서울시티투어"),
    ("명동·강남 쇼핑투어","seoul","쇼핑","soon","명동"),
    ("남산·N서울타워","seoul","자연","soon","N서울타워"),
    ("에버랜드","gyeonggi","테마파크","have","에버랜드"),
    ("여주 프리미엄 아울렛","gyeonggi","쇼핑","have","여주 프리미엄아울렛"),
    ("파주 프리미엄 아울렛","gyeonggi","쇼핑","have","파주 프리미엄아울렛"),
    ("시흥 프리미엄 아울렛","gyeonggi","쇼핑","have","시흥 프리미엄아울렛"),
    ("곤지암 리조트","gyeonggi","리조트","soon","곤지암리조트"),
    ("경주월드","gyeongsang","테마파크","have","경주월드"),
    ("경주 역사 시티투어","gyeongsang","시티투어","soon","경주"),
    ("부산 시티투어","gyeongsang","시티투어","soon","부산시티투어"),
    ("통영·남해 한려수도","gyeongsang","자연","soon","한려수도"),
    ("전주 한옥마을","jeolla","시티투어","soon","전주한옥마을"),
    ("순천만 국가정원·습지","jeolla","자연","soon","순천만"),
    ("무주 덕유산 리조트","jeolla","리조트","soon","무주 덕유산"),
    ("한라산·성산일출봉","jeju","자연","soon","성산일출봉"),
    ("제주 프리미엄 아울렛","jeju","쇼핑","soon","제주 프리미엄아울렛"),
]

FIELDS = ["contentid","contenttypeid","title","addr1","addr2","mapx","mapy",
          "firstimage","firstimage2","areacode","sigungucode","cat1","cat2","cat3","tel"]

def fetch(kw):
    params = {"serviceKey":KEY,"MobileOS":"ETC","MobileApp":"KRideus","_type":"json",
              "numOfRows":10,"pageNo":1,"arrange":"A","keyword":kw}
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent":"KRideus/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

out = {"collected_at":"2026-06-09","source":"KorService2/searchKeyword2","places":[]}
calls = 0
for title, region, typ, status, kw in PLACES:
    rec = {"card":{"title":title,"region":region,"type":typ,"status":status,"kw":kw},
           "total":0,"candidates":[]}
    try:
        d = fetch(kw); calls += 1
        body = d["response"]["body"]
        total = body.get("totalCount") or 0
        rec["total"] = total
        items = body.get("items")
        items = (items.get("item") if isinstance(items, dict) else []) if items else []
        if isinstance(items, dict): items = [items]
        for it in items:
            rec["candidates"].append({k:it.get(k,"") for k in FIELDS})
    except Exception as e:
        rec["error"] = str(e)
    out["places"].append(rec)
    top = rec["candidates"][0] if rec["candidates"] else None
    img = "IMG" if (top and top.get("firstimage")) else "no-img"
    print(f"[{calls:2d}] {title:18s} kw='{kw}' total={rec['total']:3d} {img}"
          + (f"  → {top['title']}" if top else "  → (매칭없음)"))
    time.sleep(0.3)

os.makedirs(os.path.dirname(os.path.abspath(__file__)) + "/data", exist_ok=True)
path = os.path.dirname(os.path.abspath(__file__)) + "/data/places-kto-raw.json"
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\n총 API 호출: {calls}건 / 저장: {path}")
