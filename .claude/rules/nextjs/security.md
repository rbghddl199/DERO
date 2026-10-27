---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/app/**/*.ts"
---
# React & Next.js Security

The NEVERs that have to hold at write time. CSP boilerplate, source-map and `npm audit` advice were
deleted as general knowledge (rules-diet 2026-08-14); server headers (HSTS, CSP delivery) are the
nginx/deploy side — `docs/context/deployment.md`. Full audit: the `/security-review` skill.

- **Never `dangerouslySetInnerHTML` without sanitizing at the same call site.** `DOMPurify.sanitize(...)` inside the same expression, configured as an allowlist. Sanitizing at the API boundary counts only if every consumer is verified. Prefer plain `{text}` or a markdown renderer that sanitizes.
- **Never put a user-supplied URL in `href` / `src` / `xlink:href` without a scheme check.** Parse with `new URL()` and allow only `http:`, `https:`, `mailto:` — `javascript:` and `data:` execute arbitrary code. React's dev-mode warning does not block them at runtime.
- **Never `target="_blank"` without `rel="noopener noreferrer"`.** The target page reaches `window.opener` otherwise; do not rely on the browser default.
- **Never store a session in `localStorage`.** Any XSS reads it. httpOnly secure cookies only.
- **Never put a secret in a `NEXT_PUBLIC_*` var.** Everything with that prefix is bundled into the client and is public. On every env-var change ask: would this string in the public bundle be a problem?
- **Never spread an untrusted JSON response into state.** `setState({ ...state, ...await res.json() })` hands the attacker `__proto__` — pick and coerce the keys you expect.
- **Never treat a client-side check as a guarantee.** Client validation is UX only. Authentication, authorization, input validation and rate limiting are Spring's responsibility, and render-gating in JSX prevents display, not access.
