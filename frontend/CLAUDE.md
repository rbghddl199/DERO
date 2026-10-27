# frontend — Next.js web client + 3D simulator

Inherits root `CLAUDE.md` + `docs/context/3d-scene.md`; conventions auto-load from rules frontmatter.

## Code routing — read the matching file/doc first
| Task | Read |
| --- | --- |
| 3D engine overall (scene, lighting, placement, collision, materials) | `src/three/` + `src/three/CLAUDE.md` |
| Simulator screen mount, SSR avoidance | `src/components/simulator/` + `src/app/simulator/page.tsx` |
| Simulator HUD (top toolbar, left rail, right selection panel) | `src/components/simulator/CLAUDE.md` |
| Compatibility judgment | `src/three/core/collision.ts` (0ms mirror) + `src/utils/serverJudgment.ts`·`src/api/compatibility.ts` (server canon) + `docs/context/compatibility.md` |
| GLB asset registration / compression | `docs/context/asset-pipeline.md`·`glb-rendering-guide.md` |
| Load-performance numbers · render/bundle rules | `node ../scripts/perf-trace-report.mjs <DevTools trace>` — never hand-read `encodedDataLength` (header comment explains why) + `react-performance` skill (not 3D — 3D는 `simulator-3d-scene` 스킬 → `docs/context/3d-scene.md`) |
| UI motion clip asset | `public/assets/motion/CLAUDE.md` |
| Unit tests / e2e scenarios | `tests/*.test.ts` / `e2e/CLAUDE.md` |
| Color, glass, icon tone | `src/app/globals.css` + `docs/DESIGN-SYSTEM.md` |
| Landing-page-only components | `src/components/home/` + `src/components/home/CLAUDE.md` |
| Global/common components (toast, filter, transition) | `src/components/common/` + `src/components/common/CLAUDE.md` |
| Product catalog, category nav (/product) | `src/components/product/CLAUDE.md` |
| My deskterior list/create (/craft, /craft/new) | `src/components/craft/CLAUDE.md` + `src/app/craft/` + `src/api/craft.ts`·`placement.ts`·`product.ts` |
| Community list/detail/write (/community, /community/new) | `src/components/community/CLAUDE.md` + `src/app/community/` |
| Collection gallery/detail/import (/collection, 옛 desk feed) | `src/components/collection/CLAUDE.md` + `src/app/collection/` |
| Desk feed real-photo gallery/upload/detail/edit (/desk-feed, 전용 `/desk-feeds` API) | `src/components/desk-feed/CLAUDE.md` + `src/app/desk-feed/` + `src/api/deskFeed.ts` |
| Login/signup integration (social OAuth, JWT) | `src/api/auth/CLAUDE.md` + `src/api/auth/actualAdapter.ts`·`src/components/auth/` + `docs/adr/0005-auth-social-oauth-jwt-rotation.md` |
| Onboarding (nickname, terms consent) screens + wiring | `src/components/onboarding/` + `src/app/onboarding/` + `src/api/onboarding.ts`·`src/utils/auth/onboarding.ts` + `docs/context/api-spec.md` §3 |
| Other users' profile, follow lists (/users/[userId]), image quota display | `src/components/user/` + `src/app/users/[userId]/` + `src/api/user.ts` + `src/hooks/useImageQuota.ts` |
| Admin registration/review pages (/admin) | `src/components/admin/CLAUDE.md` + `src/app/admin/` + `src/api/admin/` |
| Unsaved-changes exit guard (draft forms, simulator) — link click, tab close, browser back | `src/hooks/CLAUDE.md` (`useUnsavedDraftGuard.ts`, `useHistoryBackGuard.ts`) |
| Feature status / done check, terminology and naming | `docs/SPEC.md` (`/sync-spec`) / `docs/GLOSSARY.md` |

