---
paths:
  - "**/src/three/render/postfx.ts"
  - "**/src/three/render/nodes.ts"
  - "**/src/three/scene/scene.ts"
  - "**/src/three/scene/emitterEmissive.ts"
  - "**/src/three/scene/emitters.ts"
  - "**/src/three/scene/screenTexture.ts"
  - "**/src/three/scene/product.ts"
---
# Emissive, bloom and postfx compositing

**Output language: Korean.**
Evidence, measurements and the unwired admin-emitter state live in `docs/context/lighting-map.md` ("발광·postfx 구현 지식"). Bloom selection is ADR-0003; the one-line preventions are in `frontend/src/three/CLAUDE.md`.
_Over 300 words because the emissive path has four independent silent-failure axes (MRT slot, observer snapshot, off-switch, screen texture) and each NEVER guards a different one._

## MRT and the observer

- **Write the MRT emissive slot with `emissive` (PropertyNode), never `materialEmissive`** — the latter is undefined on materials without `material.emissive` (drag ghost ring, jointGizmo).
- **Every emissive colour or intensity change MUST route through `scheduleEmitterPoke`** — `material.needsUpdate = true` does not reach the GPU (`NodeMaterialObserver` lazy snapshot). The collision tint (`tintMesh`) shares the trap: refresh its `_origEmissive`/`_origEmissiveI` baseline and never write live while `_tinted`.
- **Bloom selection is the MRT slot, never a threshold** (ADR-0003). After touching the lighting rig, re-measure the white-wall ceiling and keep the glare threshold at **2× or more** of it.
- **Never apply the `CAMERA_EXPOSURE` inverse compensation to bloom** — it is for constant-colour overlays only. Composite as `vec4(bloomColor, 0)` and never touch alpha (the thumbnail capture path uses `alpha:true`).

## Emitters

- **Turning emission off needs both axes** — intensity 0 **and** exclusion from `reassignEmitterLights()`. **Never implement the second as `light.visible = false`** — why, and what to use instead: `lighting.md`.
- **`setEmitterColor` must never rewrite intensity unconditionally** — both setters share `emissiveIntensityFor(it)`, or a switched-off emitter comes back to life on a colour change.
- **Never put an emitter's `point` on its own emissive face.**

## Screen surfaces

- **Find screen meshes by the `userData.screenSurface` flag, never by name.**
- **Never duplicate the original screen constants** — stash them in `userData` on first application and restore from there.
- **`disposeParametric` must release the procedural `CanvasTexture` held only in `userData`**, or every item deletion leaks a texture.

## Screen-space constants

- **Author screen-space sizes as CSS px × `PIXEL_RATIO`, never in texels.**
