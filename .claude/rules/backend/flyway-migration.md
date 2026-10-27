---
paths:
  - "**/src/main/resources/db/migration/*.sql"
  - "**/*MigrationTest.java"
---
# DERO Flyway Migration Rules

Output language: Korean.

Evidence and measured incidents live in `docs/context/backend-runtime.md` §1. This file holds only
what prevents the mistake while a migration or its test is open.

## 1. `V1__baseline.sql` is frozen — write a new version instead

Enforced by `.claude/hooks/flyway-v1-freeze.sh`, not by this line (HARNESS-RULES §4). Write a new
version; from V2 onward migrations apply on the next boot with **no local volume reset**.

If a checksum mismatch is already blocking a boot, the recovery and its incident history are in
`docs/context/backend-runtime.md` §1-8.

## 2. A migration test with no `target` applies every version written later

`migrate()` without `target` runs the whole remaining chain, so a test set up at `target("7")`
exercises V8 **and** everything added after it. That is usually what you want (it proves the chain
still lands), but it means **a future migration can break a test whose name mentions only an old
version**, and an assertion touching a column a later migration drops fails with a confusing
"column does not exist".

- Assert on the columns the migration under test **creates**.
- Pin `target(...)` on **both ends** when the test cares about one step in isolation.