## Commands (from `frontend/`)
- `npm run build` / `npm run typecheck` / `npm run lint` / `npm run format:check`
- `npm test` — one `vitest run`. **`npm run test:watch` and `npm run dev` never finish — do not use them for verification.**
- `npm run test:e2e` — playwright. Kill the dev server and QA Chrome first (contention trap in `e2e/CLAUDE.md`).

## Rules
- New `src/` code by role: env/constants in `constants/`, pure functions in `utils/`, global state in `store/` — never inlined in a component. Under `components/` and `assets/`, only global/common lives in `common/`; the rest splits by domain/page.
- Every file opens with a one-line comment saying what it does. No `any`, lowercase folder names, `@/` absolute imports.
- Color tokens are `@theme inline` in `src/app/globals.css` (HEX scale still undecided — update with `docs/DESIGN-SYSTEM.md` together). Never fill large canvas areas with `primary`/`decor`; no dark mode. Page backgrounds go in `app/**/page.tsx` behind a `bg-paper` wrapper — **four pages have none and ride `body`'s `--background`** → `rules/frontend/layout-and-background.md`.

## Per-folder traps (read that `CLAUDE.md` too)
- `src/three/` — lighting SI units, postfx exposure, OBB, procedural geometry
- `src/components/simulator/` — HUD popup / glass / render-phase rules
- `src/components/craft/` — catalog vs product-API id mismatch, `thumbnailUrl` truthy trap
- `src/components/community/` — react-markdown sync export, fields shared with mypage
- `src/components/collection/` — mock metadata vs placement API, "used items" canon
- `src/api/` — mock↔real switch, ProblemDetail parsing, per-domain table
- `src/api/auth/` — `authorize()` never resolves, window DI, missing `type`
- `e2e/` — auth stubs, coach-tour seed, rail testids, suite contention
- `public/assets/motion/` — orphan motion clip, ffmpeg rebuild recipe
- `src/components/home/` — landing R3F mini-scene (Canvas camera lookAt)
- `src/components/common/` — AnimatePresence dead on App Router nav, `@layer` nesting
- `src/components/product/` — category icons in `src/assets/product/`, SVG fallback
- `src/hooks/` — history-sentinel trick for browser-back exit guards

## Build traps (this folder's config files) — narratives in `.claude/rules/frontend/`
- **Prettier is not enforced (`format:check` fails on 53 files)** — `--check` new files only, never `--write` an old one, never pipe through `tail`; an unasked auto-formatter adds semicolons, so re-read `git diff` before committing. → `formatting.md`
- **A derived array/object inside a zustand v5 selector re-renders forever**; `persist` needs `skipHydration` + bootstrap `rehydrate()`, tagged `Map`/`Set` storage, `version`+`migrate`, one `sessionScopedInitial()` factory. → `store-persistence.md`
- **`npm run typecheck` on a fresh checkout throws ~32 phantom `TS2307`** until `npm run build` generates `next-env.d.ts`; it needs `--max-old-space-size=4096`, QA scratch must not be `.ts`, react stays pinned `19.2.x` (R3F peer `<19.3`), three's types come only from `@types/three`, and `src/types/openapi.d.ts` is generated by `npm run api:types` against a `local`-profile backend (ADR-0008). → `build-config.md`
- **`output: 'standalone'` ships neither `public/` nor `.next/static`** (Dockerfile needs `COPY`s + `ENV HOSTNAME=0.0.0.0`), and **`.next/cache` must be chowned to the runtime user before `USER`** or next/image silently runs with no cache at all; a `package.json` merge leaves stale Turbopack chunks only `rm -rf .next` fixes. → `build-config.md`
- **Anything the root layout always renders must skip `/simulator` via `usePathname()`** — `#app`/`#scene`/`.ui-root` are `position:fixed; inset:0`, so it hides behind the canvas or leaks into `thumbnail-render` captures. → `layout-and-background.md`
- **Canvas capture attaches to `next build && next start`, never `next dev`**, needs `alpha:true` + SwiftShader flags, judges pixels on a color axis in one page load, and treats `qa-artifacts/` as partly force-tracked, PNG-free and volatile. → `canvas-capture.md`
