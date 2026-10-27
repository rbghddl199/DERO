---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/components/**/*.js"
  - "**/hooks/**/*.ts"
  - "**/hooks/**/*.js"
  - "**/app/**/*.ts"
  - "**/next.config.*"
  - "**/middleware.ts"
  - "**/instrumentation.ts"
---
# React & Next.js Coding Style

Only what a `.tsx` / `app/` / `next.config` turn can break without a review catching it. The `src/`
folder layout is `frontend/CLAUDE.md`'s call; naming, JSX and file-extension catalogs were deleted as
model default knowledge (rules-diet 2026-08-14).
(Over 300 words on purpose: the boundary section is seven independent silent failures — client
bundle bloat, a server module shipped to the browser, a prerender crash — and each bullet guards a
different one.)

## Server / Client Boundary

Server Component is the default. Add `'use client'` only for state, effects, refs, event handlers,
browser APIs, or a client-only dependency.

- The `'use client'` directive goes on line 1, before every import.
- Put `'use client'` on the **leaf**, never on a layout — a client layout pulls its whole subtree into the client bundle.
- `async` components are server-only. A Client Component takes data as props or through a hook.
- Only serializable values cross the boundary: no functions, class instances, or live objects. Pass plain JSON.
- Never import a Client Component file from inside a `'use server'` action file, and never re-export server-only code through a client module — the bundler includes it silently.
- Mark server-only modules with `import 'server-only'` so a stray client import fails the build. The package is not installed in this repo — add it on first use.
- A module that touches `window` at import time must be loaded with `next/dynamic(..., { ssr: false })` from a `'use client'` wrapper file. `'use client'` alone still prerenders on the server, and `ssr: false` is legal only inside a Client Component — calling it from a `page.tsx` that has no `'use client'` is a build error. The 3D simulator is the worked example in this repo.

## Routing

- App Router (`src/app/`) only. This repo has no `pages/` — do not introduce it. Two routers means two layout models and two data-fetching models in one codebase.
- Internal navigation goes through `next/link` and `next/navigation`. Never a raw `<a>` for an internal route (full document reload), never `next/router`.
- Every `page.tsx` exports `metadata` or `generateMetadata`. A missing title is a real defect, not a style nit.

## Types and State

- Component props: `type Props = {}`. Use `interface` only for declaration merging or an exported public extension point. Never `React.FC`.
- Take external or untrusted input as `unknown` and narrow it (the `no any` rule itself is canonical in `frontend/CLAUDE.md`).
- Zustand (`src/store/`) is the store. Do not add a second store library.

## next.config

- Never set `typescript.ignoreBuildErrors` or `eslint.ignoreDuringBuilds`. Silencing the build hides the defect instead of fixing it.
