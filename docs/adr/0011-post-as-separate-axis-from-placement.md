# ADR-0011. 게시글은 배치와 별개 축 — 배치 참조는 선택, 상호작용 테이블은 대상별

## 상태

**확정** — 2026-07-30, 승인 박동규.
기획 근거는 `docs/CONTEXT.md` D25. 스키마 정본(`docs/context/erd.md`) 개정은 동결 언락이 필요한 별도 작업이다(`docs/HARNESS-RULES.md` §4).

## 맥락

D25가 게시글을 확정했다. **이 ADR이 답하는 것은 하나다 — 그 기능을 기존 커뮤니티 모델에 어떤 구조로 얹는가.** 왜 필요한지·어떤 화면인지는 D25와 `docs/REQUIREMENTS.md` 소관이다.

현행 커뮤니티 모델(`erd.md` §6)은 상호작용 대상이 배치와 제품 둘뿐이다.

| 테이블 | 대상 | 삭제 |
|---|---|---|
| `comment` | `placement` (NOT NULL · ON DELETE CASCADE) | soft (감사 3종) |
| `placement_like` | `placement` | hard (토글) |
| `product_like` | `product` | hard (토글) |
| `placement_bookmark` | `placement` | hard (토글) |

공개 여부는 `placement.visibility`(PUBLIC/PRIVATE)고 `placement.like_count`가 `placement_like` 집계 캐시다. 여기에 "글"이라는 대상이 하나 더 들어오면 **댓글 대상과 좋아요 대상이 둘이 된다.** 게시글이 배치를 흡수하느냐, 옆에 서느냐가 이 ADR의 전부다.

**이미 걸려 있는 것들**

- **D24** — 개인 활동은 **대상별로 분리**한다. 그 결과가 `placement_like`/`product_like` 두 테이블이다.
- **`erd.md` 전역 규칙** — `CHECK` 제약을 쓰지 않는다. 값 검증은 WAS(Java enum·서비스)가 한다. 토글·정션은 hard delete다(soft delete와 `UNIQUE`가 충돌한다).
- **[ADR-0006](0006-persistence-jpa-conventions.md)** — soft delete는 `@SoftDelete`, PK는 SEQUENCE 전략, `LAZY` 명시 강제.
- **[ADR-0007](0007-package-structure-and-aggregates.md)** — 애그리거트 판단 기준 한 줄: *"두 테이블이 따로 저장돼서 잠깐 어긋나 있어도 괜찮은가?"* 커뮤니티 4종은 각자 루트고, 애그리거트 간 참조는 객체 참조며 `cascade`를 걸지 않는다.
- **[ADR-0008](0008-api-response-contract.md)** — 성공 엔벨로프 없음, 사용자 대면 목록은 커서.
- **Flyway V1 baseline이 프로덕션 미배포**고, baseline 직접 수정 전례가 2건 있다(`_url`→`_key` 8컬럼 rename, `user.profile_image_key` 추가).

## 결정

```
placement  1:N  post          post.placement_id NULL 허용 · ON DELETE SET NULL
                 ├─ 1:N  post_image
                 ├─ 1:N  post_like
                 └─ 1:N  post_comment

product    1:N  product_image      ← product.image_key 흡수·삭제
```

### 1. `post.placement_id`는 nullable이다 — 배치 참조는 선택이고 유니크가 아니다

> **이 결정은 [ADR-0013](0013-placement-embed-as-content-token.md)이 대체한다** (2026-07-30, 승인 박동규) — 컬럼을 삭제하고 배치 참조를 본문 `[[placement:ID]]` 토큰으로 표현한다(단일 FK로는 다중 참조를 담을 수 없었다). 아래 본문은 역사 기록으로 남긴다. 이 ADR의 나머지 결정은 전부 유효하다.

배치 없이 글만 쓸 수 있고, 배치 하나로 글을 여러 개 쓸 수 있다(유니크 제약을 걸지 않는다). `ON DELETE SET NULL`은 **`generated_image.placement_id`와 정확히 같은 처리**다 — "출처 배치가 지워져도 이력은 남는다".

