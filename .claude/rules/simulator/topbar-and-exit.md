---
paths:
  - "frontend/src/components/simulator/EditorTopBar.tsx"
  - "frontend/src/components/simulator/ExitConfirmDialog.tsx"
  - "frontend/src/components/simulator/HardwareAccelDialog.tsx"
  - "frontend/src/utils/hardwareAcceleration.ts"
  - "frontend/src/utils/simulatorExit.ts"
  - "frontend/src/utils/selectionToolbarPos.ts"
  - "frontend/src/three/bootstrap/style.css"
---

Output language: Korean

# simulator top bar · exit flow

(`utils/simulatorExit.ts`·`hardwareAcceleration.ts`·`selectionToolbarPos.ts`·`three/bootstrap/style.css`
are outside `components/simulator/CLAUDE.md`'s auto-load scope, so the overlapping sentences there
cannot be the sole carrier for those files' edit turns. The 84px rule lives here only — the other
three consumers' files are all in this `paths` list.)

- **`.editor-topbar`'s 64px height has 4 consumers and nothing auto-syncs** — `top:84px` on
  `.editor-sidebar` and on `.editor-right-column` (`three/bootstrap/style.css`) plus
  `TOP_LIMIT_PX = 84` in `utils/selectionToolbarPos.ts`. Change all four together.
- **The hardware-accel item is an indicator, never a toggle** — page JS cannot read or flip the
  browser's graphics-acceleration setting in any browser (`chrome://` navigation is blocked too).
  State comes from a one-shot WebGL software-rasterizer probe (`utils/hardwareAcceleration.ts`);
  observing SwiftShader/llvmpipe *is* the detection.
- **Exit confirmation is gated purely on `changeVersion !== savedChangeVersion`**, uniform for logo
  / 나가기 / browser-back / external nav. **A new entry path must sync
  `savedChangeVersion: changeVersion` in its own final `set()`** — `resetForMount()` starts it at
  `-1`, so without that the screen is dirty from birth ("입장하자마자 문구가 뜬다").
- **Navigate to the hardcoded absolute `SIMULATOR_EXIT_DESTINATION_URL` with
  `window.location.href`, never `router.push`** — an absolute URL may be cross-origin in local dev
  and `next/navigation`'s router is for internal routes only. `external-navigation` keeps its
  caller-supplied **relative** href via `router.push`. The back-button path uses
  `useHistoryBackGuard`'s optional `onLeave` so `leave()` hard-redirects to that fixed URL.
- **collision-ignore does not turn judgment off** — `sim.anyCollision()` stays true; only
  `applyTint`, `refreshWarning` and `trySave` are gated. Boundary violations stay red and
  save-blocked regardless.
