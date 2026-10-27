# 스킬 라우팅 — 이 프로젝트가 쓰는 스킬

작업을 시작할 때 **어떤 스킬을 손에 잡을지** 보는 문서. 전체 카탈로그가 아니라 **추천 목록**이다.

**스킬 설명은 이미 전부 주입되어 있다.** Claude Code는 매 세션 시스템 프롬프트에 설치된 스킬 전부의 이름과 설명을 싣는다 — 실측 2026-08-14(o200k_base): 플러그인 11종 13,420토큰(`mattpocock-skills` 35개 · `marketing-skills` 49개 · `claude-mem` 19개 · `firecrawl` 10개 등) + `.claude/skills`·`.claude/agents` 42개 3,389토큰. 그래서 이 문서가 하는 일은 "알려주기"가 아니라 **후보 좁히기**다. 잘못된 선택은 대개 같은 축 안의 경쟁이 아니라 **엉뚱한 축의 스킬**을 끌어오는 쪽에서 나온다(3D 씬에 일반 React 성능 스킬, Next 프로젝트에 Vite 스킬).

> **성장 규칙 — 이 문서의 핵심 한 줄**
> 여기 없는 플러그인 스킬은 **쓰지 않는다.** 필요하면 세션 시스템 프롬프트의 스킬 목록(설치된 전부가 이름·설명과 함께 실려 있다)에서 찾고, **쓰기 전에 이 문서에 한 줄 추가**한다.
> 카탈로그를 뒤지는 커맨드(`/ecc:ecc-guide`)는 ecc 플러그인과 함께 사라졌다 — 탐색 지점이 그 커맨드에서 이 문서 + 스킬 목록으로 바뀐 것뿐이고, "여기 없는 것은 쓰지 않는다" 원칙은 그대로다.

**메인 플로 축에는 승자를 정해 둔다**(2026-08-13, ADR-0041) — 아래 §0. 그 밖의 축은 후보가 둘 이상이면 병기하고, 고르는 건 그때그때 판단이다. 기능 차이가 선택을 가르는 경우만 사실로 적어둔다.

## 0. 메인 플로 — 이 축은 mattpocock 판이 이긴다

`/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review`가 공식 경로다(절차 정본: `docs/HARNESS.md`).

| 축 | 승자 | 밀려난 후보 |
|---|---|---|
| 테스트 먼저 쓰기 | `mattpocock-skills:tdd` | — |
| 코드 리뷰 | `mattpocock-skills:code-review` (표준 준수/스펙 부합 2축) | 내장 `/code-review` |
| 버그·성능 회귀 진단 | `mattpocock-skills:diagnosing-bugs` | — |
| 리서치 | `mattpocock-skills:research` | `exa:search`(단발 검색만) |

- PR에 인라인 코멘트를 남길 때만 내장 `/code-review --comment`를 쓴다 — 코멘트를 붙일 수 있는 건 그쪽뿐이다.

---

## 1. 프로젝트 규약 스킬 — 이게 먼저다

우리 규약을 코드로 들고 있는 스킬. 대체재가 없다.

| 작업 | 스킬 |
|---|---|
| 스펙·티켓 작성 (`.scratch/<feature-slug>/`) | `/to-spec` · `/to-tickets` — 포맷 정본은 `docs/agents/issue-tracker.md` |
| 기능 완료 체크 · SPEC.md 한 줄 추가 | `/sync-spec` |
| 새 세션 브리핑 | `/onboard` |
| 월간 다이어트 — 3회+ 반복 작업·함정 승격 후보 표 | `/harness-retro` (HARNESS-RULES §6 항목 9) |
| 구조 질문 (기능 end-to-end, 코드↔문서, 변경 영향 범위) | `/graphify query "<질문>"` — 아래 §9 주의 |
| 아키텍처·시퀀스·유저플로우 다이어그램 | `/system-diagram` |
| 유저플로우 문서 작성·갱신 | `/writing-user-flows` |
| 프롬프트 저작·개선 | `/promptsmith` |
| 브랜드 필름·광고 영상 | `/cinedance` · `/storyboard` · `/shot-sheet` · `/casting-sheet` (정본: `docs/brand-film/README.md`) |

## 2. 백엔드 — Spring Boot · Java · JPA

