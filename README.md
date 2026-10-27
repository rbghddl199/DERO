# DERO — 데스크테리어 시뮬레이터

**실측 규격으로 검증하고 사는 3D 데스크 셋업.** 제품의 실제 치수(mm)·VESA·허용 하중을 스펙
DB로 들고, 사기 전에 배치·호환성·예산을 3D에서 검증한다. AI는 상상도만 그린다 — 판정은
전부 스펙 알고리즘이다.

- 운영: <https://www.dero.life>
- 팀 프로젝트 (2026.07 – 2026.08) — 팀 브런치즈

## 핵심 기능

- **3D 배치 시뮬레이터** — 실측 스케일 고정(크기 조절 없음), 표면 스냅, 충돌 경고, 카메라 프리셋 5종
- **호환성 판정** — 모니터암↔책상(클램프 물림), 모니터↔암(VESA·하중), 소품↔책상(면적). 3단계 판정 + 수치 사유 + 대안 제품
- **실시간 견적** — 배치 변경마다 총액·예산 대비 즉시 갱신
- **AI 상상도** — 내 배치 스크린샷을 실사풍으로(gpt-image-2)
- **커뮤니티** — 공개 배치 피드·템플릿 복사(리믹스, 출처 자동 표기)·게시글(마크다운 + 배치 카드)
- **검색** — Elasticsearch + Nori, 카테고리·자동완성

## 기술 스택

| 영역 | 스택 |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Three.js · TypeScript · Tailwind 4 · Zustand |
| Backend | Java 21 · Spring Boot 4.1 · JPA + QueryDSL · Spring Security (OAuth2) · Flyway |
| Data | PostgreSQL 18 · Redis 8 · Elasticsearch 9.4 (Nori) · AWS S3 |
| Infra | Docker Compose · nginx · Jenkins (blue-green 무중단 배포) · Prometheus · Grafana · Kibana |

## 저장소 구조

```
backend/dero-api/   Spring Boot API 서버
frontend/           Next.js + Three.js 웹 앱
docs/               기획·설계 정본 (SPEC, REQUIREMENTS, ERD, ADR, 배포 토폴로지 등)
infra/              nginx 설정
observability/      ES·Kibana·Prometheus·Grafana·Filebeat 설정
scripts/            배포 스위치·에셋 파이프라인 스크립트
compose*.yaml       앱 / 데이터 / 관측 3계층 Docker Compose
Jenkinsfile         CI/CD 파이프라인 (main 푸시 = blue-green 배포)
```

## 빠른 시작 (로컬)

```bash
docker compose -f compose.data.yaml up -d        # postgres + redis

cd backend/dero-api
./gradlew bootRun --args='--spring.profiles.active=local --spring.datasource.url=jdbc:postgresql://localhost:5432/dero_db'

cd frontend
npm ci && npm run dev                            # http://localhost:3000
```

전체 빌드·배포 절차, 환경변수, DB 덤프 복원: **[docs/context/deployment.md](docs/context/deployment.md)**

### IntelliJ 코드 스타일 (백엔드, 1회)

`docs/GoogleStyle_custom.xml`이 포맷 정본이고 IntelliJ 코드 스타일 스킴이다. 모두 같은 방법으로 적용한다.

1. `Settings/Preferences > Editor > Code Style`
2. 기어 아이콘 → `Import Scheme > IntelliJ IDEA code style XML`
3. `docs/GoogleStyle_custom.xml` 선택해 임포트
4. `GoogleStyle-custom` 스킴을 골라 적용

**2026-07-30 이전에 임포트했다면 다시 임포트한다** — 옛 스킴은 탭이 아니라서 저장할 때마다 들여쓰기를
되돌린다. 이후 `Reformat Code`(⌘/Ctrl + Alt + L)가 규약대로 포맷한다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | 기능 체크리스트 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 요구사항·수용 기준 |
| [docs/USER-FLOWS.md](docs/USER-FLOWS.md) | 유저 플로우 |
| [docs/context/erd.md](docs/context/erd.md) | DB 스키마 정본 |
| [docs/context/api-spec.md](docs/context/api-spec.md) | API 명세 |
| [docs/context/deployment.md](docs/context/deployment.md) | 배포 토폴로지 정본 |
| [docs/adr/](docs/adr/) | 기술 결정 기록 (ADR) |

## 출처·라이선스 고지

- 의존 라이브러리: `frontend/package.json`, `backend/dero-api/build.gradle` 에 명시. 각 패키지의 라이선스를 따른다.
- 환경 HDRI `frontend/public/assets/env/studio_small_09_1k.hdr`: [Poly Haven](https://polyhaven.com/a/studio_small_09) (CC0)
- `.claude/skills/` 의 외부 스킬 복제본: [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) · [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) · [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT) · [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (Apache-2.0) · [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) (BSD-3). 출처 목록은 `skills-lock.json`.
- 3D 모델·썸네일·샘플 사진·홈 일러스트는 팀이 직접 제작하거나 AI 생성 도구로 만든 자산이다. 외부 저작물을 포함하지 않는다.
