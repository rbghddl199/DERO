---
paths:
  - "**/com/brunchies/dero/image/**/*.java"
  - "**/com/brunchies/dero/placement/**/*Upload*.java"
  - "**/src/main/resources/application-prod.yaml"
---
# Upload and image generation pipeline

Output language: Korean.

Evidence, history and discarded alternatives live in `docs/context/backend-runtime.md` §3;
endpoint contracts (feed-entry retry semantics, tags endpoint) are canon in
`docs/context/api-spec.md` §4. This file holds only what prevents the mistake while this package
is open.
(Over 300 words on purpose: each of the 10 NEVER lines prevents its own accident — narrative and history already moved out.)

- **Enqueue in `afterCommit`** — inside the transaction the worker picks up a still-`PRIVATE`
  placement and drops the job. Inverted in tests: a `@Transactional` MockMvc test never commits, so
  use `Propagation.NOT_SUPPORTED` + truncate isolation.
- **Idempotency guard on the consume side only** (`publish` no-ops unless `PENDING`) — **never
  guard in `requestFeedEntry`**; blocking re-enqueue makes a `PENDING`-with-empty-queue placement
  unrecoverable by any user action.
- **Never delete `@Transactional(propagation = NEVER)` on `publish`, and never swap it to
  `NOT_SUPPORTED`** — deleting revives the class-level `readOnly = true` (INSERTs silently vanish,
  300s connection hold); `NOT_SUPPORTED` merely suspends a future caller's transaction, which still
  owns its connection. Locked by `GeneratedImagePublishTransactionTest`.
- **Queue ops fail toward duplication, never loss** — `requeueStale` pushes to the waiting list
  **first**, removes from processing after; `complete` clears the claim timestamp first.
- **`complete`/`requeueStale` LREM with the original payload string** — never re-serialize; one
  character of drift leaves a ghost the sweeper resurrects forever.
- **After `demotePrimaries`, re-read the placement** — the bulk UPDATE clears the persistence
  context and the following `markPublished()` misses dirty checking.
- **`IMAGES_PER_UPLOAD` is the one source of truth** — never write the number anywhere else, and
  never "simplify away" the port's `count`, `GmsImageGeneration`'s loop, or the frontend's 2-column
  grid; keeping them is what makes going back to N a one-line change.
- **Read placements under judgment via `PlacementRepository.findForJudgmentById`** — a LAZY proxy
  makes `PlacementJudge`'s `instanceof` branches silently false; symptom is a fake
  "zero violations" pass, not an exception.
- **Changing generation mode must never require editing this package** — "how images are made" sits
  behind `infra/ImageGenerationPort`; the stub↔GMS switch is `app.image.generation.mode` alone.
- **`ImagePublishQueue` touches only its own 3 keys — no global commands like `FLUSHDB`** (Redis
  also holds refresh tokens), and **no presigned URL in queue messages** (presign has a TTL, queue
  wait has no upper bound).
