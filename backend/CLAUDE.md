# backend — Spring server

Single Gradle module. Real project root is `backend/dero-api/` — run every command there. Package
root `com.brunchies.dero`.

## Code routing — read the target before working

| Task | Read |
|---|---|
| **Writing Spring code (controller/service/repository/config)** | Vendored project skills (ADR-0042): `springboot-patterns` · `springboot-security` · `jpa-patterns` · `redis-patterns` · `postgres-patterns`; tests `mattpocock-skills:tdd` + `.claude/rules/backend/testing-runtime.md`, build/startup verification `.claude/rules/backend/gradle-build.md`. Skills carry generic patterns, rules below carry DERO specifics; **DERO wins on conflict** |
| Build, run, DB containers, env traps | `dero-api/` + `dero-api/CLAUDE.md` |
| Error codes, `ProblemDetail`, page response, `BaseEntity`, security wiring | `dero-api/src/main/java/com/brunchies/dero/global/CLAUDE.md` |
| Spec subtype JOINED inheritance, Lombok builders, `Product` aggregate | `dero-api/src/main/java/com/brunchies/dero/product/CLAUDE.md` |
| Placement save, optimistic lock, joint JSONB, VESA coupling | `dero-api/src/main/java/com/brunchies/dero/placement/CLAUDE.md` |
| Batch upload gate, Redis queue, in-WAS publish worker, concept image count + transaction boundary | `dero-api/src/main/java/com/brunchies/dero/image/CLAUDE.md` |
| Object storage port, S3 presign, config binding traps | `dero-api/src/main/java/com/brunchies/dero/infra/CLAUDE.md` |
| 6 master admin CRUDs, catalog↔product DIP trap | `dero-api/src/main/java/com/brunchies/dero/catalog/CLAUDE.md` |
| `User` aggregate, missed call sites on field rename | `dero-api/src/main/java/com/brunchies/dero/user/CLAUDE.md` |
| Rationale — layers/entities/ports/test strategy · persistence tooling, subtype mapping, Flyway · package boundaries, aggregate roots, dependency direction · API response, error format, pagination · entity-first reads, DTO projection exceptions, QueryDSL | ADR `0001` · `0006` · `0007` · `0008` · `0018` in `docs/adr/` |
| DB schema, table/column definitions, JPA entities, migrations | `docs/context/erd.md` |
| Entity/column naming | `docs/GLOSSARY.md` |
| Compatibility logic | `docs/context/compatibility.md` |
| Feature status, completion check | `docs/SPEC.md` (`/sync-spec`) |
| Backend runtime trap evidence (local dev · ports · image pipeline) | `docs/context/backend-runtime.md` §1 (local dev; rest still staged in `.claude/rules/backend/*.md` — auto-load per file) |

## Where new code goes

- **Exactly these 10 top-level packages** (ADR-0007). Do not add more — `com.brunchies.dero.{user, catalog, auth, product, placement, community, commerce, image, infra, global}`
- **Domain first, layers under it**: `<domain>/{controller,service,repository,dto}`, entity directly under the domain package. Never create layer packages at the top level.
- `global/{config,exception,response,entity,security}` — global config, `@RestControllerAdvice`, `ProblemDetail` factories and page response, `BaseEntity`, security config and auth failure handlers. **Do not create `common`.** Split test: handles one request → domain; intercepts every request → `global`.
- `infra/{storage,ai,recommend}` — interface and implementation of each of the 3 ports live in the same folder.
- New trap or rule in a domain/layer folder → record it in **that folder's `CLAUDE.md`**, add the `AGENTS.md` (`@CLAUDE.md` one-liner) pair, register one row in the table above. Nothing to write → no file (no empty files). This file is routing/entry only, so traps do not go here.

## Core rules

