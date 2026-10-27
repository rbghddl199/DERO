---
paths:
  - "**/*.java"
---
# DERO Query Conventions

The canonical **examples** injected when you write query code. Rationale and rejected alternatives
live in [ADR-0018](../../../docs/adr/0018-query-convention-entity-first-querydsl.md); tool choice is
`querydsl-rubric.md`; service naming is `architecture.md` §19. This file is code.
(Over 300 words on purpose: each of the five GOOD/BAD pairs guards a silent break — N+1,
`HHH90003004`, a misclassified discriminator — and only a worked example stops them. The
measurement narratives moved to their canonical homes.)

## 1. Default to entities + `join fetch`

```java
// BAD — DTO projection. Of the 22 positional args, p.name / p.description / p.productUrl are all
//       String, so swapping adjacent args still compiles → silently wrong data
@Query("""
		select new com.brunchies.dero.product.dto.ProductListRow(
				p.id, p.name, p.description, p.productUrl, p.priceKrw, p.status,
				b.name, c.name, a.assetKey, a.reviewStatus /* ... 12 more ... */)
		from Product p
			left join p.brand b
			left join p.category c
			left join p.asset a
		where p.deletedAt is null
		""")
List<ProductListRow> findProductRows(Limit limit);

// GOOD — read entities, assemble the response inside the transaction (in the service)
// JOINED inheritance means spec subtype columns (desk.width_mm etc.) come along in the same query
@Query("""
		select p from Product p
			left join fetch p.asset
			left join fetch p.emitter
			left join fetch p.brand
			join fetch p.category
		where p.deletedAt is null
		order by p.id
		""")
List<Product> findCatalogPage(Limit limit);
// ProductCatalogService assembles it with new ProductDetailResponse(...) — multiple sources means
// the service does it (architecture.md rule 11)

// GOOD — projections are allowed in exactly three cases
// (1) aggregates — select count(d) from Desk d where d.status = ...
// (2) reads you cannot reach by walking from the aggregate root — the admin review list
//     (ADR-0007, "reads may cross boundaries")
// (3) performance justified by measurement — no numbers, no exception
```

Rationale: a projection throws away the persistence context, first-level cache and dirty checking, so you cannot call entity methods on what you read. JPQL constructor expressions only validate the **number** of arguments.

## 2. Spell out inverse-side nullable `@OneToOne` with `left join fetch`

```java
// BAD — reading a list as entities without fetching Product.asset / Product.emitter
@Query("select p from Product p where p.deletedAt is null order by p.id")
List<Product> findPage(Limit limit);   // 20 rows → 40 extra SELECTs (20 asset + 20 emitter)

// GOOD
@Query("""
		select p from Product p
			left join fetch p.asset
			left join fetch p.emitter
		where p.deletedAt is null
		order by p.id
		""")
List<Product> findPage(Limit limit);
```

Rationale: the `mappedBy` side has no FK, so Hibernate must know whether the target row exists before it can decide to hand out a proxy — it ends up issuing a check query. `LAZY` does not apply. Both are ToOne associations, so combining them with `Limit` or a cursor does not trigger `HHH90003004`.

## 3. Collections are not fetch-join targets

```java
// BAD — fetching two collections at once → MultipleBagFetchException
//       even one collection combined with Limit triggers HHH90003004
//       (Hibernate reads every row into memory and paginates there)
@Query("""
		select p from Product p
			left join fetch p.images
			left join fetch p.vesas
		where p.deletedAt is null
		""")
List<Product> findPage(Limit limit);

// GOOD — batch-load primary images by id list
@Query("select i from ProductImage i where i.product.id in :ids and i.isPrimary = true")
List<ProductImage> findPrimaryImages(@Param("ids") List<Long> ids);

// GOOD — or @BatchSize. default_batch_fetch_size = 100 in application.yaml is already the baseline
@OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
@BatchSize(size = 100)
private List<ProductImage> images = new ArrayList<>();
```

## 4. Do not recompute a discriminator that is already mapped

```java
// BAD — rebuilding in JPQL the value @DiscriminatorColumn already holds
//       the else catch-all silently misclassifies a new subtype as 'PROP' with no compile error
@Query("""
		select new ...AdminProductSummaryResponse(
				p.id,
				case
					when type(p) = Desk then 'DESK'
					when type(p) = Monitor then 'MONITOR'
					else 'PROP'
				end,
				p.name)
		from Product p
		where type(p) = :specTypeClass
		""")
Page<AdminProductSummaryResponse> findAdminProducts(
		@Param("specTypeClass") Class<? extends Product> specTypeClass, Pageable pageable);
// The caller then reverses the string with SpecType.valueOf(row.specType()) — two sources of truth

// GOOD — map the discriminator column read-only and use it as is (Product).
// The read-only mapping is the exception to product/CLAUDE.md's "declaring spec_type as a field
// kills startup", which holds for a *writable* mapping.
// CAVEAT: populated only on entities LOADED from the DB — on one you just created and saved it is
// null. Use it in query predicates and on loaded entities, SpecType.of(product) otherwise
// (product/CLAUDE.md).
@Enumerated(EnumType.STRING)
@Column(name = "spec_type", nullable = false, length = 20, insertable = false, updatable = false)
private SpecType specType;

@Query("""
		select p from Product p
		where p.deletedAt is null
			and (:specType is null or p.specType = :specType)
		""")
Page<Product> findAdminProducts(@Param("specType") SpecType specType, Pageable pageable);
```

## 5. Dynamic conditions go through QueryDSL

```java
// BAD — piling null guards into a string. Every new condition lengthens the string and the
//       compiler sees nothing
@Query("""
		select p from Product p
			join fetch p.category c
		where p.deletedAt is null
			and (:categoryId is null or c.id = :categoryId)
			and (:specType is null or p.specType = :specType)
			and (:brandId is null or p.brand.id = :brandId)
		""")
List<Product> search(@Param("categoryId") Long categoryId, @Param("specType") SpecType specType,
		@Param("brandId") Long brandId, Limit limit);

// GOOD — return null and QueryDSL drops the whole condition
// Wiring (JPAQueryFactory bean, Q class generation): backend/CLAUDE.md
List<Product> search(Long categoryId, SpecType specType, Long brandId, int size) {
	return query.selectFrom(product)
			.leftJoin(product.asset).fetchJoin()
			.where(product.deletedAt.isNull(), categoryEq(categoryId), specTypeEq(specType),
					brandEq(brandId))
			.limit(size)
			.fetch();
}

private BooleanExpression categoryEq(Long categoryId) {
	return categoryId == null ? null : product.category.id.eq(categoryId);
}
```

