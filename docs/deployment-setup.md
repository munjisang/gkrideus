# Vercel · Supabase 배포 가이드

이 문서는 현재 PoC를 **Supabase(주문 DB) + Vercel(호스팅 + Python 서버리스)** 환경에서 처음부터 굴리는 전체 절차를 다룹니다.

---

## 0. 사전 준비

| 도구 | 용도 | 설치 |
|---|---|---|
| Node 18+ | Next.js dev/build | `nvm install --lts` |
| Python 3.11+ | 로컬 dev에서 Vercel Python 검증 시 | `brew install python@3.11` |
| Git | 소스 푸시 | 이미 있음 |
| GitHub 계정 | Vercel/Supabase 연동 | — |

```bash
# Vercel CLI (로컬 미리보기 + 배포)
npm i -g vercel
```

---

## 1. Supabase 프로젝트 생성

### 1-1. 회원가입·프로젝트 생성

1. https://supabase.com → **Sign in with GitHub**
2. 우상단 **New project**
3. 입력
   - **Organization**: 회사 또는 개인 default org
   - **Name**: `korail-poc`
   - **Database password**: 강한 임의 비밀번호 (잃어버리지 않게 별도 저장)
   - **Region**: `Northeast Asia (Seoul)` 권장
   - **Pricing plan**: Free (PoC 충분)
4. **Create new project** → DB 프로비저닝 약 1~2분

### 1-2. 스키마 적용

1. 프로젝트 대시보드 → **SQL Editor** → **New query**
2. 본 저장소의 [`supabase/schema.sql`](../supabase/schema.sql) 내용을 전부 복사·붙여넣기
3. **Run** (오른쪽 아래) → "Success. No rows returned" 메시지 확인
4. 좌측 **Table Editor** 에서 `orders` 테이블이 생긴 것 확인

### 1-3. 키 확보

대시보드 좌측 하단 **Project Settings** → **API**

| 키 이름 | 위치 | 용도 |
|---|---|---|
| **Project URL** | 화면 상단 | 브라우저·서버 공통 |
| **anon public** key | API Keys 첫번째 | 브라우저용 (RLS 통과) |
| **service_role** key | API Keys 두번째, 클릭해서 reveal | 서버 전용 (RLS 우회) |

⚠ **service_role 키는 절대 브라우저/git에 노출되면 안 됩니다.** Vercel env에만 넣습니다.

---

## 2. Vercel 프로젝트 생성

### 2-1. GitHub 푸시 (이미 했다면 건너뜀)

```bash
cd /Users/muns_work/Documents/muns/project/korail

# .env.local 은 이미 .gitignore 됨
git add .
git commit -m "PoC ready for Vercel"

# GitHub에 새 repo 만들고
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### 2-2. Vercel 회원가입·프로젝트 import

1. https://vercel.com → **Sign in with GitHub**
2. 대시보드 **Add New… → Project**
3. 방금 푸시한 repo **Import**
4. **Configure Project** 화면
   - **Framework Preset**: `Next.js` (자동 감지)
   - **Root Directory**: 기본값 (repo root)
   - **Build Command / Output Directory**: 기본값
5. **Environment Variables** 항목 (아래 모두 추가)

| Key | Value | 어디서 가져오나 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | §1-3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public | §1-3 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role | §1-3 (Production만 권장) |
| `TAGO_SERVICE_KEY` | data.go.kr 키 | 기존 .env.local |
| `KORAIL_ID` | 마스터 코레일 회원번호 | 기존 .env.local |
| `KORAIL_PASSWORD` | 마스터 코레일 비번 | 기존 .env.local |
| `KORAIL_RESERVE_LIVE` | `1` 또는 `0` | 운영에서 실 예매 허용 시 `1` |

6. **Deploy** 클릭 → 약 2~3분 빌드

### 2-3. 첫 배포 검증

배포 완료 후 표시되는 URL(`xxx.vercel.app`) 접속:
- `/` 메인 폼 정상
- 출발/도착 → 검색 → 카드 클릭 → 주문 페이지
- 결제하기 → 주문이 Supabase `orders` 테이블에 INSERT 되는지 대시보드에서 확인

---

## 3. Korail 예매 자동화 (Vercel Python 서버리스)

Next.js API 라우트는 Node.js로 돌기 때문에 `child_process.spawn`으로 Python을 호출하는 기존 방식은 Vercel에서 작동하지 않습니다. 대신 **Vercel Python runtime**으로 별도 함수를 만들었습니다.

### 3-1. 구조

```
/api/
  booking/
    reserve.py          Vercel Python 서버리스 (검색 + 예매)
    cancel.py           Vercel Python 서버리스 (취소)
    availability.py     좌석 조회
    sync.py             티켓팅/취소 상태 동기화
  _lib/
    creds.py            Supabase 자격증명 로딩 (사업자별, 우선순위순)
/scripts/
  ktx_booking.py        PatchedKorail 헬퍼 (코레일 공유 코드)
  korail_tls.py         레거시 TLS 시밍
requirements.txt        Python 의존성 (Vercel 빌드 시 자동 설치)
```

### 3-2. 로컬 동작 검증

`vercel dev` 를 쓰면 로컬에서도 Vercel 서버리스 환경을 그대로 흉내냅니다.

```bash
# 첫 1회: Vercel 프로젝트와 로컬 디렉토리 연결
vercel link

# 환경변수 pull (Vercel에 등록한 값을 .env.local 로 동기화)
vercel env pull .env.local

# 실행
vercel dev
```

브라우저 http://localhost:3000 으로 검증.

### 3-3. 자동화

`git push` → Vercel이 main 브랜치를 자동 빌드·배포. PR을 만들면 미리보기 배포 URL이 자동 생성됩니다.

---

## 4. 로컬 개발 흐름 (배포 후)

| 작업 | 명령 |
|---|---|
| Supabase 키 등 env 동기화 | `vercel env pull .env.local` |
| Next.js만 빠르게 (Python 호출 없는 흐름) | `npm run dev` |
| Python 함수 포함 풀 dev | `vercel dev` |
| 프로덕션 빌드 미리 검증 | `npm run build` |
| 강제 재배포 | `vercel --prod` 또는 GitHub push |

---

## 5. 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| Supabase에 데이터가 안 들어옴 | RLS 정책 확인 → `schema.sql` 의 `enable row level security` + `for all using (true)` 정책이 적용됐는지 |
| 빌드 시 `Cannot find module '@supabase/supabase-js'` | `npm i` 후 재배포. Vercel은 `package.json` 보고 자동 설치하니 lockfile 커밋 필수 |
| Python 함수 cold-start 시 5~10초 지연 | Vercel hobby 플랜 한계. 핫 호출 시엔 1초 이하 |
| `KORAIL_RESERVE_LIVE` 가 1인데 dry-run으로 동작 | Vercel env 추가 후 **재배포** 해야 반영 |
| `Function timeout` 30초 초과 | Korail 응답이 30초 넘는 경우. `vercel.json` 의 `maxDuration` 을 60~300초로 늘림 (Pro 플랜 필요) |

---

## 6. 보안 권장 (운영 전환 시 점검)

- Supabase RLS를 익명 전체 허용 → 인증 기반 정책으로 강화
- 관리자(/admin) 페이지에 Supabase Auth 로그인 게이트
- `SUPABASE_SERVICE_ROLE_KEY`는 Production env에만, Preview/Development에 노출 X
- Korail 비밀번호 정기 변경, Vercel env에만 보관
- 이용약관/개인정보 처리방침 실문안 교체
