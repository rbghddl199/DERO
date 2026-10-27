---
paths:
  - "frontend/src/components/simulator/SelectionToolbar.tsx"
  - "frontend/src/components/simulator/SelectedItemPanel.tsx"
  - "frontend/src/components/simulator/SelectionPanel.tsx"
  - "frontend/src/components/simulator/JointPanel.tsx"
  - "frontend/src/utils/selectionToolbarPos.ts"
  - "frontend/src/components/simulator/CommitNumberInput.tsx"
  - "frontend/src/utils/numericInput.ts"
---

Output language: Korean

# simulator selection panel · floating toolbar · manual axes — the constraints not held by `components/simulator/CLAUDE.md`

(Over 300 words on purpose: `utils/selectionToolbarPos.ts`·`utils/numericInput.ts` are outside
`components/simulator/CLAUDE.md`'s auto-load scope, and the in-folder lines are input/focus/rAF
traps that render and pass review while losing focus, teleporting the item or freezing the toolbar —
too narrow for that file, which is already at its 2,000-token ceiling.)

Canon there: `editLocked`'s two gates (add every new canvas mutation to the store gate), the lamp
`*Spec` vs `*Marker` split and the zero-width band ban, `CommitNumberInput` for every HUD number
field, emissive is session-only. Read that file first. Decision background: ADR-0023 결정 6·7.

- **`AxisNumberInput` is defined at module scope** — inside the component it becomes a new component
  type every render and the input loses focus mid-edit.
- **The axis inputs commit on Enter/blur only** — per-keystroke commit lets `Number('') === 0` pass
  the finite check and teleports the item to 0, so e2e must `press('Enter')` after `fill()` or the
  engine never moves.
- **One rAF loop serves all three axes and reads the current value from the store, never the render
  closure** (you cannot hold two hold-to-spin buttons at once).
- **`freezeCount` is a ref counter, not a boolean, and a selection change resets it to 0** —
  `startSpin`/input `focus` freeze, `stopSpin`/`blur` unfreeze; deleting the item mid-hold would
  otherwise strand the toolbar frozen forever. While frozen the anchor subscriber returns early,
  visibility check included.
- **The screen-photo file input's `onChange` must do `e.target.value = ''`** or re-picking the same
  file fires no change event.
- **Reuse `LightSwitch.tsx` for the emissive switch — never write a panel-local switch** (the wall
  panel uses the same component).
- **`.sel-purchase` is a plain `<a>` to `spec.productUrl` and is not rendered when the spec has
  none** (external domain; `next/link` is for internal routes; scheme check =
  `utils/externalUrl.ts` `safeExternalUrl`). Mock specs never set it, so mock mode has no purchase
  button at all.
- **`.sel-thumb` is built from `selectedItemSpecId` (`item.spec.id`)** — `/assets/thumbnails/${id}.png`
  has no file for a placed-instance id.
- **`editLocked` disables the axes plus duplicate/delete, but deselect stays enabled** —
  `selectItem` has no store gate; don't "fix" that by disabling deselect.
- **`clampToolbarPos` (`utils/selectionToolbarPos.ts`) runs on every published anchor before the
  transform** — without it a tall item or the `top` camera preset pushes the bar off-screen. Measure
  the toolbar size once per selection into a ref and invalidate on `resize`; reading `offsetWidth`
  inside the frame callback forces a reflow every frame.
