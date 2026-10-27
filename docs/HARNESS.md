# 하네스 가이드 — 플로와 설치

> 대상: 이 레포를 유지보수하는 사람(현재 솔로)과 **이 하네스를 다음 프로젝트로 옮길 때의 나**.
> **이 문서는 안내다.** 일하는 순서와 설치 방법을 설명한다. 강제되는 규칙의 정본은 `docs/HARNESS-RULES.md`이고, 이번 재정비에서 무엇을 왜 걷어냈는지는 `docs/adr/0041-harness-matt-pocock-realign.md`다.

"하네스"는 AI 도구와 일할 때 실수를 줄이는 **규칙·훅·스킬의 묶음**이다. 사상은 셋뿐이다.

- **가볍게.** 막은 사고가 실재했고 그 사고가 아직 재현 가능한 규칙만 남긴다.
- **정답은 딱 하나의 문서에**(SoT). 기능 명세와 완료 여부는 `docs/SPEC.md`, 진행 중 작업은 `.scratch/<feature-slug>/`. 같은 내용을 두 군데 적지 않는다.
- **진화하는 시스템.** 불편하면 고치고, 안 쓰면 뗀다. 전제가 죽은 규칙은 주석 달지 말고 삭제한다.

문서와 규칙은 도구와 무관하게 적용되고, 자동화(훅·스킬)는 Claude Code(및 codex)에 붙는다. 구조는 모노레포다 — `backend/`(Spring) + `frontend/`(Next·Three.js).

---

## 1. 메인 플로 — 공식 경로

```
/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review
```

`mattpocock-skills` 판을 그대로 쓴다. 손으로 산출물을 흉내 내지 않는다.

| 단계 | 산출물·규율 |
|---|---|
| `/grill-with-docs` | 설계를 심문한다. **여기서 확정된 용어는 그 자리에서 `docs/GLOSSARY.md`에, 결정은 ADR 또는 `docs/CONTEXT.md`에 인라인으로 쓴다.** 작업 폴더는 canon의 대기실이 아니다 |
| `/to-spec` | `.scratch/<feature-slug>/spec.md`. **"Testing Decisions"에서 테스트 seam을 사전 합의한다** — implement가 seam을 발명하지 않는다 |
| `/to-tickets` | `.scratch/<feature-slug>/issues/NN-<slug>.md`, blockers-first. 포맷 정본 `docs/agents/issue-tracker.md` |
| `/implement` | **1티켓 1세션**, red-green |
| `/code-review` | `mattpocock-skills:code-review`(표준 준수·스펙 부합 2축). 리팩터는 별도 세션(`/simplify`) |

- **TDD 규율과 세션 경계 규범의 정본은 `docs/HARNESS-RULES.md` §7이다** — red-green의 정확한 요구, 3D·시각 축 예외(기계 게이트 + 박동규 시각 QA), continue → clear → handoff → subagent → compact 순서가 거기 있다. 여기 다시 적지 않는다.
- 축별 스킬 승자와 후보는 `docs/context/skill-routing.md` §0.

---

## 2. 설치 — 새 체크아웃·새 머신에서 1회

> **함정 먼저.** `.claude/settings.json`에 있는 건 `enabledPlugins`·`extraKnownMarketplaces` **선언**뿐이고, 실제 설치 기록은 홈(`~/.claude/plugins/installed_plugins.json`)에 쌓인다. 게다가 **`--scope project` 설치는 설치 당시의 절대 경로에 묶인다** — 워크트리마다 스킬이 `Unknown skill`로 뜨는 원인이다. 워크트리를 여러 개 쓰면 `--scope user`가 편하다.

