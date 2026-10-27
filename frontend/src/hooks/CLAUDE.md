# src/hooks — cross-domain React hooks

Inherits `frontend/CLAUDE.md`. Holds hooks with no single owning domain (auth checks, image quota,
unsaved-changes exit guards). Domain-specific hooks stay colocated with their feature instead.

## Persistent issues

- **A plain `popstate` listener cannot reliably guard the browser back button in this app — Next.js
  App Router always wins the race.** `useHistoryBackGuard.ts` exists because of a real, measured bug:
  `useUnsavedDraftGuard`'s old implementation added a bare `window.addEventListener('popstate', ...)`
  and it silently never fired on a real back-button press (only on a manually-dispatched `PopStateEvent`
  in a test). Root cause: the App Router registers its own `popstate` listener at the app root, long
  before any page-level component mounts, so it always runs first. On a real back-press the URL
  genuinely changes, so the router immediately swaps the route tree — unmounting the guarded component
  and running our effect's cleanup (which removes our listener) **before our handler's turn comes up**
  in that same event's listener list. Console-instrumented proof: "listener attached" → "listener
  detached (cleanup)" back to back, with the handler's own log line never appearing in between
  (2026-08-03, `git log` this file for the throwaway diagnostic commit if you need to re-verify).
- **The fix is a "history sentinel," not a smarter listener.** `useHistoryBackGuard` pushes a
  history entry with the **same URL** the moment it's enabled. A back-press then only pops that
  sentinel — the URL never changes, so the App Router has nothing to react to and never touches the
  tree, so the guarded component survives and its `popstate` handler runs normally. `onBackAttempt(leave, stay)`
  gets `leave()` (consumes the sentinel via `history.back()` and lets the page actually change) and
  `stay()` (re-arms a fresh sentinel) — the confirmation UI itself (native `confirm()`, a custom modal,
  whatever) decides which to call, and can do so asynchronously.
- **Do not call `history.back()` and then synchronously push/replace another entry in the same tick —
  the second call gets silently dropped.** Measured in this exact codebase: `history.back(); history.pushState(...)`
  called back-to-back left `history.length` unchanged and the URL still on the pre-`back()` value — the
  browser's pending traversal wins and the immediately-following push is discarded. This is why the
  sentinel is only auto-consumed in the hook's own effect cleanup (there's always a real async gap
  before whatever happens next — a save request, a user re-clicking a button) and is deliberately
  **not** auto-consumed on the callers' own direct exit-button click paths, where a `router.push` often
  follows in the very same handler. Net effect: pressing an explicit "나가기"/취소 button while the
  guard was ever armed can leave one harmless extra duplicate history entry behind (worst case: back
  from the next page shows the guarded form again once, empty, before continuing back as normal). This
  is a known, accepted gap — fixing it needs every such call site to `await` the sentinel's removal
  (listen for the resulting `popstate`) before navigating, which is a much larger refactor than the
  bug this hook was built to fix. Don't "clean this up" without discussing the tradeoff first.
- **`useUnsavedDraftGuard(enabled)`** (community/collection draft forms) layers native `window.confirm()`
  and a `beforeunload` warning on top of `useHistoryBackGuard`; `confirmNavigationIfDraft()` is what
  `TransitionNavigator` calls before any in-app link click. The simulator's `EditorTopBar.tsx` calls
  `useHistoryBackGuard` directly instead, because it needs its own custom `ExitConfirmDialog` modal
  (not a native `confirm()`) — see `src/components/simulator/CLAUDE.md`.
- **`useHistoryBackGuard` takes an optional third arg, `onLeave`** (2026-08-06, added for the simulator's
  "always land on `/craft` regardless of what was actually in history" requirement) — when given,
  `leave()` calls it instead of `window.history.back()`, skipping the sentinel's real-back-navigation
  path entirely (and its `isLeavingRef` double-fire guard, which only matters for a genuine
  `history.back()`). Use this when a caller needs a **fixed** exit destination rather than "wherever
  the browser's real previous entry was" — the default (no `onLeave`) still does a genuine back-navigation
  and remains correct for every other caller (`useUnsavedDraftGuard`'s community/collection forms want the
  user's actual previous page, not a hardcoded one).
