# public/assets/motion — UI motion clips

Loading/transition motion clips, produced offline and committed here. **No npm script builds these** — the generation prompt and the ffmpeg command below are the only way to rebuild one, so keep them current.

> **These files currently have no consumer (2026-08-05, 박동규 지시).** The simulator loading-screen feature that played `desk-build.mp4` (REQ-SIM-36, commit `8f0d37d`) was reverted — `LoadingScreen.tsx` is back to the spinner, and `constants/motion.ts`, `MotionPreloadBootstrap.tsx`, the `.loading-motion*` CSS and the `next.config.ts` `immutable` header for this path are all gone. Only the assets and this doc were kept, so the work is not lost if the feature is revived. **Reviving it means restoring all five of those pieces plus reading the standing issues below** — and `public/` defaults to `Cache-Control: max-age=0`, so a consumer that skips the header pays a 304 round trip on every play.

## Assets

| File | What |
|---|---|
| `desk-build.mp4` | 720×720 · 30fps · 5.03s · silent · 128KB. A desk draws itself as glowing outlines, then fills with color. |
| `desk-build-poster.jpg` | 360×360 still, frame 75 (the completed desk) — was the `prefers-reduced-motion` fallback. |

## Rebuilding `desk-build`

Generated with the higgsfield CLI, then re-encoded locally:

```bash
higgsfield generate create seedance_2_0 --prompt "<see below>" \
  --aspect_ratio 1:1 --duration 10 --resolution 1080p --bitrate_mode high \
  --generate_audio false --mode std --wait
ffmpeg -i raw.mp4 -an -vf "setpts=0.5*PTS,fps=30,scale=720:720:flags=lanczos" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow -movflags +faststart desk-build.mp4
```

Prompt gist: cute stylized 3D miniature desk setup (desk, chair, monitor on an arm, keyboard, mouse) materializing — glowing outlines draw themselves edge by edge, then a warm honey-yellow scanline sweeps upward filling in solid surfaces, sci-fi transporter sparks along the scan edge; chunky toy proportions, toon shading, NOT photorealistic; flat plain off-white background, no floor, no cast shadow; static locked-off camera, no camera movement; seamless loop.

The `setpts=0.5*PTS` halves the source (10.04s → 5.03s) because the generated pace read as too slow; the downscale takes 17.9MB → 128KB. **Keep the raw CDN mp4 out of git.**

## Standing issues

- **The loop needs no crossfade** — the clip starts and ends on an empty frame, so one cycle is already `empty → assemble → complete → dissolve → empty`. Plain `loop` is enough. Preserve that property when re-rendering.
- **Frame timeline, measured (ffmpeg 0.5s grid, 2026-08-05): 0.0s empty · 0.5–1.5s outlines draw · 2.0s colour fills · 2.3s settled · 2.5–4.5s a static completed frame · 5.03s empty again.** Two consequences for any consumer that gates on the clip: **waiting for `ended` buys nothing** (2.7s of it is a still frame, and the final frame is the clip's own warm-grey background showing through whatever mask is used — it reads as a grey smudge), and if you must wait, wait for **playback position ≥ 2.3s**, not the end. A shorter re-render that drops the static tail would remove the need for that gate entirely.
- **Playing this over a booting 3D scene visibly stutters, and it is GPU contention — not decode or network.** Measured with real Chrome + `requestVideoFrameCallback` at dpr 2 (2026-08-05): presented-frame gaps hit **132–166 ms consistently at 200 ms and 340 ms after playback starts** (clean 33 ms after that) while the R3F render loop is running; suspending the scene render drops it to 57–75 ms with 0 dropped frames, identical to a no-3D baseline. **Throttling the render loop to 1 frame in 8 changes nothing** (166/159 ms) — the cost is the first render's pipeline/shader build, not per-frame work. Three measurement traps found the hard way: `timeupdate` follows the **media clock** and stays perfectly smooth through dropped frames (it once "proved" there was no stutter — use rVFC or `getVideoPlaybackQuality()`); Playwright's default **dpr 1 understates** contention on that pixel-bound scene; and a **401-only backend skips catalog/GLB work**, so numbers taken that way are a lower bound on real boot jank. `about:blank` is also useless for a playback smoke test — its opaque origin makes the load fail as `MEDIA_ELEMENT_ERROR: Format error`, which looks exactly like a codec problem.
- **higgsfield background removal cannot produce alpha.** `video_background_remover` and `sam_3_video` both return `pix_fmt=yuv420p` (opaque black background, no alpha channel), and on soft-glow / semi-transparent holographic frames the matte collapses: measured on `desk-build`, the chair vanished entirely and the monitor and keyboard were punched full of holes (2026-08-05). So a generated clip can only sit on a container whose background matches its own — **never over the 3D canvas or a glass HUD**.
- **`desk-build`'s own background is a vertical gradient, `#B0A297` (top) → `#D5CCC6` (bottom)** — not the page off-white `#FAFAF9`. Consumers must hide the seam themselves; `LoadingScreen` does it with a `radial-gradient` mask on `.loading-motion-slot` (`src/three/bootstrap/style.css`).
