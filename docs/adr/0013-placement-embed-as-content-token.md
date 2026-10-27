# ADR-0013. 게시글의 배치 참조는 FK 컬럼이 아니라 본문 `[[placement:ID]]` 토큰

## 상태

**확정** — 2026-07-30, 승인 박동규. **(ADR-0011 결정 1 대체)**
결정 티켓 DERO-274. 기획 근거는 `docs/CONTEXT.md` D25(2026-07-30 개정분).

**[ADR-0011](0011-post-as-separate-axis-from-placement.md)은 확정 상태 그대로 남는다.** 이 ADR이 뒤집는 것은 그 결정 1 하나고 결정 2~8은 전부 유효하다 — [ADR-0008](0008-api-response-contract.md)이 ADR-0006 결정 6만 부분 개정하고 ADR-0006을 확정으로 남긴 것과 같은 처리다.

스키마 정본(`docs/context/erd.md`) 개정은 동결 언락이 필요한 별도 작업이다(`docs/HARNESS-RULES.md` §4).

**이 ADR은 `post`(스토리 글)에 한해 유효하다.** 2026-08-10 신설된 데스크피드(실사 사진 글)는 배치 참조를 토큰이 아니라 **단일 nullable FK**(`desk_feed.placement_id`)로 한다 — 카디널리티가 다르기 때문이며(스토리 글은 여러 배치, 사진 글은 최대 1개), 이 ADR이 미룬 역방향 조회 요구가 그쪽에서 실현됐다. 상세는 [ADR-0033](0033-desk-feed-dedicated-domain.md) 결정 3.

## 맥락

ADR-0011이 오늘 확정됐다. 그 결정 1은 배치 참조를 **`post.placement_id` nullable FK 한 개**로 표현했다. 확정 직후 요구를 다시 읽는 과정에서 그 표현이 요구를 담지 못한다는 것이 드러났다. 그 하나만 뒤집는다.

**단일 FK는 배치를 하나만 가리킨다.** 게시글의 본래 요구는 "내가 만든 **여러** 데스크테리어를 소개하는 글"이다. 컬럼 하나로는 다중 참조를 표현할 방법이 없고, 참조를 늘리려면 결국 정션이나 다른 표현이 필요해진다.

**프론트에는 같은 문제를 이미 푼 파이프라인이 있다** — 2026-07-30 `frontend/src/components/community/`를 직접 읽고 확인한 사실이다.

| 파일 | 실제로 하는 일 |
|---|---|
| `communityContent.ts` | `PRODUCT_TOKEN_PATTERN = /\[\[product:([a-z0-9-]+)\]\]/gi` · `splitContentByProductTokens()` · `extractProductIds()` |
| `PostContent.tsx` | 본문을 토큰으로 split해 **짝수 인덱스는 `react-markdown`, 홀수 인덱스는 `ProductEmbedCard`**로 번갈아 렌더 |
| `serializeEditorContent.ts` | 에디터의 `productEmbed` 노드를 `[[product:ID]]` 문자열로, `image` 노드를 `![alt](src)`로 본문에 직렬화 |
| `ProductEmbedCard.tsx` | id로 제품을 찾아 썸네일·이름·가격 카드를 렌더 |

즉 **"본문 임의 위치에 N개를 꽂고 카드로 렌더한다"는 이미 돌아가는 코드다.** 반면 `[[placement:` 토큰은 이 리포 어디에도 아직 없다(같은 날 grep 확인).

**이 ADR은 그 파이프라인을 복제하지 않는다 — 대상을 갈아끼운다.** 결정 1에서 상품 토큰을 폐기하고 같은 자리에 배치 토큰을 놓으므로, 본문에 꽂히는 토큰 종류는 계속 하나다.

**해시태그도 같은 종류의 뒤늦은 확인이었다.** ADR-0011과 D25 원안은 "수요가 아직 없다"로 게시글 해시태그를 뺐는데, 프론트에는 이미 있다 — `types.ts`의 `CommunityPost.tags: string[]`, `CommunityGallery.tsx`의 검색 필터(`post.tags.some((tag) => tag.toLowerCase().includes(query))`, 선행 `#`을 지우고 비교), `PostCard.tsx`·`CommunityDetail.tsx`의 `#태그` 칩 렌더. 지금은 프론트 목 데이터지만 **화면이 이미 태그를 전제하고 만들어져 있다.**

