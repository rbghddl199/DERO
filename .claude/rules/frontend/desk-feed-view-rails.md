---
paths:
  - "**/components/desk-feed/DeskFeedGallery.tsx"
  - "**/components/desk-feed/DeskFeedGalleryLoader.tsx"
  - "**/components/desk-feed/DeskFeedCard.tsx"
  - "**/components/desk-feed/DeskFeedDetail.tsx"
  - "**/components/desk-feed/DeskFeedActionRail.tsx"
  - "**/components/desk-feed/DeskFeedProductRail.tsx"
  - "**/components/desk-feed/DeskFeedPhotoLightbox.tsx"
  - "**/utils/deskFeedRailAnchor.ts"
  - "**/utils/deskFeedChipTags.ts"
  - "**/store/deskFeedNavStore.ts"
  - "**/app/desk-feed/page.tsx"
  - "**/app/desk-feed/[postId]/page.tsx"
---

# desk-feed — gallery and the two rails

Output language: Korean.

(Over 300 words on purpose: the rail-anchor block is a chain of ordering rules that already
produced two regressions — 630 and 631 — and each link fails a different silent way, so no
single sentence covers them.)

What the two rails *are*, and where prev/next comes from, is canon in
`frontend/src/components/desk-feed/CLAUDE.md`. Below are only the rules an edit can break.

## Gallery

- **Fixed flex columns + index round-robin. Never CSS columns** — column-wise fill redistributes
  every card when infinite scroll appends a page.
- **Collect chip tags from unfiltered responses only** — a filtered response carries only posts
  holding that tag, so there is no way back to another tag.
- **Keep the top-12 + collapse toggle; do not go back to full ㄱㄴㄷ exposure** — ~40 chips of equal
  weight had no hierarchy, and every appended page grew the row and pushed the gallery down
  (layout shift). Order is post-count descending, ties ㄱㄴㄷ (`utils/deskFeedChipTags.ts`).
- **Dedup the count by remembered `postId`** — a sort switch or retry re-delivers the same first
  page, and an unfiltered count inflates and flips the order.

## Rail anchor (ADR-0040 decision 5, revisions 1·2)

The ceiling is one value in three places — header + 112px, `sticky top-28`, and
`RAIL_CEILING_PX` in `utils/deskFeedRailAnchor.ts`. **Nothing syncs them; change all three.**

- **Movement is `position: sticky`'s job. Never write style from the scroll handler** — JS only
  moves the segment (`top`/`height`) when the anchored photo changes. Writing `transform`/
  `maxHeight` every frame lands after the compositor scroll and forces a reflow (630, janked).
- **Add the card block's height to the segment height** — sticky cannot leave its segment, so
  without it the rail is pushed out before the photo's bottom reaches the ceiling, and a segment
  shorter than the card never sticks at all.
- **Discard the last segment value when re-attaching after unmount** — otherwise the "same, skip
  the write" path leaves the rail at opacity 0.
- **Order is judge → `setState` → then check the DOM** (631 regression). On the first render no
  photo is chosen, so the tag list is empty and the rail is unmounted; checking for rail DOM
  first returns early and the judgment never runs again.
- **Never go back to `IntersectionObserver`** (628) — `PostContent` rebuilds its `img` renderer
  every render, so nodes captured at mount die and the observer never fires again.
- **The appear threshold must stay different from the disappear threshold** (25% of height, max
  200px) — equal thresholds flicker at the boundary.
- **Do not revive either discarded fallback** — the whole-post tag list showed a union across the
  entire scroll and hid the per-photo tags; "keep the previous tags across a non-photo stretch"
  has nowhere to live now that the position is bound to a photo.
- **Hide the rail for a photo with no tags.** Content swaps fade 150ms (`.desk-rail-fade`) and
  **the key belongs on the `<ul>`** — remount anything outside it and the handler's inline
  position is lost. Only a post where no photo has tags gets the anchor-less whole-post rail.
- **Both rails go after the body and the comments in the DOM** — `absolute` decides the visual
  position, and putting them first makes keyboard and screen-reader users pass 3 buttons plus 10
  duplicate product links before the post.

## Product rail

- **`xl:` and up only, not `lg:`** — at 1024px the left margin is 92px, which fits the 48px action
  rail but not a card.
- **Never dress a NULL price as 0원** (self-built products), and hide the section on an empty
  `usedProducts` (soft-deleted products are already absent).
- **A cancelled share sheet is not a failure** (`utils/shareLink.ts`).
