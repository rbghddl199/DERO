---
status: accepted
date: 2026-08-13
revised: 2026-08-14 (결정 4 정밀화 — rules 잔류 판정 시험. 같은 결정의 구체화라 새 ADR 없음)
approved-by: 박동규
relates-to: ADR-0041 (하네스 Matt 순정화 — D-m이 이 건을 별건으로 넘겼다)
---

# ADR-0042. ecc 플러그인을 제거하고, 실측을 통과한 10건만 리포로 벤더링한다

ecc 플러그인은 스킬 282·커맨드 94·에이전트 67의 목록을 **매 세션 시작 컨텍스트에** 싣는다 —
근사 16.6k~24.4k 토큰(frontmatter 합산 근사 — 실측 토크나이저는 돌리지 않았다)으로, 리포 라우팅 계층
(root `CLAUDE.md` + `@karpathy-guidelines.md` = 2,112 토큰, `o200k_base` 실측 2026-08-13)의 8~12배다. 그런데 이 리포 트랜스크립트 488개를 훑어 실제로 호출된 것은 **고유 이름 15개**뿐이고,
그중 리뷰 축(`/ecc:review-pr` 등)은 ADR-0041이 mattpocock:code-review를 승자로 지정한 뒤 끊겼다.
즉 매 세션 지불하는 어텐션 예산의 대부분이 쓰지 않는 카탈로그다. 그래서 **플러그인을 제거하고,
흡수 기준을 통과한 10건만 프로젝트 `.claude/`로 벤더링한다.**

실측 근거(전부 `.scratch/matt-realign/`): [`facts-ecc-usage.md`](../../.scratch/matt-realign/facts-ecc-usage.md)
(사용 표면) · [`facts-context-surface.md`](../../.scratch/matt-realign/facts-context-surface.md) (세션 시작·rules 층 주입량) ·
[`facts-ecc-catalog-triage.md`](../../.scratch/matt-realign/facts-ecc-catalog-triage.md) (스킬·커맨드 전수) ·
[`facts-ecc-hooks-agents-triage.md`](../../.scratch/matt-realign/facts-ecc-hooks-agents-triage.md) (훅·에이전트 전수) ·
[`research-ecc-profiles-clv2.md`](../../.scratch/matt-realign/research-ecc-profiles-clv2.md) (install profiles·CL-v2 생사).
결정 서사 전문은 `.scratch/ecc-diet/grilling.md` D1~D11.

## 결정

1. **플러그인 제거 + 벤더링.** 흡수 10건 — 스킬 6(`springboot-patterns`·`jpa-patterns`·`springboot-security`·
   `postgres-patterns`·`redis-patterns`·`react-performance`), 에이전트 3(`silent-failure-hunter`·
   `security-reviewer`·`database-reviewer`), 훅 1(`block-no-verify`). 거처는 프로젝트
   `.claude/skills/`·`.claude/agents/`·`.claude/hooks/` — 벤더링이므로 워크트리·codex 하네스·팀원 체크아웃에
   따라가고, 플러그인과 달리 `skillOverrides`로 끌 수 있다.
2. **흡수분은 원본 복사가 아니다.** 트리밍(체크리스트·표만 남기고 튜토리얼 산문 제거) + description을
   트리거 문장으로 재작성 + `docs/context/skill-routing.md` 행(남긴 이유 1줄) + 해당 폴더 `CLAUDE.md`
   포인터 1줄. 판정 기준은 HARNESS-RULES §6 "Absorbing an outside skill".
3. **continuous-learning-v2는 존치가 아니라 대체다.** 플러그인 제거로 수집·분석·주입이 함께 죽는다(실측).
   관측=claude-mem, 승격=HARNESS-RULES §6 사다리, 저작=`writing-for-agents`가 이미 덮고, 남는 공백(반복 감지)은
   `/harness-retro`(수동, 월간 다이어트 동주기) 신설로 메운다. 데이터 폴더
   `~/.local/share/ecc-homunculus/`는 보존하고, 주입되던 instinct는 1회 리뷰 후 가치 있는 것만 정식 하네스로
   수동 승격한다.
