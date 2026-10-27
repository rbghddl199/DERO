---
paths:
  - "frontend/src/components/simulator/SimulatorCoachTour.tsx"
  - "frontend/src/components/simulator/CoachBubble.tsx"
  - "frontend/src/constants/simulatorTour.ts"
---

Output language: Korean

# simulator coach tour — the constraints not held by `components/simulator/CLAUDE.md`

Canon there: anchors are rail buttons (a decision), the bubble is opaque white and must not use
`BodyPortal`, new global shortcuts go under both keydown guards, never `controls.enabled = false`.
Anchor decision rationale: `docs/context/3d-scene.md` "코치 투어 앵커".

- **Catch ESC with `capture` + `stopImmediatePropagation`** — otherwise it double-fires with
  `ExitConfirmDialog`.
- **Rect state must be a `{stepId, rect}` pair, never a bare `rect | null`** — with a bare `null`
  the effect runs before rAF/RO and step 1 is silently skipped as "no target".
- **Take the first measurement from the `ResizeObserver` callback that fires on `observe()`** —
  calling `measure()` in the effect body trips `react-hooks/set-state-in-effect`.
- **Wait for persist-restore with `useSyncExternalStore(persist.onFinishHydration,
  persist.hasHydrated)`, not state + effect** — same lint rule, and skipping it flashes step 1 for
  returning users.
- **No per-component rAF loop** — `RenderLoop` owns the only one.
