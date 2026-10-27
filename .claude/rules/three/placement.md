---
paths:
  - "**/src/three/core/**"
  - "**/src/three/scene/**"
  - "**/src/three/render/placement.ts"
---
# Placement, seating, collision and mounts

**Output language: Korean.**
Spec canon is `docs/context/3d-scene.md` (+ ADR-0022·0023·0024). Design rationale, the two rejected
pose generations (cradle heuristic, contact solver), measurements and ticket history live there —
never re-derive them here.
(Over 300 words on purpose: five mount planes — desk, monitor top, floor, wall, pegboard — each fail
silently in their own set of files, and all five live in `core/snap.ts`·`scene/scene.ts`·`render/placement.ts`,
so a per-concern split would repeat these same `paths`.)

## Pose is the user's, never the engine's

- **Apply yaw before pitch** — canon is `applyItemPose`'s `yawQuat × pitchQuat` (ADR-0023). Three's default euler `'XYZ'` pitches around the **world** X axis and tips a rotated item sideways. Any new transform with a vertical rotation axis keeps that order.
- **`center.y` is a user-owned saved value** — initialised at drop (`placeAt`) only, and `resnap()` must never re-derive it. Never reintroduce a cascade that moves what sat on a removed or moved support. Yaw, pitch (`PITCH_LIMIT_DEG`) and lift (absolute spec-box bottom mm) all persist; `liftItem` may deliberately go **below** the support top.
- **The library ghost's yaw is owned by `render/placement.ts`, not the ghost object** — `ghostShow(spec, x, z, yaw)` defaults the argument to 0, so omitting it snaps an R-rotated ghost back to front-facing on the next `pointermove`.
- **The rotate ring anchors on `it.center`, never `it.group.position`.**

## Support surfaces

- **`supportSurfaces` decides what can be stacked on — never restore "one spec box per item".** A monitor exposes only its stand foot (`scene/monitor.ts` owns both constants), and the panel and the monitor **arm** expose nothing; a cantilever holds nothing, and the whole-box version floats keyboards at arm-top height.
- **A moving item must be excluded from its own support candidates** (`resolveSupportY(..., excludeId)`) or a stackable rests on its own top and climbs on every move. `specFootprintRect` is axis-aligned only — yaw paths use `rotatedFootprintRect`.
- **"On top of the monitor" is a cursor raycast (`pickMonitorTop` + pure `resolveMonitorTopPose`), never a support surface.** Discard hits below stand height (spec-derived cutoff); the item gains **no** state, so `moveItemOnMonitorTop` calls `resnap` **without** `initHeight` — passing it re-derives from `supportSurfaces` and drops the item to the desk. `seatedOnSupport` must count `restsOnMonitorTop` explicitly, `placement.ts` must remember the hit for the drag (`ghostMonitorHit`), an arm-mounted monitor and the arm itself are not valid hosts, and the width clamp uses the item's **rotated** half-extent along the host's local X.
- **Free height and tilt legitimately penetrate spec boxes** — `isSeatPair` suppresses **only that pair's** collision warning: never the pose, never saved, re-inferred on load.

## Boxes and raycasts

