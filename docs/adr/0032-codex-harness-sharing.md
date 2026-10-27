# ADR-0032. codex 하네스 공유 — 리포 커밋 기반 스킬·훅·MCP

## 상태

**확정** — 2026-08-10, 승인 박동규 (2026-08-14 결정 4 부분 개정 — ADR-0042의 ecc 플러그인 제거로 claude 공식 세트가 7종에서 **6종**으로 줄었다, codex 세트 2종은 그대로). 하네스 규칙 정본은 `docs/HARNESS-RULES.md`, 설치 절차는 `docs/HARNESS.md`.

## 맥락

팀은 Claude Code 주력에 codex 사용자가 섞여 있다(WSL Ubuntu 포함). 종전 체계에서 codex
사용자가 받는 것은 루트 `AGENTS.md`(`@CLAUDE.md` 태그)를 통한 **지침뿐**이었고, HARNESS.md는
"훅·플러그인 자동 보호를 못 받으므로 MR 템플릿이 마지막 방어선"이라고 명시했다. 즉 **ERD
동결·브랜치 가드·이슈 가드가 codex 경로로 전부 뚫려 있었다.**

2026-08-10 실측으로 codex 0.147의 확장 표면이 Claude Code와 대부분 겹침을 확인했다:

- **스킬**: Agent Skills 표준(SKILL.md) 정식 채택, 탐색 경로 `.agents/skills`(CWD→리포
  루트→`~/.agents/skills`), 심링크 추적. Claude 전용 frontmatter는 에러 없이 무시.
- **훅**: 이벤트명(PreToolUse 등)·stdin JSON(`tool_name`/`tool_input`/`cwd`)·
  `permissionDecision: deny` 출력까지 동형. 리포 `.codex/hooks.json` 지원, 훅 실행 cwd =
  프로젝트 루트. 셸 도구명은 **`Bash`로 동일**, 파일 편집만 **`apply_patch`**(패치 텍스트).
- **MCP**: 프로젝트 `.codex/config.toml`의 `[mcp_servers.*]`를 읽는다(TOML, `.mcp.json`과
  1:1 변환).
- **플러그인**: Claude 마켓플레이스를 그대로 등록·설치 가능(`codex plugin marketplace add` +
  `codex plugin add`). 단 설치는 개인 `~/.codex/config.toml` 단위 — 리포로 강제 불가.

## 결정

### 1. 정본은 Claude 쪽, codex는 참조

팀 주력이 Claude Code이므로 프로젝트 자작 스킬 정본은 `.claude/skills/`(현행 유지), 가드
훅 정본은 `.claude/hooks/*.sh` 하나다. codex는 **같은 파일을 참조**한다 — 스킬은
`.agents/skills/<name> → ../../.claude/skills/<name>` 역심링크(제3자 벤더 스킬이 이미 쓰는
개별 심링크 패턴의 대칭), 훅은 `.codex/hooks.json`이 같은 셸 스크립트를 가리킨다. 두 벌
유지·복사 동기화는 부결 — 드리프트가 곧 보호 구멍이다.

### 2. 배포는 리포 커밋 — 팀원 zero-install

`.agents/skills/` 심링크 10개, `.codex/hooks.json`(가드 4종 + 편의 SessionStart 2종),
`.codex/config.toml`(scrapling MCP)을 커밋한다. 가드 훅의 존재 이유가 "사람이 잊어도 막는
것"인데 설치를 사람 기억에 맡기면 모순이다. clone하면 끝. Windows 팀원은 WSL이라 심링크
정상 동작. 첫 실행 시 codex의 리포 훅 신뢰 확인 1회는 감수한다.

### 3. erd-freeze에 apply_patch 분기 추가

codex 편집은 `apply_patch`(tool_input.command = 패치 텍스트)라 기존 `Edit|Write` 경로
판정이 안 잡는다. 패치 헤더(`*** Add|Update|Delete File:` · `*** Move to:`)에서 경로를
읽어 동일 판정(동결 대상 차단·자가 언락 차단)을 적용한다. 실기 검증: codex가 erd.md
append 시도 → PreToolUse deny 메시지 그대로 노출, 기준선 무변경.

### 4. 팀 공식 플러그인과 리마인드 훅

- **팀 공식**: HARNESS.md 5종(claude-mem·serena·exa·firecrawl·ecc) + **ponytail·
  mattpocock-skills**(공식 워크플로로 승격). caveman은 개인 취향(강제 없음). — 2026-08-14 개정: ecc 제외, 6종.
- codex 쪽 공식 세트는 ponytail·mattpocock-skills 2종(serena·context7·exa는 codex에선
  MCP 서버로 이미 충족).
- 플러그인 설치는 리포로 강제할 수 없으므로 **SessionStart 리마인드 훅**
  (`.claude/hooks/plugin-check.sh`, claude·codex 공용)이 미설치를 세션마다 컨텍스트로
  알린다. **advisory(exit 0)** — 차단형은 핫픽스를 막아 부결, 매 프롬프트 주입은 상시
  컨텍스트 오염이라 부결. 공식 세트 변경은 스크립트 상단 변수 두 줄.

### 5. MCP 이중 정의는 인정한다

MCP 서버 정의가 `.mcp.json`(Claude)과 `.codex/config.toml`(codex) 두 곳이 된다. 포맷이
달라 참조로 합칠 수 없고, 서버 추가는 드문 이벤트라 변환 자동화는 과투자 — 두 파일 머리에
상호 갱신 주석으로 묶는다.

## 부결

- **Cursor 포함** — 플러그인·훅 표면이 없어 공유 대상이 지침(AGENTS.md)뿐, 현행 유지.
- **전 플러그인 공유(ecc 포함)** — ecc(스킬 282종)는 codex 컨텍스트만 오염, 선별이 원칙.
- **프로젝트 자작 스킬 정본을 `.agents/skills/`로 이동** — 기능상 동치이나 Claude 주력
  관례(`.claude/` 정본)를 깨는 이득이 없다.
- **커맨드형 스킬의 codex 인자 지원** — codex custom prompts가 deprecated라 인자 치환
  경로가 없다. 인자 스킬(`/issue` 등)은 codex에서 인자 없이 동작하는 한계를 문서화로 수용.
- **서브에이전트 공유** — 포맷 상이(md+frontmatter vs TOML)·손실 변환인데 codex엔 이미
  자체 에이전트 51종, 실질 수요 없음.

## 한계

- `jira-issue-guard`의 codex 실기 검증은 미완 — codex에 Atlassian MCP가 없어 도구명
  매칭(`endswith`)을 실측 못 했다. 등록은 해 두었고, codex에 Jira MCP를 붙이는 사람이
  최초 검증자다.
- 리마인드 훅은 설치 여부만 본다 — 버전·활성화 상태까지는 안 본다(과투자).
