# home — landing page (`/`) presentation components only

Inherits root `frontend/CLAUDE.md`. Hero, community preview, articulation showcase — landing-only UI.
No domain logic, no global state.

## Persistent issues

- R3F `<Canvas camera={{ position: [...] }}>` sets camera **position** only; it does not auto-face the
  origin. Default rotation is front -Z, no tilt, so an off-axis position makes the camera miss the
  subject. Get the camera via `useThree()` and call `camera.lookAt(x, y, z)` explicitly. The `src/three/`
  simulator engine is immune — it mounts the finished camera built by `scene.ts`. Applies only when
  building a **new** camera from scratch on an R3F Canvas (`MonitorArmScene.tsx`, 2026-07-24).
- A wide/short container ratio like `sm:aspect-[16/9]` narrows the vertical FOV of fixed-fov cameras
  (`DesktopScene.tsx` etc.) and clips the bottom of the model — do not touch the camera; keep the
  container taller, e.g. `aspect-[4/3]` (`DesktopShowcase.tsx`, 2026-08-02).
- Adding a Korean-named PNG to `src/assets/home/` (e.g. `모니터암_배경투명화.png`) → "Module not found":
  macOS stores the name NFD (decomposed) on disk while the `@/assets/home/...` import string is NFC, so
  bytes differ; `ls` shows them identical. Re-normalize to NFC with
  `python3 -c "import unicodedata,os; [os.rename(f, unicodedata.normalize('NFC', f)) for f in os.listdir('.') if f != unicodedata.normalize('NFC', f)]"`
  (`homeCopy.ts`, 2026-08-02).
