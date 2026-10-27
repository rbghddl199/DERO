---
paths:
  - "**/src/test/**/*.java"
---
# DERO Backend Test Rules

Output language: Korean.

Evidence, measurement dates and ticket numbers live in `docs/context/backend-runtime.md` §1.
This file holds only what prevents the mistake while a test is open.
(Over 300 words on purpose: §2's fixed-id code example eats the words — without the example the trap comes back.)

## 1. Test layering

Entities and pure logic → unit tests with **zero Spring context**; persistence and CRUD →
Testcontainers integration; API → e2e. Outside-in TDD.

- **No H2.** JSONB columns mean integration tests need real Postgres. Containers run with
  `reuse=true`, so each developer needs `testcontainers.reuse.enable=true` in
  `~/.testcontainers.properties`.
- **e2e does not honour `@Transactional` rollback** — isolate by truncate, and call `flush()`
  before asserting.
- Redis integration tests extend `AbstractRedisIntegrationTest`; Redis is deliberately not stacked
  onto the Postgres base so queue-less tests do not pay the container cost. `@ServiceConnection` is
  unusable (Boot 4.1 `spring-boot-testcontainers` ships no Redis `ConnectionDetailsFactory`) — wire
  it with `@DynamicPropertySource`.

## 2. Teardown is plain `TRUNCATE ... CASCADE` — never `RESTART IDENTITY`

A reset sequence + the pooled optimizer hands later classes **negative primary keys**, which break
only when an id must survive as text (mechanism and the measured failure:
`docs/context/backend-runtime.md` §1-1). 18 test classes truncate today, so **do not assume the
sequence is clean** — a test whose id ends up inside a string must pin the row itself:

```java
// GOOD — id the sequence can never reach, so the token text is deterministic
private static final long MENTIONED_ID = 900_001L;
jdbc.update("""
		INSERT INTO "user" (id, email, provider, provider_id, nickname, status, role, created_at)
		VALUES (?, 'desk@example.com', 'KAKAO', 'p-desk', '책상주인', 'ACTIVE', 'USER', now())
		""", MENTIONED_ID);
```

## 3. Never assert on `/api/actuator/health`

It is 200 or 503 depending on whether the developer's **host** redis container is up:
`application-test.yaml` configures no Redis, so `RedisHealthIndicator` falls back to
`localhost:6379`, outside Testcontainers. The same test flips with no code change, and the response
body shows no component detail (`show-details` defaults to `never`). If a warm-up request is what
you need, perform it and ignore the status.

## 4. The ArchUnit freeze baseline shrinks itself — a "violations so far: N" javadoc rots silently

`freeze.store.default.allowStoreUpdate=true`, so fixing one violation deletes that line from
`src/test/resources/archunit_store/<uuid>` while the javadoc beside the rule keeps the original
count. **Count remaining work from the store file, not the comment** (`stored.rules` maps rule name
→ uuid). When the last one is cleared, unfreeze the rule and delete both the baseline file and its
`stored.rules` line — an empty baseline is a place for a future regression to be absorbed silently
(`archunit.properties` principle).
