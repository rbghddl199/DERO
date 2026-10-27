---
paths:
  - "**/*.java"
---
# DERO Java Architecture Rules

Injected on every `.java` edit — the **structural rules of record**. Formatting (line length, braces,
imports) is `project-convention.md`; enum `description` and non-entity Lombok is
`enum-and-lombok.md`; query examples are `query-conventions.md`. Security prohibitions live here
(§4·§8·§9·§15) — Spring security *wiring* is the `springboot-security` skill.

Decision record: [ADR-0012](../../../docs/adr/0012-backend-code-conventions.md) (audit numbers and
adoption history live there, not here).
(Over 300 words on purpose: all 20 rules are MUST/NEVERs that a `.java` turn can break silently, so
review does not catch them — audit numbers, history and the logging narrative moved to ADR-0012,
ADR-0020 and `observability.md`.)

## 1. Controller handlers always return `ResponseEntity<T>`

```java
// BAD
@GetMapping("/{id}")
PlacementDetailResponse get(@PathVariable Long id) {
	return placementService.get(id);
}

// GOOD — wrap even a plain 200
@GetMapping("/{id}")
ResponseEntity<PlacementDetailResponse> get(@PathVariable Long id) {
	return ResponseEntity.ok(placementService.get(id));
}
```
## 2. The soft-delete filter belongs in the repository query, always

```java
// BAD — the one method without the filter answered 200 for a deleted row while
//       get/delete in the same service answered 404
Optional<Placement> findForUpdateById(Long id);

// BAD — filtering in the service
placements.findById(id).filter(p -> !p.isDeleted());

// GOOD — derived query
Optional<Placement> findByIdAndDeletedAtIsNull(Long id);

// GOOD — JPQL
@Query("select p from Placement p where p.id = :id and p.deletedAt is null")
Optional<Placement> findForUpdateById(@Param("id") Long id);

// GOOD — need deleted rows? add a separate method. Never strip the filter off an existing one.
Optional<Placement> findIncludingDeletedById(Long id);
```
## 3. Indentation is tabs

Tabs on new files and on the lines you touch. **The format source of truth is
`docs/GoogleStyle_custom.xml` — never restate widths in any doc, point at the XML** (writing the
numbers twice already produced two values that both disagreed with the XML).

**Never reformat a whole file you are editing** — the diff becomes unreviewable, which is also why
**`./gradlew spotlessApply` is off-limits** while two indentation schemes are live (rule and expiry:
`.claude/rules/backend/gradle-build.md` §4, decided by DERO-619).

## 4. Entities throw `BusinessException` + `ErrorCode` too

```java
// BAD — GlobalExceptionHandler does not catch it, so user input leaves as 500
public void increaseQuantity(int amount) {
	if (amount < 1) {
		throw new IllegalArgumentException("더할 수량은 1 이상이어야 한다");
	}
	this.quantity += amount;
}

// GOOD — domain code throws only BusinessException with an ErrorCode
throw new BusinessException(CommonErrorCode.INVALID_INPUT);
```
No `IllegalArgumentException`/`IllegalStateException`/`UncheckedIOException` from domain code.

## 5. Controllers never call repositories

```java
// BAD
@RestController
@RequiredArgsConstructor
public class AuthController {
	private final UserRepository users;   // violation
}

// GOOD
private final UserService userService;
```
WHY: `open-in-view: false`. The moment a controller touches a lazy association the transaction is already closed and it dies with `LazyInitializationException`. Convert to a DTO inside the transaction boundary (the service).

## 6. In `ErrorCode`, the constant name *is* the code string

```java
// BAD — prefix published separately from the constant name
NOT_FOUND(HttpStatus.NOT_FOUND, "배치를 찾을 수 없습니다.");

public String code() {
	return "PLACEMENT_" + name();
}

// GOOD — domain prefix lives in the constant name; code() is name()
PLACEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "배치를 찾을 수 없습니다.");

@Override
public String code() {
	return name();
}

// CAUTION — AuthErrorCode and SecurityErrorCode share the AUTH_ prefix. Adding the same name to
//           the other enum compiles fine and only the frontend branch silently splits.
//           Check the other enum first.
```
`detail()` stays Korean — it is shown to users verbatim (ADR-0008).

## 7. Entity Lombok — enforce invariants only

```java
// BAD
@Entity
@Data                  // brings setters
@Setter                // bypasses invariants
@EqualsAndHashCode     // touches lazy associations
@ToString              // N+1 and infinite recursion
public class Placement { }

// GOOD — these two are mandatory
@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Placement extends BaseSoftDeleteEntity {

	// Builder placement is free: class-level or constructor-level, either is fine
	// (rationale per aggregate in product/CLAUDE.md and placement/CLAUDE.md).
	@Builder(access = AccessLevel.PRIVATE)
	private Placement(/* ... */) { }
}
```
This rule supersedes the "all four as a set" wording in the parent docs.

