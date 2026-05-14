# 관리자 [예매하기] 실 호출 셋업

관리자 화면의 [예매하기] 버튼은 비공식 라이브러리 `korail2-ncard` 를 호출해 **단일 마스터 코레일 계정**으로 좌석을 점유합니다. 결제 자체는 자동화되지 않습니다 — 예약 후 결제 기한 내에 코레일 앱/홈에서 결제해야 좌석이 확정됩니다.

## 1. Python 환경

서버 머신에 Python 3.10+ 와 패키지 설치.

```bash
python3 --version            # 3.10 이상이어야 함
python3 -m pip install korail2-ncard pycryptodome
```

설치 검증:

```bash
python3 -c "import korail2, Crypto; print('ok')"
```

## 2. 환경 변수

`.env.local` 에 추가 (이미 `.env.example` 에 자리 잡혀 있음):

```
# 마스터 코레일 계정
KORAIL_ID=01099641234          # 회원번호 / 이메일 / 휴대폰 모두 가능
KORAIL_PASSWORD=********

# 실 예약 허용 스위치. "1" 일 때만 LIVE 가능.
# 운영 사고 방지용 — 평소엔 0으로 두고, 실 호출이 필요할 때만 1로.
KORAIL_RESERVE_LIVE=0

# (선택) python3 절대경로. 비우면 PATH 의 python3 사용.
KORAIL_PYTHON=/usr/local/bin/python3
```

`.env.local` 수정 후 dev 서버 재시작 (`Ctrl+C` → `npm run dev`).

## 3. 동작 원리 / 안전 가드

서버 라우트 [src/app/api/booking/reserve/route.ts](../src/app/api/booking/reserve/route.ts) → Python 헬퍼 [scripts/korail_reserve.py](../scripts/korail_reserve.py) 를 spawn.

호출이 실제 `reserve()` 까지 가는 조건은 **두 가지가 모두 참**일 때:

1. 서버 env `KORAIL_RESERVE_LIVE=1`
2. 관리자가 UI 우상단 토글을 **🚨 실 예약 (LIVE)** 으로 켠 상태에서 [예매] 클릭 → confirm 까지 통과

둘 중 하나라도 빠지면 dry-run(검색·매칭만 하고 reserve 호출 안 함)으로 동작합니다.

## 4. 상태 표시

| 뱃지 | 의미 |
|---|---|
| `◌ dry-run 매칭됨` | korail2 로그인·검색·매칭 성공. 실 예약은 안 됨 |
| `● 예약 완료` + `결제기한: ...` | 실제 좌석 점유 성공. **기한 내 결제 안 하면 자동 취소됨** |
| `✗ login/search/...` | 단계별 실패. 마우스 hover 시 상세 메시지 |

상세 행 펼치기를 클릭하면 코레일 응답 raw JSON 까지 확인 가능.

## 5. 한계

- 단일 코레일 계정 종속 — 일 호출량/예약 한도 적용
- 결제 자동화 X — 사용자가 별도로 코레일 앱/홈에서 결제 필요
- 비공식 API — 코레일 anti-bot 정책 변경 시 일시 장애 가능
- 약관 회색지대 — 운영 환경 적용 전 법무 검토 필요
- 왕복 주문은 가는 편(outbound)만 자동 호출됩니다. 돌아오는 편은 코레일 앱에서 별도 처리.

## 6. 트러블슈팅

| 에러 | 원인 / 조치 |
|---|---|
| `stage:env`, `KORAIL_ID / KORAIL_PASSWORD not set` | `.env.local` 채우고 서버 재시작 |
| `stage:import`, `korail2 not importable` | `pip install korail2-ncard pycryptodome` 또는 `KORAIL_PYTHON` 으로 정확한 python3 경로 지정 |
| `stage:login`, `login returned falsy` | 계정/비밀번호 오류, 또는 anti-bot 차단. 코레일 앱에서 1회 정상 로그인 후 재시도 |
| `stage:match`, `train ... not in N search results` | 우리 화면이 보유한 trainNo 와 코레일 검색 결과 매칭 실패. 시간/날짜 갱신 또는 trainGradeName 확인 |
| `stage:reserve`, `MACRO ERROR` 류 | korail2-ncard 가 anti-bot 우회 토큰을 못 따라잡은 상태. 패키지 업데이트 (`pip install -U korail2-ncard`) |
