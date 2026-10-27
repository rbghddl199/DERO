---
paths:
  - "frontend/src/store/simulatorStore.ts"
  - "frontend/src/components/simulator/SimulatorCanvas.tsx"
  - "frontend/src/components/simulator/SimHud.tsx"
  - "frontend/src/components/simulator/LoadingScreen.tsx"
---

Output language: Korean

# simulator store · entry paths · history · thumbnails

(Over 300 words on purpose: `store/simulatorStore.ts` is **outside**
`components/simulator/CLAUDE.md`'s auto-load scope, so for the store's own edit turn this file is
the only path-scoped carrier of these rules — the compressed sentences in that CLAUDE.md never
load. Every line below is a silent failure: it saves, renders and passes review, then resets or
teleports on reload.)

- **`isFullscreen` lives in the store, never in `EditorSidebar` local state** — `SimHud.tsx`
  unmounts the rail in fullscreen, so a listener inside it dies and ESC (the only exit) could never
  restore the HUD. Buttons that must survive fullscreen go outside `SimHud.tsx`'s
  `{!isFullscreen && (...)}` block; `fullscreenchange` is registered in `initEngine`.
- **The loading screen closes on `ready && screen === 'sim'`, not `ready`** — `createSimScene()`
  builds a default desk during boot, so `ready` alone exposes it until `loadPlacement` returns. No
  new store flag.
- **Block the camera with `.screen-loading.active` `pointer-events:auto`, never
  `controls.enabled = false`** — `three/render/placement.ts`'s global `pointerup` unconditionally
  resets it to `true`. Keyboard presets bypass the overlay, so **every new global shortcut goes
  under both guards** in the keydown handler (`screen !== 'sim'` and tour active) — otherwise
  `Delete` deletes and `1`–`5`/`h` move the camera mid-tour or over the loading screen.
- **Always pass < 1 to `OrbitControls.dollyIn`/`dollyOut`** — internally `radius *= scale`, so the
  same value > 1 swaps zoom in and out.
- **Undo/redo push only real user gestures** — never `loadPlacement`, `populateHeroOnce` or
  `placeProduct`/`placeProductAt`. Push sites are `onMoveCommitted`, `placement.onItemAdded`,
  `duplicateSelected`/`pasteClipboard` and `deleteSelected`.
- **Stack `pose.y` is meters but `restorePose`'s 5th arg is mm — call sites must `mToMm`**
  (DERO-448: every undo collapsed heights 1/1000; guard `tests/undoMove.test.ts`).
- **Cut cannot use the clipboard's `ref` shape** — it deletes the original, so a ref makes the
  follow-up paste a silent no-op. Snapshot first, route the deletion through `deleteSelected()` (so
  the cut stays undoable and lock-gated), and fill the clipboard **only after confirming the item
  really left `sim.placed()`**.
- **`?customDesk=` must stay last in the four-way entry-param priority**
  (`deskProjectId` > `placementId` > `deskId` > `customDesk`) — the wizard sends it together with
  `placementId`, and letting it win rebuilds an empty desk, drops saved items and 409s the save
  (`PLACEMENT_STALE`). **Always grep that a new query param is actually read somewhere.**
- **`loadPlacement` calls `sim.setDesk` directly, never `enterSim`/`setDeskConfig`** — those inject
  demo items. Pose is restored verbatim (x/z/yaw **and y**, pitch re-applied through `tiltItem`, no
  recomputation on load); items unmapped in `PRODUCT_ID_TO_SPEC_ID` are warned and skipped.
- **Do not drop `loadPlacement`'s `detail.desk.productId` prefetch** — real boot starts at
  `setCatalog([])` and nothing else ever fetches the desk product, so the desk vanishes from the
  estimate panel with no error.
- **Thumbnail auto-capture is gated on the detail response's `thumbnailUrl === null`, inside
  `loadPlacement` — never on a query param** (a param gate encodes "has no thumbnail" into "which
  param the sender used" and misses every already-existing thumbnail-less placement). Placements
  that already have one are never re-captured.
- **Server thumbnail refresh happens in `trySave`, from the save response — use `response.id`**
  (`placementId` is still null on a first save). Capture once per save and share the blob between
  card object URL and upload. `captureThumbnail` waits **3** rAFs.
- **Save-response violations go to the amber `.violation-banner`, not a toast** — the save succeeds,
  only publishing is blocked. The field is **`message`, not `reason`** (`openapi.d.ts` is canon),
  and red (`.warn-banner`) belongs to collision.
- **A store mirror of engine state is not saved state** — a new mirrored value needs the `trySave`
  snapshot, the `loadPlacement` restore **and** a `changeVersion` bump; miss one and it silently
  resets on reload (guard `tests/wallDistancePersistence.test.ts`).
