---
paths:
  - "**/frontend/scripts/**"
  - "**/frontend/qa-artifacts/**"
  - "**/frontend/src/app/simulator/thumbnail-render/**"
---

# frontend — canvas capture / visual QA measurement traps

Output language: Korean.

(Over 300 words on purpose: this is the only canon for canvas capture — `frontend/CLAUDE.md`
carries a one-line pointer — and every rule below is a way the *measurement* goes wrong while
still producing a plausible number, which no code review catches.)

Applies to `scripts/*.mjs`, anything under `qa-artifacts/`, and the `thumbnail-render` route.
Playwright **spec** authoring rules live in `frontend/e2e/CLAUDE.md`.

## Running the capture

- **Attach to `next build && next start`, never `next dev`** — the dev overlay badge lands in the
  frame.
- **Write nothing into the repo during a run** — even a `qa-artifacts/*.mjs` write triggers an HMR
  reload back to the start screen, after which every `page.screenshot` returns the same frame and
  region means match byte-for-byte. **Assert `시작하기` is absent right before each capture.**
- **Kill the listener directly, by port** (`ss -lptn 'sport = :3100'`). Killing a backgrounded
  `next start`'s PID kills only the `sh -c` wrapper; the `next-server` child keeps the port and
  serves 200 over an overwritten `.next`. **Never `pkill -f next-server`** — it matches its own
  command line and suicides.

## Getting a usable frame

- **`alpha: true` on the renderer, and strip the `document.body`/`html` CSS background in the
  script** — otherwise Playwright's `omitBackground` does nothing and tone mapping crushes a
  constant `scene.background` dark.
- **Launch with the SwiftShader flags from `e2e/playwright.config.ts`** in any GPU-less
  environment, or the alpha channel is dropped silently into an opaque black background.
  **Check new PNGs are RGBA with `file`.**
- **Headless `page.screenshot` times out on SwiftShader readback — capture with
  `headless: false`.** But if the simulator never boots headed (macOS, `__sim` never appears),
  try headless first; only readback needs the headed path.
- **On WSL use `xvfb-run`, never WSLg (`DISPLAY=:0`)** — `sampleRegion()` returns `0,0,0` and
  screenshots come back stale, which reads as "the render never changes". **Never compare
  Xvfb+SwiftShader frame timing against hardware numbers.**

## Reaching into the page

- **`window.__sim` is the only page-side engine handle** — `window.__simEngine` does not exist and
  the R3F store is unreachable from the page. Mesh-level inspection needs a handle exposed
  deliberately.
- **A React-controlled `<input>` will not move via `el.value = v`** — React's value tracker
  records it as already known and `onChange` never fires. Use
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)`, then
  dispatch `new Event('input', { bubbles: true })`.

## Judging pixels

- **Judge "different picture" on a color axis, never a brightness sum or L1** — a paled sky landed
  at the same brightness as a neutral wall and broke the guard. Window/sky content is
  blue-dominant by design; see `blueness` in `room-finish.spec.ts`.
- **Validate the measurement window against a pair that definitely changed, and measure the noise
  floor** (same code twice) — a window sitting on a wall band reports "no change" for a scene that
  moved.
- **Never compare screenshot sha1 across reloads** — the same URL loaded twice differs on ~9% of
  pixels for unknown reasons, more than the effect being measured. Rendering *is* deterministic
  within one page load, so do A/B captures **inside a single load**; if a reload is unavoidable,
  report pixel diff plus the reload noise floor.

## `qa-artifacts/` tracking

- **Not entirely untracked** — scripts and verdict records worth keeping as regression guards are
  force-tracked with `git add -f`. **No PNGs** (one folder hit 11MB and there is no LFS).
- **Copy any frame worth keeping out of the repo right after the verdict** — the scratchpad is
  swept too. If already lost, an image you actually opened with Read survives as base64 in the
  session transcript (`~/.claude/projects/**/*.jsonl`) at original resolution.
- **Force-tracked verdict records get swept away by unrelated commits** — one feature commit
  deleted 32 tracked files and nobody noticed for 3 days. A harness meant as a regression guard
  belongs outside `.gitignore` (`frontend/scripts/`).
