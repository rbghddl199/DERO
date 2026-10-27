---
paths:
  - "**/src/three/scene/scene.ts"
  - "**/src/three/scene/lightSlots.ts"
  - "**/src/three/scene/roomRig.ts"
  - "**/src/three/scene/props.ts"
  - "**/src/three/scene/emitterPreview.ts"
  - "**/src/three/render/renderer.ts"
  - "**/src/three/render/cookieBake.ts"
---
# Lighting rig, lamps, shadows, cookie bake

**Output language: Korean.**
Spec canon and every measurement, rejection rationale and QA methodology live in `docs/context/lighting-map.md`; the one-line preventions are in `frontend/src/three/CLAUDE.md`.
_Over 300 words because the rig, the light set and the cookie bake are three separate rebuild/silent-failure surfaces under one paths set, and each bullet is a distinct NEVER._

## Single canons

- **`scene/roomRig.ts` is the only canon for the room rig and `scene/emitterEmissive.ts` for emissive painting and poking — never copy their numbers elsewhere.** The admin preview shares the rig, so a second copy makes the lm chosen in admin disagree with the simulator.
- **Lamp brightness and colour temperature have two canons — update both or it is half done**: the slot SpotLight (`lightSlots.ts`) and the shade's own emission (`props.ts` `case 'lamp'`, refreshed from both setters by `syncLampShadeEmissive()`). **Never duplicate the base intensity 18** (canon is the `props.ts` export); the poke and tint-baseline protocol is in `emissive-postfx.md`.
- **Lamp brightness is lumens on `light.power`** (physical SI assumes 1u=1m + `decay = 2`) — **never port the official Reinhard `exposure^5` formula into ACES.**

## Lights and shadows

- **Never toggle a light's `visible` or `castShadow` on any path** — it rebuilds the scene shader. Empty slots use `power = 0`, room lights OFF is `intensity = 0`.
- **RectAreaLight is banned in production scenes** (unconditional since 227).
- **Never argue `LAMP_SHADOW_CAP` from the frame budget** — the cap is a look decision; per-caster cost is p50 +0.12 ms.
- **Never tune shadow softness with `shadow.radius` under `PCFSoftShadowMap`** — it is a complete no-op there.
- **Never drop `clearcoat` to 0 to disable the coat** — it flips the `useClearcoat` gate and rebuilds the shader (`roughness`/`clearcoat`/`clearcoatRoughness` otherwise need no `needsUpdate`).
- **`Box3.setFromObject` measures in world space — measure before parenting** when the value is used as a child-local coordinate (light position etc.).

## Cookie bake

- **Bake the mask at 512² and box-average down to 128²** — baking straight to 128² makes the shade silhouette binary and the pool rim reads as sawtooth. Average all four RGBA channels, not just R.
- **Never give the bake material a hex colour** — use `new THREE.Color().setScalar(t)`; a hex is treated as sRGB and skews the readback.
- **Never gate baking and applying on the same flag** — collect the `apply` callbacks and call them all on completion; the timeout, failure and no-shade paths must clear that list.
- **Run the cookie regression both one-tick and one-at-a-time** (`qa-artifacts/cookie-281/probe.mjs`) — the one-at-a-time path passes even when the apply path is broken.
- **Shade dimensions and light height are one cookie constraint, not decoration** — `atan(rBot / distance to the shade's bottom rim)` must stay under the beam half-angle, so patterns are exclusive to `flood` products.
