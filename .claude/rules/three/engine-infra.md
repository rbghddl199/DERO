---
paths:
  - "**/src/three/render/**"
  - "**/src/three/scene/scene.ts"
  - "**/src/three/bootstrap/**"
  - "**/components/simulator/SimulatorCanvas.tsx"
---
# Engine infra — renderer, R3F mount, DPR, procedural props

**Output language: Korean.**
Evidence, measurements and the R3F migration history live in `docs/context/lighting-map.md` ("R3F `<Canvas>`와 renderer 설정의 이중 소유"). The one-line preventions are in `frontend/src/three/CLAUDE.md`.
_Over 300 words because the paths cover three unrelated surfaces (renderer/R3F ownership, procedural desk init, style sheet) whose constraints do not compress into one another._

## Renderer ownership

- **Never call `postfx.render()` a second time yourself** — `RenderLoop` already runs it every frame, and a second call freezes canvas readback under SwiftShader. Wait for rAF, then read.
- **Adding a renderer-global switch to `render/renderer.ts` MUST be paired with the same-named R3F prop** (`shadows`·`linear`·`flat`·`legacy`·`orthographic`·`dpr`) — `<Canvas>` overwrites the renderer returned by the `gl={...}` factory with its own defaults.
- **Never "unify" the two `dpr` owners** — `renderer.ts` caps at 2 for the thumbnail path, `<Canvas dpr={[1, 1.5]}>` caps lower for the pixel-bound simulator. Both values are deliberate.
- **Never branch on `instanceof` across `three` and `three/webgpu`** — they are separate copies with different classes.
- **`createRenderer()` pins exposure 1/20** — a scene authored at normal lighting scale (intensity ~2) renders pitch black here; auxiliary scenes without postfx use a default `<Canvas>` or scale their lights 20×.
- **`alpha: true` alone leaves the canvas opaque** — also call `renderer.setClearColor(0x000000, 0)` right after creation.
- **Load three through `next/dynamic(..., { ssr: false })`** — `'use client'` is not enough; three touches `window`/WebGL at import time.
- **Never quote a frame number without `deviceScaleFactor`.**

## Procedural desk and props

- **Default-desk init must never read catalog (DB) products** — `getProduct('desk-oak-1200')`, otherwise `DEFAULT_CUSTOM_DESK`, never `desks()[0]`: a bad DB spec silently builds a matchbox desk instead of throwing. `chooseDesk(id)` (user-picked desk) is unaffected and renders at its DB spec.
- **`setDesk(config)` calls `clearPlaced()`** — re-place props after a spec change. The front wall z follows desk depth: move the wall, never the desk.
- **`CylinderGeometry` has θ=0 at +Z** (`x = R·sinθ, z = R·cosθ`) — a wrong start angle throws curved panels off the origin.

## Style sheet

- **Run `npm run build` after resolving a CSS merge conflict** — union-ing by marker strips can absorb a closing brace and nothing else catches it.
- **`bootstrap/style.css` has no global `.hidden` rule** — each component defines its own `.foo.hidden { display: none }`.