**본문 이미지는 아직 저장 경로가 없다.** `PostRichEditorToolbar.tsx`의 "이미지 삽입" 버튼은 `URL.createObjectURL(file)`이 만든 **블롭 URL**을 본문에 꽂는다 — 새로고침하면 죽는 주소다. 업로드가 붙어야 하고, 그때 이미지가 본문 어디에 있느냐가 스키마 판단에 걸린다.

**이미 걸려 있는 것들**

- **ADR-0011 결정 2~8** — 전부 유효하다. 특히 결정 5(게시글 북마크 없음)·결정 7(`post.user_id` nullable + `ON DELETE SET NULL`)·결정 8(애그리거트)은 이 ADR이 건드리지 않는다.
- **[ADR-0007](0007-package-structure-and-aggregates.md)** — 애그리거트 간 참조는 객체 참조, 쓰기는 루트 통과·읽기는 자유. 결정 2가 이 규칙의 사정거리를 다룬다.
- **`erd.md` 전역 규칙** — `CHECK`를 쓰지 않는다. 토글·정션은 hard delete이고 부모 FK는 `ON DELETE CASCADE`다.
- **`S3PresignService`가 이미 있다** — `backend/dero-api/src/main/java/com/brunchies/dero/infra/S3PresignService.java`의 `presignUpload(key, contentType)`(5분 TTL) · `presignGet(key)`(15분 TTL). `ProductImageController.presign`이 이미 이 경로를 쓴다.

## 결정

```
post.content  "…텍스트… [[placement:12]] …텍스트… [[placement:34]] …"
                          └ 본문 토큰이 유일한 배치 참조 (FK 없음)
                          └ 본문에 꽂히는 임베드는 이것 하나뿐 ([[product:ID]] 폐기)

post ─┬─ 1:N  post_image      (순서 컬럼 없음 — 본문 안 위치가 곧 순서. 썸네일은 is_primary)
      ├─ 1:N  post_like
      ├─ 1:N  post_comment
      └─ M:N  hashtag  via  post_hashtag      ← 신설
```

### 1. `post.placement_id` 컬럼을 삭제한다 — 배치 참조는 본문 `[[placement:ID]]` 토큰이다

컬럼과 그에 딸린 FK·인덱스를 전부 뺀다. 대신 본문(`post.content`)에 `[[placement:ID]]`를 넣는다. **참조 개수 제한이 사라지고**, 참조가 본문의 어느 위치에 오는지까지 작성자가 정한다.

**본문에 넣는 것은 배치뿐이다 — `[[product:ID]]` 상품 토큰과 "상품 최소 1개 삽입" 게시 게이트를 같이 폐기한다.** 배치(`placement`)는 `placed_item`으로 **제품 구성 전체를 이미 품는다.** 배치 하나를 꽂으면 그 안의 제품과 견적이 통째로 따라오므로, 상품 토큰은 그 부분집합을 사용자가 손으로 다시 입력하게 하는 일이었다. 게시 게이트가 없어지므로 배치를 하나도 참조하지 않는 글도 쓸 수 있다.

형식은 폐기되는 제품 토큰과 같다(`[[종류:ID]]`). 파서를 하나 더 만드는 것도, 대상 종류를 늘리는 것도 아니라 **기존 파서가 보는 대상을 제품에서 배치로 바꾸는 것**이다 — 토큰 종류가 계속 하나이므로 `PostContent.tsx`의 "짝수 인덱스=마크다운, 홀수 인덱스=임베드" 번갈아 렌더 규약이 그대로 성립한다.

### 2. `post_placement` 정션을 만들지 않는다 — 본문 토큰이 유일한 정본이다

정션을 같이 두면 "이 글이 참조하는 배치"의 답이 둘이 되고, 본문 편집과 정션 갱신이 어긋나는 순간 어느 쪽이 맞는지 다투게 된다. **본문이 정본이다.**

