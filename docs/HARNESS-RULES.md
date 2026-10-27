# Harness Rules — Enforced Canon

> **Normative.** Install/usage: `docs/HARNESS.md`. This doc = what is enforced and why.
> Frozen 2026-07-15 (승인 박동규) · split from onboarding 2026-07-22 · Englished + compressed 2026-08-03 (승인 박동규) · **deletion-first revision 2026-08-13 (ADR-0041, 승인 박동규)** — rules that depended on the expired tracker, on merge-request review or on coordinating a team were removed, not annotated. What was removed and which layer to re-lay if a team and a tracker come back: ADR-0041.

## 1. Premises

- Mixed tooling (Claude Code · Cursor · Codex) → doc structure is tool-neutral; hooks/skills are Claude Code only.
- **SoT docs = feature spec + done checks. `.scratch/<feature-slug>/` = work in flight.** No duplicate tracking.
- SoT is one continuously-updated doc, not dated accretion. Session output stays out of SoT.
- Harness is an evolving system: start minimal, add weight only on proven friction (§6).

## 2. Document Rules

```
docs/
  CONTEXT.md        # 기획 SSOT — 결정 변경은 박동규 승인 필수
  SPEC.md           # 기능 명세·완료 체크리스트 SoT
  context/          # 온디맨드 주제별 컨텍스트 (해당 작업 시에만 읽음 — 한국어, §3 "Document language")
  agents/           # 에이전트 소비 규칙 (영어 — §3)
.scratch/           # 비정본 작업 폴더 — 커밋함, 작업 머지 시 삭제 (아래 "작업 스펙 문서")
```

**Required**

- Feature done → flip that line to `[x]` in `docs/SPEC.md`. New feature → one added line.
- **Never reuse or renumber a feature ID.** Update in place. IDs are referenced outside the doc (`erd.md` notes · ADR · `CONTEXT.md` D-series · commits) and **a broken link is visible, a silently repointed one is not**. 2026-07-30: `REQ-COM-04` overwritten "배치 게시"→"커뮤니티 글 작성"; restored in DERO-274. Same rule in `docs/adr/README.md` and the `erd.md` "확정 후 개정" table (old rows never deleted).
- **Resolve `SPEC.md` conflicts against `docs/REQUIREMENTS.md`** (2026-07-30). Canon comparison, not taste: IDs/wording in REQUIREMENTS are correct; IDs absent there were manufactured by the merge. Two same-day incidents, both from judging on SPEC alone — ① `REQ-COM-04` overwrite dropped the batch-publish requirement (fixed in 274) ② `REQ-COM-12` reverted to old wording while its new content was copied to `REQ-COM-14`, duplicating one feature (fixed in 270).
- Detail rules outgrowing one line → `docs/context/<topic>.md`; SPEC.md keeps only the link.
- **Planning changes go to `CONTEXT.md` as a D-number, not SPEC.md.** 박동규 approval required.
- New/changed domain term, entity or column → updating `docs/GLOSSARY.md` is part of the change.
- One `docs/context/` file per topic + a one-line "read this when…" header. **Registering it in the root `CLAUDE.md` routing table is part of the change** — unregistered = invisible.

### Work Spec Documents (2026-08-03, revised 2026-08-13 · 승인 박동규)

Artifacts from the `/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review` pipeline are **work docs, not canon**. One folder per piece of work: `.scratch/<feature-slug>/` holding `spec.md` and `issues/NN-<slug>.md`. Layout and ticket format: `docs/agents/issue-tracker.md` — that file is the detail canon, this section is the harness rule.

- **Commit the folder** — it must survive branch switches and reach the other checkouts (worktrees, orca workspaces) to serve as reference. Not in `.gitignore`, and **not in `.git/info/exclude` either** (removed 2026-08-06: it had been excluded there while this doc said "commit it", so the rule and the tree disagreed for three days).
- **Canon updates happen during the grilling, not after.** A term settled while grilling goes into `docs/GLOSSARY.md` inline; a decision settled that way goes into an ADR or `docs/CONTEXT.md` inline. **The work folder is never a holding pen for something canon should own** — deferring the classification to folder-deletion time defers it to never (2026-08-06: `.scratch/384-search-rollout.md` sat on ES wiring facts belonging in `context/observability.md`).
- **Delete the folder when the work merges — classify what is left, and the default is "throw it away."** Wiring facts → `docs/context/*`; a trap that will bite again → "지속 이슈" in the owning folder's `CLAUDE.md`; project state → mem; an overturned design decision → ADR / `CONTEXT.md`; point-in-time measurements → gone. Enforced by the monthly diet, item 8 (§6).
- **The folder holds exactly `spec.md` + `issues/`** — no banner, no resume file, no tracker key in its name. The pipeline skills produce these two things; anything else was a local invention (what was dropped and why: ADR-0041 D-j).

**Forbidden**

