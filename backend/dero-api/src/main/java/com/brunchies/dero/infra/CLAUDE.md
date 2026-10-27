# infra — external boundary ports

Of the 3 ports named in `package-info.java` (object storage · AI concept image · recommendation
engine), storage and AI concept image are implemented; the recommendation engine is not.
Measurements, ticket numbers and failure narratives behind every trap below are in
`docs/context/backend-runtime.md` §2; the NEVER lines auto-load from
`.claude/rules/backend/storage-and-ai-ports.md` when you edit this package.

**Three properties select implementations, and each needs its own `@ConditionalOnProperty` bean
pair.** `app.storage.mode` picks presign + `StoragePort` (`s3`, or `local` by default, where the WAS
HMAC-signs its own URL and `LocalFileController` moves the bytes); `app.image.generation.mode` picks
the concept-image port (`stub` by default, `gms` for `gpt-image-2` through the GMS proxy);
`app.image.generation.request-type` picks its call path (`edits` multipart by default,
`generations` text-only). **Exactly one implementation per mode** — one unconditional implementation
extra and both beans come up and injection dies at startup, while conditioning only one side causes
the mode-mismatch accident below. `StorageModeTest`·`ImageGenerationModeTest` enforce this.

- Domain services inject **`PresignPort` only**, never a concrete type. Since ADR-0035 they also
  inject `PublicImageUrlResolver` for **image read URLs** — presigned GET remains only for
  non-public objects (GLB · KTX2 · terms MD). The public read receiver is `PublicImageController`
  (`GET /api/v1/images/{*key}`, prefix-whitelisted, `immutable` cache), mode-independent.
- `app.storage.*` keys belong on `StorageProperties`; generation keys on
  `ImageGenerationProperties`. **The latter cannot live on the `image` package's `ImageProperties`
  because `infra` may not import a domain** (`LayerDependencyTest`). Only the prefix sits under
  `app.image`, and `ImageProperties` ignores unknown keys, so there is no clash.

## Traps

- **Spring 7's `SimpleClientHttpRequestFactory` sends chunked when `Content-Length` is absent, and
  the cloudflare in front of GMS answers that with a 400 HTML page — concept images then fail 100%
  in prod, while local and CI both pass.** Wrapping in `BufferingClientHttpRequestFactory` is the
  only fix (`GmsImageGenerationConfig`); `request-type=generations` does **not** save you.
  `GmsRestClientTransferEncodingTest` pins it over a real socket.
- **presign and `StoragePort` must see the same mode — mismatched, rows insert fine and every image
  404s.** The whole guarantee is that both are conditioned on the same `app.storage.mode`, so **add
  new implementations with the condition in pairs.**
- **`S3StoragePort.store` infers `Content-Type` from the key extension** (the port signature has no
  contentType). Without it S3 stores `application/octet-stream` and **a presigned GET downloads the
  PNG instead of rendering it** — API 200, file intact, so it reads as a frontend bug.
  `LocalFileController.download` infers the same way (`S3StoragePortTest`).
  - **That inference runs on `store` only, never on the read path** — a presigned GET returns the
    **stored** `Content-Type` verbatim, which is why a `.png` key holding webp bytes does not break.
    **Read the item above as "the extension decides the served type" and you will wrongly judge the
    webp backfill unsafe.**
- **A multipart file part without a filename goes out as a value part — upstream answers "you sent
  no image".** `ByteArrayResource.getFilename()` is `null` by default, so
  `GmsImageGeneration.screenshotPart()` pins a filename with an anonymous subclass.
- **A fixed output resolution defeats the whole point of `edits` — hence `size: auto` as the
  default.** The screenshot's aspect ratio varies by viewport and dpr, so a fixed `1024x1024` makes
  upstream reframe, crop and recompose however firmly the prompt says "preserve the layout".
  **The symptom looks like "the AI ignores instructions", but the cause is `size`.** Computed by
  `OutputImageSize`; if the PNG cannot be read, send `auto` and keep generating — failing to derive
  a size is no reason to mark the placement `FAILED`.
- **`read-timeout` × `IMAGES_PER_UPLOAD` must stay smaller than `worker.processing-timeout`** —
  `read-timeout` bounds **one request**, so the comparison is against the product; exceed it and the
  sweeper treats the job as lost and the reverted job answers late. **It is also paired with the
  frontend polling ceiling (`PUBLISH_POLL_TIMEOUT_MS`)** — if polling is shorter, users get the
  "refresh to check" notice while generation proceeds normally.
- **`request-type` is a downgrade switch — do not delete it.** Whether the GMS proxy accepts
  multipart is **unmeasured**; if it is rejected, `IMAGE_GENERATION_REQUEST_TYPE=generations` must be
  able to revive concept images without a redeploy. That is also why both paths share response
  handling.
- **Do not assemble a `RestClient` from `RestClient.Builder` inside an implementation's constructor
  — tests silently hit the real network.** Rule and mechanism:
  `.claude/rules/backend/storage-and-ai-ports.md`.
- **Do not use `IllegalStateException` for startup fail-fast — `ExceptionConventionTest` blocks it**
  (ADR-0012 decision 4; the rule is frozen, so only **new** violations go red). Bean creation
  failure is not request handling and not a place for `BusinessException` + an HTTP status; Spring's
  `BeanInitializationException` is the right one.
- **When switching binding style (`@Value` → `@ConfigurationProperties`), search the class javadoc
  too** — grep the old annotation name in javadoc and fix it in the same change.
- **`@Lazy` on a `@Bean` is nullified when the injection point is non-lazy.** All 4 were deleted and
  `S3Config` became conditional on `mode=s3`. **Wanting `@Lazy` to defer a startup failure means a
  condition is missing** — failure then moves to startup, which is the point, since prod-only config
  omissions have surfaced only at deploy.
- **`StoragePort` is never called from a domain.** A domain knows only `PresignPort` (+
  `PublicImageUrlResolver`); bytes are touched only inside `infra` — `LocalFileController`
  (mode=local presign receiver) and `PublicImageController` (ADR-0035 public image read, both
  modes). (`StoragePort.delete(key)` still has no caller — added ahead of one.)
- **The controller taking `{*key}` is the only defense against path traversal.**
  `LocalFileStoragePort` resolves the key straight through `baseDir.resolve(key)`. Remove the `..`
  rejection in `LocalFileController.verified()` and files outside `app.storage.local-dir` become
  readable. **Signature verification does not cover this** — it only answers "did we issue this URL"
  and never inspects the key's content.
- **`mode=local` signing rules are written in exactly one place, `LocalFileSigner`.** Give issuing
  (`LocalPresignService`) and verification (`LocalFileController`) their own copies and fixing one
  side **still compiles** while every URL becomes 403. The signed payload is
  `method + "\n" + key + "\n" + exp` and **the separators are required** — plain concatenation makes
  `key="a1", exp=234` and `key="a12", exp=34` the same string, which lets expiry be stretched
  (`LocalFileSignerTest.서명_경계_모호성` pins it).
- **The port name in `package-info.java` does not match the real interface name** — the doc calls it
  `ObjectStorage`, the interface is `StoragePort`, so a search can fail to find it. Not renamed; get
  박동규's confirmation first.