레포 루트에서 Claude Code(v2.1.195 이상)를 열고 신뢰를 승인한 뒤, **공식 6종**을 깐다 — `plugin-check.sh`가 검사하는 집합이 이 6종이고, 미설치면 세션마다 알린다(차단은 안 함). `.claude/settings.json`의 `enabledPlugins`에는 이보다 많은 항목이 선언돼 있는데, 나머지는 개인 취향 묶음이라 없어도 알림이 뜨지 않는다.

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem@thedotmack
/plugin install serena@claude-plugins-official
/plugin install exa@claude-plugins-official
/plugin install firecrawl@claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
/plugin marketplace add mattpocock/skills
/plugin install mattpocock-skills@mattpocock
```

각각 무엇인가: **claude-mem** 세션 간 영속 메모리(로컬에만 쌓인다) · **serena** 심볼 단위 코드 탐색 MCP · **exa** 웹 리서치 MCP · **firecrawl** 스크래핑 스킬 묶음 · **ponytail** 최소 해법 강제 · **mattpocock-skills** §1의 메인 플로.

- **ecc 플러그인은 2026-08-14에 제거됐다**(ADR-0042). 흡수한 10건은 리포에 벤더링되어 있어(`.claude/skills/`·`.claude/agents/`·`.claude/hooks/block-no-verify.js`) 설치 없이 따라온다. 설치 목록에 다시 넣지 않는다 — 재도입 근거는 "세션 시작 표면 비용보다 큰 실사용의 실측"뿐이다.
- **exa 인증(권장)**: `/mcp` → **exa** → **Authenticate**. 미인증도 동작하지만 속도 제한이 빡빡하다.
- **규칙 파일**: 언어별 규칙은 `.claude/rules/<언어>/`에 있고 `paths:` 프론트매터 덕에 해당 파일을 만질 때만 로드된다. 상시 주입되던 `.claude/rules/ecc/`는 2026-08-14 rules 다이어트에서 소멸했다 — 조사 순서·위임 계약은 루트 `CLAUDE.md` "Research & delegation"이 정본이다.
- **같은 플러그인이 `/plugin`에 두 마켓플레이스로 두 줄** 보이면 그게 중복이다. 개인(글로벌) 쪽을 끈다.

firecrawl은 API 키가 필요하다. `.claude/settings.local.json`(gitignore됨)에 넣는다 — **레포에 커밋 금지.**

```json
{ "env": { "FIRECRAWL_API_KEY": "키 값" } }
```

> JSON 후행 콤마 하나면 파일 전체가 무시된다. 저장 후 `jq . .claude/settings.local.json`으로 확인한다(2026-07-17 실제 발생).

런타임과 CLI:

```bash
node --version                       # claude-mem 훅이 Node로 돈다
uvx --version                        # serena가 uvx로 MCP 서버를 띄운다 (없으면 https://docs.astral.sh/uv/)
npm install -g firecrawl-cli         # 없으면 npx로 돌지만 첫 실행이 느리다
uv tool install graphifyy            # 지식 그래프 CLI
graphify install --platform claude   # 스킬을 ~/.claude/skills/graphify로 복사 (체크아웃마다 필요)
```

동작 확인 다섯: ① `/plugin`에 위 목록이 전부 활성이고, 쓰려는 플러그인에 `enabled in project settings but isn't installed` 경고가 없다 ② `/mcp`에 serena·exa 연결 ③ `/onboard` 실행 ④ `npx -y firecrawl-cli --status`에 `Authenticated via FIRECRAWL_API_KEY` ⑤ `graphify --help` 실행 + `/graphify` 목록에 뜸.

그래프가 낡으면 SessionStart 훅이 알린다 — `graphify update .`(코드만, LLM 불필요) 또는 `/graphify . --update`(문서까지).

### Codex

리포에 커밋된 것은 clone만 하면 동작한다(ADR-0032). 루트 `AGENTS.md`(`@CLAUDE.md` 태그)로 지침이 읽히고, `.agents/skills/`(codex 표준 경로) 심링크로 프로젝트 스킬이 뜨며, `.codex/hooks.json`이 Claude와 **같은 스크립트**(`.claude/hooks/*.sh`)를 실행한다 — 첫 실행 때 훅 신뢰를 한 번 승인해야 보호가 켜진다. codex는 스킬 **인자 치환을 지원하지 않으니** 인자가 필요한 스킬은 호출 후 본문에 값을 적는다. MCP 서버를 추가할 땐 `.mcp.json`과 `.codex/config.toml` 둘 다 갱신한다 — serena·context7·exa는 codex에선 개인 `~/.codex/config.toml`에 `codex mcp add`로 다는 게 관례다. **네이티브 Windows 체크아웃은 `.agents/skills/` 심링크가 깨져 codex 쪽 스킬만 안 보인다**(WSL은 정상, Claude는 무관). 플러그인은 2종만:

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
codex plugin marketplace add mattpocock/skills
codex plugin add mattpocock-skills@mattpocock
```

---

## 3. 평소 규칙 — 딱 3가지

**작업 시작 전: 라우팅 표를 본다.** 루트 `CLAUDE.md` 상단의 표가 "이 작업엔 이 문서를 먼저 읽어라"를 담고 있다. 각 문서에 이미 확정된 결정과 제약이 있어서, 안 읽고 시작하면 결정된 것을 다시 만들거나 금지된 방식으로 구현하게 된다.

**기능 완료 시: `docs/SPEC.md`에 체크.** 해당 줄의 `[ ]`를 `[x]`로 바꾼다(`/sync-spec`). 이 파일이 기능 명세·완료의 유일한 정본이다.

**반복되는 함정 발견 시: 폴더 `CLAUDE.md`에 한 줄.** 같은 실수가 반복되면 그건 함정이다. **원인 파일이 있는 폴더**의 "지속 이슈"에 적는다 — 루트나 패키지 루트로 올리면 그 파일들의 "라우팅 전용" 원칙이 깨진다(`docs/HARNESS-RULES.md` §3). 채팅창에 `#`로 시작하는 메모를 치면 저장 위치를 고를 수 있다.

---

## 4. 브랜치와 커밋

