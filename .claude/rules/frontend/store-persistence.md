---
paths:
  - "**/frontend/src/store/**"
  - "**/frontend/src/**/*Store.ts"
  - "**/frontend/src/**/*Bootstrap.tsx"
  - "**/frontend/src/utils/mapSetJsonStorage.ts"
  - "**/frontend/src/components/simulator/SimulatorCanvas.tsx"
---

# frontend — zustand store / persistence traps

Output language: Korean.

(Over 300 words on purpose: each of the five rules fails in a different silent way — an infinite
re-render, a hydration mismatch, a `{}` where a `Map` was, a wholesale dead screen, state
surviving a route change — and none of them shows up in a diff.)

Full narrative behind the one-line rules in `frontend/CLAUDE.md`.

## Never build a derived array/object inside a zustand v5 selector

`useStore(s => Object.keys(s.draft.segments))` returns a new reference per snapshot and
`useSyncExternalStore` re-renders forever. Take the store's reference as-is and derive in the component
body (2026-07-25 DERO-155).

## `persist` on localStorage — automatic rehydration breaks hydration

SSR has no `localStorage`, so the server always renders empty state while the client restores at
store-creation time and differs from the very first render. Set `skipHydration: true` and have a
root-layout bootstrap component (same slot as `AuthBootstrap`) call `store.persist.rehydrate()` from
`useEffect` after mount (`PersistedInteractionsBootstrap.tsx`).

`Map`/`Set` are flattened to `{}` by `JSON.stringify`, so `createJSONStorage` needs a tagged
reviver/replacer (`mapSetJsonStorage.ts`), and the storage getter must branch on
`typeof window === 'undefined'` or referencing `localStorage` on the server throws `ReferenceError`
(2026-07-29, `productLikesStore.ts`/`communityBookmarksStore.ts`).

## Removing a member from a persisted union needs `version` + `migrate`

Otherwise the stored value is restored, a lookup table returns `undefined` and the screen dies wholesale
(2026-08-02, after dropping the `timedOut` notification kind:
`Cannot read properties of undefined (reading 'tone')` in the notification bell; `dropUnknownKinds` in
`uploadNotificationsStore.ts`).

## A store is a module singleton — per-mount reset must be one factory

Anything not in its per-mount reset survives a route change. `simulatorStore.resetForMount()` (called
synchronously from `SimulatorCanvas.tsx` on mount) hand-listed its fields and omitted `warning`, so a
collision banner raised on one desk was still on screen after entering a brand-new desk;
`moveHistory`/`redoHistory`/`saveViolations`/`toast`/selection/`editLocked` had the same omission (undo
history crossing desks). The root cause is **two hand-kept lists that must agree** — the initial state
literal and the reset — so the session-scoped slice now lives in one `sessionScopedInitial()` factory that
both spread. **A factory, not a shared const**: spreading one object into both places makes array/object
fields share a reference.

Engine mirrors (`wallState`, `themeKey`, `roomLightOn`, …) stay out of it — `enterSim`/`setDeskConfig`/
`loadPlacement` overwrite them from the fresh engine — and the catalog cache (`categories`,
`deskTextures`) is meant to outlive a mount (2026-08-05 DERO-452, guard
`tests/simulatorResetForMount.test.ts`).

## React Compiler lint vs `useThree()` camera

The React Compiler lint (`react-hooks/immutability`) errors on mutating a camera obtained from
`useThree()` — create a `PerspectiveCamera` yourself and register it with `set({ camera })` instead (the
`SimulatorCanvas.tsx` approach); the initial aspect then has to come from a `useThree(s => s.size)` effect,
because R3F's resize path only updates after registration (2026-07-25 DERO-155).
