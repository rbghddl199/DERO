---
paths:
  - "**/frontend/src/**/*.ts"
  - "**/frontend/src/**/*.tsx"
  - "**/frontend/tests/**/*.ts"
  - "**/frontend/e2e/**/*.ts"
  - "**/frontend/.prettierrc.json"
---

# frontend — Prettier / auto-formatter traps

Output language: Korean.

Prettier has never been enforced here: `npm run format:check` fails on 53 files, and the code is
mixed on semicolons even though `.prettierrc.json` says `"semi": true`. "The existing code looks
like this, so prettier allows it" is therefore not valid reasoning. Cleaning up the 53 is an open
question — config to code, or code to config — and it is not settled here.

- **Run `npx prettier --check` on new files only.** `--write` on one of the 53 stamps semicolons
  through the whole file, inflates the diff to ~2.5× the real change, splits that file's style
  from the rest, and silently settles that open question one file at a time.
- **Never pipe `prettier --check` through `tail`** (or any pipe) — you get `tail`'s exit code,
  which is always 0, and a failing file reads as passing.
- **Check `git diff` for unintended semicolons before committing.** An auto-formatter runs here
  unasked: files have appeared in the working tree with semicolons added right after being edited,
  with no agent running one. **Revert only those paths with `git stash push -- <file>`** — a
  blanket `git checkout .` destroys other work.
- **`prettier-plugin-tailwindcss` eats the spaces around string literals in conditional class
  template literals** — `` `cam-tab${cond ? ' active' : ''}` `` becomes `cam-tabactive` and the
  toggle breaks. Grep for that pattern before running `--write` on a whole file, and inspect the
  diff for lost spaces afterwards.
