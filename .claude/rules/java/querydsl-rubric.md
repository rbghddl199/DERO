---
paths:
  - "**/*.java"
---
# DERO QueryDSL Adoption Rubric

**Which query tool** — run this before writing the code (examples: `query-conventions.md`).
Decision of record: [ADR-0018](../../../docs/adr/0018-query-convention-entity-first-querydsl.md)
decision 2, which holds the ladder rationale and the scoring rubric.
(Over 300 words on purpose: the hard/anti triggers and the on-rung rules are all NEVERs a query turn
can break, and string JPQL, `Expressions.path` and QueryDSL DML are caught by neither the compiler
nor review.)

The ladder: derived query (≤ 2 conditions) → `@Query` (JPQL) + `join fetch` while conditions are
**static** → **QueryDSL** the moment a dynamic condition appears. Native SQL is a side exit for
PostgreSQL-only features (JSONB operators, `on conflict`), not a rung. `@EntityGraph` is orthogonal
and stays at any rung. **Do not count conditions to justify QueryDSL** — one dynamic condition is
enough (ADR-0018 deleted the counting trigger). `Specification` (JPA Criteria) is rejected outright:
string attribute names, no type safety.

## 1. Hard triggers — QueryDSL, no discussion

Answer yes to any one and the answer is QueryDSL:

- [ ] A `where` clause needs `(:x is null or ... = :x)` — a **null-guard condition** inside a JPQL string.
- [ ] `order by`, the join set, or the selected columns vary by request (client sort key, admin filter panel).
- [ ] The same query is being copy-pasted into a second method that differs only in its `where`.
- [ ] A JPQL string takes an entity **type** as a parameter (`type(p) = :specTypeClass`) — only execution validates that.
- [ ] Keyset/cursor pagination whose cursor predicate is assembled at runtime.

## 2. Anti-triggers — QueryDSL is the wrong answer

- [ ] The query is fully static. `@Query` + `join fetch` reads better and stays greppable.
- [ ] You want a DTO projection to "make it fast" without measurement. Entities + explicit
      `join fetch` stays the default (ADR-0018 decision 1), and `Projections.constructor(...)` is the
      same positional-argument trap as JPQL with only arity checked. `Projections.fields`/`bean` do
      not even give you that.
- [ ] You want to fetch two collections at once. QueryDSL raises `MultipleBagFetchException` too —
      the fix is a batch query / `@BatchSize`, at every rung.
- [ ] It is a plain `findById` / `existsBy...`. Do not wrap Spring Data in a query DSL.
- [ ] It is a write. QueryDSL DML bypasses the persistence context and dirty checking — load the
      entity and mutate it. Bulk update is the exception and needs its
      `flushAutomatically`/`clearAutomatically` reasoning stated in the MR.

## 3. Once you are on the QueryDSL rung

- Every optional predicate is a **private `BooleanExpression` helper returning `null`** when the
  input is absent — QueryDSL drops a `null` argument from `where(...)`. Never `and()`-chain onto a
  nullable expression; `null.and(x)` is an NPE.
- Pass predicates as **varargs** (`.where(a(), b(), c())`), not hand-concatenated `.where()` calls.
- Inverse-side nullable `@OneToOne` still needs `.leftJoin(product.asset).fetchJoin()` — the N+1
  does not disappear because you changed tools (`query-conventions.md` §2).
- Collection associations are still not `fetchJoin()` targets alongside `limit()`.
- Assemble the response in the service, inside the transaction, from entities.
- Never build a path from a string (`Expressions.path(...)`) to accept a client sort key — that
  reopens exactly the stringly-typed hole this rung exists to close. Map the client key to a Q path
  through an explicit `switch`/enum and reject unknown keys.
- Where the fragment lives (`XxxRepositoryCustom`/`XxxRepositoryImpl`): `architecture.md` §20.

## 4. Existing code

ADR-0018 sets the bar for **new** code. Rewriting the older projection-based catalog reads is a
separate ticket — do not fold that rewrite into an unrelated change.
