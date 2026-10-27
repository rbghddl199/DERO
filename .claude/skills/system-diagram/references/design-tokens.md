# Design tokens (PALETTE)

Canon: `de_pjt/docs/superpowers/specs/2026-07-16-diagram-skill-design.md` §4

Colors are defined in exactly one place, `palette.py` (single source). Other modules import
these constants instead of hardcoding hex. This is the main device that keeps blue-biased
color from creeping back in (R8).

```
INK       = #141414   # all primary text (black)
MUTED     = #6b6b6b   # secondary text (neutral gray, not navy)
LINE      = #8a8a8a   # connectors / call lines
LINE_SOFT = #a8a8a8   # response lines (dashed)
LIFELINE  = #d4d4d4   # sequence lifelines
ZONE      = #9a9a9a   # zone borders (single color; hierarchy via weight/dash only)
MARK      = #2b2b2b   # sequence number circles
ACCENT    = #c65e78   # the one semantic emphasis (final delivery step of a sequence)
HDR_FILL / HDR_STROKE   = #f0f0f0 / #d8d8d8   # actor header boxes
NOTE_FILL / NOTE_STROKE = #f2f2f2 / #dadada
NOTE_TICK = #b0b0b0
WHITE     = #ffffff
```

Color survives in exactly two places: **real vendor logos** and **the single accent (ACCENT)**.

`ALLOWED_TEXT = {INK, MUTED, ACCENT, WHITE}` — the `fill` of a text element must never leave
this set (R8, enforced by `checks.scan`).

`is_blue_biased(hex)` — True when the blue channel is distinctly higher than red and green
(`b > r and b > g and (b - min(r,g)) >= 10`). Neutral grays and the rose accent pass as False.

## Typography

- Primary labels (node label): system sans, weight 700, 13px.
- Sub labels (node sub) and edge labels: monospace, weight 500–600, 10–10.5px.
- Zone labels (group label): sans weight 700, letter-spacing 1.4, 10.5px.
- No CDN fonts (risk of silent fallback) — pin the system font stack
  (`ui-sans-serif,system-ui,-apple-system,sans-serif` / `ui-monospace,Menlo,monospace`).

## Canvas and ornament rules

- The diagram itself is always drawn on a **white canvas ("paper")**, independent of the
  light/dark page theme. Only the page chrome (background, header) may react to the theme.
- Arrowheads are `<marker>` triangles, colored the same as their line.
- No pill boxes on edge labels — use a white halo (`paint-order="stroke" stroke="#fff"`)
  to keep the text readable over the line (no box fill; same spirit as R3).
