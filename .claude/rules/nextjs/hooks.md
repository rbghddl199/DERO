---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/hooks/**/*.ts"
  - "**/hooks/**/*.js"
  - "**/use-*.ts"
  - "**/use-*.tsx"
---
# React & Next.js Hooks

React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, custom hooks) — NOT the Claude Code
`hooks/` runtime system. Only the rules a code review keeps missing; the React 19 hook catalog,
`useSyncExternalStore`, the stale-closure explanation and the custom-hook extraction guidance were
deleted as model default knowledge (rules-diet 2026-08-14, zero repo usage measured). Performance
judgment beyond these lines: the `react-performance` skill.
(Over 300 words on purpose: the five `useEffect` misuses and the cleanup example each guard a
different silent failure — a render loop, a stale value, a leak — and the cleanup one only lands as
code.)

## `useEffect` — When NOT to Use

`useEffect` is for synchronizing with external systems (subscriptions, browser APIs, third-party
libraries). It is **not** the right tool for:

- Derived state, or transforming data for rendering — compute it during render
- Resetting state when a prop changes — use a `key` on the parent or derive from props
- Notifying parents of a state change — call the callback in the event handler
- Initializing app-level singletons — call at module top level, or from the root `layout.tsx`

## Cleanup

Every subscription, interval, listener, or in-flight request must clean up. Missing cleanup = race
conditions when deps change, memory leaks on unmount.

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(handleResponse);
  return () => controller.abort();
}, [url]);
```

## Dependency Arrays

- Always include every reactive value referenced inside the effect/callback
- Never silence `react-hooks/exhaustive-deps` without a comment explaining why
- `rules-of-hooks` (error) and `exhaustive-deps` (warn) already come from `eslint-config-next/core-web-vitals` in `frontend/eslint.config.mjs` — do not re-declare them

## `useMemo` and `useCallback` — When Worth It

Default position: **do not memoize**. Add `useMemo` / `useCallback` only when the value is (1) a prop
of a `React.memo`-wrapped child where identity matters, (2) a dependency of another hook, or (3)
measurably expensive — profile before assuming.

## `useState`

- A `setState` that depends on the previous state uses the functional updater: `setCount(c => c + 1)`, never `setCount(count + 1)` inside async or batched contexts
