---
paths:
  - "**/components/desk-feed/DeskFeedUploadForm.tsx"
  - "**/components/desk-feed/DeskFeedEditForm.tsx"
  - "**/components/desk-feed/DeskFeedProductPicker.tsx"
  - "**/components/desk-feed/DeskFeedPhotoProductTagger.tsx"
  - "**/utils/deskFeedContent.ts"
  - "**/api/deskFeed.ts"
  - "**/app/desk-feed/new/**"
  - "**/app/desk-feed/[postId]/edit/**"
---

# desk-feed — 작성·수정 폼, 사진 업로드, 제품 태그

Output language: Korean.

(Over 300 words on purpose: these are ordering rules across four write paths — post, presign,
body PUT, tag PUT — and getting the order wrong yields a 422, an orphaned photo, or a post the
user can no longer see. A shorter version could not say which call goes where.)

불변 규칙(정본은 `frontend/src/components/desk-feed/CLAUDE.md`): 사진의 위치 정본은 본문 마크다운
`![alt](imageKey)`이고, 본문에 박는 것은 key지 URL이 아니다. 아래는 그 정본을 지키는 절차와 실측 근거다.

## 작성은 3단계다 (presign이 글 존재를 요구한다)

`CommunityEditor`와 같은 순서다.

1. `POST /desk-feeds` — 이때 본문은 아직 `blob:` 미리보기 주소를 물고 있다.
2. presign 업로드 + 등록(`POST /desk-feeds/{id}/images`, key 하나만).
3. 본문의 blob URL을 **imageKey**로 치환해 `PUT`.

②③이 실패하면 사진 0장 글이 남으므로 best-effort로 지운다 — 사진 0장 글은 서버가 목록에서 숨기고
상세도 작성자 외 404라 사용자에겐 사라진 글이다.

본문 인라인 이미지 1~30장 검증은 작성 시점 본문이 `blob:` 주소를 물고 있어도 **장수는 성립**하므로
통과한다. 상한 판정은 레지스트리(presign)와 본문(작성·수정) 두 곳에 있고 세는 대상이 다르다 —
presign은 그 시점의 DB 행 수 + 요청 수로 본다(화면 장수가 아니다).

## 에디터 삽입 경로는 셋이다

상단 업로드 존(본문 끝) · 본문 **드래그 앤 드롭**(드롭 위치) · **⌘V 붙여넣기**(커서 위치).

- **작성 폼**은 셋 다 `onSelectImage`로 blob↔File 짝을 모아 게시 때 한꺼번에 올린다.
- **수정 폼**은 글이 이미 있어 고르는 즉시 올린 뒤 그 자리의 blob 주소만 key로 바꾼다(실패하면 죽은
  blob이 본문에 남지 않게 그 마크다운을 뗀다).

새 삽입 경로를 만들면 반드시 같은 자리를 지날 것. 이 도메인만 쓰는 API가
`PostRichEditorHandle.insertImages`(상단 업로드 존이 여러 장을 본문 끝에 꽂는다)다.

## 업로드 존과 썸네일 줄

- **사진 업로드 존은 폼 맨 위에 크게 둔다** — 사진이 본체인 도메인이라서다(커뮤니티는 툴바 버튼뿐).
- 그 아래 썸네일 줄은 **본문에 실제로 남아 있는 사진만** 비춘다.
- **작성 폼의 썸네일에 삭제 버튼이 없는 것은 의도다** — 지우는 곳이 두 곳이면 정본이 갈린다(본문에서
  이미지를 지운다).
- **수정 폼의 삭제 버튼은 서버 사진을 지운 뒤 `community/communityContent.removeImageMarkdown`으로
  본문에서도 같이 뗀다.** 한쪽만 하면 본문에 죽은 key가 남거나(렌더 실패) DB에 고아 사진이 남아 30장
  상한을 헛되게 먹는다.

## 제품 태그 PUT은 글 단위 목록 저장 뒤에 친다

사진별 태그는 글 단위 `productIds`(≤10)의 **부분집합**이라, 새로 붙인 제품을 먼저 보내면 422다.
그래서 두 폼 다 태그를 들고 있다가 저장 때 흘려보낸다.

- **수정 폼**은 고친 사진만 (imageId → ids) 모아 `PUT /desk-feeds/{id}` 뒤에 이어 친다. 사진을 지우면
  그 예약도 지운다 — 안 지우면 없는 사진에 404.
- **작성 폼**은 imageId가 게시 직전에야 생기므로 blob 미리보기 주소로 들고 있다가 업로드 결과와
  짝지어 마지막에 친다. 아직 업로드 안 끝난 사진은 태그 패널이 안 열린다.

목록이 꽉 차 글 단위 ≤10에 못 들어간 제품은 **태그에도 넣지 않는다**(서버가 글 목록 밖 제품을 422로
막는다).

## 제품 피커

카탈로그와 같은 서버 검색(`GET /products?q=`)을 쓰고 받아 온 결과를 다시 거르지 않는다.
**503 `PRODUCT_SEARCH_UNAVAILABLE`은 "0건"이 아니라 그 사실을 말한다**(폴백 부재 — ADR-0019 결정 6).

"배치에서 제품 불러오기"는 첨부된 배치가 있을 때만 뜨고(=수정 화면) 배치의 `desk.productId` +
`items[].productId`를 **합집합으로 더한다** — 덮어쓰기 금지(손으로 붙인 태그가 날아간다).

## 멘션 삽입 순서

수정 화면에서 후보를 고르면 `onMentionInsert`로 해석표에 **먼저** 넣어야 한다. 안 넣으면 그 뒤 재파싱
(사진 삭제 → `setContent`) 한 번에 그 멘션이 "@알 수 없음"으로 바뀐다.

트리거 판정은 댓글 textarea와 에디터가 `utils/mentionQuery`를 **같이** 쓴다 — 입력기마다 다르면 이메일
주소가 한쪽에서만 열린다.