**대가를 정직하게 적는다.**

- **역방향 조회가 사실상 불가능하다.** "이 배치를 인용한 글 찾기"는 `content LIKE '%[[placement:12]]%'` 스캔이다. 인덱스가 안 걸리고 글이 늘수록 느려진다.
- **FK 무결성이 없다.** 배치를 지워도 본문의 토큰은 그대로 남는다 — DB가 막아주지 않는다.

상품 토큰이 폐기되면서 본문 임베드는 배치 하나만 남는다 — **이 부채를 "제품 임베드도 이미 같은 처지"로 정당화할 수 없다는 뜻이다.** 감수하는 근거는 둘뿐이다: 정본이 하나라는 것, 그리고 역방향 조회 요구가 아직 없다는 것. **요구가 실제로 생기면 그때 `post_placement`를 넣는다** — 본문이 정본이므로 정션은 나중에 파생 인덱스로 채워 넣을 수 있고, 그 반대(정션이 정본인 상태에서 본문으로 옮기기)보다 싸다.

이것이 ADR-0007 결정 3("애그리거트 간 참조는 객체 참조, ID로 끊지 않는다")과 어긋나 보일 수 있다. **어긋나지 않는다** — 결정 3은 **엔티티의 연관 매핑**에 거는 규칙이다. 본문 문자열 안의 id는 매핑이 아니라 **사용자가 쓴 콘텐츠**라 그 규칙의 사정거리 밖이다. 이걸 여기 못 박아두지 않으면 다음 사람이 같은 논쟁을 다시 한다.

### 3. 삽입 대상은 **작성자 본인의 공개 배치**로 제한한다 — 자동 공개도, 공개 전환 유도도 없다

WAS가 저장 시점에 검증한다: 토큰이 가리키는 배치가 (a) 존재하고 (b) `user_id`가 작성자이고 (c) `visibility = PUBLIC`인가. 하나라도 아니면 거부한다.

프론트의 삽입 후보 목록에는 **공개 배치만 뜬다.** 비공개 배치는 애초에 목록에 나타나지 않는다. D25 원안의 **자동 공개는 폐기하고, 그 대체안이던 "공개 전환 유도"도 폐기한다** — 게시글 작성 흐름 한가운데서 배치의 공개 설정을 바꾸게 하면 사용자가 자기 배치가 열린 것을 인지하지 못한 채 지나간다. 자동이든 유도든 되돌릴 수 없는 노출이 글 쓰는 도중에 일어난다는 점은 같다. **차단 하나뿐이다.**

배치를 공개로 바꾸는 것은 `REQ-COM-04`(배치 게시 — 커뮤니티 공개, Should)의 **독립된 행위**로 두고, 게시글은 이미 공개된 것만 참조한다. **그래서 이 ADR은 `REQ-COM-04`의 존재를 전제한다** — 공개 배치만 삽입할 수 있으므로, 배치를 공개로 전환하는 경로가 없으면 삽입할 배치 자체가 존재하지 않는다.

### 4. 토큰이 fetch되면 카드로 렌더된다. 대상이 사라지면 플레이스홀더다

썸네일(`placement.thumbnail_key`)·이름 등 상세를 카드로 그린다. 폐기되는 `ProductEmbedCard`가 서 있던 자리를 `PlacementEmbedCard`가 그대로 이어받는다.

참조 대상이 사라졌으면 그 자리는 **"삭제된 배치입니다" 플레이스홀더**다. 카드가 통째로 없어지면 앞뒤 문장이 무엇을 가리키는지 알 수 없게 된다("이 배치는 …" 다음에 아무것도 없는 글). 지금 `ProductEmbedCard.tsx`는 제품을 못 찾으면 `null`을 반환해 아무것도 그리지 않는데, **그 동작은 폐기와 함께 사라진다** — 임베드가 하나뿐이므로 플레이스홀더가 유일한 정책이다.

### 5. `post_image.display_order`를 삭제하고 `is_primary`를 넣는다. 테이블 자체는 유지한다

