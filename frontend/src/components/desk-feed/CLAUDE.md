# src/components/desk-feed — /desk-feed 실사진 갤러리·업로드·상세·수정

Inherits `frontend/CLAUDE.md`. Routes: `/desk-feed` (갤러리) · `/desk-feed/new` (사진 올리기) ·
`/desk-feed/[postId]` (상세) · `/desk-feed/[postId]/edit` (수정).
사용자가 **실제 책상 사진**을 올리는 도메인이다 — 컬렉션(3D 배치 공개)과 UI만 비슷할 뿐 별개다.
주의: "데스크피드"는 컬렉션의 옛 이름이기도 하다(2026-08-10 이전 문서의 `/desk-feed` 참조는 컬렉션 얘기다).

절차·실측 근거는 `.claude/rules/frontend/`가 `paths:`로 들고 있다 — `desk-feed-editor-upload.md`
(작성 3단계·삽입 경로·썸네일·제품 태그 순서), `desk-feed-view-rails.md`(갤러리·레일 앵커 규칙).

## 화면 구조 — 이전/다음과 두 레일

- **상세의 이전/다음 글은 서버 조회가 아니다** — `GET /desk-feeds`는 커서 페이징뿐이라 이웃을 물을 수
  없다. 갤러리가 불러온 순서를 `store/deskFeedNavStore.ts`(세션 메모리, persist 없음)에 남겨 상세가
  읽는다. **직접 URL 진입·새로고침에서 내비게이션이 숨는 것은 의도다.** 같은 라우트 내 param 이동이라
  상세는 `key={postId}` remount로 상태를 초기화한다.
- **두 레일(`DeskFeedActionRail`·`DeskFeedProductRail`)은 데스크톱 전용 중복 표시다** — 본문 끝 인라인
  좋아요 버튼도 하단 제품 그리드도 대체하지 않고 같은 상태를 겹쳐 그린다(모바일엔 여백이 없어 안 뜬다).
  **좋아요 상태를 한쪽에만 물리면 두 버튼이 갈린다.** 레일의 댓글 버튼은 서버 왕복이 아니라
  `#desk-feed-comments` 앵커 점프라 **앵커를 지우면 조용히 아무 일도 안 일어난다.**
- **카드 커버는 실사진 자연 비율(`w-full h-auto`)이라 plain `<img>` + onError 폴백을 쓴다** — 가짜
  aspect 해시가 없다. 이미지 주소는 만료 없는 공개 URL이므로(ADR-0035) next/image 전환은 별건이다.

## Data model — 전용 `desk_feed` 도메인, **post 동형 콘텐츠** (D34·ADR-0037)

- **백엔드는 `/api/v1/desk-feeds` 한 벌이다**(전용 5테이블 + `desk_feed_product`). 2026-08-10 오전의
  "post + 예약 해시태그 `데스크피드`" 구조는 같은 날 오후 폐기됐다 — **되살리지 말 것**(ADR-0033 결함 1~4).
- **제목(필수, ≤100) + 마크다운 본문(필수)이다**(D34·ADR-0037). 이 도메인은 하루 사이 콘텐츠 모델이 세 번
  뒤집혔다(0034 마크다운 → 0036 인스타형 → 0037 마크다운). **축을 고정한 것은 사업 전제(SEO 사활)**이므로
  그 전제가 살아 있는 한 인스타형(사진 스택 + plain text)으로 되돌리지 않는다. 카드·내비·alt에 거는 이름은
  언제나 `title` 필드다.
- **사진의 위치 정본은 본문 마크다운 `![alt](imageKey)`다.** `images`는 순서도 대표 플래그도 없는 **소속
  레지스트리**이고, 목록 카드 표지(`coverUrl`)는 서버가 **본문 첫 이미지**에서 파생한다(대표 선택 UI 없음
  — 대표를 바꾸려면 본문에서 순서를 바꾼다). 그래서 **`PUT`에 `imageKeys`가 없다** — 등록은
  `POST /desk-feeds/{id}/images`(key 하나만), 삭제는 `DELETE .../images/{imageId}`다. 전체 교체 PUT을
  되살리면 정본이 둘로 갈린다.
- **본문에 박는 것은 언제나 key지 URL이 아니다** — URL 조립 규칙이 바뀌어도 본문이 안 깨지도록 상세가
  `images`의 (imageKey → imageUrl) 맵으로 렌더 시점에 해석한다.
- **본문 인라인 이미지 1~30장은 서버가 검증한다**(0장·31장 모두 422
  `DESK_FEED_CONTENT_IMAGE_COUNT_INVALID`). 상한 판정은 레지스트리(presign)와 본문 두 곳에 있고 **세는
  대상이 다르다** — 기준은 화면 장수가 아니라 **서버에 저장된 장수**다.
