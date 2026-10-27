---
paths:
  - "**/components/community/PostRichEditor.tsx"
  - "**/components/community/PostRichEditorToolbar.tsx"
  - "**/components/community/CommunityEditor.tsx"
  - "**/components/community/CommunityPostEditForm.tsx"
  - "**/components/community/PostContent.tsx"
  - "**/components/community/placementEmbedNode.tsx"
  - "**/utils/serializeEditorContent.ts"
  - "**/utils/richTextClasses.ts"
  - "**/utils/communityContent.ts"
---

Output language: Korean

# Community editor and post body — the constraints not held by `components/community/CLAUDE.md`

Everything else is canon there: `toImageAlt`, the placement-snapshot leak ban, the
serialize/parse round-trip contract, `imageKey` in the body, the `.tiptap` mirror,
`toPlainText` ordering, the null-editor toolbar, the starter-kit duplicate, the YouTube
allowlist, and the mount-captured-node ban. Read that file first.

- **`serializeEditorContent` must keep escaping literal `<` and `>` as `\<` / `\>`** — `rehype-raw`
  is on (underline/color/alignment need it), so an unescaped `<script>` a user typed parses as a
  real tag. They are CommonMark backslash-escapable, so the escape always returns as a literal.
- **Count photo-limit reservations in a ref, seeded from state** (`serverImages.length +
  inFlightRef.current`) — a limit read straight from state passes N times when N files arrive in
  one render, because every `onSelectImage` call sees the same snapshot. `react-hooks/immutability`
  refuses a ref an effect also writes, hence the seed-from-state shape.
- **Never remount `PostRichEditor` mid-draft** — in-progress typing is lost. `CommunityEditor`
  exists in that shape for this reason.
- **Revoke preview object URLs on unmount only, never right after upload** — the editor has not
  swapped the `src` yet and the photo flashes broken.
