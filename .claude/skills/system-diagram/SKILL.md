---
name: system-diagram
description: Use when creating a system architecture diagram, sequence diagram, or user-flow/flowchart diagram — clean, at-a-glance, portfolio-grade SVG with real vendor logos. Triggers: "아키텍처 다이어그램", "시퀀스 다이어그램", "유저 플로우", "플로우차트", "system architecture diagram", "sequence diagram", "user flow", "flowchart".
---

# system-diagram

Structured spec → clean SVG architecture / sequence / user-flow diagram. The rules (R1–R8) are enforced in code.

**Output language: Korean** for your messages; diagram labels follow the user's content.

## Workflow
1. Identify the components of the target system (from code or from the user).
2. Write a spec dictionary modeled on `examples/` (logical placement only; never touch coordinates, colors or styling).
3. Run `python3 render.py <spec.py> <out_stem>` → `<stem>.html` (viewer) + `<stem>.svg` (embeddable).
4. Show the HTML to the user as an Artifact.
5. `render.write` self-checks R1–R8 before writing (raises `ValueError` on violation).

## Hard rules (never violate)
- R1 square corners (no rx) · R2 no shadows · R3 transparent zone fill · R4 an SVG scene (not a web card)
- R5 real logos · R6 no overlapping text · R7 emphasis carries meaning only · R8 all text black (no navy)

## References
- `references/design-tokens.md` PALETTE and typography
- `references/schema.md` the spec schema
- `references/layout-patterns.md` lane+fan-out / standard sequence
- `references/logo-catalog.md` logo mapping and how to add one (`assets/fetch_logos.sh`)
- Canon design: de_pjt `docs/superpowers/specs/2026-07-16-diagram-skill-design.md`

## Adding a logo
Add one `get <key> <iconify-path>` line to `assets/fetch_logos.sh` and re-run it. Missing logos fall back to a text chip.

## Scope
v1 = architecture + sequence + user flow. Charts/metrics come later. Topologies outside the supported patterns fall back to hand-authored SVG using the same PALETTE and rules.