- **"사용된 제품"은 글 단위 `productIds` ≤10**(ADR-0034 결정 5). **사진별 제품 태그는 정션 API**(D37 개정·
  ADR-0040) — 읽기는 상세 응답의 `images[].productIds`, 쓰기는
  `PUT /desk-feeds/{id}/images/{imageId}/products`(전체 교체, 빈 배열이 "태그 없음"). 태그는 **id만**
  나르고 글 단위 `usedProducts`에 없는 id는 안 그린다. **본문 토큰 `[[products:…]]`는 2026-08-12 같은 날
  폐기됐다 — 되살리지 말 것**(마이그레이션이 본문을 직접 변환한 이력 V13·V14 때문에 토큰이 통째로 날아가고
  주인 잃은 토큰이 위쪽 사진에 달라붙었다).
- **멘션은 본문·댓글에 `[[user:ID]]` 토큰으로 저장된다**(D35·ADR-0038) — 닉네임이 아니라 **안정 userId**다.
  해석은 서버가 응답에 동봉하는 `mentions` 표로만 하고 프론트는 치환만 한다(본문은 `resolveMentions` →
  `PostContent`, 마크다운을 안 거치는 댓글은 `MentionText`). **표에 없는 id는 "@알 수 없음" 무링크.**
  **본문 문자열을 화면 글자로 쓰는 자리는 전부 치환을 먼저 태울 것**(카드 발췌·SEO description·schema.org
  `articleBody`) — 안 하면 검색 결과에 `[[user:12]]`가 뜬다.
- **`@` 자동완성은 데스크피드에서만 켠다**(`PostRichEditor`의 `enableMention`) — 커뮤니티 게시글 멘션은
  부결이라 그쪽 상세는 해석표를 안 받는다.
- **댓글은 서버 영속이다**(`desk_feed_comment`) — 커뮤니티의 세션 메모리 스토어를 **쓰지 않는다**. 카운트
  정본은 목록 응답의 `totalCount`이고, 작성·삭제 뒤에는 첫 페이지를 다시 받는다.
- **검색창이 없다** — 서버 검색은 후속이다(ADR-0033 결정 6). 클라이언트 필터로 흉내 내지 말 것(받아 온
  페이지만 거르는 착시가 된다). 북마크 없음(엔드포인트 자체가 없다) · 좋아요는 토글(멱등 204) 성공 후
  GET으로 서버 값을 재확정.
- **동영상은 본문 유튜브 임베드로만 받는다**(D36) — 자동 링크된 유튜브 주소를 `PostContent`가 플레이어로
  바꾼다(에디터·저장 모델·BE 무변경). **직접 업로드는 백로그**(에픽 617)이고 되살리려면 크기 방어·코덱·
  Range·대역폭 넷이 한 묶음이다.
- **배치 첨부는 수정 화면의 피커뿐이다**(자동 첨부 부결 — ADR-0033 결정 4). 후보는 **본인 소유 + PUBLIC
  배치만**이고 서버도 같은 조건으로 검증한다(아니면 422). `PUT`의 `placementId: null`은 "안 건드림"이
  아니라 **첨부 해제**다(전체 교체 의미론).
- 상세의 배치는 **요약 카드**다 — 3D 뷰어 임베드는 부결(컬렉션 상세가 이미 하는 일이고 사진 글에 엔진
  로드가 붙는다). 배치가 공개취소·삭제되면 서버가 `placement`를 `null`로 답해 카드가 사라진다(FK는 남는다).
  첨부가 없을 때만 "이 사진으로 배치 만들기"(`/craft/new`)를 권한다.

## 재사용과 seam

- **커뮤니티 컴포넌트를 재사용한다** — 작성·수정 본문은 `community/PostRichEditor`, 상세 본문은
  `community/PostContent`다(갤러리·카드는 여전히 복사만, 공유 금지). 아바타는 공용
  `common/PersonAvatar.tsx`(community의 `AuthorAvatar` 금지).
- **뷰 모델 seam이 없다** — 마커를 떼려고 있던 `api/deskFeed.ts` 매퍼가 할 일을 잃어 컴포넌트가
  `types/deskFeed.ts`(DTO)를 직접 읽는다. 다시 seam을 만들려면 바꿀 이유부터 적을 것.
- **사진 MIME 상수를 따로 두지 않는다** — 백엔드 표가 `PostService`와 같은 넷이라 `constants/post.ts`의
  `POST_IMAGE_ACCEPT_ATTRIBUTE`를 그대로 쓴다(`image/*`로 두면 heic를 고른 뒤 업로드에서 400이 난다).