## 8. try-catch is banned except for translation

```java
// BAD — swallowing turns an outage into a symptomless one
try {
	refreshTokens.revokeAll(userId);
} catch (BusinessException ignored) {
}

// GOOD — translate an optimistic lock failure into 409
try {
	placements.saveAndFlush(placement);   // flush must be forced so the exception fires inside this try
} catch (ObjectOptimisticLockingFailureException e) {
	throw new BusinessException(PlacementErrorCode.PLACEMENT_STALE);
}
```
WHY: catching is allowed only to translate an external (Spring/JDK/library) exception into `BusinessException` + `ErrorCode`, and the catch block carries a one-line comment saying what it catches and why. `saveAndFlush` + catch is **a pair** — with plain `save()` the flush is deferred to commit, the exception fires outside the try, and it goes out as a 500.

## 9. `@Slf4j` + SLF4J to stdout — never `System.out`, never a hand-rolled `LoggerFactory`

```java
// BAD — bypasses the appender; Filebeat reads every frame as its own document
System.out.println("TEMP_DEBUG " + token);
e.printStackTrace();

// BAD — the stack trace is thrown away at the source
log.error("색인 실패: " + e.getMessage());

// BAD — hand-rolled logger. Two idioms for one job.
private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

// BAD — the token is the whole reason this line is a leak. ES keeps it 30 days.
log.warn("리프레시 실패: token={} email={}", refreshToken, user.getEmail());

// GOOD — @Slf4j, subject identified by internal id, throwable as the LAST argument
@Slf4j
@Service
public class ProductSearchService {
	void index(Product product) {
		try {
			// ...
		} catch (IOException e) {
			// 삼키는 것이 설계라(ADR-0019 결정 3 — 재색인으로 복구한다) 이 로그가 유일한 증거다.
			log.error("제품 색인에 실패했습니다 — 재색인으로 복구합니다: productId={}", product.getId(), e);
		}
	}
}
```

- **Throwable goes last, with no placeholder** — that is what puts the trace into the ECS JSON as `error.stack_trace`. If you caught it, log it with the throwable; **never with `getMessage()` alone**.
- **No token, password, full email, or IP in a log line.** Logs land in ES and are searchable for 30 days — one careless line is a real leak. Identify subjects by internal numeric id. **Mask at the `throw`, not only at the `log`**: the exception's own message rides into ES with the trace, so `new IllegalArgumentException("bad token: " + token)` leaks at a log site that never saw the token.
- **`@ExceptionHandler` logs 5xx and stays silent on 4xx.** A rejected input is a normal outcome; logging it at ERROR buries real outages. `GlobalExceptionHandlerTest.BusinessExceptionLogging` holds both halves — a status-code assertion cannot see this regression.
- **Log at the point where a failure is swallowed on purpose** — there the log line is the only evidence the document went missing.
- **Asserting on log output uses `@ExtendWith(OutputCaptureExtension.class)` + `CapturedOutput`**, never a logback `ListAppender` on a cast `LoggerFactory` logger: same characters as the banned line above, and it reads stdout — the actual collection path.

WHY: collection is infra's job and **the ingest pipeline routes on logger name** ([ADR-0020](../../../docs/adr/0020-observability-stack.md)) — a second delivery path from app code is invisible to it. Pipeline wiring, ILM and dashboards: `docs/context/observability.md` §6.

## 10. `@Transactional(readOnly = true)` on the class, re-declare on write methods

```java
// BAD — no annotation at all (no transaction boundary), or readOnly on a method that writes
@Service
public class ProductImageService { }

// GOOD
@Service
@Transactional(readOnly = true)
public class ProductImageService {

	@Transactional
	public void replace(Long productId, List<String> keys) { }
}
```
## 11. Response DTO assembly — one source `from()`, many sources service

```java
// BAD — three sources pushed into the DTO; the DTO now knows service logic
PlacementSaveResponse.from(placement, byRef, violations);

// GOOD — single entity → static factory next to the DTO
PlacementDetailResponse.from(placement);

// GOOD — entity + byRef map + violation list → assembled in the service
return new PlacementSaveResponse(placement.getId(), byRef, violations);
```
## 12. Test method names are free, `@DisplayName` in Korean is mandatory

```java
// GOOD
@Test
@DisplayName("배치를 찾을 수 없으면 404")
void get_notFound() { }
```
Method-name language is not enforced and **existing method names stay untouched** — a rename diff ruins blame.

