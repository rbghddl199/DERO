---
paths:
  - "**/components/community/CommunityGallery.tsx"
  - "**/components/community/CommunityDetail.tsx"
  - "**/components/community/PostCard.tsx"
  - "**/utils/searchQuery.ts"
  - "**/store/communityCommentsStore.ts"
  - "**/store/communityBookmarksStore.ts"
  - "**/app/community/page.tsx"
  - "**/app/community/[postId]/page.tsx"
---

Output language: Korean

# Community list, card and detail — the constraints not held by `components/community/CLAUDE.md`

Everything else is canon there: the CSS-columns ban, the `id` sort key, `EMPTY_COMMENTS`, the
503 search state, the debounced-query dependency, the single detail like button, and the
client-fetched detail. Read that file first.

- **Like and bookmark handlers must pass `requireAuth()`** (`CommunityGallery`,
  `CommunityDetail`) — logged out goes straight to `/login?returnTo=<current location>`, no popup
  (`useRequireAuth`). **The "작성하기" click gate stays off** — that is deliberate, not an omission;
  comment write/delete were always gated.
- **Anything placed next to `PostCard`'s `truncate` title needs a `flex min-w-0` wrapper and
  `min-w-0` on the `h3`** — put the `HOT` badge inside the `h3` and truncation eats it.
- **Strip the leading `#` exactly once, on the frontend** (`utils/searchQuery.ts`) — the server
  does not strip it. Stripping on both sides breaks `##태그`; on neither side tags never match.