이미지는 본문 임의 위치에 삽입되고 `serializeEditorContent.ts`가 그것을 `![alt](src)`로 **본문 안 그 자리에** 직렬화한다. 그러면 **본문 안 위치가 곧 순서**다. 별도 순서 컬럼은 갱신되지 않는 순간 거짓이 되고, 갱신하려면 저장할 때마다 본문을 파싱해 순서를 다시 매겨야 한다 — 결정 2에서 정션을 버린 것과 같은 이유다.

**대신 `is_primary BOOLEAN NOT NULL DEFAULT false`를 둔다** — 목록 카드의 썸네일을 고르기 위해서다. `uq_post_image_post_id`(post_id) `WHERE is_primary` 부분 유니크가 게시글당 1장을 강제한다. **썸네일은 "몇 번째냐"가 아니라 "어느 것이냐"의 문제라 순서 컬럼과 성질이 다르다** — `is_primary`는 본문 안 위치와 무관하므로 사용자가 이미지를 옮겨도 어긋나지 않는다. `product_image.is_primary`(ADR-0011 결정 6)와 같은 형태이고, 부분 유니크가 "`CHECK` 금지"에 걸리지 않는 근거도 거기와 같다(동시 요청 경쟁 조건 방어). 저장 시점에 본문 첫 이미지를 기본값으로 찍고 사용자가 바꿀 수 있다. 이미지가 0장이면 썸네일 없는 카드다.

**`post_image` 테이블 자체는 남긴다.** 없애고 본문 안 key만 두면 **어떤 파일이 이 글 것인지 DB가 모른다** — 글을 지워도 객체 저장소에 고아 파일이 영구히 쌓이고 정리할 근거가 없다. 배치 토큰과 판단이 갈리는 지점이 여기다: 배치는 지워도 원본이 남는 **남의 행**이지만, 이미지는 **이 글이 소유한 파일**이다.

### 6. `post_hashtag` 정션을 신설한다. 북마크는 끝까지 넣지 않는다

`hashtag` 마스터를 재사용하고 `product_hashtag`와 **완전히 같은 구조**다 — hard delete, FK 2개 `ON DELETE CASCADE`, 복합 `UNIQUE`. 새로운 종류의 결정이 아니라 기존 패턴의 두 번째 적용이다.

**게시글 북마크는 넣지 않는다** — ADR-0011 결정 5를 그대로 유지한다. 태그를 넣는 근거는 "화면이 이미 그것을 전제하고 있다"이고, 북마크에는 그 근거가 없다.

### 7. `placement.description`을 `VARCHAR(255)` → `TEXT`로 승격한다

배치가 게시글 본문에 카드로 인용되면서 설명이 사람에게 읽히는 자리가 늘었다. 255자는 3D 배치를 소개하는 글로는 짧다. `TEXT`는 Postgres에서 `VARCHAR`와 저장 비용이 같고, 이 리포는 이미 같은 자리에 `TEXT`를 쓰고 있다(`erd.md`의 다른 `description` 컬럼들).

### 8. 이미지 상한 20장, presigned URL 방식은 기존 `_key` 관례 그대로

상한은 **WAS가 강제한다**(행 개수 조건이라 인덱스로 표현할 수 없다 — ADR-0011 결정 6의 "최소 1장"과 같은 자리다). 업로드는 `S3PresignService.presignUpload`로 브라우저가 직접 S3에 PUT하고, 조회는 응답 조립 시점에 `presignGet`으로 완성 URL을 만든다. DB에는 `_key`만 저장한다.

## 대안과 버린 이유

**① `post_placement` 정션 + 본문 토큰 병행**
FK 무결성과 역방향 조회("이 배치를 인용한 글")를 둘 다 얻는다. **버린 이유**: `content`와 정션이 어긋나면 **정본이 둘**이 되고, 본문 편집마다 정션을 다시 계산해 맞추는 동기화 코드가 붙는다. 그 코드가 놓치는 경로 하나가 곧 버그다. 역방향 조회가 실제로 필요해지면 그때 넣는다(결정 2).