- **No dated snapshot docs (plan/spec) under `docs/`** (2026-07-22, scope clarified 2026-08-03). Decisions → `CONTEXT.md`, implementation rules → `context/*`, harness → this doc. Why: six 2026-07-15/07-21 design snapshots outlived implementation still carrying unchecked boxes, creating rework risk. **We block survival, not creation** — hence `.scratch/` plus a death date.

## 3. CLAUDE.md · AGENTS.md Rules

### One responsibility per layer (2026-07-23)

| Layer | Sole job | Holds | Never holds |
|---|---|---|---|
| Root `CLAUDE.md` | **Routing** | one-line service definition · repo-wide invariants · doc/package routing table | persistent issues, traps (not one line) |
| Package root (`backend/`·`frontend/`) | **Entry point** | 1–2 lines of stack · submodule routing table · local run commands · build traps from **config files that folder owns** (`package.json`·`tsconfig.json`) | domain/module traps |
| Module/domain folder (`.../user/`, `src/three/`) | **Knowledge** | that folder's persistent issues, traps, scoped rules | parent or sibling folders |

### Ownership — where a trap goes

- **Write it in the `CLAUDE.md` of the folder holding the cause; never promote upward.** `backend/dero-api/build.gradle` → `backend/dero-api/CLAUDE.md`; `src/three/core/collider.ts` → `src/three/CLAUDE.md`.
- Spanning two folders → write in **each**, not the ancestor. Three or more → ladder step 3 (`docs/context/` topic doc, §6).
- **Create a child `CLAUDE.md` only when there is content.** No empty files/skeletons. Depth follows the cause (`user/CLAUDE.md` vs `user/controller/CLAUDE.md`).
- A new child ships with **one line in the parent routing table**. Unregistered = nobody finds it.

### Authoring (2026-07-23)

**First principle: never write what the code already says.** CLAUDE.md is a guardrail, not a README.

