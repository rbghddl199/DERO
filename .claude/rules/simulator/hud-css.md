---
paths:
  - "frontend/src/three/bootstrap/style.css"
---

Output language: Korean

# simulator HUD stylesheet (`three/bootstrap/style.css`)

(Over 300 words on purpose: `three/bootstrap/style.css` is outside every folder `CLAUDE.md`'s
auto-load scope, so this file is the only path-scoped carrier — and each rule below fails silently,
producing a plausible-looking style that a diff review passes.)

## Scrollbars

- **Adding any new `overflow-y:auto` selector means adding it to the 3 webkit rules AND the
  `@supports not selector(::-webkit-scrollbar)` list** in the same change — the bar must match
  the site-wide one (`common/ScrollProgress.tsx`).
- **Declaring standard `scrollbar-color`/`scrollbar-width` on the same element makes Chromium
  discard all of that element's `::-webkit-scrollbar-*` rules** (measured Chrome 148: 12px → 15px
  default, colors ignored) — keep the standard props inside the `@supports not` block only.
- **`::-webkit-scrollbar-thumb:hover` must re-declare `background-clip:content-box`** — redeclaring
  the `background` shorthand resets it and the thumb fattens 6px → 12px on hover.
- **Use the globals.css Tailwind theme tokens, not the HUD `--primary`/`--select-accent`** or the
  two bars diverge. The 4px visible width is `12px - border*2` — keep the transparent border +
  `background-clip:content-box` pair when changing either.
- **The vertical border is 16px on `.hud-gallery`/`.estimate-panel-body`/`.editor-selected-panel`
  and 4px on `.editor-rail-flyout` — an intended exception, don't "unify" it.**

## Layout

- **`.lib-grid` is flex, not grid** (`flex-wrap` + `justify-content:center`, `.lib-card`
  `flex: 0 0 calc(50% - 4px)`) — grid can't center a lone last-row card, `1fr` tracks leave no free
  space. **`.lib-card:only-child` keeps `margin-right:auto`** (auto margins consume free space
  before `justify-content`). Applies wherever `.lib-grid`/`.lib-card` are reused.
- **`EstimatePanel` and `SelectedItemPanel` stay flex children of `.editor-right-column`**
  (`top:84px`~`bottom:20px`, estimate first, selection second with `margin-top:auto`, both
  `flex-shrink` + `min-height:0` + `overflow-y:auto`). **A new always-visible right-side panel goes
  in this column, never a new `position:absolute` box** — "has items" and "has selection" are
  unrelated conditions and absolute boxes overlapped. `flex:1 1 0` on the selected panel was tried
  and reverted (grow leaves a gap under it).

## Authoring

- **A className present in JSX with no matching CSS rule is invisible** — commit the rule in the
  same change; "style it later" means never.
- **Equal-specificity overrides win by source order** — a `.foo` override of `.modal-card` (both
  0-1-0) must come *after* it, and both parse fine so only computed styles reveal it. Raise
  specificity with a doubled selector (`.modal-card.<component>-modal`) instead of depending on
  order.
- **`::-webkit-slider-runnable-track`/`::-moz-range-track` paint properties are silently ignored
  without `-webkit-appearance:none` on the parent `<input>`** — and `appearance:none` kills
  `accent-color`, so you must draw `::-webkit-slider-thumb`/`::-moz-range-thumb` yourself or the
  handle vanishes.
- **`.joint-slider` fill**: put the `linear-gradient(... var(--fill,0%) ...)` on the
  `input[type=range]` itself and set `::-webkit-slider-runnable-track` to `background:transparent`
  so it shows through; Firefox needs native `::-moz-range-progress`. **`--fill` must be injected as
  `style={{'--fill': `${pct}%`} as CSSProperties}`** and percentage math is the caller's job.