**② `placement_id` FK를 남기고 "대표 배치 1개 + 본문 토큰 N개"**
스키마 변경이 순수 추가라 싸 보인다. **버린 이유**: **"대표 배치"라는 개념이 요구사항에 없다.** 요구하지 않은 개념을 스키마에 새기는 것이고, 컬럼 하나로 못 푸는 문제를 반만 푼 채 "대표는 토큰 목록에도 들어가나"를 조회마다 다투게 된다. ADR-0011 결정 6이 `product.image_key`를 흡수해 정본을 하나로 만든 판단과 정면으로 어긋난다.

**③ 자동 공개 유지 (D25 원안)**
클릭이 하나 줄어 흐름이 매끄럽다. **버린 이유**: 사용자가 모르는 사이에 비공개 배치가 열린다. 노출은 되돌려도 이미 본 사람을 되돌리지 못한다. 배치를 공개로 만드는 것은 게시글 작성과 분리된 명시적 행위여야 한다(결정 3, ⑦).

**④ `post_image`를 폐기하고 본문 안 key만 둔다**
테이블이 하나 줄고 "본문이 정본"이 이미지에도 일관되게 적용된다. **버린 이유**: 글 삭제 시 어떤 오브젝트를 지워야 하는지 DB가 모른다 — 고아 파일을 정리할 근거 자체가 없어진다. 본문을 파싱해 key를 뽑아 지우는 방법이 있지만, 그건 삭제 로직이 본문 형식에 영구히 묶인다는 뜻이다(토큰 문법을 바꾸면 과거 글의 파일을 못 지운다).

**⑤ `post_image.display_order`를 남기고 본문 순서와 동기화**
목록 API가 본문을 파싱하지 않고 이미지 순서를 알 수 있다. **버린 이유**: 저장할 때마다 본문을 파싱해 순서를 다시 매겨야 하고, 어긋난 순간 어느 쪽이 정본인지 답이 없다. 결정 2에서 정션을 버린 것과 같은 형태의 문제를 컬럼 하나로 축소해 옮겨놓을 뿐이다.

**⑥ 배치를 토큰이 아니라 평범한 마크다운 링크(`[내 데스크](/craft/12)`)로 표현**
파서를 아예 손대지 않아도 되고 오늘 당장 된다. **버린 이유**: 링크는 **텍스트지 카드가 아니다** — 썸네일·이름을 못 그린다. 더 결정적으로 **서버가 검증 대상을 식별할 수 없다** — 본문에 사용자가 손으로 쓴 임의 URL과 구별이 안 되므로 결정 3의 본인·공개 검증을 걸 자리가 없다.

**⑦ 비공개 배치를 만나면 게시 흐름 안에서 공개 전환을 유도한다**
자동 공개의 위험 없이 한 클릭으로 이어지고, 자기 배치인데 왜 못 고르는지 화면이 설명해준다. **버린 이유**: 게시 흐름 한가운데서 배치의 공개 설정을 바꾸게 하면, 사용자는 글을 쓰는 중이라 **자기 배치의 공개 상태를 방금 바꿨다는 사실을 인지하지 못한다.** 노출 부작용이 자동 공개와 실질적으로 같아진다. 배치 공개는 `REQ-COM-04`의 독립된 행위로 두고, 게시글은 이미 공개된 것만 참조한다(결정 3).

**⑧ 상품 토큰(`[[product:ID]]`)을 배치 토큰과 나란히 남긴다**
2026-07-30에 이미 구현돼 돌아가는 코드라 지우지 않는 쪽이 싸 보인다. **버린 이유**: 배치가 `placed_item`으로 제품 구성을 이미 품으므로 **같은 정보를 넣는 경로가 둘**이 된다. 본문의 상품 카드 목록과 인용된 배치의 실제 구성이 어긋날 때 어느 쪽이 이 글의 "쓴 제품"인지 답이 없고, 상세 페이지의 "사용된 상품·합계"가 그 둘 중 무엇을 세는지도 갈린다. 토큰 종류를 하나로 유지하면 `PostContent.tsx`의 짝수/홀수 규약도 그대로 산다(결정 1).

## 파급

