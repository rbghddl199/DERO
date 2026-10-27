# src/components/simulator — simulator HUD (React)

`SimHud.tsx` = thin shell assembling `EditorTopBar` + `EditorSidebar` + `SelectedItemPanel` + `EstimatePanel` + `SimulatorCoachTour` + warn banner / toast / mount banner.

Canon for what it states. `.claude/rules/simulator/*.md` (`paths:` glob) carries the rest — files outside this folder (`store/`, `three/bootstrap/style.css`, `utils/`, `tests/`) and traps too narrow for here. Also canon: `docs/context/lighting-map.md` (render/lighting), `docs/context/3d-scene.md` (scene/placement).

## Layout

- **`EditorTopBar.tsx`** — full-width opaque white bar, `height:64px`, not HUD glass, always mounted. **That 64px drives `top:84px` on `.editor-sidebar` and `.editor-right-column` plus `TOP_LIMIT_PX` in `utils/selectionToolbarPos.ts` — 4 places, nothing auto-syncs.**
- **The hardware-accel item is an indicator, not a toggle** — a web page cannot read or flip the browser's graphics-acceleration setting. Don't "upgrade" it; state comes from a one-shot WebGL software-rasterizer probe.
- **collision-ignore does not turn judgment off** — `sim.anyCollision()` stays true; only `applyTint`/`refreshWarning`/`trySave` are gated. Boundary violations stay red and save-blocked regardless.
- **`EditorSidebar.tsx` (left rail)** — save · undo/redo · 4 category icons. Exactly one flyout open, plain local `useState`. **No per-flyout close buttons and no `<`/`>` on the left side** — pressing the rail icon again is the only close.
- **`.editor-right-column`: `EstimatePanel` first (whenever items are placed), `SelectedItemPanel` second (`margin-top:auto`, on selection). Both stay flex children — a new always-visible right panel goes in this column, never a new absolute box.**
- **The three manual axes and duplicate/delete/deselect live in the floating `SelectionToolbar.tsx`** (it freezes its anchor while a control is in use). `SelectionPanel.tsx` keeps emissive on/off + color, lamp controls, `detach-button`, `screen-photo-row`. **Emissive is session-only; the axes and screen photos persist.**
- **Fullscreen `isFullscreen` lives in the store, never in rail-local state** — `SimHud.tsx` unmounts the rail in fullscreen, so a listener inside it dies and ESC (the only exit) could never restore the HUD.

## 지속 이슈