4. **판정 축을 canon에 등재한다.** "강제=훅, 금지선=rules, 지식=skill" — HARNESS-RULES §6. 이 축은 후속
   rules 다이어트 피처의 입력이다 — `.claude/rules/java/security.md`와 `.claude/rules/ecc/java/security.md`가
   각각 99줄·헤딩 구성 동일이고 본문 차이는 3줄뿐인 것(2026-08-13 실측)이 즉물 증거다.
   - **정밀화 (2026-08-14, 승인 박동규 — rules 다이어트 피처 D1):** 축은 "무엇을 어디에 둘까"만 답하고
     "이미 rules에 있는 이 줄을 남길까"에는 답하지 않았다. 잔류 판정 시험을 canon에 병기한다 —
     **"paths 매칭 파일을 고치는 에이전트가 그 턴에 위반할 수 있고, 위반이 코드 리뷰로 싸게 잡히지 않는
     MUST/NEVER 명령문"만 잔류.** 탈락분의 목적지 우선순위(삭제 > 기존 `docs/context/` 합류 > 기존 skill
     흡수, 신규 doc 발명 금지), 단일 정본 규칙(폴더 `CLAUDE.md` 자동 로드 범위 안이면 그쪽이 정본),
     300단어 초과 잔류 파일의 정당화 1줄까지 같은 절에 있다. 전문은 HARNESS-RULES §6 "Retention test".
     새 ADR을 만들지 않는 이유: 결정 4가 정한 축의 적용 규칙이지 축의 교체가 아니다.
5. **chrome-devtools-mcp는 상시 배선하지 않는다.** 성능 트레이스 캡처가 이 MCP 전용 기능인 것은 실측이지만,
   에픽 606류 측정 때만 임시 배선한다 — 배선 명령 1줄을 문서화하는 것으로 충분하다.

## 대안과 버린 이유

- **플러그인 유지 + install profile로 부분 설치** — 실측에서 **플러그인 설치 경로에는 profile이 적용되지
  않는다**. 유지하면서 표면을 줄이는 길이 존재하지 않는다.
- **selective install(원하는 것만 골라 설치)** — 흡수분은 어차피 트리밍해야 쓸 만하고, 트리밍하는 순간
  upstream 추적 이점이 사라져 벤더링과 같아진다. 이점 없는 간접층만 남는다.
- **훅 프로파일만 남기고 나머지 비활성** — 플러그인 스킬은 `skillOverrides`로 끌 수 없다(실측). 세션 시작
  표면은 그대로 남는다.
- **전량 폐기(벤더링 0건)** — Spring·JPA·PG·Redis·성능 축의 참조 지식과 리뷰 렌즈 3종은 리포 canon에
  대체물이 없다. 표면 비용은 on-demand 층(skill description 트리거)으로 옮기면 사라진다.
- **rules 층까지 이번에 함께 정리** — 62개 재분류는 이 피처의 크기를 넘는다. 판정 축과 중복 실측만
  후속 피처로 넘긴다.

## 파급

- **블라스트 반경은 이 리포뿐** — 플러그인 scope가 project이고 타 프로젝트 사용 0건(실측).
- 업데이트 단절을 받아들인다. 흡수분은 패턴·체크리스트 같은 안정 지식이라 upstream 갱신 가치가 낮다.
- `/ecc:*` 죽은 참조는 리포 전체에서 걷어낸다(`docs/context/skill-routing.md`·rules·docs·`.codex/`).
- `/ecc:ecc-guide`가 맡던 "스킬 탐색 경로"는 `skill-routing.md`가 대신한다 — "여기 없는 스킬은 쓰지 않는다"
  원칙은 유지하고 탐색 지점만 재지정한다.
- 재도입을 검토한다면 근거는 하나다: **세션 시작 표면 비용보다 큰 실사용이 실측으로 증명될 때.**