**스키마** (`erd.md`는 동결 — 언락 후 별도 작업이다, `docs/HARNESS-RULES.md` §4)

| 것 | 내용 |
|---|---|
| 삭제 | `post.placement_id`(+ FK `fk_post_placement` · 인덱스 `idx_post_placement_id`) · `post_image.display_order` |
| 신설 | `post_hashtag` (`post_id`·`hashtag_id`, hard delete, FK 2개 `ON DELETE CASCADE`, 복합 `UNIQUE` + 후행 컬럼 인덱스 — `product_hashtag`와 동형) · `post_image.is_primary` (`BOOLEAN NOT NULL DEFAULT false` + 부분 유니크 `uq_post_image_post_id WHERE is_primary`) |
| 변경 | `placement.description` `VARCHAR(255)` → `TEXT` |

`erd.md` "확정 후 개정" 표에 한 줄이 따라간다. ADR-0011로 들어간 옛 행은 지우지 않는다 — 이 ADR이 ADR-0011 결정 1 본문을 지우지 않는 것과 같은 이유다.

**ADR-0011 결정 8(애그리거트) — 유효하다. 다만 근거가 한 줄 바뀐다**

ADR-0007의 기준(*"두 테이블이 따로 저장돼서 잠깐 어긋나 있어도 괜찮은가"*)으로 다시 판정한 결과다.

- **경계는 그대로다.** `Post`는 여전히 애그리거트 루트고 `post_image`만 안에 있다. `post_like`·`post_comment`는 각자 루트다. `placement_id`가 사라진 것은 경계를 옮긴 것이 아니라 **경계를 넘는 간선 하나가 없어진 것**이라 경계가 오히려 더 깨끗해진다.
- **`Post` → `Placement` 객체 참조(`@ManyToOne(fetch = LAZY)`)가 사라진다.** ADR-0011 결정 8이 적어둔 "`cascade`를 걸지 않는다"는 그 필드에 대한 서술이므로 대상이 없어진다. ADR-0007 결정 3이 "오늘 것 중 제일 못 무른다"고 한 결정의 **적용 대상이 하나 줄었다** — 되돌리기 비용이 없는 방향의 변화다.
- **의존 방향(ADR-0007 결정 7)은 그대로 `community` → `placement`다.** 엔티티 필드는 없어졌지만 토큰이 가리키는 배치 상세를 게시글 조회가 가져와야 하므로 의존은 남는다. 다만 그 의존이 **연관 매핑이 아니라 서비스·리포지토리 호출**로 표현된다. 방향이 같으므로 결정 7 위반은 없고, `PlacementRepository`를 게시글 조회에서 부르는 것은 ADR-0007 결정 2("읽기는 자유")가 이미 허용한다.
- **`post_image`가 `Post` 안이라는 판단은 유지되지만 근거 하나가 빠진다.** ADR-0011 결정 8은 "사진 빠진 채 노출·**순서 뒤집힘**"을 잘못된 상태로 들었는데, `display_order`를 지웠으므로 순서 근거는 사라진다. 남는 근거는 "`post` 없이 존재할 수 없다"와 **"이 글이 소유한 파일이라 글을 지울 때 같이 지워야 한다"**(결정 5)이고, 후자가 오히려 루트 책임을 강화한다. `PostImageRepository`는 여전히 만들지 않는다.
- **`Placement`는 이 ADR로 애그리거트가 바뀌지 않는다.** `description` 타입 승격뿐이다.

**프론트**

- `communityContent.ts` — 토큰 파서의 **대상만 제품에서 배치로 바꾼다**(`PRODUCT_TOKEN_PATTERN`·`buildProductToken`·`splitContentByProductTokens`·`extractProductIds` → 배치판). 토큰 종류가 계속 하나이므로 `PostContent.tsx`의 **짝수/홀수 인덱스 규약은 그대로 쓴다** — 세그먼트를 `{kind, value}`로 바꿀 필요가 없다. `toPlainText`의 토큰 제거 정규식도 같이 따라간다.
- `PlacementEmbedCard` 신규 — `ProductEmbedCard`를 대체하고 미발견 시 플레이스홀더(결정 4).
- `CommunityEditor`에 배치 선택·삽입 UI — **후보 목록에 본인 공개 배치만 노출**한다(결정 3). 공개 전환 UI는 넣지 않는다.
- `PostRichEditorToolbar.tsx`의 이미지 삽입을 **블롭 URL에서 presigned 업로드로 교체**한다.
- 태그 입력 UI — 지금 태그는 목 데이터라 읽기만 있고 쓰기가 없다.

