@karpathy-guidelines.md

# Deskterior Simulation Service — Team DERO

3D desk simulator built on real measured specs: verify layout, compatibility and budget before buying.
Monorepo: `backend/` (Spring Boot 4) + `frontend/` (Next.js + Three.js). Plan frozen 2026-07-15.

## Doc routing — read the matching doc before you work

| Task | Read |
|---|---|
| Backend code/build/run · frontend code/3D | `backend/CLAUDE.md` / `frontend/CLAUDE.md` |
| Searching the codebase — symbols (where defined, what calls it, implementations, rename) vs structure ("how does X work end to end", code↔doc, blast radius) | serena MCP (`find_symbol`, `find_referencing_symbols`, `rename_symbol`) / graph in `graphify-out/` via `/graphify query "<q>"`. Never a blind Grep sweep — see "Research & delegation" below |
| Feature status, adding a feature | `docs/SPEC.md` (feature-checklist SoT) |
| Planning rationale, frozen decisions (D series) | `docs/CONTEXT.md` (planning SSOT) |
| Requirement detail, acceptance criteria, priority | `docs/REQUIREMENTS.md` |
| Personas, target users, hypotheses | `docs/PERSONAS.md` |
| User flows, screen flow | `docs/USER-FLOWS.md` |
| Term definitions, entity/column naming | `docs/GLOSSARY.md` (term SSOT) |
| Design system, color, glass, icon tone | `docs/DESIGN-SYSTEM.md` |
| Brand film — story, cuts, shot prompts, render verdicts | `docs/brand-film/README.md` (media gitignored) |
| DB schema, tables/columns, JPA entities, migrations | `docs/context/erd.md` (schema canon, **FROZEN** — schema work only; read global rules + that table's section) |
| Compatibility judgment | `docs/context/compatibility.md` |
| API endpoints and spec shape | `docs/context/api-spec.md` (auth + response format pending decisions 129/135) |
| Asset registration, review, spec DB | `docs/context/asset-pipeline.md` |
| 3D placement, camera, snap, wall toggle, simulator e2e operating record | `docs/context/3d-scene.md` |
| Lighting / emissive render decisions | `docs/context/lighting-map.md` |
| GLB authoring, render look, asset onboarding | `docs/context/glb-rendering-guide.md` |
| Admin registration flow (per-variant GLB bake + emissive input) | `docs/context/admin-asset-registration.md` |
| Backend/infra/API design decisions | `docs/context/architecture-map.md` |
| Backend runtime trap evidence — measurements, tickets, failure narratives (local DB · Docker · Gradle · Flyway · tunnel) | `docs/context/backend-runtime.md` (open on symptom; rules stay in `.claude/rules/backend/*`) |
| Deploy wiring, server access, domain/nginx/CI | `docs/context/deployment.md` (topology canon = measured facts; decisions live in architecture-map) |
| Search/observability stack wiring, ES · Kibana · Prometheus · Grafana ops | `docs/context/observability.md` (ADR-0019 · ADR-0020) |
| Architecture diagram for slides/onboarding | `docs/context/diagrams/` (view of the two fact docs — never a source of fact) |
| Tech decision rationale, recording a new decision | `docs/adr/` (rules: `docs/adr/README.md`) |
| Commits, branches | `docs/git-convention.md` |
| Main flow (grill → spec → tickets → implement → review), harness install | `docs/HARNESS.md` |
| Harness rules, doc norms, evolution | `docs/HARNESS-RULES.md` (enforced canon) |
| Which skill to use for this task (project · mattpocock · other plugins) | `docs/context/skill-routing.md` (recommendations; a plugin skill not listed there gets a line added before use) |
| Review lenses the 2-axis code review misses — swallowed errors, vulnerabilities, DB/index judgment | project agents `silent-failure-hunter` · `security-reviewer` · `database-reviewer` in `.claude/agents/` (why each was kept: `docs/context/skill-routing.md` §7) |

## Research & delegation

- **Prior art before new code.** Search this repo and forge first — this project is on **GitHub: `gh`** — then Context7 / vendor docs for library behavior, and only then Exa. Check package registries before hand-rolling a utility.
- **Structure questions → graphify, symbol questions → serena, never a blind Grep sweep.** Grep stays correct for non-symbol text (strings, config keys, log messages). Treat INFERRED / AMBIGUOUS graph edges as leads to verify, never as facts.
- **If you delegate, you own collection.** Your final message is the deliverable — ending a turn while spawned agents run orphans their results. No fire-and-forget, and do not re-delegate work that fits one context.

## Non-negotiables

- No planning change without 박동규's approval. `docs/CONTEXT.md` is canon for frozen decisions.
- Mesh/spec separation: compatibility is judged from the spec metadata DB (mm) only. Never read 3D mesh dimensions.
- Measured scale is fixed: no user resize, no non-uniform scale.
- AI produces recommendations and concept images only. Placement and compatibility are decided by spec algorithms.

## Harness rules

- **`docs/context/erd.md` is frozen** — a hook blocks edits. To change it, tell 박동규 ①what ②why now ③cost of not changing ④blast radius, get consent, and he unlocks. Canon: `docs/HARNESS-RULES.md` §4.
- **`git commit`/`push --no-verify` (and `-c core.hooksPath=`) is blocked** by `.claude/hooks/block-no-verify.js` — fix what the git hook rejects, never bypass it. Canon: `docs/HARNESS-RULES.md` §4.
- Feature done: check `[x]` on that line of `docs/SPEC.md`; new feature: add one line (use `/sync-spec`).
- New domain term / entity / column: updating `docs/GLOSSARY.md` is part of the change. Replace banned spellings with the canonical one on sight.
- Record a repeated mistake or trap as one line under "지속 이슈" in the `CLAUDE.md` of the **deepest folder that owns the cause**. Root and package-root CLAUDE.md are routing-only — never promote a trap upward (HARNESS-RULES §3).
- Package roots (`backend/`, `frontend/`) ship `CLAUDE.md` (≤ 2,000 tokens) + `AGENTS.md`. Create a deeper module/domain `CLAUDE.md` only when there is something to write (no empty files); when you do, register it in the parent routing table and add the `AGENTS.md` set.
- `AGENTS.md` is a one-line `@CLAUDE.md` tag file, not a copy (revised 2026-07-18). Edit content in CLAUDE.md only.
- Update the living docs under `docs/` in place. **Never create dated snapshot docs (plan/spec)** — decisions go to `docs/CONTEXT.md`, implementation rules to `docs/context/*`, harness rules to `docs/HARNESS-RULES.md` (confirmed 2026-07-22).
- Keep this file and every folder CLAUDE.md **under 2,000 tokens** — the folder file auto-loads whenever that folder is touched, and line count hid a 17,597-token file (HARNESS-RULES §3 Common). Over the ceiling: move content out, never delete it. A new `docs/context/` doc must be registered in the routing table above.

## Agent skills

- **Main flow** — `/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review` is the official path (procedure: `docs/HARNESS.md`; per-axis winners: `docs/context/skill-routing.md`).
- **Issue tracker** — local markdown under `.scratch/<feature-slug>/` (`spec.md` + `issues/NN-<slug>.md`). No external tracker. Canon: `docs/agents/issue-tracker.md`.
- **Triage labels** — workflow inactive; the 5 labels survive as local ticket status vocabulary. See `docs/agents/triage-labels.md`.
- **Domain docs** — terms → `docs/GLOSSARY.md`, planning → `docs/CONTEXT.md`, technical decisions → `docs/adr/`. See `docs/agents/domain.md`.