- **`editLocked` has two gates — fixing one gives you half a lock**: `placement.ts` `pointerdown` (forces orbit) and the store mutation actions. **Add every new canvas mutation to the store gate.** The room-finish actions are covered only because their single writer `applyRoomConfig` carries it.
- **Never block the camera with `controls.enabled = false`** — `three/render/placement.ts`'s global `pointerup` unconditionally resets it to `true`. Use an overlay's `pointer-events`. Overlays block pointers only, so **new global keyboard shortcuts go under both guards** in `simulatorStore.ts`'s keydown handler (`screen !== 'sim'`, tour active).
- **Coach tour anchors are rail buttons, not flyout content — a decision, not a compromise.** Changing it means lifting `flyout` into the store.
- **Any new container directly under `.screen-sim` (`pointer-events:none`) must include the `hud` class** — pointer-events inherits, so buttons render but never click.
- **Content nested inside a flyout or right panel never carries its own `.glass`** — the surface is the parent (no glass on glass; keep the ≤3 `backdrop-filter` budget over WebGL). The tour bubble is opaque white for the same reason, and must not use `BodyPortal`.
- **Collapsing a panel replaces the whole subtree; never shrink inner content inside the parent glass** — that leaves an "empty transparent window".
- **The prettier-plugin-tailwindcss template-literal trap (`rules/frontend/formatting.md`) has bitten this folder repeatedly** — the `warn-banner`/`toast` case pinned the collision banner on screen. **Re-adding the space does not work; change the shape** (`c ? 'x y' : 'x'`).
- **A className present in JSX with no matching CSS rule is invisible** — commit the rule in the same change. Equal-specificity overrides win by source order; raise specificity with a doubled selector instead.
- **Adding any new `overflow-y:auto` HUD selector means adding it to every scrollbar rule** in `style.css` (webkit rules + the `@supports` list). Same file: `.lib-grid` is flex, not grid — grid breaks last-row centering.
- **Real mode's simulator catalog starts empty** — only `LibraryPanel`'s paging appends. Anything showing product cards must `appendCatalog` the mapped specs, or cards render but cannot be dragged. Hearts are the shared `/product` like state, never a simulator-only one.
- **Categories are frontend-fixed (`PRODUCT_CATEGORY_NAV_GROUPS`); filtering and search are server-side.** Never re-apply the client name filter to real entries — it drops legitimate hits. **Search has no fallback by decision**: a 503 shows `hud-search-unavailable`, never a silent empty list.
- **The estimate's desk row comes from `sim.deskConfig()`, never `sim.placed()`** — a 직접 입력 규격 desk is a synthetic 0원 `linkable:false` row. Rows with no price or `linkable:false` render a plain `<div>`, not a `<Link>` that 404s.
- **`loadPlacement` calls `sim.setDesk` directly, never `enterSim`/`setDeskConfig`** — those inject demo items. Pose is restored verbatim; products unmapped in `PRODUCT_ID_TO_SPEC_ID` are warned and skipped.
- **`/simulator` has four entry paths by query param in a fixed priority; `?customDesk=` must stay last** — the wizard sends it with `?placementId=`, and letting it win rebuilds an empty desk and 409s the save. Always grep that a new param is actually read.
- **Placement thumbnail auto-capture is gated on the detail response's `thumbnailUrl === null`, inside `loadPlacement`** — never on a query param. Server refresh otherwise happens only in `trySave`, using `response.id` on a first save.
- **Undo/redo push only real user gestures** — never `loadPlacement`/`populateHeroOnce`/`placeProduct`. **Stack `pose.y` is meters but `restorePose` takes mm — call sites must `mToMm`.**
- **Ctrl+C/X/V never touch the system clipboard.** Copy stores a ref resolved at paste time; **cut must snapshot instead**, and its delete routes through `deleteSelected` to stay undoable and lock-gated.
- **Save-response violations go to the amber `.violation-banner`, not a toast** — the save succeeds, only publishing is blocked; red (`.warn-banner`) belongs to collision.
- **Exit confirmation is gated purely on `changeVersion !== savedChangeVersion`**, uniform for every exit route. **A new entry path must sync `savedChangeVersion` in its final `set()`** or the screen is dirty from birth.
- **A store mirror of engine state is not saved state** — a new mirrored value needs the `trySave` snapshot, the `loadPlacement` restore, **and** a `changeVersion` bump; miss any one and it silently resets on reload.
- **Lamp spec markers: never feed a clamped `*Marker` to the caption or `isFixedSpec`** (both are `MarkerSpan`; the type won't stop you) — it fakes a "fixed" lamp and a lying caption. **Never draw a zero-width band** — invisible reads as broken UI.
- **`OrbitControls.dollyIn`/`dollyOut` reverse direction if the scale is > 1** — always pass < 1. **Range-input track paint props are ignored without `-webkit-appearance:none`**, which then kills `accent-color` — draw the thumb yourself or it vanishes.
- **Never route per-frame 3D→HTML overlay coords through React state** — publish through `three/scene/selectionAnchor.ts` and write `style.transform` directly.
- **Every HUD number field goes through `CommitNumberInput`, never a raw `<input type="number">` wired to `onChange`** — per-keystroke commits make a cleared field snap to the clamp minimum and unretypeable. The parse lives in `utils/numericInput.ts`; there is no third copy.
- **Flyout content is absent from the DOM until its rail button is clicked** — e2e must click `rail-product`/`rail-wall`/`rail-view` first (canon: `e2e/CLAUDE.md`). **`WallDiagram.tsx` holds no state of its own** — it calls the same `setWall` as `LightSwitch`, so the two UIs can't drift.
