# src/api — mock ↔ real switching convention

Inherits `frontend/CLAUDE.md`. The only contact point with the backend — components never call `fetch`/`apiClient` directly. Endpoint shapes and params live in `docs/context/api-spec.md`; the full per-domain contract (endpoint paths, ticket numbers, deleted alternatives) is in `docs/context/api-spec.md` §12–13. This file holds the switch convention and what breaks silently.

## The switch

- **`NEXT_PUBLIC_API_MODE`** (`.env.local`, default `mock`), read via `isMockApi()` in `src/constants/api.ts`. One switch for all domains — do not add per-domain flags.
- The real-only domains have no mock branch and never read it. That is the target state; leave them.

## Pattern — branch in the function, not port/adapter

Domains needing mock↔real branch inside the function: `isMockApi() ? getMockX() : getRealX()` (see `product.ts`). Do not copy the `port.ts` + `actualAdapter.ts` shape from `src/api/auth/` — auth needs it for state and DI (`accessTokenHolder`, injected `navigate`, the never-resolving `authorize()`), not for method count. Interface + factory over 1–3 pure functions is ceremony nobody asked for.

## Shared error parsing

`parseApiProblemDetail(value)` in `src/utils/problemDetail.ts` validates the ADR-0008 `ProblemDetail`; `request()` in `client.ts` uses it for `ApiError.problem` in every domain. Auth (`src/utils/auth/problemDetail.ts`) only adds the `type` default — new domains never handle `type`.

- **Do not fail-closed on a body without an `errors` key.** `GlobalExceptionHandler` adds `errors` **only for validation failures**, so 401/403/404/409 bodies have none. Requiring it returned `null` for all of them and **the Korean `detail` and the `code` the frontend branches on vanished together** — invisibly, nothing thrown (`AUTH_SESSION_REVOKED` was misread as ordinary expiry). Before requiring a new field, confirm `ProblemDetails.of` puts it on **every** response (2026-08-01, fixed).

## Server search has no fallback anywhere (ADR-0019 · ADR-0027)

`q=` reaches the server in product, collection and community. On 503 show the error — **never render 0 results**. The code differs per domain (`PRODUCT_SEARCH_UNAVAILABLE`, `PLACEMENT_SEARCH_UNAVAILABLE`, `POST_SEARCH_UNAVAILABLE`). Desk feed has no `q=` at all (server search is a follow-up).

## Idempotent toggles need a re-read

Like/bookmark (`interaction.ts`) and follow (`user.ts`) answer **204 with no body**, so callers re-confirm with a GET — client-computed counts drift on rapid clicks. Bookmark save and group move are one PUT: an empty body only adds, **`{groupId: null}` silently unassigns**, so cards without a group picker use `putPlacementBookmarkKeepingGroup`.

## Per-domain state (keep current)

