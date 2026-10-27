---
paths:
  - "**/src/main/resources/application*.yaml"
  - "**/src/test/resources/application*.yaml"
  - "**/.env.local*"
---
# DERO Spring Config Rules

Output language: Korean.

Evidence, measurement dates and ticket numbers live in `docs/context/backend-runtime.md` §1 and
`docs/context/observability.md`. This file holds only what prevents the mistake while a profile
file is open.
(Over 300 words on purpose: 5 profile-scoped constraints, and an editor with one profile file open
can violate any of them — the Elasticsearch and pool ones wipe production data or hang CI silently.)

## 1. What `application.yaml` may and may not hold

- It already carries the shared JPA values fixed by ADR-0006 — `ddl-auto: validate` ·
  `open-in-view: false` · `default_batch_fetch_size: 100`. **Do not loosen them.**
- **datasource and redis blocks are deliberately absent.** They are injected by the 3 profile files
  (`application-local.yaml`, `application-prod.yaml`, `application-test.yaml`) and by root
  `.env.local` → compose interpolation (ADR-0010). A URL or credential written into the shared file
  **silently overrides** per-profile injection.

## 2. Actuator and metrics

- **Actuator is at `/api/actuator`**, not the default `/actuator`
  (`management.endpoints.web.base-path`). nginx forwards only the `/api` prefix.
  **Change that path and change `Jenkinsfile`'s `wait_for` in the same commit** — Verify bypasses
  nginx and hits `127.0.0.1:8081` directly, so the next deploy retries a 404 and times out.
- **Metrics export is opt-in in Boot 4.1.** The `micrometer-registry-prometheus` dependency plus
  `prometheus` in `management.endpoints.web.exposure.include` is **not enough**: without
  `management.prometheus.metrics.export.enabled: true` the registry bean is never created and
  `/api/actuator/prometheus` answers **404 with no exception and no warning**. Boot 3 tutorials do
  not carry that line. `PrometheusEndpointTest` locks all three together.

## 3. Elasticsearch — an unset URI points at production over an open tunnel

`spring.elasticsearch.uris` unset means Boot's default `localhost:9200`, which on a machine running
`ssh -L 9200 ...` **is production ES**. `application-test.yaml` pins it to the closed port
`http://127.0.0.1:1` for exactly that reason — **never remove that line**.
**`application-local.yaml` is not guarded yet**, so `bootRun` on a tunnelled machine walks the same
path.

## 4. Test profile: connection pool

`spring.datasource.hikari.maximum-pool-size: 4` in `application-test.yaml` is load-bearing. Each
Spring test context opens its own Hikari pool and the default is 10, so raising it (or adding a
context) overruns the container's `max_connections` and later contexts die with
`FATAL: sorry, too many clients already` hidden inside `Failed to load ApplicationContext`.
Tests are single-threaded; 4 is enough.

## 5. OAuth registration entries

- **Fill `.env.local` registration entries wholly or leave them wholly empty.** A partially filled
  provider kills boot with `Client id of registration 'kakao' must not be empty.`; a missing file
  boots fine. Entry list: `.env.local.example`; rationale ADR-0010.
- **Prod has no "leave empty" option** — `application-prod.yaml` declares all 4 providers
  unconditionally as `client-id: ${OAUTH_KAKAO_CLIENT_ID}`. Missing keys fail loudly at
  `docker compose up`; an **empty string is the quiet path** and surfaces only at the message above.
  Fill values, never clear them.
- **`{baseUrl}` resolves to http behind the proxy unless `server.forward-headers-strategy` is set.**
  nginx terminates TLS and forwards plain HTTP, and Boot defaults to `NONE`, so
  `redirect-uri: "{baseUrl}/api/login/oauth2/code/{registrationId}"` assembles as `http://...` and
  providers reject it as an unregistered redirect URI. `prod`-profile-only, so local, CI and tests
  all pass. Diagnose the scheme directly:
  `curl -sD - -o /dev/null https://www.dero.life/api/oauth2/authorization/kakao | grep -i location`.
- **`.env.local` is resolved against the JVM working directory.**
  `spring.config.import: optional:file:./.env.local[.properties]` and the file lives in
  `backend/dero-api/`. `bootRun` defaults there (correct); an IDE Run Configuration pointing at repo
  root does not, and `optional:` skips it **with no warning** — only social login quietly breaks.