- **`Box3.setFromObject` and `Raycaster.intersectObjects` both ignore `visible`** — raycast scene geometry through `it.collider.parts`, never the whole group, or a hidden stand becomes a valid seat point.
- **`Raycaster` never updates `matrixWorld`** — `collectContactSamples` must `updateWorldMatrix(true, false)` each target first, or same-tick placement (`loadPlacement`'s synchronous loop) seats items at world-origin height.
- **`OBB.applyMatrix4` adds only translation to the center** — keep `worldOBB`'s own centre recomputation in `collider.ts`, or an off-origin geometry box (quantized GLB) drifts the world OBB.

## Floor items (`mountSurface === 'FLOOR'`)

- **Six places change together** (pure rules in `core/snap.ts`, the rest in `placement.ts`): base Y, support search filtered to the same mount plane (`sharesMountPlane`), desk-boundary exemption, drag plane Y, click-place default slot, default yaw 180° (**an explicit `yawDeg` from the caller always wins** — R-key rotation mid-drag, `duplicateItem`, undo/redo restore). **Never restore the "floor products skip the support search" gate** — a rug and the chair on it then interpenetrate and stay permanently red.

## Wall items

- **`center.y` is stored, not derived** — keep `resnap`'s `wallSide` branch and `restorePose`'s `centerY` argument, or every move snaps the item back to desktop height.
- **Convert `WallSide` casing in `utils/wallSide.ts` only** — engine lowercase, storage/API uppercase.
- **`pickWall` must filter on `wallOn[side]`** — that filter *is* "cannot place on a hidden face" (REQ-ENV-04); the raycaster does not check `visible`.
- **Moving a wall (`setWallDistance` / `setFrontWallGap`) must `resnap` that wall's items**, or the shelf detaches and floats. `applyRoom` resnaps only the faces whose `decorDepthM` actually changed — a wall resnap drags pegboard-guest recursion and a full collision recompute with it.
- **The hard clamps (`clampToWalls`, `clampCenterToWalls`, `clampCenterToWallsAlongEdge`, `activeWallPlanes`) are the only thing preventing wall penetration** — there is no soft wall judgment any more and `it.boundary` looks at the desktop only. Re-read this line before touching them.
- **A new wall-finish family must return its own `decorDepthM`** (`WallFinishModule`) or thin items sink behind its relief. Pegboard products get `PEGBOARD_STANDOFF_M` unconditionally, decor or not.

## Pegboard mounting

- **Never reuse `mountedToId` for the host link** (the host is an *item*, and `pegboardHostId` is the only field for it) — `removeItem` would push a hook down the monitor-detach path. Pegboard guests cascade-delete with their host (a hook has no desktop pose to fall back to).
- **`resnap` must check `pegboardHostId` before `wallSide`**, or `wallPoseAt` drags the guest through the panel.
- **Exclude the dragged item *and its descendants* from `pickPegboard`** — a self hit silently stalls the drag, a descendant hit makes `resnapPegboardGuests` recurse forever.
- **The host↔guest pair needs the `isMountPair` collision exemption** (faces are exactly coincident). Positioning is continuous, never hole-aligned — there is no hole-pitch column and measuring the mesh breaks the mesh/spec split.

## Arm mount / detach

- On detach via `placedRoot.attach()`, **explicitly clear both `scale` (the baked parent scale) and `rotation`** — `resnap` rewrites yaw only, so residue leaves the monitor tilted and drifting across repeated attach/detach.
- Magnet attach must `drops.delete(id)` — a live landing tween overwrites local y every frame. **Rewind presentation tweens only after judgment and colliders are frozen**; scene state is always the target pose and tweens are visual only.
- **Bite distance measures the support segment mesh (`clampReachM`)**, not spec depth — presentation, so mesh reading is allowed here while judgment inputs stay spec mm. **A clampable arm always edge-locks** (`edgeSnapTarget`, no radius gate), on `placeAt` as well as `moveItem`; when `judgeArmDesk` is INCOMPATIBLE it falls back to free placement — leave that path alone.

## Units and catalog gaps

- Weights and loads are **integer grams** (`weightG`, `loadCapacityG`) so judgment compares integers; every user-facing string goes through `formatKg()`.
- Prismatic joint values are **mm** and **absolute from `restPos`, never cumulative** (cumulative drifts the part on every slider round trip); **never save a coupled joint** — only the driver is saved and `articulate` returns `null` for the rest (ADR-0002).
- **`ARM` has no box dimension columns**, so `toProductSpec` ships `ARM_FALLBACK_DIMS_MM` tagged `meshDerivedDims: true` — **never feed such a spec straight into placement or collision judgment.** Go through `ensureTemplate` (`core/productAssets.ts`) and use the spec it returns; it measures the GLB once and clears the flag.
