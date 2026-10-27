---
name: sync-spec
description: Update the docs/SPEC.md feature checklist — tick completions ([x]), add a one-line feature, link a Jira key. Use on requests like "SPEC 갱신", "기능 완료 체크", "기능 추가해줘".
---

# SPEC.md sync

`docs/SPEC.md` is the single source of truth for feature completion state. This skill performs updates to it in the correct format.

**Output language: Korean** — the file's own content is Korean; keep writing it in Korean.

## Procedure

1. Read `docs/SPEC.md`.
2. Handle by request type:
   - **Tick a completion**: change `- [ ]` to `- [x]` on that line. If it is unclear whether it is genuinely done (implemented + tests passing), confirm with the user before ticking.
   - **Add a feature**: append one line at the end of the relevant area section. Format: `- [ ] REQ-<area>-<next number> <one-line spec> (<Must|Should|Could>)`. Never reuse or renumber IDs — not even a deleted one (e.g. REQ-ENV-05). When a new REQ ID is added, tell the user the detailed acceptance criteria must also be added as a row in `docs/REQUIREMENTS.md` (prevents SPEC ↔ REQUIREMENTS drift).
   - **Link Jira**: append `(Jira: DERO-XX)` at the end of the line. Keep the issue key uppercase (the GitLab-Jira integration only recognizes uppercase).
   - **Harness item**: add `- [ ] H-<next number> <one line>` to the `## 하네스 (H)` section.
3. If a detailed rule grows past one line, split it into `docs/context/<topic>.md` and leave only a `→ docs/context/<topic>.md` reference in SPEC.md. A new context document comes as a set with registering it in the root `CLAUDE.md` routing table.
4. Change only the line in question. Never reorder or reformat other lines.
5. If the request mixes in a planning change (removing a feature, changing scope), that belongs in `docs/CONTEXT.md` as a decision record, not in SPEC.md — say that 박동규's approval is required and stop.
