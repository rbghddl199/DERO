---
paths:
  - "**/frontend/e2e/**"
  - "**/frontend/scripts/**"
  - "**/frontend/qa-artifacts/**"
---

Output language: Korean

# Measuring UI in an automation browser — evidence behind `components/common/CLAUDE.md`

These traps make scroll- and time-sensitive UI look broken when it is not. Prevention sentences live in `src/components/common/CLAUDE.md`. Simulator e2e operating rules are canon in `frontend/e2e/CLAUDE.md`; the long-form record behind them (coachmark seeding list, suite degradation, the shelved drag e2e) moved to `docs/context/3d-scene.md` § "e2e — 시뮬레이터 스펙 운영 기록".
(Over 300 words on purpose: 4 measurement traps that each produce a *plausible wrong number* rather
than an error — the fix is only usable with the replacement API written out.)

## The QA tab is `document.hidden === true`

rAF-based animation (framer-motion etc.) halts and `getComputedStyle` returns stale values — transitions can only be verified through class/DOM state; visual checks need a real user browser. `getBoundingClientRect()` likewise returns stale coordinates; verify positions from the inline `style` value (`el.style.top`).

**`setTimeout` is throttled too**, so sampling-loop time labels drift from real elapsed time — judging "the timer fired early/late" from labels alone is a misdiagnosis (2026-07-28 precedent). Verify order/count by stamping event times directly (`history.pushState` monkey-patch + `performance.now()`).

## `window.scrollTo()` fires no `scroll` event

Measured: a probe listener received 0. Testing scroll-reactive UI that way misdiagnoses as "value never updates" — dispatch it yourself with `window.dispatchEvent(new Event('scroll'))`. On pages where list filters change document height, 150ms after scrolling is too early — wait 250ms+ for it to settle (2026-07-29 scrollbar drag verification nearly misdiagnosed on a 4px delta).

## Tool-call latency swallows the thing you are measuring

**Real elapsed time between a `navigate` tool call and the next `javascript_tool` call is seconds** (agent processing included) — `performance.now()` already reads thousands of ms on that script's first call (measured: verification script ran 12.7s after load). So "call a tool right after navigation to check for a delay" always runs after the delay has passed and yields a false "appeared instantly" (2026-07-29, old `SectionReveal` `delayMs` verification; the component is gone but this tooling trap stands).

Do the navigation (link click) **and** the measurement inside one script execution and compare `performance.now()` at click vs. a `MutationObserver` DOM-change timestamp — only click-relative deltas are trustworthy; absolute "elapsed since page load" cannot be measured this way.

## Reading Tailwind v4 rules from `sheet.cssRules`

Looking up a selector directly in `sheet.cssRules` always returns empty — Tailwind v4 nests utilities inside a single `@layer utilities { ... }` rule, so you must recurse into `rule.cssRules` to see individual class rules (`.opacity-0` etc.). Concluding "the rule doesn't exist" without recursing is a misdiagnosis.