`post`가 `placement`를 물고 있어도 **한 덩어리가 아니다**(결정 8). 배치를 지웠다고 글을 지우지 않는다.

### 2. `placement`는 한 컬럼도 바뀌지 않는다 — 공개 축이 둘로 공존한다

`visibility`·`like_count`·`description`·`is_template` 전부 잔류하고, `comment`·`placement_like`·`placement_bookmark`도 계속 `placement`를 대상으로 한다. **배치 공개(REQ-COM-04)와 게시글은 별개 축으로 공존한다.**

대가를 정직하게 적는다 — **좋아요가 두 축이 된다.** 배치에 눌린 좋아요와 글에 눌린 좋아요는 다른 수이고, 통합 "인기순"은 존재하지 않는다. 정렬은 축마다 따로다. 이걸 하나로 합치는 안이 안 C-1이고, 그 대가는 대안 절에 적었다.

### 3. `post_like`·`post_comment`를 따로 만든다 — 다형성을 쓰지 않는다

`comment`에 `post_id`를 덧붙여 `(placement_id, post_id)` 둘 다 nullable로 만드는 안을 쓰지 않는다.

**이 리포에서는 다형성이 DB로 검증되지 않는다.** `CHECK` 제약을 쓰지 않기로 했으므로(전역 규칙) "정확히 하나만 채워짐"을 지킬 장치가 DB에 없다. 지금 `comment.placement_id`는 `NOT NULL`이라 무결성이 공짜인데, 다형성으로 바꾸는 순간 그 보증을 버리고 WAS 검증으로 대체하게 된다 — **이미 있는 제약을 없애는 방향의 변경**이다.

그리고 **D24가 같은 문제를 이미 같은 방식으로 풀었다.** 좋아요를 `(target_type, target_id)`로 묶지 않고 `placement_like`/`product_like`로 나눈 것이 D24의 결과다. 세 번째 대상이 생겼다고 규칙을 바꾸지 않는다.

### 4. `post`에 `visibility`를 두지 않는다

배치는 3D 작업물이라 "만들었지만 아직 안 보여줄래"가 자연스럽다. 스토리 글은 안 보여줄 거면 쓸 이유가 없다 — 쓰는 행위 자체가 게시다. **쓰이지 않는 상태값을 미리 파지 않는다.**

삭제는 소프트 삭제(감사 3종)다. `comment`와 같은 자리다.

### 5. 게시글에 북마크를 붙이지 않는다

`placement_bookmark`는 **"남의 배치를 다시 보기"**가 목적이고 그룹(`placement_bookmark_group`)까지 딸린 기능이다. 글에 같은 것을 복제할 요구가 없다. 필요해지면 그때 `post_bookmark`를 만든다 — 대상별 분리(결정 3)를 지키면 나중에 붙이는 비용이 테이블 하나다.

### 6. `product.image_key`를 삭제하고 `product_image`로 흡수한다

`product_image`(1:N)에 `is_primary`·`display_order`를 둔다. **대표 이미지 정본을 한 곳으로 만드는 것이 목적이다** — 컬럼과 테이블을 둘 다 두면 "대표는 어느 쪽이냐"를 조회마다 다투게 된다.

이 리포는 같은 형태의 판단을 반복해 왔다: `material_skin` 테이블 폐기, `asset` 재질 4컬럼 → `finish` 1컬럼, `asset.emitter_manifest` → `product_emitter` 테이블, `light` 광학 컬럼 nullable화. **정본이 갈라질 자리를 미리 합치는 쪽으로 계속 갔다.**

**지금이 가장 싼 시점이다.** Flyway V1 baseline이 프로덕션 미배포라 마이그레이션 파일을 하나 더 얹지 않고 baseline을 직접 고칠 수 있고, 전례가 2건 있다. 대가는 팀원 로컬 DB 볼륨 리셋이며 그것도 전례와 같다.

