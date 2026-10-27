---
paths:
  - "**/*.java"
---
# DERO Enum & Lombok Rules

Injected on every `.java` edit. Two rules of record, settled 2026-08-02 (approved 박동규):
**every enum constant carries a Korean `description`**, and **hand-written boilerplate
constructors are deleted in favour of Lombok**. Entity-specific Lombok rules stay in
`architecture.md` §7 — this file does not repeat them.
(Over 300 words on purpose: all three rules compile fine and only blow up at DB insert or as a
runtime null, and the exception list — Lombok drops `@Value`/`@Lazy` constructor parameters — is part
of the constraint, not commentary.)

## 1. Every enum constant declares a Korean `description`

```java
// BAD — the value set is a bare list; what PENDING means lives in someone's head,
//       in erd.md, or in a javadoc paragraph three scrolls up
public enum PublishStatus {
	PRIVATE,
	PENDING,
	PUBLIC,
	FAILED
}

// GOOD — canonical shape (placement/PublishStatus.java)
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum PublishStatus {
	PRIVATE("내 작업실. 기본값이고 피드에 노출되지 않는다."),
	PENDING("상상도 생성 대기. 피드에 노출되지 않는다. 서버가 정한다."),
	/* PUBLIC, FAILED — one line each, same shape */;

	private final String description;
}
```

An enum that already has methods keeps its `;`, and the `description` field sits between the
constants and the methods.

Writing the text:
- Korean, plain declarative (`~다`), one line. Source it from the constant's existing javadoc,
  `docs/context/erd.md`, or the field javadoc that uses the enum — **never invent semantics**.
- A one-line constant javadoc is *moved into* `description` and the javadoc is deleted. A
  multi-paragraph javadoc (rationale, trade-offs, ADR references) **stays** and `description` is
  added as a one-line summary alongside it.
- Class-level javadoc is never deleted.
- `access = AccessLevel.PRIVATE` on `@AllArgsConstructor` is not decoration — see rule 3.

**`description` is documentation, not data.** It has no caller. Do not surface it in a response
DTO, do not branch on it, do not translate it. The day it becomes an API field it also becomes a
contract, and the freedom to reword a line for clarity is gone.

**Exception — enums implementing `ErrorCode` do not get one.** Their `detail` already *is* a
user-facing Korean description of the constant; a second Korean string next to it is two places to
edit and two places to drift. They still get the Lombok treatment in rule 2.

## 2. Never hand-write a constructor Lombok can generate

```java
// BAD — utility class (infra/DeskScenePrompt.java before 2026-08-02)
final class DeskScenePrompt {

	private DeskScenePrompt() {
	}
}

// GOOD
@NoArgsConstructor(access = AccessLevel.PRIVATE)
final class DeskScenePrompt {
}

// BAD — enum boilerplate: 4 lines of assignment that the field declarations already state
ProductErrorCode(HttpStatus status, String detail) {
	this.status = status;
	this.detail = detail;
}

// GOOD
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ProductErrorCode implements ErrorCode { /* ... */ }
```

Spring beans are the same rule with `@RequiredArgsConstructor` — `architecture.md` §14.

**Keep the constructor when it does work.** Lombok generates assignment and nothing else, so a
hand-written constructor stays if any of these is true:

- The body does more than `this.x = x` — derivation, validation, key material, builder assembly.
  `auth/JwtIssuer` and `infra/LocalFileSigner` are in this category.
- A parameter carries an annotation. `@Lazy`, `@Value`, `@Qualifier` on a constructor parameter are
  not copied to a Lombok-generated constructor by default. The standing examples are
  `auth/RefreshCookieWriter` and `auth/OAuth2LoginSuccessHandler` — both take a `@Value` parameter,
  so Lombok would silently drop the property binding and inject a bean of that type instead.
- The class needs two constructors.

Do not relocate constructor logic into field initializers or `@PostConstruct` just to qualify for
this rule. A constructor that earns its keep is not a violation.

## 3. `access` is never omitted on a generated constructor

```java
// BAD — public by default. Anyone can now build a half-initialized instance,
//       and a utility class becomes instantiable again.
@NoArgsConstructor
@AllArgsConstructor
public class Thing { }

// GOOD
@NoArgsConstructor(access = AccessLevel.PRIVATE)     // utility class
@NoArgsConstructor(access = AccessLevel.PROTECTED)   // @Entity — JPA needs it, callers do not
@AllArgsConstructor(access = AccessLevel.PRIVATE)    // enum / entity behind a static factory
```
