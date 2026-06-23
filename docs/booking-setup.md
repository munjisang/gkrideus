# 관리자 [예매하기] 실 호출 셋업

관리자 화면의 [예매하기] 버튼은 비공식 라이브러리(`korail2-ncard` / `SRTrain`)를 호출해 좌석을 점유합니다. 결제 자체는 자동화되지 않습니다 — 예약 후 결제 기한 내에 코레일/SRT 앱·홈에서 결제해야 좌석이 확정됩니다.

## 0. 구조 한눈에

실 호출은 **Vercel Python 서버리스 함수**로 동작합니다 (Next.js API 라우트가 아님 — Node 런타임에서는 Vercel이 Python을 spawn할 수 없습니다).

```
api/
  booking/
    reserve.py        POST /api/booking/reserve   (검색 + 예약)
    cancel.py         POST /api/booking/cancel
    availability.py   POST /api/booking/availability
    sync.py           POST /api/booking/sync       (티켓팅/취소 상태 동기화)
  _lib/
    creds.py          Supabase에서 계정 자격증명 로딩 (서비스별, 우선순위순)
scripts/
  ktx_booking.py      PatchedKorail 헬퍼 (코레일 공유 코드)
  korail_tls.py       레거시 TLS 시밍
requirements.txt      Python 의존성 (Vercel 빌드 시 자동 설치)
```

두 사업자를 모두 지원하며 [api/booking/reserve.py](../api/booking/reserve.py) 안에서 자동 라우팅됩니다:

| 사업자 | 라이브러리 | 라우팅 기준 |
|---|---|---|
| 코레일 (KTX 계열) | `korail2-ncard` | 기본값 |
| SRT | `SRTrain` | `trainGradeName` 이 `SRT` 로 시작하거나 요청 `service:"srt"` |

응답은 두 사업자 모두 동일한 envelope(`{ ok, stage, mode, train, reservation? }`)로 정규화되어 프런트엔드는 사업자별 분기가 필요 없습니다.

## 1. Python 의존성

[requirements.txt](../requirements.txt) 에 명시되어 있고 **Vercel 빌드 시 자동 설치**됩니다 — 운영 서버에 수동 설치할 필요 없습니다.

```
korail2-ncard==0.1.0
pycryptodome>=3.20.0
SRTrain>=2.0.7
```

로컬에서 Python 함수까지 포함해 검증하려면 `vercel dev` 를 사용합니다 (`npm run dev` 는 Next.js만 띄우고 `api/booking/*.py` 는 실행하지 않습니다).

```bash
vercel link              # 최초 1회
vercel env pull .env.local
vercel dev               # http://localhost:3000 — Python 함수 포함
```

## 2. 계정 자격증명

[api/_lib/creds.py](../api/_lib/creds.py) 가 다음 순서로 해석합니다 (사업자별):

1. **`public.service_accounts`** 테이블의 `enabled=true` 행 — `display_order` 우선순위순. **권장 경로**, 관리자 UI(계정 탭)에서 추가·토글·정렬.
2. `public.korail_credentials` 레거시 단일 행 (`service='korail'` 에만 해당).
3. `KORAIL_ID` / `KORAIL_PASSWORD` 환경변수 (부트스트랩 / 로컬 dev).

> Supabase 읽기는 `SUPABASE_SERVICE_ROLE_KEY`(서버 전용) 로 수행합니다. 두 자격증명 테이블 모두 RLS가 anon 접근을 차단하므로 service_role 우회만이 유효한 경로입니다.

### 실 예약 허용 스위치

```
# 실 예약 허용 마스터 스위치. "1" 일 때만 LIVE 가능.
# 운영 사고 방지용 — 평소엔 0으로 두고, 실 호출이 필요할 때만 1로.
KORAIL_RESERVE_LIVE=0
```

Vercel env 변경 후에는 **재배포해야** 반영됩니다.

## 3. 동작 원리 / 안전 가드

실 `reserve()` 까지 가는 조건은 **두 가지가 모두 참**일 때:

1. 서버 env `KORAIL_RESERVE_LIVE=1`
2. 관리자가 UI 우상단 토글을 **🚨 실 예약 (LIVE)** 으로 켠 상태에서 [예매] 클릭 → confirm 까지 통과 (요청 body `live:true`)

둘 중 하나라도 빠지면 dry-run(검색·매칭만 하고 reserve 호출 안 함)으로 동작합니다.

### 다계정 재시도

`enabled` 계정이 여러 개면 [api/booking/reserve.py](../api/booking/reserve.py) 가 `display_order` 순으로 **하나씩 시도하다 성공하면 즉시 반환**합니다. 단, 재시도가 무의미한 결정적 실패(`input` / `import` / `match` / `dry-run`)는 다른 계정으로 넘어가지 않고 바로 반환합니다. 전부 실패하면 `stage:all-accounts-failed` 로 마지막 에러까지 함께 돌려줍니다.

## 4. 상태 표시

| 뱃지 | 의미 |
|---|---|
| `◌ dry-run 매칭됨` | 로그인·검색·매칭 성공. 실 예약은 안 됨 |
| `● 예약 완료` + `결제기한: ...` | 실제 좌석 점유 성공. **기한 내 결제 안 하면 자동 취소됨** |
| `✗ login/search/...` | 단계별 실패. 마우스 hover 시 상세 메시지 |

상세 행 펼치기를 클릭하면 사업자 응답 raw JSON 까지 확인 가능합니다. 다계정 시도 시 직전 실패 계정 내역(`priorAttempts` / `attempts`)도 함께 표시됩니다.

## 5. 한계

- 결제 자동화 X — 사용자가 별도로 코레일/SRT 앱·홈에서 결제 필요
- 비공식 API — 사업자 anti-bot 정책 변경 시 일시 장애 가능
- 약관 회색지대 — 운영 환경 적용 전 법무 검토 필요
- 왕복 주문은 가는 편(outbound)만 자동 호출됩니다. 돌아오는 편은 사업자 앱에서 별도 처리
- 일 호출량/예약 한도는 사용한 계정 기준으로 적용됨 (다계정 등록으로 분산 가능)

## 6. 트러블슈팅

| 에러(stage) | 원인 / 조치 |
|---|---|
| `env`, `... 계정이 설정되어 있지 않습니다` | 관리자 UI 계정 탭에서 해당 사업자 계정을 추가·활성화. 또는 `KORAIL_ID/PASSWORD` env 설정 후 재배포 |
| `import`, `... not importable` | `requirements.txt` 에 `korail2-ncard` / `pycryptodome` / `SRTrain` 가 있는지 확인 후 재배포 |
| `login`, `login returned falsy` / `SRT login failed` | 계정/비밀번호 오류, 또는 anti-bot 차단. 해당 앱에서 1회 정상 로그인 후 재시도 |
| `match`, `train ... not in N search results` | 화면이 보유한 trainNo 와 사업자 검색 결과 매칭 실패. 시간/날짜 갱신 또는 `trainGradeName`(KTX↔SRT 라우팅) 확인 |
| `reserve`, `MACRO ERROR` 류 | anti-bot 우회 토큰을 못 따라잡은 상태. 패키지 업데이트 (`korail2-ncard` 버전 상향) 후 재배포 |
| `all-accounts-failed` | 등록된 모든 enabled 계정이 재시도 가능한 실패. `attempts` 의 마지막 에러로 원인 추적 |
| Python 함수 cold-start 5~10초 지연 | Vercel 플랜 한계. 핫 호출 시 1초 이하 |
