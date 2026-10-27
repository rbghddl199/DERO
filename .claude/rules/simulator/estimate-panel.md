---
paths:
  - "frontend/src/components/simulator/EstimatePanel.tsx"
  - "frontend/tests/estimateGroups.test.ts"
---

Output language: Korean

# simulator estimate panel — the constraints not held by `components/simulator/CLAUDE.md`

Canon there: collapse replaces the whole subtree, rows with no price or `linkable:false` render a
plain `<div>`. Repeated below only where this file's `paths` reach outside that folder
(`tests/estimateGroups.test.ts` does not auto-load it).

- **Do not "fix" `estimate-fold` into moving with state** — it sits at `left:-12px` (half its 24px
  width) overlapping the container's left border, vertically centered, and
  `.editor-estimate-panel` must keep `position:relative` as its containing block.
- **The checkbox stays a direct child of `.estimate-row`, outside `.estimate-row-link`** — wrapping
  it in the `<Link>` collides check-click with navigation.
- **The desk row is assembled from `sim.deskConfig()`, never `sim.placed()`** — a 직접 입력 규격
  desk becomes a synthetic `custom-desk` row at **0원, `linkable:false`** (matching the server's
  D18 rule, so canvas total and "저장된 배치 기준" agree).
  (The desk row only works because `loadPlacement` prefetches `detail.desk.productId` — that
  constraint is delivered on `simulatorStore.ts`'s own turn, in `store-and-entry.md`.)
