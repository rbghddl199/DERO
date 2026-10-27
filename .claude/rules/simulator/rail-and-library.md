---
paths:
  - "frontend/src/components/simulator/EditorSidebar.tsx"
  - "frontend/src/components/simulator/LibraryPanel.tsx"
  - "frontend/src/components/simulator/LikedProductsPanel.tsx"
  - "frontend/src/components/simulator/WallDiagram.tsx"
  - "frontend/src/components/simulator/LightSwitch.tsx"
---

Output language: Korean

# simulator rail · library · liked panel — the constraints not held by `components/simulator/CLAUDE.md`

Canon there: `appendCatalog` or cards can't be dragged, the shared `/product` heart, no per-flyout
close button and no `<`/`>` on the left, categories are frontend-fixed with server-side filtering,
never re-apply the client name filter to real entries, search has no fallback, `WallDiagram` holds
no state, flyout DOM is absent until the rail click. Read that file first.

(Every `paths:` entry here is inside that folder, so D4 would normally fold these into it — they
stay in rules because that CLAUDE.md is already at the 2,000-token ceiling and the survey verdict
for this file is 분할, not 삭제. Fold them in when that file gets its own diet. Over 300 words for
the same reason — folding is blocked, so the rail, library, search and liked-panel constraints all
live here.)

- **Stop the heart's pointer/click propagation before `attachLibraryDrag`** — otherwise pressing
  the heart starts a placement drag.
- **The liked panel goes through `productLikesStore.syncFromServer()`, never `getLikedProducts()`**
  — hearts and cards must come from one response.
- **The debounced search value (300ms `SEARCH_DEBOUNCE_MS`) drives both `useCatalogPage`'s query
  AND `categoryIds`** — feeding the immediate value fires a whole-catalog request on the first
  keystroke and the real search 300ms later.
- **A group sends its root `categoryId` only** — the server rolls up the subtree, so root+children
  duplicates products (`categoryIdsOf()` guards this).
- **Category ids are hardcoded from the live DB tree (roots 52–61, subs 62–78), not from the repo
  seed** — the seed file's flat 900–908 is stale; never derive ids from it.
- **The suggestion dropdown keeps its own 150ms debounce**, selects on `onPointerDown` (not
  `click`, which races the blur timer), delays the `onBlur` close by 120ms, and closes with
  `close(값)` — calling it with no argument closes "the current query", so the dropdown reopens the
  moment the input becomes that value.
- **`GallerySection` must pass its own scroll container (`.hud-gallery`) as the
  `IntersectionObserver` `root`** — with the default viewport root the sentinel is already visible
  and every page loads at once.