브랜치 이름은 자유다(권장: `feat/<slug>`, `prototype/<name>`). 형식을 강제하던 훅은 삭제됐다. 커밋은 Conventional Commits **권장**이고 기계 강제는 없다 — 정본은 `docs/git-convention.md`. 티켓을 닫는 커밋은 푸터에 로컬 티켓 경로를 단다:

```
Resolves: .scratch/<feature-slug>/issues/NN
```

Claude Code 개인 설정에 `"includeCoAuthoredBy": false`를 넣는다 — 없으면 커밋에 `Co-Authored-By` 트레일러가 붙는다(git-convention이 금지).

---

## 5. 하네스 자체를 고치고 싶을 때

**존치 기준은 하나 — 막은 사고가 실재했고, 그 사고가 아직 재현 가능한가.** 이 기준에 걸리지 않는 규칙·스킬·훅은 뗀다. 한두 번 겪은 것은 폴더 `CLAUDE.md` 한 줄로 충분하고, 반복될 때만 context 문서 → 스킬 → 훅으로 올린다(`docs/HARNESS-RULES.md` §6).

월 1회 다이어트로 "항상 로드되는 것" 전부를 8개 항목에 비춰 쳐낸다 — 여기에 **머지 끝난 `.scratch/<feature-slug>/` 삭제**가 포함된다. 삭제 전에 남은 것을 분류하고, 기본값은 "버린다".

팀과 외부 트래커가 다시 생기면 **어느 층을 되깔지는 ADR-0041**에 4단으로 적혀 있다. 이 문서를 다음 프로젝트로 복사할 때도 그 순서를 먼저 읽는다.

---

## 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| `/plugin`에 플러그인이 안 보임 | §2의 설치 명령을 다시 실행하고 `/reload-plugins`. 마켓플레이스 상태도 확인 |
| 스킬이 `Unknown skill`로 뜸 / 설정엔 켜져 있는데 안 붙음 | 그 체크아웃 경로에 설치 기록이 없다. **프로젝트 루트에서** `claude plugin install <플러그인>@<마켓플레이스> --scope project` 후 재시작. 워크트리가 여러 개면 `--scope user`가 편하다. 확인: `python3 -c "import json;d=json.load(open('$HOME/.claude/plugins/installed_plugins.json'));print([e.get('projectPath') for e in d['plugins'].get('<플러그인>@<마켓플레이스>',[])])"` 에 현재 경로가 있는지 본다 |
| 마켓플레이스는 있는데 설치가 안 됨 | `/plugin marketplace remove <이름>` 후 다시 추가. shallow clone에 태그가 없어 생기는 문제 |
| 세션 종료 시 하네스 리마인드 | `docs/SPEC.md`나 작업 폴더 `CLAUDE.md`에 갱신할 게 있는지 확인. 없으면 무시해도 된다 |
| AGENTS.md 관련 리마인드 | `AGENTS.md`가 `@CLAUDE.md` 한 줄인지 확인. 내용이 들어 있으면 한 줄로 되돌린다 |
| ERD 동결 훅이 계속 불일치라고 함 (Windows) | 작업 트리가 CRLF라 생기던 오탐. 훅은 고쳐졌으니 `git pull`이면 된다. 아래는 선택 |

### Windows: 줄바꿈 재체크아웃 (최초 1회, 선택)

`.gitattributes`의 `eol=lf`는 앞으로 받는 파일에만 적용된다. **이미 CRLF로 받아둔 파일은 저절로 바뀌지 않는다.** 셸 스크립트가 WSL에서 안 돌거나 diff에 줄 전체가 바뀐 것처럼 보이면 정리한다.

> **주의: `git reset --hard`는 커밋하지 않은 변경을 되돌릴 수 없게 지운다.** 1번을 먼저 확인하고, 남길 게 있으면 커밋하거나 stash 한 뒤 실행한다.

```bash
git status            # 1. 변경사항 없는지 확인 (있으면 커밋 또는 stash 먼저)
git rm --cached -r .  # 2. 인덱스 캐시만 비운다 (작업 파일은 안 지워진다)
git reset --hard      # 3. 새 규칙으로 작업 트리를 다시 받는다
```

확인: `git ls-files --eol docs/context/erd.md`가 `i/lf w/lf`면 정상이다. `gradlew.bat`은 예외로 CRLF를 유지한다.

---

## 더 볼 것

| 궁금한 것 | 문서 |
|---|---|
| 강제되는 규칙의 정확한 문구·근거 | `docs/HARNESS-RULES.md` |
| 이번 재정비에서 무엇을 왜 뺐나 | `docs/adr/0041-harness-matt-pocock-realign.md` |
| 어떤 작업에 어떤 문서를 읽나 | 루트 `CLAUDE.md` 라우팅 표 |
| 어떤 작업에 어떤 스킬을 쓰나 | `docs/context/skill-routing.md` |
| 티켓·스펙 파일 포맷 | `docs/agents/issue-tracker.md` |
| 커밋 메시지 형식 | `docs/git-convention.md` |