| Domain | File | State |
|---|---|---|
| Auth | `auth/actualAdapter.ts` | real only (port/adapter) |
| Onboarding (terms, nickname) | `onboarding.ts` | real only. Onboarding-complete rides `UserSession.onboardingRequired` (auth adapter), not here |
| Placement save/list/upload | `placement.ts`, `craft.ts` | real only. **`/craft` must pass `owner: 'me'`** — the list is optionally authenticated, so omitting it silently returns "everything public + mine". **`PUT feed-entry` returns 202 with no body**: success means "queued", the global poller `common/UploadWatcherBootstrap.tsx` watches `publishStatus`, and **retry is the same PUT**. Remix needs the server to do the copy or `sourcePlacement` is never recorded |
| Product image upload | `productImage.ts` | real only |
| Desk template cards (`/craft/new`) | `getDeskTemplates` in `product.ts` | mock/real branch |
| Full catalog (simulator) | `getDeskTextures`/`getProductPage` in `product.ts` | mock/real branch, cursor pages of 20 via `useCatalogPage`. **Category ids are hardcoded from the live DB tree; the repo seed `product-catalog-seed.sql` is stale** — seeding those ids returns 0 products everywhere. One root id per group (`categoryIdsOf()` guards duplicates); `constants/productCategoryGroup.ts` is canon and `GET /categories` is never called. **The consumer is the engine, not this layer** — `setCatalog()` runs only from `initEngine`, so pages that never boot the simulator still see mock `PRODUCTS` |
| Product list/detail | `components/product/ProductGrid.tsx` (list, client), `app/product/[productId]/page.tsx` (detail, server) | mock/real branch. Client cursor paging, so **search/sort/like filters only cover loaded pages** (accepted trade). Detail is a Server Component; ARM measurement falls back to `ARM_FALLBACK_DIMS_MM`. `getProductById` also serves collection "used items" |
| Collection list | `collection.ts` | real only. Tag writes use `replacePlacementTags`, **never a second `PUT .../feed-entry`** (that re-runs the publish gate and burns image quota). **The cover is only `primaryImageUrl`**; the summary's `thumbnailUrl` (3D screenshot) is for workspace cards. Bookmark counts have no endpoint and stay 0 |
| Community posts | `post.ts` (raw) + `community.ts` (view-model seam) | real only. `community.ts` only maps DTOs → `CommunityPost`; writes/uploads use `post.ts`. **Image presign requires the post to exist first** — `POST /posts` → upload → replace blob URLs → `PUT`. The list has no per-user `liked` and no bookmarks at all: list hearts come from the local override store |
| Desk feed (실사진) | `deskFeed.ts` | real only. 전용 `/desk-feeds` 한 벌(D32·ADR-0033) — 마커 해시태그·매퍼는 2026-08-10 폐기. `?q=` 없음: 목록 필터는 `?sort=`·`?hashtag=`·`?placementId=`(역방향)뿐. **`PUT`에 `imageKeys`가 없다** — 사진 순서 정본은 본문 마크다운이고, 등록은 `POST .../images`(key 하나), 삭제는 `DELETE .../images/{imageId}`다. `PUT`의 `placementId: null`은 첨부 해제(부분 갱신 아님). 사진별 제품 태그는 `PUT .../images/{imageId}/products` 전체 교체 |
| Community comments | none | No endpoint in the contract — session memory only (`store/communityCommentsStore.ts`). Placement comments (`comment.ts`) are a different resource |
| My liked products | `getLikedProducts` in `product.ts` | real only (🔒). Sole consumer is `syncFromServer()` in `store/productLikesStore.ts`, which overwrites localStorage at boot. **Keys differ per mode**: mock `'monitor-27'`, real `'27'` |
| Like / bookmark toggle | `interaction.ts` | real only — see "Idempotent toggles" above. Post likes exist as functions with no consumer |
| Bookmark group CRUD | `bookmark.ts` | real only. **The list of bookmarked placements is not here** — it is `GET /placements?bookmarked=me`, and `bookmarkGroup` on its own is 400 |
| Placement comments | `comment.ts` | real only. Only the list GET returns 200 when logged out |
| Profile / follow / profile image / image quota | `user.ts` | real only. `UserProfileResponse.following` is **always false when logged out**, indistinguishable from "not following". Self-follow is 422, so the button is not rendered. Types are hand-written in `types/user.ts` |
| Cart | none (**deliberately deleted**) | Backend `/cart-items` and the `cart_item` table are alive, but no frontend code calls them. **Do not "restore" the frontend on sight of a dead API** — reviving means `git revert` of that commit, and ask 박동규 first |
| Compatibility judgment | `compatibility.ts` | real only. **There is no mock branch because in mock mode it is never called** — mock spec ids are not backend `product.id`; that gate lives in `simulatorStore.confirmMountWithServer`. `collision.ts` stays as the 0ms mirror, overwritten when the server responds (ADR-0004, ADR-0009 결정 6) |
| Recommendation judgment | none | `POST /recommendations` and `POST /compatibility/alternatives` have 0-line backend controllers |