**"대표 이미지가 정확히 하나"는 부분 유니크 인덱스가 DB에서 강제한다** — `uq_product_image_product_id`(product_id) `WHERE is_primary`. `CHECK`는 쓰지 않지만 이건 `CHECK`가 아니다: 전역 규칙이 "`UNIQUE`는 비즈니스 규칙이 아니라 **동시 요청 경쟁 조건 방어 수단**이라 남긴다"고 정했고, 부분 유니크는 "인덱스라서 DB에 비즈니스 로직 금지 방침에 걸리지 않는다"고 명시했다(`uq_user_email` 등). 대표 지정 요청이 동시에 둘 들어와 대표가 둘이 되는 것이 정확히 그 경쟁 조건이고, 그러면 목록 카드가 어느 것을 쓸지 갈린다. 결정 3의 다형성 기각과 어긋나지 않는다 — 거기서 못 쓴 건 "두 FK 중 정확히 하나"를 표현할 **인덱스가 존재하지 않기** 때문이지 DB 강제 자체를 버려서가 아니다.

**"최소 1장"은 WAS가 강제한다**(`source = CATALOG`일 때). 행 개수 조건은 인덱스로 표현할 수 없고, 종전 `image_key`의 `source`별 필수 여부를 WAS가 강제하던 것과 같은 자리다.

### 7. `post.user_id`는 nullable + `ON DELETE SET NULL`

`placement.user_id`·`comment.user_id`와 같다. 탈퇴해도 글은 남고 작성자만 비워진다. 남이 좋아요·댓글을 단 글이 사용자 탈퇴로 통째 사라지면 그 상호작용도 같이 증발한다.

### 8. 애그리거트 — `Post`가 새 루트고 그 안에는 `post_image`만 있다

ADR-0007의 기준(*"따로 저장돼서 잠깐 어긋나도 괜찮은가"*)을 그대로 적용한 결과다.

| 테이블 | 자리 | 판단 |
|---|---|---|
| `post` | **애그리거트 루트 신설** | `PostRepository` |
| `post_image` | `Post` **안** | 본문과 사진이 어긋난 게시글은 **잘못된 상태**다(사진 빠진 채 노출·순서 뒤집힘). `post` 없이 존재할 수 없다. `PostImageRepository`를 만들지 않는다 |
| `post_like` | **각자 루트** | 남이 누른다. 글 본문과 잠깐 어긋나도 무해하다. ADR-0007이 `placement_like`를 `Placement` 밖에 둔 것과 같다 |
| `post_comment` | **각자 루트** | 위와 같다. `comment`가 `Placement` 밖 루트인 것과 같다 |
| `product_image` | `Product` **안** | `asset`·`product_vesa`·`product_vibe`와 같은 자리다. 제품 없이 존재할 수 없고, "대표 하나"(결정 6)가 **제품 단위 불변식**이라 루트가 지켜야 한다. `ProductImageRepository`를 만들지 않는다 |

`post_like`·`post_comment`를 `Post` 안에 넣지 않는 이유가 하나 더 있다: 좋아요 하나 누르자고 글+사진 컬렉션을 통째 로드하게 된다 — ADR-0007 결정 1이 "대가"로 적어둔 바로 그 비용이다.

**`Post` → `Placement`·`User`는 애그리거트 간 참조라 객체 참조(`@ManyToOne(fetch = LAZY)`)고, `cascade`를 걸지 않는다**(ADR-0007 결정 3). 패키지는 `community`다 — `post`가 `placement`를 참조하므로 의존 방향(`community` → `placement`)이 ADR-0007 결정 7과 맞는다. `product_image`는 `product` 패키지다.

## 대안과 버린 이유

**① 안 C-1 — 게시글이 배치 게시를 흡수한다 (공개는 오직 게시글로)**
`placement.visibility`를 삭제하고 `comment`·`placement_like`·`placement_bookmark`의 대상을 전부 `post`로 옮긴다. **이점이 실재했다**: 좋아요 축이 하나로 통합되어 "인기순"이 명확해지고, 결정 2가 감수한 두 축 문제가 아예 생기지 않는다. 그런데도 버렸다 — 동결된 `erd.md`에서 테이블 4개 이상이 움직이고, `REQ-COM-01`~`08` 문구를 다시 써야 하며, **"배치 공개"라는 기존 축 자체가 사라진다.** 게시글은 배치와 거의 상관없는 별개 기능이라는 것이 박동규의 판단이었다(2026-07-30).