**폐기되는 2026-07-30 프론트 구현분** (결정 1 — 아래는 같은 날 파일을 직접 읽어 확인한 자리다)

- `CommunityEditor.tsx` — 오른쪽 **상품 검색 삽입 패널** 전체, 그리고 `extractProductIds(content).length === 0`으로 등록을 막는 **"상품 최소 1개" 게시 차단**.
- `ProductEmbedCard.tsx` · `productEmbedNode.tsx`(Tiptap `productEmbed` atom 노드) · `serializeEditorContent.ts`의 `case 'productEmbed'` 분기.
- `communityContent.ts`의 제품 토큰 3종(위 항목에서 배치판으로 교체된다) · `communityPosts.ts` 목 데이터의 `buildProductToken` 치환.
- `CommunityDetail.tsx` — **"사용된 상품"·합계 사이드바**(`usedProducts`·`estimatedTotalKrw`)와 `PostCard.tsx`의 "사용한 제품 N" 칩. 이 계산의 입력이 사라진다.
- `tests/communityContent.test.ts` · `tests/serializeEditorContent.test.ts`의 제품 토큰 케이스, `src/components/community/CLAUDE.md`의 상품 토큰 규약·"최소 1개 필수" 절.

**프론트 북마크 제거 (별건 작업)**
ADR-0011 결정 5가 "게시글 북마크 없음"인데 프론트에는 아직 있다 — `types.ts`의 `isBookmarked`·`bookmarkCount`, `PostCard`의 `onToggleBookmark`. **`src/components/community/CLAUDE.md`가 이 필드들을 `src/components/mypage/BookmarkPanel.tsx`가 그대로 소비한다고 명시하고 `tests/mypageBookmarks.test.ts`를 가리킨다** — 걷어내면 마이페이지 북마크 메뉴가 같이 움직인다. 이 ADR의 범위가 아니고 별도 티켓이다.

**백엔드**

- 토큰 파싱 → 본인·공개 배치 검증(결정 3)은 저장 경로에, 카드용 배치 상세 조회(N개 id → 한 번 조회)는 상세 조회 경로에.
- 본문 이미지 presigned 발급은 `S3PresignService` 재사용 — `ProductImageController.presign`과 같은 형태다.
- `Post` 엔티티에서 `placement` 필드 제거, `PostImage`에서 `displayOrder` 제거, `PostHashtag` 신설. 리포지토리 증가분은 없다(`post_hashtag`는 `Post` 안이다 — `product_hashtag`가 `Product` 안인 것과 같다).
- 에러 코드는 `PostErrorCode`에 든다(ADR-0008): 남의 배치·비공개 배치·존재하지 않는 배치·이미지 상한 초과.

**요구사항·기획** — `REQ-COM-12` 수용 기준 개정(다중 배치 참조, **공개 배치만 삽입 가능**, 상품 임베드 폐기, 이미지 20장). `REQ-COM-04`는 같은 날 **"배치 게시 — 커뮤니티 공개"(Should)로 복원**됐고(ID 재사용 정정), 결정 3이 그 기능의 존재를 전제한다. 기획 근거는 D25(2026-07-30 개정분). `docs/GLOSSARY.md`에 게시글 해시태그 항이 따라가고, 게시글 이미지 항의 장수·순서 서술이 결정 5·8과 맞춰진다.

**바뀌지 않는 것** — ADR-0011 결정 2~8(결정 8은 위 근거 한 줄만) · `post_like`·`post_comment`·`product_image` · ADR-0008 응답 계약 · ADR-0007 애그리거트 규칙 자체 · `placement`의 나머지 전 컬럼.