| 작업 | 스킬 |
|---|---|
| 캐시·비동기·필터·재시도·관측 | `springboot-patterns` (프로젝트 벤더링) — rules가 안 덮는 배선 축만 남겼다 |
| 인증 필터·인가·CSRF·CORS·보안 헤더·레이트 리밋 | `springboot-security` (프로젝트 벤더링) — `rules/java/architecture.md`가 없는 **설정 축**을 갖고 있다 |
| Spring 테스트 작법 (플로는 §0 `mattpocock-skills:tdd`) | 스킬 없음 — `.claude/rules/backend/testing-runtime.md` |
| 빌드·프로파일·기동 검증 절차 | 스킬 없음 — `.claude/rules/backend/gradle-build.md` · `spring-config.md` |
| 코드 스타일·네이밍 | 스킬 없음 — `.claude/rules/java/project-convention.md` · `enum-and-lombok.md` |
| N+1 진단·인덱스 설계·배치 쓰기·커서 페이징·Hikari | `jpa-patterns` (프로젝트 벤더링) — 진단 절차와 인덱스 판단은 rules에 없다 |

`backend/CLAUDE.md`가 이 프로젝트의 실제 규약이고 위 스킬은 일반 지식이다. **충돌하면 `backend/CLAUDE.md`가 이긴다.**

## 3. DB

| 작업 | 스킬 |
|---|---|
| 쿼리·인덱스·성능 진단 SQL | `postgres-patterns` (프로젝트 벤더링) — PG 쪽 인덱스·진단 SQL은 리포 canon에 대체물이 없다 (RLS 절은 삭제) |
| Flyway 마이그레이션 | 스킬 없음 — `.claude/rules/backend/flyway-migration.md` (스키마 정본은 동결된 `docs/context/erd.md`) |
| 캐시·세션 스토어·키/TTL 설계·분산 락 | `redis-patterns` (프로젝트 벤더링) — 예시를 Spring Data Redis로 치환, 배선 정본은 `rules/backend/*` |

스키마 자체는 `docs/context/erd.md`가 정본이고 **동결**되어 있다(훅이 편집을 차단). 스킬 조언이 ERD와 갈리면 ERD가 이긴다.

## 4. 인프라·배포

**이 축에는 스킬이 없다.** 실제 배선(EC2 · nginx · Jenkins · compose · Dockerfile)은 `docs/context/deployment.md`가 측정된 사실 정본이고, 설계 결정은 `docs/context/architecture-map.md`·`docs/adr/`다. 일반론 스킬을 끌어오면 이 배선과 어긋난 조언이 들어온다.

## 5. 프론트 — React · Next.js

| 작업 | 스킬 |
|---|---|
| 컴포넌트·훅·상태 | 스킬 없음 — `.claude/rules/nextjs/patterns.md` · `coding-style.md` · `.claude/rules/frontend/*` |
| 렌더 최적화·번들·첫 로드 JS | `react-performance` (프로젝트 벤더링) — 성능 축은 rules에 없다. 원본 70+ 규칙에서 이 스택(Route Handler·Server Action 없음, SWR·React Compiler 미사용)에 유효한 것만 남겼고, **3D·R3F 성능은 소관 밖**(§6) |
| 컴포넌트 테스트 | 스킬 없음 — 플로는 §0 `mattpocock-skills:tdd`, 러너는 vitest(`frontend/`에서 `npm run test`) |
| 접근성 | 스킬 없음 — 공식 세트에 대응 없음(ecc 제거로 빈 축). 정본은 `docs/DESIGN-SYSTEM.md`, 필요하면 이 문서에 후보를 한 줄 추가하고 `docs/HARNESS.md` 설치 절에도 넣는다 |
| Next·Turbopack 빌드·라우팅 | 스킬 없음 — `.claude/rules/nextjs/*` + `frontend/CLAUDE.md`(빌드 지뢰 정본) |
| 화면 룩·디자인 방향 | `design-taste-frontend` (`docs/DESIGN-SYSTEM.md`가 정본, 스킬은 작법) |

## 6. 3D·씬 — 라우터 스킬 `simulator-3d-scene`이 문서 정본으로 보낸다

**3D·배치·스냅·카메라·조명 작업에 일반 React·성능 스킬을 끌어오지 않는다.** three.js/R3F 내용을 담은 스킬은 설치 표면 어디에도 없고(ecc 282개에도 없었다 — 실측 2026-08-13), 트리거 QA 2차(2026-08-14, `.scratch/skill-firing/measurement.md`)에서 이 공백 축을 일반 성능 스킬이 가로채는 오답 경로가 실측됐다. 그래서 내용 없는 라우터 스킬 `simulator-3d-scene`(프로젝트 벤더링)이 발화를 받아 아래 문서 정본으로 보낸다. 정본은 여전히 문서다. 이름에 트리거 토큰(simulator·3d·scene)을 실은 이유: 신규·미사용 스킬은 세션 스킬 목록에 description 없이 이름만 실리는 것이 실측됐다(QA 3차) — 이름이 곧 포인터다.

