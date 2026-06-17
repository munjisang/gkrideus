# K.Rideus v2.1 리빌딩 — 격리 작업 공간

본 폴더는 v2.1 리빌딩의 **신규 페이지 시안** 작업 공간이다.
- 라이브(`src/`)와 완전 격리, nginx 웹루트 외부이며 `.gitignore` 대상.
- 사용자 컨펌이 완료된 시안만 `src/`로 이관한다.

## 작업 분장

| 폴더 | 용도 | 이관 목적지 |
|------|------|-------------|
| `movement/` | 이동 허브 시안 (공항·항만·KTX) | `src/movement/` |
| `travel/` | 여행 허브 시안 (리조트·쇼핑·테마파크·투어) | `src/travel/` |
| `event/` | 이벤트 허브 시안 (콘서트·페스티벌·스포츠) | `src/event/` (기존 페이지 대체) |
| `partner/` | 파트너 등록 페이지 정식본 (기존 `tmp/partner-page/`에서 발전) | `src/partner/` |

## 기존 50여 상세 페이지 마이그레이션
신규 시안이 아닌 **기존 페이지 브레드크럼·navbar 일괄 갱신 작업**은 본 격리 공간에서 다루지 않는다.
별도 git 브랜치 `feat/rebuild-v2.1-detail`을 만들어 `src/` 직접 작업한다.

## 정의서 참조
모든 시안의 콘텐츠·카피·구조는 다음을 단일 source of truth로 한다:
- `docs/planning/[개편]-K-Rideus-Integrated-Content-Specification.md`
- `docs/planning/[개편]-prd-redesign-v2.1.md`
- `docs/planning/[개편]-IMAGE_GENERATION_PROMPTS.md`
