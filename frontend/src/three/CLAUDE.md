# src/three — 3D simulator engine

Three.js scene / placement / collision logic; rendering is **react-three-fiber** (migrated 2026-07-22). Mount point is the `<Canvas>` in `src/components/simulator/SimulatorCanvas.tsx`, HUD is `src/components/simulator/*.tsx`, state is `src/store/simulatorStore.ts`. React imports are forbidden in every subfolder — the engine stays vanilla.

| Subfolder | Place new code here when it is |
| --- | --- |
| `core/` | specs, math, judgment (`collision`, `collider`, `snap`, `rig`, `window`) |
| `scene/` | scene composition — `createSimScene()` |
| `render/` | renderer, camera, materials, TSL nodes, loaders, cookie/placement infra |
| `finishes/` | wall/floor finish modules (`woodSlat.ts`, `presets.ts`) |
| `bootstrap/` | `style.css` only |

## Where the evidence lives

One-line preventions only — evidence moved out 2026-08-10 (DERO-540). Rules files auto-load on the files they cover.

| Area | Detail |
| --- | --- |
| Lighting, lamps, shadows, cookie bake | `.claude/rules/three/lighting.md` · `docs/context/lighting-map.md` |
| Emissive, bloom, postfx, screens | `.claude/rules/three/emissive-postfx.md` · `docs/context/lighting-map.md` |
| Placement, seating, collision, mounts | `.claude/rules/three/placement.md` · `docs/context/3d-scene.md` |
| Renderer / R3F infra, DPR | `.claude/rules/three/engine-infra.md` · `docs/context/lighting-map.md` |
| Windows, wall finishes | `docs/context/3d-scene.md` "방 표면" · ADR-0030·0031 |

## Rules

- Never read mesh dimensions for compatibility judgment — spec metadata (mm) only (`docs/context/compatibility.md`).
- Lighting mood = placed-lamp local SpotLights only; the global rig stays neutral. **RectAreaLight is banned in production scenes (227, unconditional).** `product_emitter.shape` is fixed to POINT/SPOT. Shadow caster cap ~3.
- Renderer, scene graph and GPU resources go in refs — an `Object3D` in `useState` re-renders every frame. Frame loop is `useFrame`; never hand-roll `useEffect` + `requestAnimationFrame`.
- Route changes unmount the canvas: dispose hand-made geometry/material/texture/renderTarget, never `useLoader` results (shared cache). Renderer settings live in `<Canvas gl={...}>` — if the render output changes while porting, it is not a port.

## Standing issues

Lighting

- **Lamp brightness and color temperature have two canons** — the slot SpotLight (`lightSlots.ts`) and the shade's baked emissive (`props.ts` `case 'lamp'`). Fixing one leaves it half-done.
- `shadow.radius` is a **no-op** under `PCFSoftShadowMap`; the caster cap is a look decision, never a frame-budget one.
- **Never toggle a light's `visible` or `castShadow`** — it rebuilds the shader. Slots are constant: empty = `power = 0`, room OFF = `intensity = 0`.
- **Measure nothing inside the lamp pool** (8-bit clipping) — the only valid control is equidistant azimuthal samples at one radius.
- `scene/roomRig.ts` (rig) and `scene/emitterEmissive.ts` (emissive) are single canons — copying their numbers makes the admin preview lie. `Box3.setFromObject` is world-space, so measure before parenting.
- Shade size and light height are one **cookie** constraint, not decoration. Bake 512² → downsample 128², and never gate bake and apply on the same flag (one-tick bulk placement leaves later slots white).

Emissive / postfx

