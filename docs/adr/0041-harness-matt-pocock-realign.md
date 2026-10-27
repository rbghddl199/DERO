---
status: accepted
date: 2026-08-13
approved-by: 박동규
relates-to: ADR-0042 (ecc 플러그인 제거·벤더링 — 아래 D-m의 별건 판정 결과)
---

# ADR-0041. 하네스를 Matt Pocock 순정으로 되돌리고, 죽은 인프라에 매인 규칙을 삭제한다

교육기관가 제공한 Jira·GitLab이 만료되면서 이슈 트래커·MR 리뷰·브랜치 가드의 근거가 사라졌고, 팀 6인을
조정하려고 만든 규율(이슈 규격 훅, 담당자 로스터, non-canon 배너, 승격 사다리, Notion 발행)은 솔로
유지보수 국면에서 보호 대상이 없는 무게가 됐다. 그래서 하네스를 **추가가 아닌 삭제로** 개정하고 Matt
Pocock 순정 플로(`/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review`)로 복귀한다.
존치 판정 기준은 하나다 — **막은 사고가 실재했고, 그 사고가 아직 재현 가능한가**. 이 기준을 넘지 못한
규칙은 근거가 이 ADR에 남는 대가로 canon에서 사라진다.

## 결정 원장 (2026-08-13 grilling 세션, 라운드 1R·2R·3)

| | 결정 |
|---|---|
| D-a | 목적: DERO을 순정 플로의 실증 사례로 쓰고, 개정 결과를 다음 프로젝트로 가져갈 자산으로 만든다 |
| D-b | 범위: 문서 층 + 스킬 라우팅. 훅은 삭제 방향으로만 포함 |
| D-c | 순정화: `/issue` 스킬 삭제, `/to-spec`·`/to-tickets` 밴 해제, 트래커는 GitHub로 이전 |
| D-d | 용어집: `docs/GLOSSARY.md`가 Matt의 glossary 역할을 그대로 맡고, `docs/agents/domain.md` 매핑을 교정한다 |
| D-e | ADR: 0041부터 Matt 포맷(한국어 본문), README 표는 legacy 색인으로 동결 |
| D-f | triage 라벨: 비활성 — 외부 이슈 유입 채널이 없다 |
| D-g | TDD 편입: seam은 spec 단계에서 사전 합의, implement는 red-green. refactor는 별도 리뷰 세션. 3D·시각 축은 기계 게이트 + 박동규 시각 QA 예외 |
| D-h | 컨텍스트 위생 규범화: phase boundary에서 continue → clear → handoff → subagent → compact 순서, 1티켓 1세션 |
| D-i | 훅: `jira-issue-guard`·`git-branch-guard`·`scratch-checkpoint` 삭제. `erd-freeze`·`prettier-format`·`plugin-check`·`harness-check`·2,000토큰 실링 존치 |
| D-j | `.scratch`: epic-key 네이밍·배너·`checkpoint.md`·승격 사다리 박리 → `<feature-slug>/spec.md` + `issues/NN-<slug>.md`. 대체 규율은 grilling 중 GLOSSARY·ADR 인라인 갱신 |
| D-k | HARNESS-RULES: Jira 이슈 규격·MR 리뷰 의무·담당자 로스터·H-xx 등록 의무·**Notion 발행 규칙 전체** 삭제 |
| D-l | 개정 원리: 추가가 아닌 삭제. 존치 기준 = 실사고 이력 + 사고 재현 가능성 |
| D-m | ecc 플러그인 다이어트는 별건(새 트래커 1호 티켓) — continuous-learning-v2·claude-mem·패턴 스킬 보존 전제 |

**D-m의 결론은 [ADR-0042](0042-ecc-plugin-removal-and-vendoring.md)다** (2026-08-13, 같은 날): 플러그인 제거 +
흡수 10건 벤더링. "continuous-learning-v2 보존" 전제는 그 조사에서 뒤집혔다 — 플러그인 제거 시 CL-v2가 함께
죽는 것이 실측이라 존치 대신 대체(claude-mem + `/harness-retro`)로 간다.

## ADR 포맷은 0041부터 forward-only Matt 포맷이다

**이 문서부터** frontmatter 상태(`proposed | accepted | deprecated | superseded by ADR-NNNN`) +
간결한 본문(1문단으로 끝나도 된다)이다. 절 6종(제목/상태/맥락/결정/대안과 버린 이유/파급)을 채우는
의무는 없어진다 — 기록 비용이 결정을 남기지 않는 이유가 되면 안 된다.

**0001–0040은 원형 보존한다.** 기존 형식으로 계속 읽히고, 결정 단위 부분 대체 주석("결정 2는 0018로
대체됨")이 그 안에만 살아 있어 재작성하면 유실된다. 0040 이하를 대체할 때도 옛 문서의 상태 줄만
고치고 형식은 건드리지 않는다.

## 팀 + 트래커 환경이 부활하면 되깔 층

삭제한 것을 한 덩어리로 보지 않기 위해 층을 적어 둔다.

1. **트래커 종속 층** (트래커가 다시 생기면): 이슈 규격 게이트, 이슈 키 브랜치 가드, 트래커 규약 문서
   (`docs/agents/issue-tracker.md`)의 해당 절
2. **다인 조정 층** (동료가 생기면): 코드 리뷰 의무(MR·PR), 담당자 로스터, non-canon 배너, 승격 사다리
3. **외부 발행 층** (외부 독자가 생기면): Notion 발행 규칙, triage 라벨 운용
4. **되깔지 않을 것**: 로컬 발명품(`checkpoint.md`, epic-key 네이밍) — 순정 스킬이 같은 일을 한다

## 부결

- **삭제 대신 보강** — 죽은 규칙에 "지금은 해당 없음" 주석을 달아 남기는 안. 규칙이 canon에 있으면
  세션은 따른다. 예외 표기가 늘어날 뿐 사고는 줄지 않는다.
- **ADR 40건 Matt 포맷 재작성** — 위 부분 대체 주석 유실 위험이 얻는 것보다 크다.