## 13. Never rebuild an entity with a builder — use JPA dirty checking

```java
// BAD — 17 fields reassembled and saved
Placement updated = Placement.builder()
		.id(found.getId()).ownerId(found.getOwnerId()) /* ... 15 more ... */
		.title(req.title())
		.build();
placements.save(updated);

// GOOD
found.rename(req.title());   // dirty checking issues the UPDATE at commit

// OK — creating a new row is not this anti-pattern
Placement created = Placement.create(user, req.title());
placements.save(created);
```
WHY: an entity returned by a repository is already managed, so mutate it through its own method and skip the redundant `save()` inside `@Transactional`. Builder reassembly silently drops each newly added field and **overwrites existing values with null**.

## 14. Spring beans use `@RequiredArgsConstructor` + `final` fields

```java
// BAD — hand-written constructor; each new dependency means editing three places
public PlacementService(PlacementRepository placements, ProductRepository products) {
	this.placements = placements;
	this.products = products;
}

// BAD — field injection: untestable, hides cycles
@Autowired
private PlacementRepository placements;

// GOOD
@Service
@RequiredArgsConstructor
public class PlacementService {

	private final PlacementRepository placements;
	private final ProductRepository products;
}
```
Exceptions where a hand-written constructor stays: `enum-and-lombok.md` §2.

## 15. Request DTO validation is Bean Validation + `@Valid` in the controller

```java
// BAD — hand-written validate() on a request DTO
public record PlacementCreateRequest(String title, Integer budgetKrw) {
	public void validate() {
		if (title == null || title.isBlank()) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}
}

// GOOD
public record PlacementCreateRequest(
		@NotBlank String title,
		@Positive Integer budgetKrw) { }

@PostMapping
ResponseEntity<PlacementSaveResponse> create(@Valid @RequestBody PlacementCreateRequest req) { }

// GOOD — the one grandfathered exception, and it says why.
// DeskSnapshot.validate(): the fields to check depend on specSource, which Bean Validation
// cannot express. Rationale recorded in placement/CLAUDE.md.
```
Conditional validation that is genuinely needed **must carry its reason in a comment** — reviewers revert hand validation without one.

## 16. Every `@ManyToOne`/`@OneToOne` declares `fetch = FetchType.LAZY`

```java
// BAD — JPA defaults to EAGER
@ManyToOne
@JoinColumn(name = "product_id")
private Product product;

// GOOD
@ManyToOne(fetch = FetchType.LAZY)
```
## 17. API paths are prefixed `/api/v1/…`

```java
// BAD
@RequestMapping("/placements")

// GOOD
@RequestMapping("/api/v1/placements")
```
## 18. `@Modifying` always carries `(clearAutomatically = true, flushAutomatically = true)`

```java
// GOOD
@Modifying(clearAutomatically = true, flushAutomatically = true)
@Query("update Placement p set p.deletedAt = :now where p.id = :id")
void softDelete(@Param("id") Long id, @Param("now") Instant now);
```
WHY: bulk queries bypass the persistence context. Without `flushAutomatically` pending changes go out after the query; without `clearAutomatically` later reads return the **pre-update first-level cache**.

## 19. Services are `*Service` — never create a `*QueryService`

```java
// BAD
class CategoryQueryService { }
class CategoryCommandService { }

// GOOD
class CategoryService { }        // public reads
class AdminCategoryService { }   // admin writes
```
The public↔admin split is already carried by the `Admin*` prefix, and the read-only boundary by §10. ("CQRS" appears in no ADR — do not invent the citation.)
**This is a structural decision about not splitting reads from writes, not a suffix format — do not move it to `project-convention.md`.**

## 20. QueryDSL dynamic reads live in a `XxxRepositoryCustom`/`XxxRepositoryImpl` fragment

```java
// GOOD — ProductRepository, first production use
public interface ProductRepository extends JpaRepository<Product, Long>, ProductRepositoryCustom { }

public interface ProductRepositoryCustom {
	// specType is the enum, not Class<? extends Product> — entity class literals stay inside
	// SpecType, and the predicate compares the read-only spec_type column.
	List<Product> findCatalogPage(SpecType specType, Long categoryId, Long cursorId, Limit limit);
}

@RequiredArgsConstructor
public class ProductRepositoryImpl implements ProductRepositoryCustom {
	private final JPAQueryFactory queryFactory;
}

// BAD — do not invent a standalone query-repository shape
public interface ProductQueryRepository { }
```
WHY: Spring Data auto-detects `XxxRepositoryImpl` by naming convention (no `@Repository` needed) and wires it as the custom fragment for `XxxRepository` — the standard pattern, no new abstraction. Tool choice for the query itself: `querydsl-rubric.md`.
