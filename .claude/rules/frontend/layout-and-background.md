---
paths:
  - "**/frontend/src/app/layout.tsx"
  - "**/frontend/src/app/globals.css"
  - "**/frontend/src/app/simulator/**"
  - "**/frontend/src/components/layout/**"
  - "**/frontend/src/components/simulator/**"
---

# frontend — root layout, global background, `/simulator` overlay traps

Output language: Korean.

Full narrative behind the one-line rules in `frontend/CLAUDE.md`.

## Four pages have no `bg-paper` wrapper

Page backgrounds are supposed to be declared per `app/**/page.tsx` with a `bg-paper` wrapper, but
`mypage`, `product/[productId]`, `community/[postId]` and `collection/[collectionId]` ride on `body`'s global
`--background` (`globals.css`) with no wrapper — **changing `--background` moves those pages too**
(2026-07-31, found during the all-white `--color-paper` unification).

The exact HEX scale is still "undecided" in `docs/DESIGN-SYSTEM.md` — when the tokens are fixed, update
`globals.css` and `DESIGN-SYSTEM.md` together. Never fill large canvas areas with `primary`/`decor`: the
canvas stays neutral gray so color-harmony judgment stays honest (DESIGN-SYSTEM §1.5). No dark mode — do
not add one until the light-only design system is settled.

## A global layout laid over `/simulator` disappears

`/simulator` is built from `#app`, `#scene` and `.ui-root` all at `position: fixed; inset: 0` covering the
viewport — a global layout (TopNavbar etc.) laid on top is hidden behind the 3D canvas.
`src/components/layout/TopNavbar.tsx` avoids this by not rendering itself on `/simulator` via
`usePathname()` (2026-07-23).

**Always-on global overlays (`WebVitalsOverlay.tsx` and anything else rendered by the root layout) need the
same `usePathname()` exception** so they do not render on `/simulator/thumbnail-render` — otherwise they
are captured into generated thumbnails.

## HUD grid

The simulator HUD prevents overlap with a 3x3 grid on `.screen-sim` (no hardcoded absolute coordinates;
panels in the same cell use flex) — a flex child's `max-height:100%` is ignored when the parent height is
`auto`, so give the grid track a definite height with `align-self:stretch` (the default). Found alongside:
`.hud-save` lacked the `.hud` class and therefore `pointer-events:auto`, a latent bug where the save button
could not be clicked (2026-07-23).
