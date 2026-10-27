---
name: harness-retro
description: Mine claude-mem for work and traps that repeated 3+ times in the last month and table them as harness promotion candidates (hook / rules / skill). Use on "/harness-retro", "월간 다이어트", "하네스 회고", "반복 작업 뽑아줘".
---

# Harness retro

Runs at the monthly diet (`docs/HARNESS-RULES.md` §6). Answers one question: **what did we do or hit
by hand 3+ times last month that the harness should be doing for us?**

Replaces the repetition-detection that ecc continuous-learning-v2 used to do (ADR-0042).

**Output language: Korean.** Report only — never edit the harness in the same run.

## Procedure

1. **Window.** Default = last 35 days. Take an explicit range from the user's arguments if given.

2. **Probe claude-mem** with `mcp__plugin_claude-mem_mcp-search__search`, always with
   `project: "DERO"`, `dateStart: <window start>`, `limit: 40`. Semantic search does not count
   repeats — it hands you candidates and you cluster them. Run these probes (add more if a cluster
   looks live):

   | Probe | `query` | `obs_type` |
   |---|---|---|
   | Repeated fix | 반복 실수 함정 workaround trap | `bugfix` |
   | Repeated manual step | manual step ran again by hand procedure | — |
   | Environment friction | build failed env config broken locally | `bugfix` |
   | Wasted round trip | wrong assumption had to redo re-ran | — |
   | Decision re-litigated | decided again revisited same question | `decision` |

3. **Cluster and count.** Group observations by *cause*, not by wording — "Flyway disabled ⇒ schema
   validation failed" and "migration not applied ⇒ startup failed" are one cluster. A cluster counts
   once per **distinct session**, not per observation: three observations from one session is one
   occurrence. Fetch details with `get_observations([ids])` only for clusters you are unsure about.

4. **Drop anything already promoted.** For each cluster ≥3, grep before proposing:
   `.claude/hooks/` · `.claude/rules/` · `.claude/skills/` · the "지속 이슈·함정" section of the owning
   folder's `CLAUDE.md` · `~/.claude/projects/-Users-parkdongkyu-my-project-DERO/memory/MEMORY.md`.
   Already covered and it still repeated ⇒ keep it, but the proposal is "the existing X does not fire",
   not "add X".

5. **Assign a home** per §6 placement axis — enforcement ⇒ hook, prohibition violable every turn ⇒
   `.claude/rules/`, everything else (knowledge, checklist, craft) ⇒ skill. Default is skill.

6. **Report** — this table, nothing else:

   | 항목 | 횟수 | 근거 관측 ID | 제안 거처 | 근거 |
   |---|---|---|---|---|
   | <cause in one line> | 4 | #9527, #13151, #14446, #14862 | hook / rules / skill / 기존 X 미발화 | <why that home, one line> |

   Then one line per row on what the promotion would concretely be (file path + what it does).
   **No rows ⇒ say so and say why** — window too quiet, memory sparse, or everything already promoted.
   An empty table is a valid result; do not pad it.

7. Ask 박동규 which rows to promote. Promotion itself is separate work — the promoting session
   loads `/mattpocock-skills:writing-for-agents` before writing the skill / rules / CLAUDE.md line
   (its auto-trigger does not cover `.claude/rules/` or hook docs).
