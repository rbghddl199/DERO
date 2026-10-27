# Domain Docs

_Read this when a skill needs domain terminology, a planning decision, or the rationale behind a technical choice._

How engineering skills should consume this repo's domain documentation while exploring the codebase. **Layout: single-context.**

This file is written in English (HARNESS-RULES §3 "문서 언어"). **Output language: Korean.**

## The three-way mapping

| What the skill wants | Where it lives here |
|---|---|
| Glossary / ubiquitous language | `docs/GLOSSARY.md` — write new terms here inline, as they are settled |
| Planning decisions (product, scope, what we are building) | `docs/CONTEXT.md`, the **D series** |
| Technical decisions (how it is built) | `docs/adr/` |

Skills that speak of a single root `CONTEXT.md` holding both the glossary and the decisions are describing their default layout; this repo splits them as above.

## Read before exploring

- **`docs/CONTEXT.md`** — planning SSOT. Fixed decisions run **D1–D37** and keep growing; check the tail of the file for the current highest number before adding one. It lives under `docs/`, not at the root.
- **`docs/GLOSSARY.md`** — terminology SSOT. Canon for entity and column naming.
- **`docs/adr/`** — whichever ADRs touch the area you are working in. The numbering convention is in `docs/adr/README.md`; its table is a **frozen legacy index** of ADR-0001–0040, not a register you must add to. Backend work is covered by `0001-backend-layering.md` (layering, entities, ports, test strategy). **From ADR-0041 the Matt format applies** — YAML frontmatter for status, one paragraph is enough.
- Topic deep-dives live in `docs/context/` (compatibility, asset-pipeline, 3d-scene, glb-rendering-guide). The doc routing table in `CLAUDE.md` is the table of contents.

If a file is missing, **move on silently.** Do not point out the absence or propose creating it up front. `/domain-modeling` (reached via `/grill-with-docs` or `/improve-codebase-architecture`) creates them lazily, once terms and decisions are actually settled.

## File layout

```
/
├── CLAUDE.md                  ← doc routing table (table of contents)
├── docs/
│   ├── CONTEXT.md             ← planning SSOT (D series)
│   ├── GLOSSARY.md            ← terminology SSOT
│   ├── SPEC.md                ← feature checklist SoT
│   ├── adr/                   ← technical decision rationale (0001–, convention in adr/README.md)
│   └── context/               ← topic deep-dives
└── frontend/
```

## Use the glossary vocabulary

When output refers to a domain concept (ticket titles, refactor proposals, hypotheses, test names), use the term as defined in `docs/GLOSSARY.md`. Do not drift into synonyms the glossary explicitly bans.

If a concept you need is not in the glossary yet, that is a signal — either you are inventing language the project does not use (reconsider), or it is a genuine gap (record it for `/domain-modeling`).

Introducing or changing a term, entity or column comes as a set with updating `docs/GLOSSARY.md` (`CLAUDE.md` harness rules).

## Surface ADR conflicts

If output contradicts an existing ADR or a fixed decision in `docs/CONTEXT.md`, say so explicitly rather than quietly overriding it:

> _Contradicts ADR-0007 (event-sourced orders) — here is why it is still worth reopening…_

Changing the plan itself is forbidden without 박동규's approval (`CLAUDE.md` non-negotiables).
