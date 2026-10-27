---
paths:
  - "**/components/collection/CollectionGallery.tsx"
  - "**/components/collection/CollectionGalleryLoader.tsx"
  - "**/components/collection/CollectionLoadErrorState.tsx"
  - "**/components/collection/CollectionCard.tsx"
  - "**/components/collection/CollectionCoverImage.tsx"
  - "**/components/collection/collectionPhotos.ts"
  - "**/app/collection/page.tsx"
---

Output language: Korean

# collection gallery — the three constraints not held by `components/collection/CLAUDE.md`

Everything else is canon there: masonry columns, the 503 banner, the single `#` strip, the
truthy-thumbnail ban, body-less bookmark PUT, the deleted demo tags, and the money line.
Read that file first.

- **Discard a page that arrives while the sort is changing** — compare `nextCursor` before
  appending. Appending it interleaves recency-sorted and popularity-sorted fragments.
- **Build the chip row only from unfiltered responses** (`chipTags` in the loader). A filtered
  response carries only placements holding that tag, so building the row from what is on screen
  collapses it to the selected chip with no way back to another tag.
- **Never "fix" the popular banner's ordering** — `FEATURED_POST_ID` (1652, 싸버지 데스크) is a
  deliberate hardcoded pin (2026-08-10 request) and falls back to the most-liked post only when
  that id is absent from the first page. "This banner isn't sorted by popularity" is the pin.
- The contest banner (`HomeContestBanner` + `assets/banner/home.webp`) was removed on 2026-10-27 —
  neither the home screen nor the `/collection` shell renders one anymore.