| Cut (code says it) | Write (code doesn't) |
|---|---|
| stack/version lists — in `package.json`·`build.gradle` | why a version is pinned (`react 19.2.x 핀 — R3F peer가 <19.3`) |
| folder structure description | the rule deciding **where new code goes** |
| "written in TypeScript" | a decidable ban like "no `any`" |
| behavior visible in code | conditions under which it **silently breaks** (traps) |

Exception — **keep routing tables**: they point at what to open first, cutting search cost. One line per row, no commentary.

**Rules must be measurable.** ✗ "테스트 잘 짜라" · "코드를 깨끗하게" · "성능을 신경 써라" → ✓ "vitest로 짜고 외부 API mock 금지" · "함수 30줄 넘으면 분리".

**Always write run commands** (build · test · lint · typecheck) — without them AI digs through `package.json` and burns tokens on wrong commands. **Ban non-terminating forms explicitly** (watch, resident server): `npm test -- --run`, no watch mode.

**Name the environment in every environment claim** (2026-07-23). Subjectless "로컬에 JDK가 없다" goes false elsewhere and makes teammates install what they have. Format: `<환경>은 <상태>(<날짜> 확인)` + what other environments do. Real case: JDK/docker/CLI-tool absence from one WSL session hardened into canon, then was disproven three-for-three on macOS (corrected 2026-07-23) — run the tool before writing presence or auth state as canon. **Never name an environment after a person** (2026-07-24): "macOS는 …", not "박동규 macOS는 …" — unverifiable for others and silently false when hardware changes. Person names appear only in approval signatures (`승인 박동규`), where the name is the information.

**`@import` vs nested `CLAUDE.md`.** `@path` is **always loaded** — repo-wide invariants only (currently `@karpathy-guidelines.md`). Never hoist folder-scoped knowledge into it. Nested `CLAUDE.md` loads only when that folder is touched — that is why the ownership rule works.

**`.claude/rules/*.md` frontmatter is the load condition** (2026-07-24). With `paths:` it loads only on matching globs; **without it, it always loads like `@import`.** 10 files / 542 lines under `.claude/rules/common/` were being injected into every message with no frontmatter — all deleted 2026-07-24. They were ecc plugin remnants (removed 2026-07-22) and beyond bloat they were **false instructions**: invoking 11 nonexistent agents, mandating `gh search` in a GitLab repo, silently freezing a still-unapproved API response format. **Every new rule file carries `paths:`.** A rule needed always belongs in `CLAUDE.md`.

### Document language (2026-08-03, `CLAUDE.md` row corrected 2026-08-10, 승인 박동규)

**Docs no human needs to read — agent-consumed instructions — are English.** Decided by **path**, not taste.

| Path | Language | Why |
|---|---|---|
| `.claude/**` (skills, rules, hook guidance) | **English** | model instructions; humans see only output |
| every `CLAUDE.md` | **English** | folder-scoped agent context; teammates meet it as a diff, not as a file |
| `docs/agents/**` | **English** | agents read these as rules |
| `docs/HARNESS-RULES.md` | **English** | dense enforced canon, mostly agent-read; humans review the diff |
| every other `docs/**` — including `context/**` and `adr/**` | Korean | humans read and review them — `SPEC`, `GLOSSARY`, `REQUIREMENTS`, `CONTEXT.md`, `PERSONAS`, `USER-FLOWS`, `DESIGN-SYSTEM`, `HARNESS.md`, `research/**` |

The `CLAUDE.md` row swapped sides because it was describing nothing: measured 2026-08-10, all 25 files were 0–6% Hangul. The tree had already gone English and only newly appended entries drifted back.

**Carve-out for vendored artifacts (2026-08-14, ADR-0042).** In `.claude/skills/**` and `.claude/agents/**`, two parts are Korean: the `description` trigger sentence (it must match how work is actually asked for here, and it is the routing surface 박동규 reviews) and the vendoring/dedup notes stating what was cut and why. Rule text, checklists and tables stay English. This describes what tickets 02–04 shipped; do not "fix" those files back to English.

**`docs/context/**` and `docs/adr/**` were moved to English on 2026-08-10 and moved back the same day, 승인 박동규.** The measurements below are why. Do not re-propose the translation without new evidence — and if you do, measure tokens, not characters.

#### Measured 2026-08-10

`tiktoken` `o200k_base` as a proxy (Claude's own tokenizer was unavailable; the sign is reliable, the ratios are directional).

| Group | Tokens | Chars | ch/tok |
|---|---|---|---|
| `docs/context` (10, frozen + `diagrams/` excluded) | 99,123 | 193,849 | 1.96 |
| `docs/adr` (33) | 152,755 | 298,417 | 1.95 |
| `CLAUDE.md` (25) | 96,737 | 362,961 | 3.75 |
| `.claude/rules` (20) | 24,245 | 101,865 | 4.20 |
| `.claude/skills` (24, repo-owned) | 54,600 | 189,156 | 3.46 |
| total | **427,460** | 1,146,248 | 2.68 |

**Count tokens, never characters.** The `compatibility.md` pilot went 5,834 → 8,870 characters (**+52%**) and 3,041 → 2,383 tokens (**−21.6%**). H-17 read that same expansion on 2026-08-03 as a failure because it counted characters. Korean prose runs ≈1.95 ch/tok against English's 3.75–4.20, so **English is ~2× more token-efficient per character** — which is also why `CLAUDE.md` holds 32% of the characters and only 23% of the tokens.

**Translating buys nothing where the context actually fills.** What enters an agent's window unasked is already English: root `CLAUDE.md` + `karpathy-guidelines.md` = 2,104 tokens always, plus the folder files for whatever is touched — 3D work pulls `frontend/CLAUDE.md` + `frontend/src/three/CLAUDE.md` = **22,275 tokens**, 34,443 with the simulator folder. `docs/context/**` and `docs/adr/**` never auto-load; an agent opens one because the routing table sent it there for that task. So the ~21% a translation buys applies only to pages someone chose to open, while the pressure that is actually unasked-for is English narrative — reducible by cutting text, which is the information loss this decision refused.

**Translation is not lossless, even carefully.** The pilot's mechanical check was clean (60 backticked literals, 27 numbers, 0 lost) and a claim-by-claim reread still found two drifts: an `18mm` pulled into a sentence that did not have it, and the phrase marking ADR-0004 as holding the *rejected* alternatives. Two in the single most careful file; `docs/adr` is 33 files whose entire value is that kind of nuance.

Human-read docs stay Korean because the readership is Korean, not because English would cost more.

**Two carve-outs inside `docs/context/`.** **`erd.md` stays Korean** — hook-frozen, 113,974 characters, and its column comments are mirrored by hand into the ERDCloud copy; its language is a separate decision. **`diagrams/**` stays Korean** — it exists to be pasted into slides and onboarding, which is human readership.

**Check for a served twin before translating.** `docs/context/admin-asset-registration.md` is byte-identical to `frontend/public/docs/admin-asset-registration.md`, which `AssetGuideModal.tsx` fetches and shows to admins. That copy is UI, so it stays Korean — english the canon and the two silently split. Look for a `frontend/public/docs/` twin before touching any `docs/context/` file.

- **Output language is separate.** Commit messages, ticket files under `.scratch/` and user replies stay **Korean**. Every English skill file states `Output language: Korean` — without it the model follows the instruction language into its output.
- **Never translate literals.** Strings a hook compares or that reach an external system verbatim — commit types, file paths, status vocabulary (`ready-for-agent` etc., `docs/agents/triage-labels.md`) — stay original inside backticks.
- **`docs/GLOSSARY.md` terms and user-facing output strings keep their Korean inside backticks** (2026-08-10). A term like `클램프 물림 두께` is the key that links the doc to GLOSSARY, the column comments and the reason strings the code emits; translating it silently unlinks all three. Same for any string a user reads (`물림 두께 40mm(엣지 마감) > 클램프 최대 35mm`, `클램프 물림 규격 미등록 — 제조사 사양 확인 필요`) and for screen labels whose stored form is a code (`적합`/`FIT`) — fixtures pin substrings of these. Gloss the term in English on first use if the sentence needs it; never replace it. State this rule at the top of any file where it applies, so the next pass does not "finish the translation".

### Common

- **≤ 2,000 tokens** (2026-08-10, 승인 박동규 — replaces "≈ 50–60 lines" from 2026-07-22). A ceiling, not a target; a three-line submodule file is fine. Convention only, no automated check. Measure with `tiktoken` `o200k_base` (§3 "Count tokens, never characters").
  - **The line ceiling was inverted in practice, so it is gone.** Measured 2026-08-10 across 25 files: `frontend/src/three/CLAUDE.md` passed at 70 lines while holding **17,597 tokens** — 251 tokens per line, longest line 4,725 characters. The only file that *broke* the line rule, `frontend/src/components/product/CLAUDE.md` at 100 lines, was among the healthiest by density (40 tok/line). A metric that punishes the well-formed file and waves through a file 4× larger is worse than no metric. 2,000 is what "50–60 lines" meant before the drift, at ordinary line length.
  - **Why the ceiling is load-bearing at all**: a folder's `CLAUDE.md` enters the window unasked whenever that folder is touched. 3D work pulled `frontend/` + `frontend/src/three/` = **22,275 tokens** before this rule. Total across the 25 files was 96,737.
  - **Over the ceiling? Move content, do not delete it.** Three routes, in this order: ① the material duplicates a `docs/context/*` canon → delete it and leave a one-line pointer (verify with a literal/number diff against the target first); ② unique detail → move the body to the topic doc and keep only the sentence that prevents the mistake; ③ a trap tied to specific files → `.claude/rules/<area>/*.md` with a `paths:` glob, which loads only when those files are touched. Routes ② and ③ trade a guaranteed read for a conditional one — keep the prevention in `CLAUDE.md` and move the evidence.
- **`AGENTS.md` is a one-line `@CLAUDE.md` tag file** (2026-07-18, copies abolished). **Edit content in `CLAUDE.md` only.** Every new `CLAUDE.md` ships with an `AGENTS.md` beside it — the only way Codex/Cursor see that folder's context.

## 4. Hooks

**Codex runs the same guards** (2026-08-10, ADR-0032): repo `.codex/hooks.json` invokes the identical `.claude/hooks/*` scripts (`.sh`, plus `block-no-verify.js` since 2026-08-14) — the hook stdin protocol is isomorphic (`tool_name`/`tool_input`, `permissionDecision: deny`, measured). Codex's shell tool is also named `Bash`; only file edits differ (`apply_patch`, handled inside `erd-freeze.sh`). One script, two registrations — **never fork a codex copy of a guard.** Codex asks once to trust repo hooks; protection is off until approved.

### Stop hook `harness-check.sh`

1. **Doc update**: worktree diff touches `backend/`·`frontend/` but neither `docs/SPEC.md` nor **any `CLAUDE.md` at any depth beneath** changed (2026-07-23: nested paths count) → remind.
2. **Set enforcement**: walk every folder holding a `CLAUDE.md` (excluding `node_modules`·`build`·`dist`); missing `AGENTS.md`, or a body that isn't the single line `@CLAUDE.md`, is collected and reminded — the only enforcement of the §3 set rule.
3. **ERD freeze drift** (2026-07-23): `erd-freeze.sh --verify` compares `docs/context/erd.md` sha256 against `.claude/erd-baseline.sha256`. Mismatch → ask whether it was approved. **After-the-fact detection** for hook bypasses and direct human edits.
4. Runs regardless of commit state (check 2 reads the filesystem, not the index).
5. **Never blocks** — reminder only; false positives are common and enforcing would only build fatigue.

### Stop hook `next-step-guard.js` + UserPromptSubmit hook `context-status.js` (2026-08-14, 박동규 지시)

`next-step-guard.js` **blocks** turn end when the final assistant message lacks the closing "다음 스텝" block: ① next Matt Pocock skill command as a code block (or an explicit "스킬 불필요") ② session verdict — continue / new session / clear / compact, with a one-line reason ③ measured context tokens vs the smart zone (150k). `context-status.js` injects the measured context size (from the transcript's last assistant `usage`) into every prompt so the announcement is a measurement, not a guess. Cause: the same announcement duty was assigned twice by memory/feedback (2026-08-13/14) and still got skipped — §6 ladder, repeated omission incident → hook. Loop-safe (`stop_hook_active` → pass), fail-open on parse errors, Claude Code only (session-protocol hooks — not registered for codex). Measured trap (first fire, 2026-08-14): the final message may not be flushed to the transcript when Stop runs, and a turn's text spans multiple entries — so the guard aggregates all assistant text back to the last real user message and retries once after 500ms before blocking. Regression test `node .claude/hooks/next-step-guard.test.js` (15 cases, both scripts).

### SessionStart hook `graphify-stale-check.sh` (2026-08-04)

Counts `backend/`·`frontend/`·`docs/`·`.claude/rules/` source and doc files newer than `graphify-out/graph.json`; more than 20 → one warning line into session context. **Never blocks.** Cause: the graph was built 2026-08-03 and queried zero times in the 300+ sessions after, while 133 tracked files moved past it — the routing rule alone did not make anyone notice the drift. Refresh with `graphify update .` (AST only, no LLM, ~12s) or `/graphify . --update` when docs/images changed too.

### SessionStart hook `plugin-check.sh` (2026-08-10, ADR-0032)

Checks the CLI-specific official plugin set (`claude`: 6 — claude-mem·serena·exa·firecrawl·ponytail·mattpocock-skills / `codex`: 2 — ponytail·mattpocock-skills; ecc left the claude set 2026-08-14 with the plugin removal, ADR-0042) against local install state (`~/.claude/plugins/cache/` dirs / `~/.codex/config.toml` entries). Missing → one notice into session context, every session, until installed. **Never blocks** (a hotfix must be possible on a bare install). Set changes are the two variables at the top of the script. Install canon: `docs/HARNESS.md`. Regression test `.claude/hooks/plugin-check.test.sh`.

### PostToolUse `prettier-format.sh` (2026-08-11, 박동규 지시)

Runs the checkout's own `node_modules/.bin/prettier --write` on every file an agent edits with Edit/Write/MultiEdit, when the path is `ts/tsx/js/jsx/mjs/cjs/css/scss` and a `node_modules/.bin/prettier` exists above it (found by walking up, so worktrees use their own). `*.d.ts` is excluded — declaration files here are generated by openapi-typescript and formatting them makes every regeneration a diff. **Never blocks** (any failure exits 0); format is not a reason to reject an edit.

Cause: with no formatter in the loop, format cleanup fell to the model — it rewrote already-correct code just to change line breaks, spending tokens on what prettier does for free and non-deterministically (it cannot count columns, so the same code came out folded one turn and flat the next). Measured 2026-08-11: 36 files under `frontend/src` violated `.prettierrc.json`, i.e. 36 standing invitations to repeat the waste. Judgment authority stays in `.prettierrc.json` (`printWidth: 100`); the hook only executes it. The 36 files are **not** swept yet — that is a separate call, since a repo-wide format touches concurrent sessions' work. Regression test `.claude/hooks/prettier-format.test.sh` (7 cases).

Backend got the same authority the same day, in the build instead of a hook: spotless + google-java-format with `ratchetFrom 'origin/develop'` (`backend/dero-api/build.gradle`), matching the style SoT `docs/GoogleStyle_custom.xml`. `check`/`build` fail on a violation, `test`/`bootJar` do not, and **spotless tasks need a git repo** — the deploy Dockerfile has none, so it must keep calling only `bootJar`. Rules: `.claude/rules/backend/gradle-build.md` §4 · measurements: `docs/context/backend-runtime.md` §1-14. No per-edit hook for `.java`: a Gradle invocation per edit costs seconds, the build gate is enough.

### PreToolUse `block-no-verify.js` (2026-08-14, ADR-0042)

**Blocks** `--no-verify` / `-n` on `git commit·push·merge·cherry-pick·rebase·am`, and `-c core.hooksPath=` overrides. Second blocking hook after the ERD freeze: a git hook that an agent can skip is not a gate. Vendored from the ecc plugin when it was removed — the plugin was the only thing enforcing this, so removal without vendoring would have opened the bypass.

1. **Judgment is by shell tokenizer, not substring match** — a `--no-verify` inside a quoted commit message passes, a clustered `-an` blocks, and flags belonging to an earlier command in a chain are not attributed to `git commit`. This is why the file is 562 lines and why it is vendored rather than rewritten as a one-line grep.
2. **Non-`Bash` tool calls are allowed before parsing** (`tool_name !== 'Bash'` → exit 0). Claude Code registers it with `matcher: "Bash"`, but **codex's `PreToolUse` has no matcher**, so without this gate a `Write` whose *content* mentions the flag was blocked (measured 2026-08-14 — this rule's own text triggers it).
3. **Blocks on both CLI paths**: exit 2 + stderr (Claude Code) and a `permissionDecision: deny` JSON on stdout (codex), same shape as `erd-freeze.sh`. Nothing is written to stdout when the call is allowed.
4. **Fail-open**: a malformed payload is treated as plain text; only a detected bypass flag blocks.
5. Regression test `.claude/hooks/block-no-verify.test.js` (33 cases, `node .claude/hooks/block-no-verify.test.js`) — vendored with the script and extended with the codex/stdout cases above.

### PreToolUse `erd-freeze.sh` — ERD freeze (2026-07-23, 박동규 지시)

**Goal: stop the schema changing silently**, not block approved changes. `docs/context/erd.md` is where GLOSSARY part 2, CONTEXT D-series, `compatibility.md`, JPA entities and Flyway all hang — one silent line change has consequences nobody sees.

1. **Two layers**: ① **block (prevention)** — reject agent edits to force the request into conversation ② **baseline hash (detection)** — Stop hook check 3 catches bypasses after the fact. **A hook cannot prove human consent**, so ① is the device and ② the audit trail.
2. **Blocked**: `Edit`·`Write`·`MultiEdit`·`NotebookEdit` on `erd.md`, codex `apply_patch` whose patch headers name a protected path (2026-08-10), plus `Bash` writes (redirects · `tee` · `cp`/`mv`/`rm` · `git checkout|restore|apply|stash|revert|reset|clean`). **One-line interpreter runs mentioning `erd.md` (`sed`·`awk`·`python`·`node`) are blocked even for reads** — write mode hides inside strings. Read via `Read`·`grep`·`wc`.
3. **Creating the unlock/baseline file is always blocked**, even inside an unlock window — it is the evidence of consent, so an agent-created one isn't evidence. Detection triggers on `--unlock` anywhere in the command string, so **putting the unlock command in a commit message or a test blocks that `Bash` call too** — write the body to a file and pass `$(cat <file>)` (hit twice during construction). Not narrowed on purpose: the mistake being prevented is typing the unlock verbatim, and it looks exactly like this.
4. **Approval** (the deny message states it verbatim): give 박동규 **①what (table/column) ②why now (which requirement/judgment/code is blocked) ③cost of not changing ④blast radius** → on consent **박동규 personally** runs `!.claude/hooks/erd-freeze.sh --unlock "<사유>"` → **30-minute** window → add a row to the `erd.md` "확정 후 개정" table and run `--rebaseline`.
   - **Finish the patch before requesting the unlock** (2026-07-29, from DERO-230). Order: ① read `erd.md` with `Read`·`grep` only, draft every `기존:`/`신규:` pair into a scratch file ② verify each anchor occurs **exactly once** via `grep -cF` ③ then request approval. All 15 edits passed first try in 230, and step ② caught a transcription error that would otherwise have burned the window.
5. **JSON parse failure blocks** (fail-closed, see 8); **unresolvable paths pass** — anything slipping through is caught by the baseline hash. Hence two layers.
6. **Scope is `erd.md` alone.** GLOSSARY/CONTEXT stay unfrozen — schema-unrelated updates there are far more frequent, so freezing is pure friction. If a schema change actually leaks through them, promote via §6.
7. Status: `.claude/hooks/erd-freeze.sh --status`. Unlock token `.claude/.erd-unlock` is gitignored; baseline `.claude/erd-baseline.sha256` is committed.
8. **Regression test `.claude/hooks/erd-freeze.test.sh`** (29 cases; run on every hook change). Only this hook has tests because during construction **the decider died and everything passed**: a quote inside a regex broke `python3 -c '...'` quoting and `2>/dev/null` swallowed the error. So ① the decider body lives in a quote-safe heredoc (`<<'PYEOF'`) ② exit codes separate pass (0) / block (3) / error (other), and **errors are treated as blocks** — the only hook not fail-open.
9. **Baseline hash is computed after stripping CR** (2026-07-27). Windows checkouts have a CRLF worktree (`git ls-files --eol` → `w/crlf`), so disk bytes permanently diverge from the LF baseline: `git status` clean but `--verify` always failing (reported by 박성은). Newline-only differences are meaningless in a schema doc. The baseline stays LF-based, so no `--rebaseline` needed. Root cause blocked too — root `.gitattributes` pins checkouts with `* text=auto eol=lf` (exception: `gradlew.bat` stays CRLF via `backend/dero-api/.gitattributes`). Existing CRLF checkout cleanup: `docs/HARNESS.md` "문제 해결".
10. **Unlocking from a worktree: check `CLAUDE_PROJECT_DIR` first** (2026-07-31, reversing the 2026-07-29 measurement). Hook line 20 is `ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"`, and the token is read from `$ROOT/.claude/.erd-unlock`. **That variable flips the answer.**
    - **Set (main repo)** → unlock with the main repo script: `!<main repo>/.claude/hooks/erd-freeze.sh --unlock "<사유>"`.
    - **Unset** → the hook falls back to its own script's parent, i.e. the **worktree** → unlock with the worktree script.
    - **Symptoms are identical either way**: unlock prints "완료" but edits keep blocking, because the token landed where the hook isn't looking. Don't guess — check `echo $CLAUDE_PROJECT_DIR` and whether `.claude/.erd-unlock` exists on each side (this order solved it in one round trip on 2026-07-31, after one wasted unlock).
    - `--rebaseline` always runs from the **worktree script** — the baseline is git-tracked, so updating it there puts it in the worktree's commit and keeps the main repo consistent after merge.

### PreToolUse `flyway-v1-freeze.sh` — Flyway V1 freeze (2026-08-15, matt-realign 12; freeze directive 2026-07-31 박동규)

Enforces the existing freeze of `V1__baseline.sql` instead of leaving it as a read rule. Promoted because the
violation is **CI-invisible**: `./gradlew test` stays green (Testcontainers replays migrations from scratch) while
the next `local` boot dies on `Migration checksum mismatch for migration version 1`, and a deploy dies the same way.
Zero legitimate edits since the freeze (V2…V15 were all new files), so false-positive fatigue is not a cost here.

1. **Scope is `V1__baseline.sql` alone** — matched by basename, so the `bin/main` build copy is covered too.
   Not widened to "every applied version": an agent editing the migration it is still writing (V16 before merge)
   is normal work, and no post-merge edit of V2…V15 has ever happened. Widen only if one does.
2. **Blocked**: `Edit`·`Write`·`MultiEdit`·`NotebookEdit` on that path, codex `apply_patch` headers naming it, and
   `Bash` writes (redirects · `tee` · `cp`/`mv`/`rm`/`patch` · interpreter one-liners carrying a write signal).
   `git checkout|restore` is **allowed on purpose** — restoring the frozen content is the recovery path.
3. **No unlock file, no baseline hash.** A hook only intercepts agent tool calls, so a human editing the file is
   already the exception; and V1 is git-tracked, so drift shows up in the diff. If a rewrite is ever needed, give
   박동규 the reason and he edits it himself.
4. **Fail-closed** like the ERD freeze: a payload the decider cannot parse blocks (exit codes 0 pass / 3 block /
   other → block). Side effect of the substring prefilter: a `Bash` command that both names `V1__baseline` and
   carries a write signal is blocked even when it is a commit message — pass message bodies via `-F <file>`.
5. Regression test `.claude/hooks/flyway-v1-freeze.test.sh` (25 cases; run on every hook change).

## 5. Plugin Operations

- Adding/removing a plugin means editing `.claude/settings.json` and **committing it** — the file is how another checkout (worktree, another machine) learns the set.
- **`/plugin install` alone does not share it (measured 2026-08-03)**: `/plugin marketplace add` records the marketplace only in personal settings (`~/.claude/settings.json`). The project file gets just the `enabledPlugins` line, so another checkout gets "enable this plugin" with no source and silently ignores it (no error). Outside `claude-plugins-official`, sharing works only if the **`extraKnownMarketplaces` entry is in the project `settings.json`**. Verify: every `@<marketplace>` in project `enabledPlugins` is a project `extraKnownMarketplaces` key or `claude-plugins-official`.
- **Auto-install is unreliable (measured 2026-07-16)**: inherited parent-folder trust skips the trust dialog and never triggers auto-install. **Canon is the manual install commands in `docs/HARNESS.md` §2**; the `settings.json` declaration is secondary.
- **No version tag pinning (measured 2026-07-16)**: Claude Code clones marketplaces shallow and main-only, so tags are unreachable and a `ref: <tag>` fails the install outright. Drift risk accepted.
- serena is unpinned at source too (tracks latest) — same risk, same handling.

## 6. Harness Evolution

### Promotion ladder

Each step is taken **only after repetition at the previous one**:

1. **First occurrence** — fix in place, no record.
2. **Repeat** — one line under "지속 이슈·함정" in the `CLAUDE.md` of the **deepest folder holding the cause** (§3 ownership).
3. **Pattern crossing folders** — `docs/context/` topic doc + root routing table entry.
4. **Done manually every time** — promote to a `.claude/skills/` skill.
5. **Rule whose omission causes incidents** — promote to a hook (blocking hooks with care: false-positive fatigue).

### Placement axis — hook vs rules vs skill (2026-08-13, ADR-0042, 승인 박동규)

Decides where a piece of harness knowledge lives. Applies to anything being written, moved or absorbed.

- **skill is the default.** Reference knowledge — patterns, checklists, craft — is all skill: it loads only on
  the turn that needs it (`description` is the trigger, so write it as a trigger sentence).
- **Only two things stay in `.claude/rules/`**: ① a prohibition that can be violated on *every* turn and whose
  violation is expensive ② a constraint applied mechanically whenever a given file is touched (that one carries
  `paths:`, §3).
- **What must be enforced is a hook, not a rule** (e.g. the erd freeze). A rule is read; a hook decides.

The ladder above says *when* to promote; this axis says *where* the promoted thing goes. Ladder step 4 lands in
`.claude/skills/`, step 5 in `.claude/hooks/`, and `rules/` is the narrow middle, not the overflow bin.

**Retention test — applied per line to anything already in `.claude/rules/`** (2026-08-14, ADR-0042 결정 4 정밀화, 승인 박동규 · rules diet feature):

> A line stays only if it is a MUST/NEVER imperative that **an agent editing a `paths:`-matched file can violate on
> that very turn**, and whose **violation code review does not catch cheaply**.

Everything failing it — knowledge, history, measurements, ticket narrative, diagnostic recipes — leaves the file, in
this order: ① delete ② join an existing `docs/context/` topic doc (**inventing a new doc is not an option**)
③ absorb into an existing skill (a new skill needs the four criteria below). Where a risk sits inside a folder
`CLAUDE.md`'s auto-load range, that `CLAUDE.md` is canon and the `rules/` copy goes; outside it (e.g. a single
source file with no owning folder doc), `rules/` is canon. **One constraint lives in exactly one place.**
A retained file over 300 words carries a one-line justification — a signal, not a gate.

### Absorbing an outside skill (2026-08-13, ADR-0042, 승인 박동규)

An external skill/agent/hook (plugin, marketplace, another repo) is taken in only when all four hold:

1. **Stack axis matches** what this repo actually runs.
2. **Not a duplicate of existing canon.** The mattpocock pipeline's axes are off limits (ADR-0041 §0 winners);
   overlap with `.claude/rules/` or `docs/**` means the existing one wins.
3. **The work it serves actually happens here** — measured, not anticipated. "Might need it later" fails.
4. **It is reshaped, not copied**: trim to checklists/tables (tutorial prose out) · rewrite `description` as a
   trigger sentence · one row in `docs/context/skill-routing.md` stating why it was kept · one pointer line in
   the owning folder's `CLAUDE.md`.

Enforcement points are the monthly diet and `/harness-retro`. The same four criteria apply to every future
addition, not just the ecc absorption that produced them.

### Reverse

Unused skills, reminders turned noise, unread context docs: **remove them.** Harness weight must track friction that is actually felt. **A rule whose premise died is deleted, not annotated** (2026-08-13, ADR-0041): an "N/A for now" note leaves the rule in canon, and a session in canon follows it.

### Repo vs personal

Anything in `~/.claude` or `settings.local.json` reaches only this machine. Move a skill/hook into `.claude/skills/`·`.claude/hooks/` and commit it when it must survive a fresh checkout or a worktree.

### Monthly diet (2026-07-23)

Once a month, sweep **everything always loaded** against these 9 and cut on the spot. Targets: every `CLAUDE.md` + `@import`-pulled files + `.claude/rules/*.md` without `paths:`. A doc that only grows stops being read.

1. Under 2,000 tokens? (§3 Common — count tokens, not lines; a 70-line file held 17,597). **Measure, do not eyeball** — this item existed from 2026-07-23 with no command, and 9 of 27 files had drifted over by 2026-08-13 (worst 5,081). Zero output means clean:
   ```bash
   uvx --with tiktoken python - <<'PY'
   import tiktoken, subprocess
   enc = tiktoken.get_encoding("o200k_base")
   for p in subprocess.run(["git","ls-files","*CLAUDE.md"],capture_output=True,text=True).stdout.split():
       n = len(enc.encode(open(p).read()))
       if n > 2000: print(n, p)
   PY
   ```
2. Build, test, lint, typecheck commands present?
3. Any sentence the code already tells you? → delete
4. Any unjudgeable abstract rule? → concretize or delete
5. Any already-resolved trap? → delete (§6 reverse)
6. Updated within the last month? If not, nobody reads it
7. Any `.claude/rules/` file without `paths:`? → add or delete (§3). This blind spot injected 542 lines continuously until 2026-07-24
8. **Any `.scratch/<feature-slug>/` folder whose work already merged? → delete** (§2). A leftover spec holds old decisions while posing as canon. Check each folder's tickets: all boxes ticked and the branch merged = delete
9. **Run `/harness-retro` — the only item that adds.** Items 1–8 cut; this one tables what repeated 3+ times last month and where it should be promoted (hook / rules / skill, placement axis above). Do it first, while the month's memory is the subject; then cut.

Tooling: `claude-md-management`'s `/revise-claude-md` (suggests) → `/claude-md-improver` (refactors). Validate suggestions against the 8 items before applying.

## 7. Session Discipline (2026-08-13, ADR-0041 D-g·D-h)

### Phase boundary — escalation order

At a phase boundary (a ticket done, a decision settled, a diagnosis finished), take the **first** of these that fits, and only escalate when it does not:

1. **continue** — same session, context still clean and the next step shares its facts.
2. **clear** — `/clear` and restate the task from the ticket file. The default at a ticket boundary.
3. **handoff** — write what the next session needs into the ticket file, then clear. Use when the next step needs findings a ticket line cannot hold.
4. **subagent** — delegate a bounded read-heavy piece so its search output never enters this window. The parent still owns collecting the result (root `CLAUDE.md` "Research & delegation").
5. **compact** — last. A summary is lossy in a way that is invisible: the session keeps answering confidently from facts the summary dropped.

- **One ticket, one session.** A ticket is sized so a fresh session can finish it from `spec.md` + its own file.
- The escalation order is the point: compact is available, not preferred.

### TDD

- **The test seam is agreed at spec time, not at implement time.** `spec.md` carries a "Testing Decisions" section naming the seam; `/implement` does not invent one.
- **`/implement` runs red-green**: the failing test lands first, then the code that passes it. Verify a single test file often, the whole suite once at the end.
- **Refactoring is a separate session** (`/code-review` → `/simplify`), never folded into the green pass.
- **Exception — 3D and visual axes.** Behavior nobody can assert in a test (look, lighting, camera feel, layout) gets machine gates only (typecheck · build · unit on the spec math) plus **박동규's visual QA**. Never fake a visual assertion to claim a green bar.

## 8. Out of Scope (YAGNI)

- Building our own plugin / running a marketplace — third-party pinning suffices.
- Automated length checks, automated doc-code consistency verification — add when the need is proven.
- Any sync between the repo and an external tracker — repo markdown is SoT canon, `.scratch/` holds work in flight.
