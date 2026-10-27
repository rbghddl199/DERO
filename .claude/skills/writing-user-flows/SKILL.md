---
name: writing-user-flows
description: Use when writing or updating user-flow / screen-flow documentation — the step before a screen definition or requirements spec, when folding a new feature into an existing flow, or when organizing journeys, branches, exceptions and edge cases. Triggers: "유저 플로우", "화면 흐름", "여정 정리".
---

# Writing user flows — a three-layer tree

**Output language: Korean** — `docs/USER-FLOWS.md` and your messages are Korean.

## Core principle

A journey is not a parallel list, it is **one tree**. Different destinations still share the same trunk:

```
entry branches → [gate merge] → shared trunk → edit/work loop (hub) ─┬─ feature branches
                                                                     └─ terminal leaves
```

Listing flows separately as F1, F2, F3… duplicates the shared stretch in every flow, and the same screen ends up scattered across several flows in the screen definition. Draw the trunk once and branch off it.

## Order of work

1. **Read the SSOTs first**: `docs/CONTEXT.md` (decision record) → `docs/REQUIREMENTS.md` and `docs/PERSONAS.md` → `docs/SPEC.md`. Take REQ IDs, priorities and pain IDs from there. Never invent a new ID.
2. **Settle the policy gates first**: decisions that affect every branch (the auth boundary — from where is login required, what is allowed anonymously) must be asked and fixed with the user up front. If they are open, the whole tree wobbles.
3. **Quarantine open items in an assumptions box**: anything unsettled (service name, login providers) goes into an "가정" section at the top of the document, not mixed into the body. When it is settled, only that part is replaced.
4. **Write in three layers** (below).
5. **Where it goes**: create/update the living canon `docs/USER-FLOWS.md` directly (never create a new dated snapshot). It is already registered in the root `CLAUDE.md` routing table.

## The three layers

| Layer | Content | Consumed by |
|---|---|---|
| 1 | Full screen map (IA): screen list + entry points + screen-to-screen transitions (mermaid) | the screen inventory of the screen definition |
| 2 | One master tree + a detailed flow per branch (mermaid, branches and exceptions included) | per-screen behavior in the screen definition |
| 3 | Case matrix: `\| 상황 \| 조건 \| 시스템 동작 \| REQ \| 우선순위 \|` | requirement verification and QA scenarios |

**Layer 2 rule**: present the master tree for the whole picture first, then draw a detailed diagram per branch (G1, G2…). Mark nodes and edges with REQ IDs and priority tags (`[Must]` `[Should]` `[Could]`). Must is the skeleton; Should and Could are visually distinguished by dashed lines or tags. Draw cycles (e.g. copy → edit → publish → another user copies) with dashed lines.

**Layer 3 matrix categories** (adjust to the service): the auth gate (logged-out × each action), judgment/state branches (success, conditional, failure each), constraint rules (operations that must be refused), limits and empty states (0 items, over the cap), errors and recovery (load failure, session expiry, preserving work).

**Traceability is mandatory**: every layer-3 row must trace to a layer-2 branch and a REQ ID, and every layer-2 node to a REQ ID. If a flow turns up that maps to no REQ, add the REQ to the planning docs first (with user approval), then put it in the flow.

## Common mistakes

| Mistake | Correction |
|---|---|
| Flows listed in parallel as F1…Fn | one shared trunk plus a branching tree |
| Only the happy path is drawn | every branch includes failure, empty state, limit and recovery |
| Open items written in the body as if settled | quarantine in the assumptions box, marked as open |
| Missing priority tags | Must/Should/Could on every branch and matrix row |
| mermaid breaks on special characters | wrap node labels in double quotes, use GitLab-compatible `flowchart TD` |
| Branches drawn while policy is undecided | ask and settle the gate decision first |