Architecture and code-level rules are **canonical in `.claude/rules/java/*.md`**, which auto-load on
every `.java` edit: `architecture.md` (deep entities · 3 ports · aggregates and repository
placement · dependency direction · `BusinessException`+`ErrorCode` · explicit `fetch = LAZY`) ·
`query-conventions.md` (GOOD/BAD reads, `join fetch`, the 3 DTO-projection exceptions) ·
`querydsl-rubric.md` (derived query → `@Query` → QueryDSL) · `enum-and-lombok.md`. Rationale is in
the ADRs listed above. **Do not restate any of it here.** What follows is only what those files do
not say.

- **Lombok `access` is not optional.** `@Entity` = `@Getter` + `@NoArgsConstructor(access = PROTECTED)`, plus `@AllArgsConstructor(access = PRIVATE)` + `@Builder(access = PRIVATE)` in the default form, with construction through a static `create(...)` that calls `X.builder()....build()`. Omit `access` and the default is public: a bare `@Builder` allows `User.builder().build()` with no `status`/`role`, and every invariant `create()` enforced disappears at compile time — the failure resurfaces at DB insert. The 2 `@MappedSuperclass` types in `global/entity/` take **`@Getter` only** (auditing fills the fields). Inheritance or collection initialization → constructor-level `@Builder` instead.
- **QueryDSL is wired and the artifact is the openfeign fork** — `io.github.openfeign.querydsl:7.0`, not `com.querydsl` (upstream 5.1.0 dates from JPA 3.1/Hibernate 6), while **imports stay `com.querydsl.*`**. Inject `JPAQueryFactory` by constructor (`global/config/QuerydslConfig`). Q classes are generated at compile time, so **if the IDE cannot see them, run `./gradlew compileJava` first**. Build-file details: `.claude/rules/backend/gradle-build.md`.
- **`spec_type` is immutable** — changing it kills `product.id` and breaks placements, carts and likes. PK is `@GeneratedValue(SEQUENCE)` + `@SequenceGenerator(sequenceName="<table>_id_seq", allocationSize=50)`; **if `allocationSize` differs from the DDL `INCREMENT BY`, PKs collide silently.**
- **Tests**: entity/pure logic → unit (zero Spring context); persistence → Testcontainers; API → e2e; outside-in TDD. **No H2** (JSONB needs real Postgres) and containers use `reuse=true`, so each developer needs `testcontainers.reuse.enable=true` in `~/.testcontainers.properties`. **e2e does not honour `@Transactional` rollback** — truncate to isolate and `flush()` before asserting. Details: `.claude/rules/backend/testing-runtime.md`.
- Schema SoT is **`docs/context/erd.md`**: change tables/columns there first and get MR review — entity code must not lead the doc. Entity/column naming SoT is `docs/GLOSSARY.md`, and a new term means a GLOSSARY update in the same change.
- Compatibility logic uses the spec metadata DB (mm) only — never 3D mesh dimensions (`docs/CONTEXT.md` D7, D8). Edit CLAUDE.md, never AGENTS.md — it is a one-line `@CLAUDE.md` tag file.

## Commands (all from `backend/dero-api/` — the parent folder has no `gradlew`)

```bash
./gradlew compileJava   # type check. no separate typecheck task
./gradlew test
./gradlew build
./gradlew bootRun       # long-running — do not use for verification. start postgres/redis first from repo root: docker compose -f compose.data.yaml up -d (dero-api/CLAUDE.md)
```

- **Format is machine-checked by spotless + google-java-format** (added 2026-08-11) — but **do not run `spotlessApply`** while the tab/2-space schemes disagree (ban and expiry: `.claude/rules/backend/gradle-build.md` §4, decided by DERO-619). It governs **only files changed vs `origin/develop`** (`ratchetFrom`), so legacy files stay untouched until you touch them. `check`/`build` fail on a violation; `test` and `bootJar` do not. Still no checkstyle. Style values live in `docs/GoogleStyle_custom.xml` — the IntelliJ scheme and spotless must stay equal or they fight on every save. **Never write widths into docs, point at the XML** — writing the number in two places made both drift from the XML. Anyone who imported the scheme before 2026-07-30 must re-import; the old one reverts indentation on every save. Config and the deploy trap: `.claude/rules/backend/gradle-build.md` §4.
