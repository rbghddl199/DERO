---
name: onboard
description: Brief the current project state — for a new session or a new teammate. Use on requests like "온보딩", "현재 상태 알려줘", "프로젝트 브리핑", "onboard me".
---

# Project onboarding brief

**Output language: Korean.**

## Procedure

1. Read these three documents: `docs/SPEC.md` (feature status), `docs/CONTEXT.md` (planning decisions D1–D12 and open items), root `CLAUDE.md` (routing table).
2. Brief concisely, in this shape:
   - One-line service definition + the 4 differentiators (CONTEXT.md D1, D3)
   - Feature progress: done/total per section of SPEC.md (e.g. `CMP 2/6, SIM 0/8`)
   - Open items (verbatim from the "미결(다음 논의)" section of CONTEXT.md)
   - Three lines on using the harness: the SPEC.md update rule, where the routing table is, that `/sync-spec` exists
3. If follow-up questions target a specific area, follow the root `CLAUDE.md` routing table down to the relevant `docs/context/` document and answer from it.
