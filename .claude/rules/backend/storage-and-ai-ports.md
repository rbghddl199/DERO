---
paths:
  - "**/com/brunchies/dero/infra/**/*.java"
  - "**/com/brunchies/dero/image/**/*.java"
  - "**/compose*.yaml"
  - "**/scripts/webp-backfill.mjs"
---
# Storage, presign and AI image ports

Output language: Korean.

Evidence, measurements and failure narratives live in `docs/context/backend-runtime.md` §2.
This file holds only what prevents the mistake while this package is open.

- **Domains inject `PresignPort` only** — never a concrete type, and **never call `StoragePort`
  from a domain**; only `LocalFileController` touches bytes.
- **New storage/presign implementations carry the `app.storage.mode` condition in pairs** — presign
  and `StoragePort` must see the same mode, exactly one implementation per mode
  (`StorageModeTest`·`ImageGenerationModeTest`). Mismatched, rows insert fine and every image 404s.
- **Build the finished `RestClient` as a bean and inject it** (`GmsImageGenerationConfig` →
  `GmsImageGeneration`) — assembling from `RestClient.Builder` inside an implementation constructor
  overwrites `MockRestServiceServer`'s mock factory and the test **silently hits the real network**.
- **Startup fail-fast throws `BeanInitializationException`, never `IllegalStateException`**
  (`ExceptionConventionTest`, ADR-0012 decision 4; frozen — only new violations go red).
- **Never remove the `..` rejection in `LocalFileController.verified()`** — it is the only
  path-traversal defense; signature verification never inspects the key's content.
- **Signing rules live in `LocalFileSigner` alone** — never copy issue/verify logic into
  `LocalPresignService`/`LocalFileController`; the signed payload's `\n` separators are required
  (`LocalFileSignerTest.서명_경계_모호성`).
- **Never delete the `request-type` downgrade switch** — GMS multipart acceptance is unmeasured;
  `generations` must be able to revive concept images without a redeploy.
- **Keep `read-timeout` × `IMAGES_PER_UPLOAD` < `worker.processing-timeout`** — exceed it and the
  sweeper treats the job as lost; also paired with the frontend polling ceiling
  (`PUBLISH_POLL_TIMEOUT_MS`).
