---
paths:
  - "**/src/three/finishes/**"
  - "**/src/three/core/window.ts"
  - "**/src/three/render/windowNodes.ts"
  - "**/src/three/scene/windowView.ts"
  - "**/src/three/scene/boundaryGuide.ts"
  - "**/src/utils/roomFinish.ts"
  - "**/frontend/scripts/measure-room-themes.mjs"
---
# Room surface — wall finishes, time-of-day, windows, blinds

**Output language: Korean.**
Evidence, measurements and history live in `docs/context/3d-scene.md` ("근거·실측" under 방 표면, "검증·캡처 함정" under 구현 세부). The look constants are owned by `render/windowNodes.ts` — never copy their values here.
(Over 300 words on purpose: 4 separate subsystems — verification, sun/shadow, window portal shader, finish modules — with no shared failure mode; each bullet is a silent wrong render.)

## Verification

- **Never verify rig or boundary behaviour through `__sim.placeProductAt`** — it silently places a parametric box in real mode. Place through the real drag path (`dropSpec` → `ensureTemplate`) and check `joints` is populated first.
- **Changing which sides carry a finish must be confirmed with a `scripts/measure-room-themes.mjs` screenshot**, never by counting sides.
- **Never use `Matrix4.decompose` to detect a collapsed `InstancedMesh` instance** — it returns scale `1,1,1` for an all-zero 3×3. Read the column lengths directly (`e[0]²+e[1]²+e[2]² === 0`).
- **A new edit-only marker must also be hidden in `captureFullCanvas` (`store/simulatorStore.ts`)** — save `visible` → turn off → restore, and never clear `selectedItemId` to hide it.

## Windows and sun

- **A room with no window has sun intensity 0** — the default room's `lightingInfo().shadowCasters` is 2. Code and e2e expecting 3 must add a window first.
- **Never turn off `castShadow` on the wall meshes** — the sun then passes straight through windowless walls.
- **Every new wall placement path MUST go through `wallPoseAt`** — the eviction out of the window opening lives there and nowhere else.
- **Never pass `currentRoom` itself into the first boot `applyRoom`** — `syncWindows` would diff it against itself and no opening is cut.

## Window view and dressing (ADR-0031)

- **The only animated uniforms are `windowTime` and `nightMix`** — adding a material, a light or a `visible` toggle here brings the shader rebuild back.
- **Keep the split: sky and lit windows on `emissiveNode`, ground and buildings on `colorNode`.** Never chase bloom with the brightness scale (`DAY_SCALE`).
- **Never write a descending `smoothstep`** — `edge0 > edge1` is undefined in WGSL. Use `1 − smoothstep(low, high, x)`.
- The portal plane sits flush in the wall rect with a 2mm setback (no margin), dressing relief stays under the 20mm cap (`MAX_RELIEF_PROTRUSION_M`), and **blinds never set `castShadow`**.

## Finishes

- **`FinishContext.windowRectM` is read-only — a finish may only avoid covering the opening.** The scene owns the hole.
- **Never express slat height as an instance scale** — the wood grain reads `positionLocal` in metres. Build a separate `BoxGeometry` per piece length.
- **A side whose window changed must have its finish rebuilt too** (`sameFinish` does not look at windows).
