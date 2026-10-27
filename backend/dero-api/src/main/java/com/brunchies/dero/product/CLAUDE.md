# product — JOINED inheritance aggregate

`Product` is the aggregate root and the JOINED inheritance root of 5 spec subtypes (`Desk`·`Monitor`·`Arm`·`Light`·`Prop`). **Prevention lines only** — the old evidence file (measurements, ticket keys, failure narratives) was deleted 2026-08-14 (rules-diet 10; the `/products` 400-not-404 block moved to `docs/context/api-spec.md` §5). General mapping rules `backend/CLAUDE.md`, column SoT `docs/context/erd.md`.

## Traps

- **Builders: `@Builder(access = AccessLevel.PRIVATE)` on the *constructor*.** `@SuperBuilder` has no `access` attribute, so the builder goes public and `Desk.builder().build()` bypasses the static factory's invariants; class-level `@Builder` has no inheritance support and **silently drops the 9 parent `Product` fields** (compiles, stores NULL).
- **Renaming one parent `Product` field is a 6-file job** — subtypes thread parent fields by hand, 4 sites each. Scope the task as 6 files, not 1.
- **A LAZY proxy on the polymorphic root makes `instanceof` false, so compatibility judgment is skipped with no error — a false "compatible".** Two defenses, do both: `@ConcreteProxy` on `Product` (applied 2026-08-02) **and** `join fetch` down to the subtype on judgment paths.
- **Subtypes need `@PrimaryKeyJoinColumn(name = "product_id")` and must not declare `@Id`/`@GeneratedValue`/`@SequenceGenerator`.** The child PK column is `desk.product_id`, not `desk.id`, and per-subtype sequences do not exist — either mistake kills boot under `ddl-auto: validate`.
- **Do not map audit columns (`created_at`·`updated_at`) on subtypes** — the columns are deliberately dead; redeclaring double-maps them and boot dies. Rationale: ADR-0006 decision 5.
- **`spec_type` may be mapped only read-only (`insertable = false, updatable = false`).** `@DiscriminatorColumn` already writes it, so a plain field declaration maps it twice for write and boot dies with `Repeated column in mapping for entity`. Subtypes need only `@DiscriminatorValue`.
  - **⚠ `getSpecType()` is `null` on an instance you just created and saved** (it is filled only on DB-loaded entities). Judge a freshly created product with `SpecType.of(product)`; use the field only for query conditions and already-loaded entities.
- **`monitor.ports` is `List<String>`, not a record** — erd.md defines a flat string array, so there is no per-port structure to model.
- **Say spec type with `SpecType` constants; do not leak entity literals like `Desk.class`.** Query conditions too are enum comparisons on `product.specType`, never `type(p) = Desk`. **`SpecType.procedural` is the SoT for "does this type need a GLB asset"** — the catalog-visibility predicate derives from it, so amending D18's procedural set means updating this flag in the same change or a whole spec type vanishes from `GET /products`.
- **Do not rebuild an already-mapped discriminator in queries** (ADR-0018 decision 3). JPQL `case when type(p) = Desk then 'DESK' ...` forks the SoT and its `else` catch-all **silently misclassifies a newly added subtype**. Read `Product.specType` instead.
- **Reverse `@OneToOne` `Product.asset` and `Product.emitter` are not lazy even marked LAZY** — nullable, so Hibernate cannot proxy them and every `Product` read fires 2 extra SELECTs per row. The cure is an explicit `left join fetch`, **not** projection; both repositories stay banned (ADR-0007), so writes go through the root.
- **to-many fetch cannot combine with `Limit`/`Pageable`; to-one fetch can.** `product_image`·`product_vesa` stay separate `IN (:ids)` batch queries; `brand`·`category`·`asset`·`emitter` are safe to `join fetch` with `Limit`.
- **JPQL constructor projection off a JOINED subtype works, but it is not general permission** — the default is entity + `join fetch`, and projection is only for ADR-0018's 3 exceptions (thin admin summary lists).
- **Never let the client filter a page after fetching — put the filter in `GET /products`.** Client-side removal breaks the "page size = rows returned" promise silently: the list stops growing and the infinite-scroll sentinel never fires. `categoryId` therefore takes repeats (capped at 100, **rejected not truncated**).
- **`@MapsId` entities (`Asset`·`ProductEmitter`) have a NULL PK until flush** — building a response straight off `product.registerAsset(...)` ships `productId = null`. Call `products.flush()` and do not call `save()`; only the new-registration path reproduces it.
- **Junction collection replacement must be a diff, not `clear()`+`addAll()`** — Hibernate emits INSERT before DELETE inside a flush, so a replacement that keeps an existing element dies on the unique index. Testing only non-overlapping replacement hides it.
- **`orphanRemoval` on a reverse 1:1 only fires when the load snapshot held a value** — register and delete inside one persistence context and the row survives with no exception. In integration tests put `entityManager.clear()` between the two to mimic the real flow.
- **Emissive authoring values live in `ProductEmitter`, not `Asset`** — procedural emissive products have no GLB, so no `asset` row can exist. **Do not read `light`'s optical columns as render input**; they are catalog display markers only.
- **No defaults on spec-subtype booleans** (explicit exception to the erd.md global rule) — a `false` default silently turns a missing measurement into "no" and flips the monitor↔arm judgment. They are required static-factory arguments; **`@Builder.Default` legalizes omission instead of preventing it**, and `@NonNull` does nothing on primitives.
- **Bundle adjacent same-typed args into a value object (`record` + `@Embeddable`, e.g. `ArmMounting`)** — `create()` takes 25–30 positional args, so adjacent `boolean`s can be swapped and still compile. `@Column(name=...)` on each record component is mandatory; the schema does not change.

## Search index (product documents)

Evidence and measurements: `docs/context/observability.md` §6, ADR-0019·0028·0029.

- **The ES document holds `{name}` only; visibility is judged in Postgres** by re-reading ids through `findCatalogByIds`. **Test fixtures built as PROP without an approved asset drop out of the catalog entirely and make every assertion pass vacuously** — use `registerAsset(...)` or a procedural spec type.
- **Korean typos change morpheme output, so `fuzziness` cannot catch them** — that is why the `name.autocomplete` clause alone keeps `operator` at the default `OR`.
- **Never render a completion-suggester string on screen** — the FST matches hidden and review-pending product names. Return `option.id()` only and re-read through the catalog predicate.
- **An analyzer-only change is invisible to boot-time `prepareIndex`** (it compares top-level field names), so that deploy needs one manual `POST /api/v1/admin/search/reindex`. Adding a new top-level field (e.g. `categoryPath`) does not.
- **Category-word search is solved by indexing the category's ancestor path**, and that clause alone is `operator=AND` — `OR` degrades "category search" into "the whole list".
- **A 404 from an alias lookup is a normal state** (`ignore_unavailable` covers indices, not aliases) — not catching it fails the very first indexing run.
- **`GET /products/{productId}` swallows literal sub-paths, so a missing endpoint answers 400, not 404.** `errors[0].field=productId` on a path variable you never sent means the endpoint is absent from that server (unmerged branch / old build) — not a bad client parameter. Detail: `docs/context/api-spec.md` §5.
