# Issue tracker: local markdown

_Read this when a skill needs to create, read or update a ticket, or asks where a spec goes._

Canon for issues and tasks in this repo is a **local markdown tracker under `.scratch/`**. There is no external tracker — the institution-provided one expired and the repo is maintained solo (rationale: ADR-0041). Migration to GitHub Issues is planned; when it lands, this file is rewritten to point at `gh`.

This file is written in English (HARNESS-RULES §3 "문서 언어"). **Output language: Korean** — ticket titles, bodies, spec text and commit messages are all Korean.

## Layout

```
.scratch/<feature-slug>/
├── spec.md              ← what is being built and why. Written once by /to-spec, then mostly static
└── issues/
    └── NN-<slug>.md     ← the ticket. Numbered from 01 in creation order
```

- `<feature-slug>` is a plain kebab-case name for the piece of work (`matt-realign`), not a key from any tracker.
- **The `NN-` number is fixed at creation.** Never renumber or rename a ticket file — other tickets link to it by number.
- **Commit the folder.** It has to survive branch switches and reach the other checkouts (worktrees, orca workspaces).
- When the work is done and merged, delete the folder (monthly diet, `docs/HARNESS-RULES.md`). Classify its contents first — see "Where implementation notes go".

## Ticket file format

```markdown
# NN — <title>

**What to build:** one or two sentences describing the observable outcome.

**Blocked by:** 02, 03 — or `None — can start immediately.`

**Status:** ready-for-agent

- [ ] acceptance criterion, checked off as it lands
- [ ] acceptance criterion
```

- **Blockers first.** Every ticket states what it waits on, by ticket number, before anything else. A ticket with no blocker says so explicitly.
- **`Status:` is a real line here** — the ticket file is the only copy of the status, so it belongs in it. Vocabulary: `docs/agents/triage-labels.md`.
- **Acceptance criteria are checkboxes**, and the implementing session ticks them as it goes.
- Keep it short. Background, rationale and alternatives belong in `spec.md`, `docs/CONTEXT.md` or an ADR — not in the ticket.

## `docs/SPEC.md` stays the completion ledger

A ticket tracks one unit of work in flight; `docs/SPEC.md` records that a feature exists and is done. Tick the SPEC line when the feature lands (`/sync-spec`). Do not copy ticket status into SPEC.md.

## Where implementation notes go

Progress and dead ends live in the ticket file's checkboxes while the work is in flight. When the folder is deleted, classify what is left. **The default is "throw it away."**

| What it is | Where it goes |
|---|---|
| Wiring fact (ES version, index name, port) | `docs/context/<topic>.md` |
| Trap that will bite again | "지속 이슈" in the `CLAUDE.md` of the folder that owns the cause |
| Ongoing project state | mem |
| A design decision that got overturned mid-build | ADR / `docs/CONTEXT.md` |
| A term or entity name that got settled | `docs/GLOSSARY.md`, inline, as it is settled |
| A point-in-time measurement ("178 indexed") | thrown away |

## Branches and commits

Branch naming and commit format are canon in `docs/git-convention.md`. Nothing about a branch name is derived from a ticket — there are no issue keys.

## Are pull requests a request surface?

**No.** _(Change to `yes` to treat incoming pull requests as feature requests — `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Write `.scratch/<feature-slug>/issues/NN-<slug>.md` in the format above. For a spec document, write `spec.md` in the same folder and have the tickets point at that path.

## When a skill says "fetch the relevant ticket"

Read the file. Find it by number in `.scratch/<feature-slug>/issues/`.
