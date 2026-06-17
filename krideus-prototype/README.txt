K.Rideus 프로토타입 v2.1 — 소스 공유본
========================================

[실행 방법] 이 폴더를 "정적 웹서버 루트"로 띄우세요. (그냥 더블클릭 X — 자산 경로가 절대경로라 서버 필요)

방법 1) Node 설치돼 있으면:
    cd krideus-prototype
    npx serve -l 8080
    → 브라우저에서  http://localhost:8080/prototype/index.html

방법 2) Python 3 설치돼 있으면:
    cd krideus-prototype
    python3 -m http.server 8080
    → 브라우저에서  http://localhost:8080/prototype/index.html


[주요 페이지]  (모두 /prototype/ 하위)
- 홈                  /prototype/index.html
- 공항(이동) 허브      /prototype/movement/index.html
    └ 공항 검색결과     /prototype/movement/results/index.html
- 여행 허브            /prototype/travel/index.html
    ├ 쇼핑 파주        /prototype/travel/shopping-paju/index.html
    │   └ 쇼퍼 검색결과 /prototype/travel/shopping-paju/results/index.html
    ├ 쇼핑 여주        /prototype/travel/shopping-yeoju/index.html
    └ 시티투어 경주     /prototype/travel/city-tour-gyeongju/index.html
- 테마파크 에버랜드     /prototype/theme-park/everland/index.html
    └ 쇼퍼 검색결과     /prototype/theme-park/everland/results/index.html
- 이벤트 허브          /prototype/event/index.html
    ├ GTWS 무주        /prototype/event/gtws-muju/index.html
    └ BOF 부산         /prototype/event/bof-busan/index.html


[참고]
- 우상단 KR / EN 토글로 한·영 전환됩니다 (영어가 기본).
- 네이버 지도가 들어간 페이지(시티투어 경주 등)는 지도 API의 도메인 제한 때문에
  localhost에서는 지도가 안 뜰 수 있습니다. (디자인 확인엔 지장 없음)
- 폴더 구조: 루트 = 이미지·CSS·JS 등 자산,  /prototype = 프로토타입 페이지.
