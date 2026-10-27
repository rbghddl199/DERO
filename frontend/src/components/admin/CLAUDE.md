# admin — admin registration/review pages (`/admin` tree)

Guard: `AdminShell` (MypageShell-style render gate — blocks unknown/loading, 403 screen when role≠admin).
All APIs via `src/api/admin/*` (re-exports generated `openapi.d.ts` types). **Never import `openapi.d.ts`
from a screen — pull types from the admin module.** An endpoint newer than the generated file (regeneration
needs the backend on `local`) gets its response type **hand-declared narrowly inside its own admin module**,
not in `src/types/` and never by editing the generated file — `api/admin/search.ts` is the precedent.

## Persistent issues / traps

- **Reindex lives in two places on purpose.** `/admin/search` (`components/admin/search/`) carries all four
  indexes — products, placements, posts, users — because **boot only creates empty indexes**; the reindex call
  is the only thing that fills them, and skipping it after a deploy leaves search silently at 0 results with no
  error. `SearchReindexButton` stays embedded in the brands screen because brand registration is the recurring
  event that *requires* a product reindex (the Nori dictionary is baked from the brand table, ADR-0019 decision 2).
  Both call the same function; do not "dedupe" by deleting the brands one.

- **Only `adminClient` auto-attaches Bearer** (`src/api/admin/client.ts` — on 401, refreshCoordinator
  reissues once and retries). Global apiClient is NOT wired; replicating this outside admin is separate
  work (`src/api/auth/CLAUDE.md`).
- **Authoring stores (`rigDraftStore`, `lightAuthorStore`) are module singletons with two entry points** —
  dev catalog path (`selectProduct`/`selectSource`) and admin path (`openAssetSource`, arbitrary URL).
  **`closeAssetSource()` cleanup on admin component unmount is mandatory** — omit it and the next
  `/dev/rig`·`/dev/light` visit opens the admin GLB.
- **GLB loader differs per section**: rig authoring = `rigPreview` (no KTX2 — part-seg only; a textured
  GLB fails wholesale), emission judgment = `lightPreview` (KTX2 included). Renderer types differ too —
  no `instanceof` branching (`src/three/CLAUDE.md`).
- **`useMasterList` fetchPage must be referentially stable** (effect deps). Today it is a module
  top-level function, so it is safe — swapping in an inline arrow to pass filter args = refetch loop
  every render; use `useCallback` then. Loading state is derived ("requested key ≠ finished key") —
  reverting to `setIsLoading` inside an effect is blocked by `react-hooks/set-state-in-effect`.
- **Blank field in PATCH means "keep"** — no path to lift a category to root, or to revert desk-texture
  to solid color (map key back to NULL). Category tree select fetches size=500 in one shot; silently
  wrong past 500 rows.
- **Never pass `File.type` straight to presign — some environments give empty string.** Backend only
  checks `contentType.startsWith("image/")` (`ProductImageService`·`AdminBrandService`), so empty →
  400 `PRODUCT_INVALID_IMAGE_CONTENT_TYPE` ("이미지 파일만 업로드할 수 있습니다."). Culprits: extensions
  with no OS MIME registration (webp), drops whose drag source carried no type. **Nothing in the code
  blocks webp, yet only webp looks broken** (2026-08-01). Use `resolveImageContentType(file)` from
  `utils/admin/imageContentType.ts` and put that one value **identically** into the presign request and
  the PUT header (mismatch fails S3 signature verification).
- **Do not guard response fields with `X === undefined` — backend sends `null`.** Generated
  `openapi.d.ts` writes `polygonCount?: number` (optional only, never nullable), but Jackson default
  inclusion is always, so absent values arrive as `null`. Trusting the type, filtering on `=== undefined`
  and then calling `.toLocaleString()` **kills the entire admin detail page with `This page couldn't
  load`** (2026-08-01, right after GLB save — the save succeeded but the screen died, so it looked like
  a failed save). Guard with `== null` (catches null and undefined).
- **Product images are re-encoded in the browser before upload — take all three values from one result.**
  `prepareImageForUpload(file, contentType)` (`utils/admin/imageCompression.ts`) returns `blob`,
  `contentType` and `fileName` **together on purpose**: `contentType` must be identical in the presign
  request and the PUT header (the trap above), and `fileName` becomes the object key extension
  (`ProductImageService.extensionOf` takes the substring after the last dot). Pull any one of them from
  the original `File` instead and you get a signature mismatch or a `.png` key holding webp. It falls back
  to the original for GIF (animation would collapse to one frame), decode failure, and cases where
  re-encoding grows the file — `isCompressed: false` surfaces that as a **warning**, not an error.
  **The constants are coupled to `scripts/webp-backfill.mjs`** (long edge 1280, q82); diverge and
  batch-converted images look different from newly uploaded ones. `tests/imageCompression.test.ts` pins
  the pair. **Only product images are wired** — profile, post and brand-logo uploads still send originals.
- Master file upload order is forced: **create → edit modal** (presign needs the record id). The
  follow-up PATCH relies on "only sent fields are updated" — breaks if the backend drops that semantic.
