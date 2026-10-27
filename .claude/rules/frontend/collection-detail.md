---
paths:
  - "**/components/collection/CollectionDetail.tsx"
  - "**/components/collection/CollectionDetailGate.tsx"
  - "**/components/collection/CollectionUsedItems.tsx"
  - "**/components/collection/CollectionGeneratedImages.tsx"
  - "**/components/collection/CollectionEditForm.tsx"
  - "**/components/collection/usedItems.ts"
  - "**/app/collection/[collectionId]/**"
---

Output language: Korean

# collection detail — the three constraints not held by `components/collection/CLAUDE.md`

Everything else on this screen is canon there: single fetch owner, distinct-product count,
404 drop, no client-side total, the edit form's write order, `IMAGES_PER_UPLOAD` parity with
the backend, 가져오기, and the single money line. Read that file first.

- **Hide a horizontal scrollbar on the track itself** — `scrollbar-none` **plus**
  `[&::-webkit-scrollbar]:hidden`. Global `html.hide-scrollbar` removes the document bar only,
  and Safari < 18.2 does not know `scrollbar-width`. Remove the arrows at the ends; never
  `disabled` (it reads as broken).
- **Keep `CollectionDetailGate`'s `hasHydrated()` / `onFinishHydration` guard** — without it the
  server title paints for one frame before the local title is applied.
- **Render the used-items section even at 0 items** (empty-state copy, both the sidebar dropdown
  and the bottom gallery), and **gate the sidebar toggle on `state.status === 'ready'`, never on
  `usedItems.length`** — the length gate flashes "0개" during the fetch window.
