---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/components/**/*.js"
  - "**/app/**/*.ts"
  - "**/lib/**/*.ts"
  - "**/middleware.ts"
---
# React & Next.js Patterns

Architecture prohibitions only. The RSC boundary is canonical in [coding-style.md](coding-style.md)
§Server / Client Boundary, hook rules in [hooks.md](hooks.md), performance in the
`react-performance` skill. The pattern catalog (container/presentational, compound components,
caching layers, form libraries, portals) and the recommendations for libraries this repo does not
install (TanStack Query, SWR) were deleted (rules-diet 2026-08-14) — recommending an absent
dependency produces wrong code.

## No Route Handlers, No Server Actions

The backend of this project is Spring Boot 4; Next.js is the client only. Do not add `route.ts`
files or `'use server'` actions. Mutations and queries go to the Spring API through a typed module
under `src/api/`.

## Data Fetching

- Set caching explicitly on every `fetch` (`cache`, `next.revalidate`). The implicit default has changed between Next majors — relying on it becomes a stale-data bug at upgrade time.
- Independent fetches run through `Promise.all`. Sequential `await`s create request waterfalls.
- Never duplicate server state into a client store — the copy ages against its source.

## Middleware

- Middleware is a UX-level gate, **not** an authorization check. It can only see cookies, not verify permissions — re-verify in the backend.
- Set an explicit `matcher`. Without one it runs on static assets too.
- No database calls, no heavy dependencies. Middleware has a constrained runtime.

## Lists

- Never use the array index as `key` for a list that can reorder, insert, or delete — child state attaches to the wrong row.

## Fonts

- `next/font` only. No `<link>` to a font CDN: `next/font` self-hosts and eliminates the layout shift.