**② 안 B — 게시글을 완전 독립 축으로 두고 배치 참조 자체를 안 둔다**
결정 1의 nullable FK조차 두지 않는다. 스키마는 제일 깨끗하지만 `REQ-COM-01`~`08`을 게시글용으로 한 벌 더 만들어야 하고, 커뮤니티 피드가 서로 못 잇는 둘로 쪼개진다.

**③ 다형성 `comment` (`placement_id`·`post_id` 둘 다 nullable)**
테이블이 안 늘고 "최신 댓글" 통합 조회가 한 번에 된다. 결정 3대로 기각 — `CHECK`가 없어 "정확히 하나"를 DB가 못 지키고, 지금 `NOT NULL`로 공짜인 무결성을 버리는 방향이며, D24가 정한 대상별 분리와 어긋난다.

**④ `product.image_key`를 남기고 `product_image`를 추가로 둔다**
마이그레이션이 순수 추가라 로컬 DB 리셋이 없다. 그러나 대표 이미지 정본이 두 곳이 되어 **조회마다 우선순위 규칙을 들고 다녀야 하고**, 둘이 어긋난 데이터를 막을 장치가 없다. 리셋 비용은 지금 한 번이고 이 혼란은 영구다.

**⑤ `placement_photo` 신설 (사용자 실물 사진을 배치에 직접 붙인다)**
게시글 없이도 실물 사진을 올릴 수 있다. 그러나 사진은 "이 배치의 속성"이 아니라 **"자랑하려고 올린 것"**이라 게시 행위에 붙는 게 맞다. `post_image`가 그대로 덮는다.

## 파급

**스키마 (별도 언락 작업 — `erd.md`는 동결이다)**

| 것 | 내용 |
|---|---|
| 신설 5테이블 | `post` · `post_image` · `post_like` · `post_comment` · `product_image` |
| 삭제 1컬럼 | `product.image_key` |

`erd.md` 전역 규칙이 이미 정해둔 것들이라 개정 때 다시 논쟁하지 않는다 — `post`·`post_comment`는 soft delete(감사 3종), `post_like`는 토글이므로 **hard delete + `uq_post_like_user_id_post_id` + FK 2개 `ON DELETE CASCADE`**(`placement_like`와 동형), `post_image`·`product_image`는 부모와 운명을 같이하므로 hard delete + `ON DELETE CASCADE`. FK 컬럼에는 전부 인덱스를 만든다(복합 유니크 선두 컬럼만 예외).

**Flyway** — V1 baseline **직접 수정**(전례 2건). **팀원 로컬 DB 볼륨 리셋이 따라온다.**

**JPA** — `Product` 엔티티에서 `imageKey` 제거, 신규 엔티티 5개. 리포지토리는 **3개만** 는다(`PostRepository`·`PostLikeRepository`·`PostCommentRepository`) — 결정 8대로 `PostImageRepository`·`ProductImageRepository`는 만들지 않는다.

**API** — ADR-0008 계약 그대로다. 게시글 목록은 사용자 대면이므로 커서 페이지네이션이고, 에러 코드는 도메인별 `ErrorCode` enum(`PostErrorCode`)에 넣는다. `product.imageKey` 필드가 응답에서 사라지고 이미지 배열로 바뀐다 — **`openapi-typescript` 생성 타입이 깨지므로 프론트 제품 카드가 같이 움직인다.**

**요구사항·기획** — `REQ-COM-12`(Must) · `REQ-REC-06`(Should) 신설, `REQ-ADM-01` 확장. 기획 근거는 D25다. `docs/GLOSSARY.md`에 게시글·게시글 이미지·제품 이미지 항이 세트로 따라간다.

**프론트** — 게시판 화면 신규(목록·작성·상세). 제품 상세의 단일 이미지가 갤러리가 된다.

**바뀌지 않는 것** — `placement` 전 컬럼 · `comment`·`placement_like`·`placement_bookmark`의 대상 · 배치 저장 페이로드(ADR-0009) · 호환성 판정 · 애그리거트 규칙 자체.