- `frontend/CLAUDE.md` — 프론트 지뢰와 빌드 함정
- `docs/context/3d-scene.md` — 배치·카메라·스냅·벽 토글
- `docs/context/lighting-map.md` · `docs/context/glb-rendering-guide.md` — 조명·발광·GLB 저작

## 7. 리뷰·보안

| 작업 | 스킬 |
|---|---|
| 코드 리뷰 | `mattpocock-skills:code-review` (§0 승자) |
| 보안 점검 | `security-reviewer` 에이전트(아래) + `springboot-security` 스킬 |

### 렌즈 에이전트 3종 (프로젝트 벤더링, `.claude/agents/`)

메인 플로 리뷰(`mattpocock-skills:code-review`)는 **표준 준수·스펙 부합** 2축이다. 그 2축이 안 보는 결함을 잡는 렌즈만 남겼다 — Agent 툴로 이름을 지정해 띄운다.

| 에이전트 | 남긴 이유 |
|---|---|
| `silent-failure-hunter` | 삼켜진 예외·의미 없는 폴백은 표준에도 스펙에도 안 걸린다 — 리뷰 2축의 사각 |
| `security-reviewer` | 취약점은 "표준 준수"와 별개 축이고, rules는 금지선만 갖고 있어 능동 스캔 주체가 없다 |
| `database-reviewer` | 인덱스·EXPLAIN·잠금 순서 판단은 스킬(참조)이 아니라 실제로 훑어 줄 주체가 필요하다 |

ADR-0042로 ecc 플러그인에서 벤더링했다(플러그인은 2026-08-14 제거). 나머지 ecc 에이전트 64종은 데려오지 않았다(스택 불일치·리포 canon과 중복).

## 8. mattpocock-skills — 전부 쓴다

35개 전부 채택, 밴 없음(2026-08-13 `/to-spec`·`/to-tickets` 밴 해제, ADR-0041 D-c). 설정 산출물은 `docs/agents/{domain,issue-tracker,triage-labels}.md`이고, 루트 `CLAUDE.md`의 "Agent skills" 절이 그 라우팅이다.

- `/to-spec`·`/to-tickets`는 `.scratch/<feature-slug>/`에 스펙·티켓을 쓴다. **`docs/SPEC.md`는 기능 완료 대장으로 남는다** — 기능이 착지하면 `/sync-spec`으로 한 줄 체크(둘은 경쟁이 아니라 단계가 다르다).
- **`in-progress/` 6종만 쓰지 않는다.** 저자가 미완성으로 표시한 것들이다.

`/domain-modeling`은 그대로 쓴다. 원문은 "루트 `CONTEXT.md`는 glossary이고 구현 세부가 없어야 한다"고 지시하지만, 이 레포는 `docs/CONTEXT.md`가 기획 SSOT·`docs/GLOSSARY.md`가 용어 SSOT다 — 이 차이는 `docs/agents/domain.md`가 이미 덮어써 놨다.

## 9. 여기서 다루지 않는 것

- **검색·리서치 순서** — 정본은 루트 `CLAUDE.md` "Research & delegation" 절이다(prior art → serena/graphify → Context7 → Exa. 2026-08-14 `.claude/rules/ecc/common/`에서 흡수). 여기 다시 적으면 SoT가 둘이 된다.
- **스타일 모드**(`caveman:*` · `ponytail:*`) — 개인 취향이다.
- **`/graphify` 설치** — `graphify-out/`(984 파일)은 레포에 커밋되어 있지만 스킬은 CLI가 홈(`~/.claude/skills/graphify`)에 깔아준다. **새 체크아웃·워크트리마다 설치가 필요하다**(`docs/HARNESS.md` 설치 절).

## 10. 뺀 것과 근거

같은 축에 있어 보여도 이 프로젝트 작업에 끌어오지 않는 것들. 헷갈리면 이 표를 본다.

| 뺀 것 | 근거 |
|---|---|
| `ecc:*` 전체 (스킬 282·커맨드 94·에이전트 67) | 플러그인 제거(2026-08-14, ADR-0042). 흡수 10건은 위 표에 벤더링 이름으로 있고, 나머지는 **존재하지 않는 참조**다 — 호출하면 그냥 실패한다 |
| `marketing-skills:*` 49개 | 마케팅 카피·캠페인용. 이 리포의 코드·하네스 작업 축에 대응 없음(실사용 0건, 실측 2026-08-14) |
| 3D·R3F 축 스킬 | 설치 표면에 존재하지 않음 (§6) |
| MySQL·k8s·Vite 축 스킬 | 스택 불일치 — PostgreSQL(`org.postgresql`·`flyway-database-postgresql`·`testcontainers-postgresql`) · EC2+compose+Jenkins(`docs/context/deployment.md`) · Next.js/Turbopack |