- **A material property change may never reach the GPU** — `NodeMaterialObserver`'s snapshot is lazy and `needsUpdate` does not fix it. Route emissive color/intensity changes through `scheduleEmitterPoke` (needs 2+ emitters).
- Write the MRT emissive slot with `emissive` (PropertyNode), **never `materialEmissive`** — `undefined` on materials without `material.emissive`.
- Bloom is selected by **MRT slot, not threshold** (ADR-0003). The glare threshold is coupled to the room rig — after touching lighting, re-measure the white-wall ceiling and keep 2×.
- Constant-color overlays (outline) need the `CAMERA_EXPOSURE` inverse multiply; **never apply it to bloom**, and do not touch alpha.
- The only emissive source is the mock `PRODUCTS` `emitter:` field (`scene/product.ts`) — admin-saved `product_emitter` is **not** wired. Switching emission off needs intensity 0 **and** removal from `reassignEmitterLights()`.
- A photo on a monitor screen also needs `color` flattened and intensity dropped, originals stashed in `userData`; find screens by `userData.screenSurface`, not by name.
- Author screen-space sizes in **CSS px × `PIXEL_RATIO`**, not texels — a texel constant doubles with DPR.

Placement / mounts

- **Apply a vertical rotation axis before pitch** — canon is `applyItemPose`'s quaternion yaw × pitch (ADR-0023); default euler `'XYZ'` tips rotated items sideways with no error.
- **`center.y` is user-owned and saved** — initialised at drop only, never re-derived by `resnap()`. Yaw, pitch and lift all persist.
- **Seating is spec-box stacking, not a solver.** `supportSurfaces` decides: a monitor exposes only its stand foot and the **arm exposes nothing**. Putting something **on** a monitor is a separate path — a cursor raycast (`pickMonitorTop`), never a support surface.
- **`Box3.setFromObject` and `Raycaster.intersectObjects` ignore `visible`, and the raycaster never updates `matrixWorld`** — call `updateWorldMatrix` on same-tick geometry or a bulk `loadPlacement` seats items at world-origin height.
- `specFootprintRect` is axis-aligned only (yaw paths use `rotatedFootprintRect`), and a **moving** item must be excluded from its own support candidates or it climbs on every move.
- **`mountSurface === 'FLOOR'` changes six places together** (base Y, support search, desk-boundary exemption, drag plane, click-place slot, default yaw); pure rules in `core/snap.ts`.
- Wall items: `center.y` is stored, not derived; `WallSide` casing differs engine vs API (convert only in `utils/wallSide.ts`); decor depth must reach `resolveWallPose` or thin items sink behind the relief.
- **Pegboard mounting attaches to an *item*, not the wall** — never reuse `mountedToId` for the host link, and exclude the dragged item and its descendants from the host raycast.
- Arm attach/detach must clear the baked scale **and** rotation, and rewind tweens only after judgment is frozen. Bite distance measures the support **mesh** (`clampReachM`), not spec depth, and a clampable arm **always** edge-locks.
- Weights/loads are integer **grams**, user strings only via `formatKg()`. `ARM` has no box dimension columns, so its spec arrives `meshDerivedDims: true` — any consumer feeding 3D judgment must take the spec back from `ensureTemplate`, never the catalog one.
- Prismatic joints are **mm**, absolute from `restPos` (ADR-0002); coupled joints are not saved. The ghost's yaw lives in `render/placement.ts`, silently defaulting to 0.

Engine infra

- **A frame number without `deviceScaleFactor` is meaningless** — this scene is pixel-bound.
- `three` and `three/webgpu` are **separate copies**, so `instanceof` branches split silently. `createRenderer()` pins exposure 1/20 (a normal-scale scene mounted here is black); `alpha: true` also needs `setClearColor(…, 0)`. three touches `window` at import — `next/dynamic(..., { ssr: false })`.
- **Never call `postfx.render()` yourself** — `RenderLoop` runs it every frame and a second call freezes canvas readback on SwiftShader.
- Desks and monitors are procedural, and **the default desk never reads catalog (DB) products** (`chooseDesk(id)` still does). `setDesk()` calls `clearPlaced()`, so re-place props after a spec change.
- `bootstrap/style.css` has no global `.hidden`, and a union-ed CSS merge can eat a closing brace — `npm run build` after resolving one.

Windows / finishes

- A window is a **real hole** in the wall geometry (`core/window.ts`), so wall-hang avoidance costs zero judgment code. Every wall pose goes through `wallPoseAt`, and **a finish must never cover the opening** (`FinishContext.windowRectM` is read-only). Look constants are canon in `render/windowNodes.ts`.
