# 용어 사전 (Glossary) — 도메인 용어·명명 정본

> **살아있는 정본.** 도메인 용어 정의와 엔티티·속성 명명의 단일 진실 원천(SSOT).
> 문서·코드·ERD·API·회의에서 용어가 갈리면 이 문서가 이긴다. 새 개념 등장 시 여기 먼저 등록.
> 정본 변경은 기획 변경과 동일 — 박동규 승인 필수. 근거 결정: `docs/CONTEXT.md` D15.
> 최초 확정: 2026-07-16 (문서 전수 스캔으로 표기 충돌 6군 해소).
> 팀 공유 사본: 노션 "자료 공유 > 용어 사전" — 이 파일 갱신 시 재발행 (하네스 규칙).
>
> **구성 두 부**: 1부 = 회의·문서·대화용 (전원 대상). 2부 = ERD·코드 설계용 (개발 시 필수).

---

# 1부. 도메인 용어 — 회의·문서·대화용

정본 용어만 쓴다. "이렇게 말하지 않기" 열의 단어가 나오면 정본으로 고쳐 말한다.

## 1-1. 사람

| 용어 | 뜻 (한 줄) | 이렇게 말하지 않기 |
|---|---|---|
| **사용자** | 서비스를 쓰는 사람. 로그인 안 했으면 "비로그인 사용자" | 유저, 회원, 방문자, 소비자(마케팅 문서 외) |
| **관리자** | 에셋 등록·규격 관리·템플릿 시딩 권한을 가진 우리 팀 | 운영진 |

## 1-2. 제품과 데이터 — "제품 3형제"

| 용어 | 뜻 (한 줄) | 이렇게 말하지 않기 |
|---|---|---|
| **제품** | 돈 주고 살 수 있는 실물 하나 (책상·모니터·암·조명·소품). 가격·브랜드가 붙는 단위 | 아이템, 상품, 모델 |
| **규격** | 그 제품의 실측 수치(mm·g). 호환성 판정은 오직 이 숫자로만 | 스펙, 메타데이터, 규격표 |
| **에셋** | 그 제품의 3D 모양 파일(glTF). 화면에 보여주기 전용 — 판정에 쓰면 안 됨 | 3D 모델, 오브젝트, 폴리곤 파일 |
| **바이브** | 제품 간의 분위기 조화를 판단하고, 사용자가 원하는 데스크테리어 감성에 어울리는 제품을 추천하는 기준 (`vibe`, 2026-07-22 노션 역류) | 무드, 감성, 톤 |

> **헷갈리면 이렇게**: 하나의 제품에 숫자(규격)와 모양(에셋)이 따로 붙는다. "모니터암 규격이 이상해요" = 숫자 문제, "모니터암 에셋이 이상해요" = 3D 모양 문제. **"모델"은 금지어** — 제품 종류인지 3D 파일인지 매번 헷갈리게 만든 주범.

서술 허용: **소품·장비**(제품 카테고리를 가리키는 말), **치수**(3D 메쉬의 실제 크기 — 규격과 다르면 에셋 불량).

"아이템" 금지 예외 (2026-07-21): 제품 **자체**를 아이템이라 부르는 건 금지. 단 **어딘가에 담긴 제품 인스턴스**는 아이템이 정본 — 배치 아이템(`placed_item`), 장바구니 아이템(`cart_item`).

## 1-3. 시뮬레이터 공간

| 용어 | 뜻 (한 줄) | 이렇게 말하지 않기 |
|---|---|---|
| **배치** | 제품들을 책상 공간에 놓은 결과물. 저장·게시·복사가 다 이 단위 | 레이아웃, 세팅, 셋업 |
| **배치 아이템** | 배치 안에 놓인 제품 하나하나 (위치·회전 정보 포함) | 오브젝트, 배치 오브젝트 |
| **책상 (= 데스크)** | 배치의 기준이 되는 제품. 규격·판정 얘기할 땐 "책상" 권장, "데스크"도 같은 뜻으로 허용 | 데스크를 **배치·공개 배치 뜻으로** 쓰기 (2026-07-21) |
| **상판** | 책상의 판 부위. 두께·면적이 판정에 쓰임 | 탑, 테이블 탑 |
| **엣지 마감** | 상판 앞면 단면의 마감 부위(밴딩·몰딩·베벨). 그 **최대 두께**가 판정 입력이다 (`edge_thickness_mm`) | 엣지 밴딩, 테두리, 모서리 마감 |
| **클램프 물림 두께** | 판정 ①이 실제로 보는 두께 = **max(상판 두께, 엣지 마감 두께)**. 저장 컬럼이 아닌 파생값 (D21) | 상판 두께 — 상판 두께는 이 값의 입력 하나일 뿐이다 |
| **책상 설정** | 책상 규격의 정본 묶음. 출처(제품/직접 입력)·너비·깊이·높이·상판 두께·엣지 마감 두께·재질·프레임을 갖는다 (`desk_config`, D18) | 책상 옵션, 데스크 설정 |
| **직접 입력 규격** | 제품 DB에 없는 책상을 사용자가 입력한 규격. 호환성 판정의 정본이 되며 견적에는 포함하지 않는다 (`custom_desk_spec`, D18) | 커스텀 책상, 수동 규격 |
| **프레임 유형** | 책상 하부 구조 분류. T프레임 / 다리4개 / 상판만 (`frame_type`, D18) | 다리 종류, 레그 타입 |
| **벽면** | 책상 기준 좌·전면·우 3면. 각각 켜고 끔 | — |
| **타공판** | 벽에 붙이는 배치 표면. 벽이 켜져 있어야 설치 가능 | 페그보드 |
| **표면 스냅** | 상판·타공판·벽 표면에 자동으로 착 붙는 배치 방식 | — |
| **결합 (mount)** | 아이템을 다른 아이템에 **규격으로** 붙이는 관계. 호환성 판정(적합/조건부/불가)을 통과해야 성립한다 — 모니터↔암, 암↔책상 (D22) | 장착, 마운트, 부착. 거치를 결합이라 부르지 않기 |
| **얹기 (구 표면 안착·거치, stack)** | 아이템이 아래 아이템의 **지지면**에 얹히는 관계. **게이트 없음** — 아래 표면이 있으면 얹힌다. 기하가 정하는 것은 드롭 시 초기 높이뿐이고 **자세(기울기·최종 높이)는 사용자가 정하고 저장한다** (D22 2026-08-04 재개정, ADR-0023). 스태킹(매트·라이저)도 이 개념이다 | 표면 안착·거치·seat — 2026-08-04 폐기 표기. 결합 — 규격 게이트가 없으므로 결합이 아니다. "얹기 불가" 금지(거절 개념이 없다). 물리·중력·낙하로 설명하지 않기(엔진이 자세를 정하지 않는다) |
| **지지면 (구 안착면, support surface)** | 얹기의 기준 높이 = **아래 아이템 규격 박스 상단**(`center.y + heightMm/2`, 코드 `supportTopY`). **실메쉬 형상을 읽지 않는다** — 이 이름이 그 규칙이다 (2026-08-04 개정, ADR-0023 결정 1·10) | 안착면 — 2026-08-04 폐기 표기. 홀더 면, 슬롯, 크래들. 실표면·메쉬 표면 |
| **자세 (pose)** | 아이템 인스턴스의 회전·기울기 = `placed_item.rotation_deg`(yaw) + `pitch_deg`(앞뒤 기울기, ±75°). **사용자 입력이고 저장되는 원본값이다** — 로드 시 재계산하지 않는다 (ADR-0023 결정 2). 좌우 기울기(roll)는 없다 | 안착 자세 — 엔진이 계산하던 개념의 표기라 쓰지 않는다 |
| **형태 페어링 (accepts)** | **폐기 (2026-08-03, ADR-0022)** — 표면 안착에 게이트가 없어져 허용 카테고리 표(`CRADLE_ACCEPTS`)와 함께 소멸. 이 용어로 새 규칙을 만들지 말 것 | — |
| **측정** | 3D 공간에 점 찍어서 구간 거리·총합(mm) 재는 기능 | — |
| **선정리 계획** | 측정 경로로 케이블 길이·멀티탭 위치 잡는 보조 기능 | "선정리"만 단독 사용 |
| **카메라 프리셋** | 1인칭·전면·후면·측면·탑뷰 5종 고정 시점 | — |

서술 허용: **오브젝트** — 3D 캔버스 위 물체를 가리키는 개발 서술어(Three.js 맥락). 회의·기획 문서에선 배치 아이템.

## 1-4. 판정과 돈

| 용어 | 뜻 (한 줄) | 이렇게 말하지 않기 |
|---|---|---|
| **호환성 판정** | 규격 숫자로 "같이 쓸 수 있나" 판단. 결과는 3단계: **적합/조건부/불가** | 호환성 검증, 호환성 체크 |
| **견적** | 배치에 놓인 제품 가격 합산, 예산과 비교 표시 | 견적서, 총액 |
| **예산** | 사용자가 입력한 상한 금액(원) | — |
| **세팅 추천** | 예산·니즈 질문 받아서 제품 구성을 제안. 결과물은 "추천 세팅" | 구성 추천, 셋업 추천 |
| **AI 상상도** | 지금 배치를 바탕으로 AI가 그려주는 완성 이미지 | 렌더링, AI 이미지 |
| **찜** | 마음에 드는 **제품**을 담아두기. 배치가 아니라 제품에만 씀 | 위시리스트, 관심 상품 |
| **장바구니** | 사려는 제품을 수량과 함께 모아두는 목록 | 카트, 바구니 |

> **판정 이름 규칙**: 판정 종류는 개체끼리 부른다 — **암↔책상, 모니터↔암, 소품↔책상**. 부위 이름(클램프↔상판)으로 부르지 않는다. 부위·수치는 판정의 파라미터 — 클램프 물림 범위, 클램프 물림 두께, VESA, 허용 하중, 잔여 면적.

## 1-5. 커뮤니티

| 용어 | 뜻 (한 줄) | 이렇게 말하지 않기 |
|---|---|---|
| **공개 배치** | 사용자가 **컬렉션에 업로드**한 배치(`publish_status = PUBLIC`). **게시글 본문에 삽입할 수 있는 배치는 공개 배치뿐이다**(D25) | 게시물, 포스트 |
| **컬렉션** | 공개 배치들이 모여 보이는 갤러리 화면 (`/collection`, REQ-COM-13). 여기서 남의 배치를 리믹스하거나 북마크한다. **게시 입구는 작업실**이다(2026-08-11 D33·ADR-0036 — `/collection/new` 제거, 제목·설명 정본은 `placement.title`·`description`이고 localStorage 사이드카는 폐기). 옛 이름 "데스크 피드"에서 2026-08-10 개명(백엔드 `feed-entry` API는 legacy 이름 유지. `/desk-feed` 308 redirect는 같은 날 제거 — 그 URL은 아래 **데스크피드**(신규 도메인)가 가져갔다). 더 옛 이름 "커뮤니티"는 이제 **게시글** 화면을 가리키므로 섞어 쓰지 말 것 (D27) | 데스크 피드(이 화면 뜻으로 — 이제 다른 화면의 이름이다), 피드, 커뮤니티(게시글 화면과 겹친다), 갤러리 |
| **데스크피드** | 사용자가 **실제 책상 사진**을 올려 공유하는 갤러리 화면 (`/desk-feed`, 2026-08-10 신설). 컬렉션과 UI만 비슷할 뿐 별개 도메인 — 3D 배치가 아니라 사진이다. **콘텐츠는 제목 + 마크다운 본문 + 인라인 이미지**(2026-08-11 3차 개정, D34·ADR-0037 — 같은 날의 인스타형(ADR-0036 결정 1) 대체): **제목**(필수) + **본문**(마크다운, 필수 — **"캡션"이라 부르지 않는다**) + 본문 인라인 이미지 1~30장(**본문 안 위치가 순서 정본, 첫 이미지가 목록 대표** — 대표 컬럼 없음) + 태그 ≤5 + **사용된 제품 태그 ≤10**(`desk_feed_product` — 상세 하단 카드에서 내부 링크 `/product/{id}`). 목록은 카드(대표 이미지+제목+발췌+**사진 수 뱃지** — 뱃지 클릭 시 사진만 라이트박스), 상세는 **비로그인 공개 SSR 아티클**이다. 저장은 **전용 `desk_feed` 도메인**이다(D32·ADR-0033 — 신설 당일의 "post + 예약 해시태그" 구조는 같은 날 폐기, 사유는 ADR-0033). **배치 첨부**: 글 하나에 본인 공개 배치 **하나**를 붙일 수 있다(`desk_feed.placement_id`, D25와 같은 제한) — 사진을 먼저 올리고 나중에 붙여도 되고(양방향), 컬렉션 배치 상세는 역방향으로 "이 배치의 실사 사진"을 보여준다. ⚠ 2026-08-10 이전 문서의 "데스크피드"/`/desk-feed`는 지금의 **컬렉션**을 가리킨다 | 컬렉션(별개 화면), 피드(단독), 사진 게시판 |
| **업로드** | **목적어로 뜻이 갈린다** (D27) — **배치 업로드** = 배치를 컬렉션에 공개하는 행위(AI 상상도 생성이 따라붙는다, `PUT /placements/{id}/feed-entry`). **이미지 업로드** = 파일을 오브젝트 스토리지에 올리는 행위. 목적어 없이 "업로드"만 쓰지 말 것 | 게시(배치 뜻으로 — 게시글과 섞인다) |
| **상상도** | 배치를 업로드할 때 AI가 만드는 **실사 이미지 1장**(`generated_image`). 그 1장이 곧 `is_primary`이고 컬렉션 카드에 쓰인다(2026-08-06 3장→1장, D29·ADR-0025 — 재업로드 이력이 남으므로 행이 여러 개일 수는 있고, 그때 현재 대표를 답하는 것이 `is_primary`다). **시뮬레이터 스크린샷(`placement.thumbnail_key`)과 다른 것** — 스크린샷은 내 작업실 카드용이자 상상도 생성의 입력이다 (D27·ADR-0015) | 썸네일, 미리보기 |
| **게시글** | 데스크테리어 스토리를 글·사진으로 올린 커뮤니티 글 (`post`, D25). **배치는 3D 작업물이고 게시글은 그것에 대해 쓴 글이다 — 배치를 참조하지 않은 게시글도 성립한다.** 참조할 땐 본문 토큰으로 **여러 개**를 끼워 넣고, 대상은 **본인이 만든 공개 배치**만이다 — **비공개 배치는 삽입 자체가 불가능하다**(자동 공개도 공개 전환 유도도 없다) | 게시물, 포스트 (공개 배치와 같은 이유로 금지) |
| **본문 토큰** | 게시글 본문 안에 배치를 끼워 넣는 표기 — `[[placement:ID]]`. 저장은 본문 텍스트 그대로이고 **참조를 담는 컬럼·정션이 따로 없다**(D25 2026-07-30 개정). 대상이 삭제되면 그 자리는 "삭제된 배치입니다" 플레이스홀더로 렌더한다. ~~`[[product:ID]]`(상품 토큰)~~은 **폐기**(D26 2026-07-30 저녁) — 배치가 제품 구성을 이미 품어 상품을 따로 넣을 이유가 없다 | 임베드, 링크, 첨부, 태그 — 태그는 해시태그 뜻 전용 |
| **템플릿** | 관리자가 시딩해 둔 공개 배치. 별도 개념 아님 — 공개 배치의 하나 | 데스크 — 데스크는 책상(제품) 뜻 전용 |
| **리믹스** | 남의 공개 배치·템플릿을 복사해 내 걸로 편집. 원본 출처 표시됨 | — |
| **북마크** | 공개 배치를 내 목록에 담아두기 | "저장" — 저장은 내 배치 저장 전용 단어 |
| **북마크 그룹** | 북마크한 공개 배치를 사용자가 직접 묶어 관리하는 단위 (`placement_bookmark_group`) | 폴더, 보드 — "컬렉션"도 금지였으나 2026-08-10부터 갤러리 화면의 이름이 됐다. 북마크 그룹 뜻으로 쓰지 말 것 |
| **좋아요** | 공개 배치·게시글·데스크피드 글 호감 표시. **대상별로 기록이 따로다** — `placement_like` / `post_like` / `desk_feed_like` (D25·D32) | — |
| **댓글** | 공개 배치·게시글·데스크피드 글에 다는 글. **대상별로 테이블이 따로다** — `comment`(배치) / `post_comment` / `desk_feed_comment` (D25·D32). 전부 플랫(대댓글 없음) | — |
| **팔로우** | 다른 사용자의 활동을 구독해 새 공개 배치를 받아보기 (`follow`) | 구독, 친구 추가, 팔로잉(행위 뜻으로) |
| **해시태그** | **제품·게시글·배치·데스크피드 글**에 붙는 탐색용 태그. 값이 자유롭게 늘어난다 (`hashtag` 마스터 하나를 넷이 공유, 정션은 `product_hashtag`·`post_hashtag`·`placement_hashtag`·`desk_feed_hashtag`. 게시글 편입은 D25 2026-07-30 개정, 배치 편입은 ADR-0027 2026-08-07, 데스크피드 편입은 D32 2026-08-10) | 태그(단독), 키워드, 라벨 |
| **멘션** | 데스크피드 본문·댓글 텍스트 안에서 다른 사용자를 가리키는 표기 — 입력은 `@닉네임` 자동완성, 저장은 **안정 userId 토큰** `[[user:ID]]`(D35·ADR-0038), 렌더는 현재 닉네임 + 프로필 링크. 용도는 크레딧(남의 데스크 사진의 주인 표기). 탈퇴 사용자는 "@알 수 없음" | 태그(해시태그 뜻 전용), 사용자 태그(사용자 입력 해시태그 뜻), 언급 |
| **자작 제품** | 사용자가 GLB와 규격을 직접 올려 만든 제품 (`product.source = USER`, D20). 카탈로그 제품과 같은 테이블·같은 판정을 쓴다 | 유저 에셋, 커스텀 제품 — **"직접 입력"은 책상 규격(D18) 전용 단어라 쓰지 않는다** |
| **카탈로그 제품** | 운영진이 등록한 제품 (`product.source = CATALOG`). 브랜드·가격·구매처가 붙는다 | 공식 제품, 정품 |
| **에셋 검수** | 올라온 GLB·규격을 운영진이 보고 승인·반려하는 단계 (`asset.review_status`) | 심사, 승인 절차, 검증 — **검증은 호환성 판정 뜻으로 쓰지 않는다** |

> **헷갈리면 이렇게**: 배치는 하나다. 내 작업실에 있으면 그냥 **배치**, 커뮤니티에 올리면 **공개 배치**, 관리자가 올린 공개 배치면 **템플릿**. 별도 데이터가 아니라 같은 배치의 상태 차이. / **저장 vs 북마크**: 내 배치를 보관 = 저장, 남의 배치를 담아두기 = 북마크. / **북마크 vs 북마크 그룹**: 담는 행위·기록이 북마크, 담은 것들을 묶는 상자가 북마크 그룹(그룹에 넣지 않은 북마크도 허용).

> **커뮤니티에 올리는 것은 세 종류다**(D20·D25): 내가 만든 **3D 파일 = 자작 제품 업로드**(제품이 하나 생긴다), 내가 꾸민 화면 = **배치 게시**(제품이 생기지 않고 배치가 공개된다), 내가 쓴 이야기 = **게시글 작성**(배치를 참조하지 않아도 된다). 셋 다 "올린다"고 말해서 섞이는데, 첫째는 `product`+`asset` 행이 생기고 둘째는 `placement.visibility`가 바뀔 뿐이며 셋째는 `post` 행이 생긴다.

> ⚠️ **해시태그 ≠ 스타일 태그**: 해시태그는 **제품과 게시글**에 붙는 탐색용 태그이고 값이 자유롭게 늘어난다(`hashtag` 테이블 하나를 둘이 공유한다 — D25 2026-07-30 개정으로 게시글이 편입됐다). REQ-ENV-03의 "스타일 태그"는 온보딩에서 **사용자**가 고르는 고정 선택지이고 세팅 추천(REQ-REC-02)의 입력값이다. 둘은 붙는 대상도 값의 성격도 달라 같은 말로 섞지 않는다.

## 1-6. 3D·에셋 기술 용어 — 에셋 얘기 나올 때

개발↔기획 대화에서 자주 나오는 3D 단어. 회의에서 이 뜻으로만 쓴다.

| 용어 | 뜻 (한 줄) | 비고 |
|---|---|---|
| **메쉬** | 3D 모양을 이루는 그물망 데이터(정점+면). 에셋 파일의 본체 | 판정 참조 금지 — 시각화 전용 |
| **폴리곤** | 메쉬를 이루는 면 조각(주로 삼각형). 많을수록 정밀하고 무거움 | 경량화·검수 기준 |
| **정점(버텍스)** | 폴리곤의 꼭짓점. 폴리곤 수와 함께 에셋 용량을 좌우 | vertex |
| **텍스처** | 메쉬 표면에 입히는 이미지(나뭇결·금속 질감 등) | 경량화 기준 |
| **머티리얼** | 표면 재질 설정 묶음 — 텍스처 + 색 + 반사 정도 | material |
| **셰이더** | 화면에 어떻게 그릴지 계산하는 GPU 프로그램 | WebGPURenderer+TSL 채택(2026-07-17 개정, D5). 커스텀 셰이딩은 TSL로만 |
| **glTF / GLB** | 3D 에셋 표준 파일 포맷. 미터 단위 고정. GLB = 한 파일로 묶은 바이너리판 | 에셋 등록 포맷 |
| **바운딩 박스** | 물체를 딱 감싸는 최소 직육면체 | 치수 실측(Box3)·충돌 감지에 사용 |
| **균일 스케일** | x·y·z 같은 비율로 크기 조정. 로드 후 규격 DB 값에 맞춰 1회 적용 | 비균일(한 축만) 스케일 금지 — 왜곡 (D7) |
| **정합** | AI 생성 에셋을 실측 규격·비율에 맞게 손보는 수작업 | 내부 비율 오차 5% 초과 = 재생성 |
| **경량화** | 폴리곤·텍스처를 줄여 로딩을 가볍게 하는 작업 | — |
| ~~**제네릭 에셋**~~ | ~~모니터암처럼 얇은 구조에 쓰는 공용 파라메트릭 에셋. 규격 값으로 형태 조정("제네릭 에셋 + 규격 스킨")~~ | **2026-07-23 폐기 (D19 소품 전량 GLB화).** 짝 개념 "규격 스킨"도 함께 폐기 — 표기 금지. 관절 구조는 파트 분할 export + 리그 매니페스트 + 런타임 리지드 노드 계층으로 대체(D16 2026-07-18 개정). 근거는 D17("텍스처가 룩의 ~70%" — 고정 UV 없이는 손그림 albedo가 불가). 절차 생성으로 남는 것은 치수 가변 지오메트리(책상 상판·모니터 화면 패널)뿐 |
| **머티리얼 스킨** | 코드가 메쉬에 입히는 재질 프리셋. PBR 수치(기본색·거칠기·금속성·clearcoat·투과)는 코드가 들고 있고, DB는 **어느 프리셋인지만** 고른다 | **"제품마다 필수"는 폐기(2026-07-23)** — 물리 정본은 `asset.finish` **1컬럼**이고 part-segmentation 에셋에만 채운다. 옛 재질 4컬럼(`material_class`·`base_color`·`roughness`·`metalness`)도 같은 날 폐기 — 수치 정본이 코드(`materialForSkin()`, `frontend/src/three/render/materials.ts`)라 DB에 또 받으면 정본이 둘이 되어 어긋난다. 코드에는 런타임 타입 `MaterialSkin`으로 남는다. 갈래별 재질 정본: `docs/context/asset-pipeline.md` |
| **벽면 마감** | 벽면 하나의 룩. **재질 계열**(`material` — `PAINT`·`WOOD_SLAT`·`BRICK`·`MARBLE`·`CONCRETE`)과 그 계열이 정의한 **변형**(`variant` — 오크/월넛/애쉬 등) 한 쌍이다. 좌·전면·우가 각자 갖는다 | ADR-0030(2026-08-08). 저장은 `placement_wall` 행(면당 1행). **색은 계열이 소유한다** — 자유 hex는 여전히 금지이고 변형 목록 밖의 색은 만들 수 없다. 룩의 계산 정본은 여전히 코드(`frontend/src/three/finishes/`, ADR-0021 결정 1). 바닥은 면이 하나라 `placement.floor_material`·`floor_variant`. 표기 금지: **벽 스킨**, 룸 스킨, 월페이퍼, 벽지 |
| **벽 거리** | 벽면 하나가 책상에서 얼마나 떨어져 있는지(mm). **기준이 면마다 다르다** — 좌·우는 책상 중심 기준 거리, 전면은 책상 뒷변 기준 간격이다. HUD 벽 플라이아웃에서 mm로 조정한다 | REQ-ENV-06. 저장은 `placement_wall.distance_mm`(면당 1행, DERO-548 이전에는 저장되지 않아 재로드마다 기본값으로 돌아갔다). 기본값도 면마다 다르다 — 좌·우 1550, 전면 50. **하한 클램프는 엔진 소관**이다(책상 반폭에 걸려 규격마다 달라 WAS는 상한 3000mm만 본다). 표기 금지: **벽간 거리**(면과 면 사이로 읽힌다), 벽 간격 |
| **방 프리셋** | 벽면 3면 + 바닥 마감을 한 번에 채워 주는 이름 붙은 조합(`neutral`·`oak-warm`·`white-clean`·`dark-studio`·`morning-window`·`night-city`) | ADR-0030 결정 1. **저장되지 않는다** — 클릭하면 벽면별 값에 써넣는 프리필 버튼이고 정본은 벽면 마감 하나다. 그래서 재로드 때 프리셋과 벽면 값이 다툴 일이 없다. ~~2026-08-03~~ **2026-08-08까지 이 개념의 이름은 "테마"였고 `placement.theme_key`로 저장됐다** — ADR-0021 결정 3·4가 대체됐다. **머티리얼 스킨과 층위가 다르다**(스킨은 메쉬 1개의 PBR 프리셋) |
| **시간대** | 방의 무드 2값 — 주간 `DAY` / 야간 `NIGHT`. 창밖 풍경과 햇살 방향·색을 함께 정한다 | ADR-0030 결정 4, D31. `placement.time_of_day`. **방 조명(`is_room_light_on`)과 별개 값이다** — 시간대를 바꾸면 방 조명이 기본값으로 따라 움직이지만(DAY→on, NIGHT→off) 그 뒤 따로 끌 수 있다. 조합 4개가 전부 유의미하다. AI 상상도의 `generated_image.time_of_day`와 **같은 값 공간**이다 |
| **창문** | 벽면에 뚫는 개구부. 벽면당 0~1개, 창밖 풍경이 보이고 **주 창문 하나가 햇살 방향을 정한다** | ADR-0030 결정 5·6·7. 벽 지오메트리의 **진짜 구멍**이라 벽걸이 아이템이 raycast로 자동 회피한다. 주 창문 우선순위는 전면 > 좌 > 우(꺼진 벽 제외). D4가 폐기했던 항목을 D31이 무드 축으로 되살린 것 — **방 구조를 설계하는 기능이 아니다**(문 위치는 폐기 유지) |
| **블라인드** | 창문에 걸리는 백색 베네시안 블라인드. 위에서 개구부 높이의 0.45만 내려온(기준은 화면) 슬랫 반개 **고정 상태 하나**로, 조절·저장 대상이 아니다 | ADR-0031 결정 4 (커튼 대체). 창틀·창턱·밸런스와 함께 창문 있는 벽에 자동 생성되는 드레싱 — 스키마에 필드가 없다. "커튼"은 2026-08-09 이후 표기 금지 |
| ~~**벽지 색 / 바닥 색**~~ | ~~벽·바닥 재질에 직접 먹이는 자유 hex 색. 프리셋 8색 + 컬러 피커~~ | **2026-08-03 폐기(ADR-0021 결정 4).** 테마 키 하나로 축을 통일하면서 UI·스토어·씬 API(`setWallColor`·`setFloorColor`)를 전부 제거했다. 자유 hex는 절차 룩과 양립 불가(우드 슬랫에 초록을 먹이면 나무가 초록이 된다)이고, 테마와 병존하면 재로드 시 정본이 둘로 갈린다 — **되살리지 말 것.** ⚠️ **2026-08-08 ADR-0030이 벽면별 색 선택을 도입했지만 이 폐기를 되살린 것이 아니다** — 색이 계열이 정의한 유한 변형에서만 오므로 위 폐기 사유(나무가 초록이 되는 조합)가 **구조적으로 불가능**해졌다. `<input type="color">`와 자유 hex는 여전히 금지다 |
| **마감(finish)** | 관절 에셋에 입힐 재질 프리셋 선택지. 고정 4종 — **투명 아크릴 / 메탈릭 / 화이트 / 블랙** | 등록자가 드롭다운으로 고르는 값 하나. `asset.finish`(2026-07-23 확정). ⚠️ 에셋 **하나에 마감 하나** — 로더가 전 메쉬에 같은 재질을 입힌다. 투톤이 필요해지면 그때 `asset_part_material`(1:N) 신설 |
| **관절(조인트)** | 에셋에서 접히고 꺾이는 부분. 모니터암의 팔꿈치처럼 두 세그먼트가 만나 회전하는 지점 | D16. 관절이 있는 에셋 = 관절 에셋. 대상 제품군 4종(2026-07-23 확정) — 모니터암·마이크암(`spec_type = ARM`) / 노트북 거치대·휴대폰 거치대(`spec_type = PROP`) |
| **관절 종류** | 관절의 운동 형태. `revolute`(회전, 도 단위) · `prismatic`(직선, mm 단위) 2종 | ADR-0002(2026-07-25). `rig_manifest`의 `kind` 필드, 생략 시 `revolute`가 기본값. 표기 금지: 힌지 종류 |
| **종속 관절** | `coupledTo`로 driver 관절을 따라 값이 자동 계산되는 관절 (평행사변형 링크 등). 슬라이더·gizmo에 노출되지 않고 값도 저장하지 않는다 | ADR-0002 결정 2. 값 = `driver × ratio + offset`, 자기 한계각으로 재클램프 후 로드 시마다 재계산 |
| **driver 관절** | 사용자가 직접 조작하는 관절. `placed_item.joint_values`에 저장되는 것은 driver 값뿐이다 | ADR-0002 결정 2·3 |
| **리지드 노드 계층** | 관절 에셋을 만드는 방식. 세그먼트(팔뚝·팔꿈치 등)를 각각 별도 메쉬로 두고 부모-자식으로 엮어, 부모를 돌리면 자식이 따라 도는 구조. 모양은 안 변하고 각도만 변함 | D16. 본 프로젝트 관절 에셋의 유일한 방식 |
| **스키닝** | 뼈대에 살을 붙여 정점을 부드럽게 휘게 하는 방식(사람·동물 캐릭터용) | ⚠️ **본 프로젝트 관절 에셋에는 금지** — 정점이 변형되는 게 곧 "깨짐"의 원인 (D16) |
| **관절 한계각** | 관절이 꺾일 수 있는 최대·최소 각도(도). 실제 제품이 접히는 범위 | 규격 DB 소관 — 메쉬가 아닌 DB가 정본 (D16, D7 연장) |
| **레이캐스팅** | 클릭 지점에서 광선을 쏴 어느 물체·표면인지 찾는 기법 | 선택·표면 스냅 구현 수단 |
| **씬** | 3D 공간 전체 — 물체·광원·카메라를 담는 그릇 | Three.js Scene |
| **광원** | 씬 안의 빛 소스. 조명 무드 시뮬레이션(D5)의 대상 | — |
| **색온도** | 빛의 색깔을 숫자로 나타낸 값(단위 K, 켈빈). 낮으면 주황빛(아늑함), 높으면 푸른빛(사무실 형광등) | 조명 에셋의 규격 DB 필드 (D5) |
| **IBL(HDRI 환경 조명)** | 사방이 찍힌 파노라마 사진(HDRI)을 씬 주변에 둘러 그 사진의 빛으로 물체를 비추는 기법. 반사·그림자가 자연스러워짐 | D5 개정으로 채택. Image Based Lighting |
| **배광 분포(확산형/집중형)** | 조명이 빛을 좁게 모으는지(집중형) 넓게 퍼뜨리는지(확산형). SpotLight cone 각으로 표현 | 조명 에셋 규격 DB 필드 (D5). distribution |
| **광속(루멘)** | 조명이 내는 빛의 총량(lm). 렌더는 **저작 기준값**을 `SpotLight.power`·`PointLight.power`에 직결한다 | 밝기의 정본 단위 (2026-07-23 확정). **렌더 정본은 `product_emitter.lumens`**이고 `light.luminous_flux_min_lm`은 제조사 정격의 카탈로그 표기다 (2026-07-29 개정, DERO-222) |
| **방 조명** | 씬 전역의 중립 기본 조명. on/off 토글 — 끄면 배치한 조명만 남아 무드 확인. 색온도·밝기 변조는 여기 안 걸고 배치 조명이 담당 | D5 (2026-07-18). on/off는 **배치 저장 값** — `placement.is_room_light_on` |
| **조명 제품** | **용도가 조명인** 제품(스탠드·벽등 등). 카탈로그 분류 개념 | `spec_type = LIGHT`. 발광체와 혼동 금지 — 아래. 규격 표기는 `light`(마커), **렌더 발광값은 `product_emitter`** (2026-07-29) |
| **발광체** | **빛을 내는 파트.** `spec_type`과 무관한 렌더 개념이라 PC 본체·키보드도 가질 수 있다. 조명 제품 ⊂ 발광체를 가진 제품이고 역은 성립하지 않는다 | D5 (2026-07-25 개정)·ADR-0003. 정의는 **`product_emitter`** (2026-07-29 개정, DERO-222 — **`asset.emitter_manifest` 표기 금지**). 부모가 `asset`이 아니라 `product`인 것은 절차 생성 발광체가 GLB가 없어 `asset` 행을 못 갖기 때문이다 |
| **기능 조명** | 조명 제품의 발광. `product_emitter.shape = SPOT`이라 그림자를 지는 SpotLight가 된다 | ADR-0003 결정 2. **광원 값의 출처가 `light`에서 `product_emitter`로 바뀌었다** (2026-07-29, DERO-222) — 그림자 여부를 가르는 것도 제품 분류가 아니라 `shape`다(223) |
| **장식 발광** | 조명 제품이 아닌 것의 발광(PC RGB·스트립·백라이트). emissive + 블룸 + **그림자 없는** PointLight로 주변만 물들인다 | ADR-0003 결정 2. `shape = POINT`라 그림자 캐스터 모집단에서 빠진다 — 큐브맵이라 씬 6패스다(223). **`spec_type`이 아니라 `shape`가 가른다** (2026-07-29) — SPOT으로 저작된 장식 발광은 코드 수정 없이 그림자를 받는다 |
| **고정 발광 / 가변 발광** | 발광체의 색을 제품이 정하면 고정, 사용자가 고르면 가변 | **`product_emitter.recolorable`** (2026-07-29 개정 — **`emitter_manifest.recolorable` 표기 금지**). 가변의 색은 **배치 아이템당 1개** — `placed_item.emitter_color`. `recolorable = false`는 "못 고른다", `emitter_color`가 NULL이면 "고를 수 있는데 안 골랐다" — **다른 상태다** |
| **저작 추정 광속** | 저작자가 눈으로 맞춘 **기준** lm 값. 스펙시트에 RGB 루멘이 없어 추정치다. **정격 광속과 권위가 다르다** — 렌더가 읽는 건 이쪽이고 정격은 카탈로그 표기다 | **`product_emitter.lumens`** (2026-07-29 개정 — **`emitter_manifest.lumens` 표기 금지.** 에셋이 아니라 **제품**에 붙는다). 단위를 lm으로 맞추는 건 `CAMERA_EXPOSURE` 한 번의 캘리브레이션을 재사용하기 위함이다. 렌더 최종값 = 이 값 × `placed_item.emitter_brightness_scale` |
| **발광 shape** | 발광체가 빛을 **어떻게 뿌리는가**. 점(`POINT`, 사방) / 스팟(`SPOT`, 원뿔) 2종 | `product_emitter.shape` (2026-07-29 신설). **`AREA`는 DERO-227이 부결했다 — 열거에 넣지 않는다** (2026-07-30). 사각 하이라이트는 실측으로 진짜지만(aspect 12.0 대 SPOT 0.98) 프로덕션 카메라 프리셋 6개 중 어느 것도 보여주지 못하고, 그림자가 영구 불가하다. ⚠️ `PROJECTOR`는 three 업스트림 API 미확정. 위 **배광 분포**와 축이 다르다 — shape는 광원 종류, distribution은 원뿔을 얼마나 조이나 |
| **밝기 배율** | 사용자가 배치에서 고르는 무단위 실수. 렌더 lm = 기준 lm × 배율 | `placed_item.emitter_brightness_scale` (2026-07-29 신설). 절대 lm이 아니라 배율인 이유: 저작 기준값을 고쳐도 사용자가 고른 **상대** 밝기가 안 뒤집힌다. 실효 lm은 그림자 배정 랭킹 키이기도 하다(223) |
| **블룸** | 밝은 픽셀 주변으로 빛이 번져 보이게 하는 후처리. 없으면 발광체가 "밝은 스티커"로 보인다 | ADR-0003. 대상 선택은 밝기 threshold가 아니라 **emissive MRT 슬롯**이다(2026-07-25 확정) — 흰 벽은 이 슬롯에 0을 써서 구조적으로 못 번진다 |
| **파트 분할(part-segmentation)** | Meshy가 에셋을 파츠별 분리 메쉬로 내보내는 export 모드. 텍스처는 빠짐 | 관절 에셋 지오메트리 소스. texture(융합) export와 대비 (2026-07-18) |
| **리그 매니페스트** | 관절 에셋의 파트→세그먼트 매핑·관절 종류(회전/직선)·축/점·한계각·표시명(`label`)·커플링(`coupledTo`)을 담은 규격 DB 데이터. 런타임이 이걸로 리지드 노드 계층 구성 | D16. part-seg 지오메트리에 관절을 입히는 정본 (2026-07-18, 2026-07-25 관절 종류 유니온·커플링 확장 — ADR-0002). 물리 위치는 **`asset.rig_manifest`**(2026-07-23 `arm`에서 이동) — 매니페스트가 GLB 파트 이름에 묶여 있어 제품 규격이 아니라 에셋 파일에 종속이다. 관절 부위·가동 범위의 **런타임 정본**이며 `arm`의 각도 컬럼은 카탈로그 표기·필터용 |
| **렌더링** | 3D 장면을 화면 그림으로 그려내는 일 | ⚠️ AI 상상도를 "렌더링"이라 부르지 말 것 — 렌더링은 실시간 3D 화면 얘기 전용 |
| **stylized PBR (스타일라이즈드 PBR)** | PBR 재질 응답을 유지한 채 약한 toon ramp로 살짝 카툰화한 셰이딩 | full cel-shade와 구분 — 재질 구분·IBL 반사 보존 → D5 무드 시뮬 유지 (D17) |
| **toon ramp (툰 램프)** | diffuse 조도를 2~3밴드로 posterize하는 TSL 노드 | specular·반사는 PBR 보존. 강도 약하게 — 세면 IBL 반사 무드 죽음 (D17) |
| **선택 외곽선 (selection outline)** | 선택·호버 제품 강조용 카툰 외곽선 | WebGPU outline 노드(TSL RenderPipeline)로 구현. classic OutlinePass(EffectComposer)는 비호환 (REQ-SIM-11, D17) |
| **painterly (페인털리)** | 손그림 텍스처 + 베이크 라이팅 + 둥근 로우폴리가 만드는 회화풍 룩 | 레퍼런스 three.js LittlestTokyo (D17) |
| **OBB (방향성 바운딩 박스)** | 물체의 회전을 따라 기울어지는 최소 직육면체. 축정렬(AABB)과 달리 비스듬한 물체·관절 포즈에서 헛충돌이 안 남 | 공간 충돌 판정 단위(메쉬당 1개), collider.ts (REQ-SIM-04) |
| **SAT (분리축 판정)** | 두 OBB가 겹치는지 가리는 알고리즘 — "떼어놓는 축"이 하나라도 있으면 안 겹침 | OBB 교차 검사에 사용 (REQ-SIM-04) |
| **지지 파트 (supportPart)** | 관절 에셋에서 책상에 실제 닿는 밑동 세그먼트(모니터암의 클램프). 경계(상판 밖) 판정은 이 파트 footprint로만 — 머리 캔틸리버는 상판 밖도 허용 | 리그 매니페스트 필드 (REQ-SIM-04) |
| **스태커블 (stackable)** | 위에 다른 아이템을 얹을 수 있는 낮은 표면(데스크 매트·라이저·코스터). **2026-08-03부터 엔진 지지면 게이트가 아니다** — 얹기가 모든 아이템 규격 박스 상단을 지지면으로 취급한다(ADR-0022 결정 3, ADR-0023에서 유지). `prop.is_stackable` 컬럼은 남되(ERD 동결) 엔진이 읽지 않는다 | 규격 DB 플래그 (REQ-SIM-02). ~~`accepts: any`인 거치의 특수형~~ — 거치·accepts 개념과 함께 소멸(D22 개정) |
| **소프트 블록** | 충돌·경계 위반 시 배치를 막지 않고(위치 클램프 없음) 빨강 표시 + 저장 차단만 하는 방식 | 자유 이동 보장, 저장 게이트가 최종 방어 (REQ-SIM-04) |
| **충돌 무시** | 겹침(충돌) 축의 빨강 표시·경고 배너·저장 차단을 사용자가 세션 한정으로 끄는 토글. **판정 자체를 끄는 게 아니라 소비만 막는다** — `anyCollision()`은 계속 참이다. 경계 위반은 무시 대상이 아니다 | 상단 네비바 토글 (REQ-SIM-32). "겹쳐 보고 싶은 사용자"용 — 근거는 ADR-0009 결정 5 |
| **절차형 모델 (procedural_model)** | 규격값으로 런타임에 생성하는 지오메트리. GLB 에셋과 대비되는 개념이며 **책상 상판·모니터 전체**(화면 패널·베젤·스탠드)가 여기 해당 | D18(2026-08-02 재개정 — 모니터 하이브리드 폐기). 임의 리사이즈 금지(D7)는 GLB 스케일 왜곡 대상 — 절차형 생성은 해당 없음 |
| **패널 형상 (panel_shape)** | 모니터 화면 형상 분류. 평면(`flat`) / 곡면(`curved`) | D18. "와이드"는 형상이 아니라 화면비로 표현한다 |
| **곡률 반경 (curvature_radius)** | 곡면 모니터 화면이 이루는 원호의 반지름(mm). 예: 1800R | 규격 DB 필드 `curvature_radius_mm` (D18) |
| **화면비 (aspect_ratio)** | 모니터 화면의 가로:세로 비율. 인치와 함께 화면 mm 치수를 결정 | ⚠️ 마케팅 라벨과 실제 패널 비율이 다르다 — 34" 울트라와이드는 21:9가 아니라 **43:18**(3440×1440과 일치). 21:9로 적으면 화면 치수가 어긋난다 (D18) |

---

# 2부. 설계 사전 — ERD·코드용

단계별 명명: 개념(1부 한글 정본) → 논리(영문 PascalCase 엔티티 / camelCase 필드) → 물리(snake_case, 완전 단어).
새 컬럼명은 §2-3 표준 단어를 조립해서 만든다. 없는 단어는 사전에 먼저 추가.

## 2-1. 엔티티 사전 (개념 → 논리 → 물리)

| 개념(한글) | 논리(엔티티) | 물리(테이블) | 비고 |
|---|---|---|---|
| 사용자 | User | `user` | 단수형. SQL 예약어라 DDL·쿼리에서 `"user"` 인용 필수. role: USER/ADMIN, provider: KAKAO/GOOGLE. 표시 이름은 `nickname`(**`name` 금지** — 실명 오해, 2026-07-28 개정), 프로필 사진은 사용자가 올린 파일의 object key `profile_image_key`(nullable — 안 올렸으면 NULL이고 프론트가 기본 아바타를 쓴다. **소셜 제공자가 주는 사진은 받지 않는다** — D24 2026-07-29 개정). `nickname`은 **살아있는 계정 기준 유니크**(부분 유니크 인덱스) — **가입 플로우에서 사용자가 직접 입력하고, 중복이면 그 자리에서 거절해 다시 받는다**(D23 2026-07-28 확정. 제공자 표시명은 초깃값으로만 주고 **접미사 자동 부여는 채택하지 않았다**) |
| 팔로우 | Follow | `follow` | `follower_id`·`following_id` 둘 다 User FK. 쌍 유니크, hard delete |
| 약관 | Terms | `terms` | 동의 항목·개정 회차 마스터 (2026-07-28 신설, DERO-217). `code`(4종)+`revision` 쌍 유니크·`is_required`·`effective_at`. **테이블명이 이미 복수형처럼 보이지만 단수형 원칙 위반이 아니다** — terms는 "약관"을 뜻하는 불가산 관용 표기다. soft delete 아님(법적 증빙이라 행을 지우지 않는다) |
| 동의 이력 | UserConsent | `user_consent` | 사용자별 동의 기록. User N:1, Terms N:1. **append-only** — 철회도 `is_agreed = false` 새 행이고 UNIQUE가 없다. 동의 시각은 `created_at`이며 `agreed_at`을 따로 두지 않는다 (2026-07-28 신설, DERO-217) |
| 브랜드 | Brand | `brand` | 제품 제조·판매 주체. Product N:1 |
| 카테고리 | Category | `category` | 탐색·분류 트리. `parent_id` 자기참조(NULL = 루트) |
| 제품 | Product | `product` | 제품 마스터. brand_id·category_id·spec_type·price_krw + **출처 2종**(`source` CATALOG/USER, `owner_user_id`). 사용자 자작 제품도 이 테이블이다(D20) — 별도 테이블 없음. 대표 이미지 컬럼은 없다(아래 `product_image`가 흡수, D25) |
| 제품 이미지 | ProductImage | `product_image` | Product 1:N. 제품 실사 이미지 최대 8장 — `image_key`·`display_order`·`is_primary`. 2026-07-30 신설(D25) — **옛 `product.image_key` 컬럼을 흡수하며 그 컬럼은 삭제된다**(`product.image_key` 표기 금지). 대표 이미지의 정본은 `is_primary`이고, 제품당 1장을 부분 유니크 인덱스가 강제한다 |
| 에셋 | Asset | `asset` | Product 1:1(**nullable**). glTF file key(`asset_key`)·검수 상태(`review_status`·`review_note`)·`glb_export_mode`·`finish`(아래 머티리얼 스킨)·`rig_manifest`(관절 에셋만). **책상·모니터는 행이 없다**(D18 절차형 생성 — 모니터는 2026-08-02 재개정으로 하이브리드가 폐기돼 GLB가 없다). 나머지는 전부 행을 갖는다(D19). `product_id`가 PK 겸 FK인 **식별관계** |
| 머티리얼 스킨 | — | `asset`.finish | 별도 엔티티가 아니다 — `material_skin` 표기 금지(2026-07-23 테이블 폐기). ~~재질 4컬럼(`material_class`·`base_color`·`roughness`·`metalness`)~~도 같은 날 폐기하고 **`finish` 1컬럼**(VARCHAR(20), 고정 4종)으로 접었다 — PBR 수치의 정본은 코드다. `glb_export_mode = PART_SEGMENTATION`이면 `finish` 필수, `TEXTURE`면 NULL(WAS 강제). 프론트 `MaterialSkin`(`frontend/src/three/scene/product.ts`)은 런타임 타입으로 유지 — 테이블 미러가 아니다 |
| 리그 매니페스트 | — | `asset`.rig_manifest | 별도 엔티티가 아니다 — 관절 에셋의 파트→세그먼트 매핑·관절 종류·한계각·표시명·커플링(JSONB). 2026-07-23 `arm`에서 `asset`으로 이동(`arm.rig_manifest` 표기 금지), 2026-07-25 관절 종류 유니온·커플링 확장(ADR-0002) |
| 발광체 저작값 | ProductEmitter | `product_emitter` | Product 1:1(**nullable**). 2026-07-29 신설(DERO-222) — 옛 `asset.emitter_manifest` JSONB 대체(**표기 금지**). `shape`·`distribution`·`lumens`·`radius_mm`·`recolorable`·`default_color`·`point_x/y/z_mm`. **렌더 발광값의 정본**이고 `light`는 카탈로그 표기 마커다. 부모가 `asset`이 아닌 이유: 절차 생성 발광체(ADR-0003 결정 7)는 GLB가 없어 `asset` 행을 만들 수 없다 |
| 책상 규격 | Desk | `desk` | Product 1:1. `spec_type = DESK`. product_id가 PK 겸 FK |
| 책상 상판 재질 | DeskTexture | `desk_texture` | 사용자가 고르는 상판 재질 마스터. 텍스처 3맵 file key + `tile_size_mm`(1장이 덮는 실제 폭). 서버 제공이라 enum이 아니다 |
| 모니터 규격 | Monitor | `monitor` | Product 1:1. `spec_type = MONITOR`. VESA는 인라인 컬럼 아닌 `product_vesa` 정본 |
| 암 규격 (모니터암·마이크암) | Arm | `arm` | Product 1:1. `spec_type = ARM`(2026-07-23 `MONITOR_ARM`에서 개명 — 마이크암 편입). `arm_kind`(MONITOR/MIC)로 제품군을 가르고 `device_capacity`(구 `monitor_capacity`)로 거치 대수를 담는다. 마운트 boolean 3종 보유. 리그 매니페스트는 `asset.rig_manifest`로 이동 |
| 조명 규격 | Light | `light` | Product 1:1. `spec_type = LIGHT`. 색온도·밝기·배광 분포 — **카탈로그 표기용 마커이고 렌더는 읽지 않는다** (2026-07-29, DERO-222). 광학 6컬럼 nullable, 치수 3컬럼과 boolean 2종은 `NOT NULL` |
| 소품 규격 | Prop | `prop` | Product 1:1. `spec_type = PROP`. 구 `decorate`(동사라 폐기) |
| VESA 규격 | VesaSpec | `vesa_spec` | VESA 홀 간격 마스터. `width_mm`×`height_mm` 유니크 |
| 제품 VESA 지원 | ProductVesa | `product_vesa` | Product N:M VesaSpec 정션. 한 모니터가 75·100을 동시 지원할 수 있어 정션이 정본 |
| 바이브 | Vibe | `vibe` | 제품 분위기 마스터. 컬럼은 `name`(테이블명 반복 금지) |
| 제품 바이브 | ProductVibe | `product_vibe` | Product N:M Vibe 정션. 구 `item_vibe` |
| 해시태그 | Hashtag | `hashtag` | 제품 탐색용 자유 확장 태그 마스터 |
| 제품 해시태그 | ProductHashtag | `product_hashtag` | Product N:M Hashtag 정션 |
| 배치 | Placement | `placement` | publish_status·is_template·source_placement_id·방 조명·**바닥 마감(`floor_material`·`floor_variant`)**·**시간대(`time_of_day`)**·예산·thumbnail_key(스크린샷). 책상은 `placement_desk`, **벽 3면은 `placement_wall`**이 갖는다 |
| 배치 벽면 | PlacementWall | `placement_wall` | Placement 1:N, 면당 1행 3행 고정(`UNIQUE(placement_id, wall_side)`). **벽면 마감(`material`·`variant`) + 표시 여부(`is_on`) + 벽 거리(`distance_mm`) + 창문 4컬럼.** ADR-0030 결정 3. `placement`에 있던 `is_wall_left_on`·`is_wall_front_on`·`is_wall_right_on`이 여기 `is_on`으로 옮겨왔다 — 벽 정본이 두 곳으로 갈리면 안 된다 |
| ~~테마 키~~ | — | ~~`placement`.theme_key~~ | **2026-08-08 폐기(ADR-0030 결정 1).** 축이 테마 1개에서 벽면별 마감으로 바뀌면서 저장할 값이 없어졌다 — 방 프리셋은 저장되지 않는다. `theme` 마스터 테이블을 만들지 않는다는 판단(**`theme` 테이블 표기 금지**)은 그대로 유효하고, "WAS는 이 값으로 판정하지 않고 형식만 검증한다"도 `placement_wall.material`·`variant`가 그대로 물려받았다 |
| 배치 책상 | PlacementDesk | `placement_desk` | Placement 1:1(`UNIQUE(placement_id)`). D18 책상 설정 블록. 유니크는 다중 책상 확장 시 DROP만 하면 되는 자리다 |
| 배치 아이템 | PlacedItem | `placed_item` | Placement 1:N, Product N:1. 좌표·회전·표면 유형·관절 값(`joint_values`)·발광 인스턴스 3종(`emitter_color`·`emitter_brightness_scale`·`emitter_color_temperature_k`). **인스턴스 1개 = 행 1개**(수량 컬럼 없음) |
| 배치 아이템 관절 값 | — | `placed_item`.joint_values | 리그 매니페스트 관절 키 → 현재 값(JSONB, 종류별 단위 — revolute=도, prismatic=mm). driver 관절만 저장, 종속 관절은 로드 시 재계산. 별도 엔티티가 아니다 — `PlacedItemJoint` 표기 금지(2026-07-23 테이블 폐기). `joint_angles`에서 개명(2026-07-25, ADR-0002 결정 3 — 직선 관절 값이 mm라 `_angles`가 거짓 이름이 된다) |
| 댓글 | Comment | `comment` | Placement 소속. 작성자 탈퇴 시 `user_id` NULL |
| 배치 좋아요 | PlacementLike | `placement_like` | 대상_행위 조립 (`placement` + `like`). `placement.like_count`의 집계 원천 |
| 제품 찜 | ProductLike | `product_like` | user_id·product_id 유니크 |
| 북마크 그룹 | PlacementBookmarkGroup | `placement_bookmark_group` | 사용자가 북마크를 묶는 단위 |
| 배치 북마크 | PlacementBookmark | `placement_bookmark` | 남의 공개 배치 다시 보기. 그룹 미지정(nullable) 허용 |
| 게시글 | Post | `post` | 커뮤니티 글. User N:1. `title`·`content` + soft delete. **`visibility`가 없다** — 쓰는 행위 자체가 게시다(D25). **배치 참조는 본문 `[[placement:ID]]` 토큰으로 하고 배치 FK 컬럼을 두지 않는다** — 배치를 **여러 개** 참조할 수 있고, 대상은 **본인이 만든 공개 배치**로 제한한다(D25 2026-07-30 개정. 종전 `placement_id` nullable FK는 폐기 — 하나만 참조할 수 있었다). **비공개 배치는 삽입 자체가 불가능하다** — 자동 공개도 공개 전환 유도도 없고, WAS가 삽입 시점에 `visibility = PUBLIC`과 작성자 본인 소유를 검증한다. 상품 토큰(`[[product:ID]]`)은 폐기됐다(D26) |
| 게시글 이미지 | PostImage | `post_image` | Post 1:N. 사용자 실물 사진 최대 20장 — `image_key`·`is_primary`(2026-07-30 개정: 상한 10→20, `display_order` 삭제 — 본문 안 이미지 위치가 곧 순서라 별도 순서 값은 거짓이 된다. 목록 카드 썸네일은 `is_primary` 1장, 부분 유니크로 강제 — `product_image`와 같은 형태). 시뮬레이터 캡처(`placement.thumbnail_key`)·AI 상상도(`generated_image`)와 다른 이미지다(D25) |
| 게시글 좋아요 | PostLike | `post_like` | 대상_행위 조립 (`post` + `like`). user_id·post_id 유니크, hard delete. **`placement_like`와 합치지 않는다** — 대상별 분리(D24·D25) |
| 게시글 댓글 | PostComment | `post_comment` | Post 소속. 작성자 탈퇴 시 `user_id` NULL. **`comment`(배치 댓글)에 `post_id`를 덧붙이는 다형성을 쓰지 않는다** — `CHECK` 미사용이라 "두 FK 중 하나만 채워짐"을 DB가 못 지킨다(D25) |
| 게시글 해시태그 | PostHashtag | `post_hashtag` | Post N:M Hashtag 정션. **`hashtag` 마스터는 제품과 공유한다** — `product_hashtag`와 같은 패턴이고 마스터를 새로 만들지 않는다(D25 2026-07-30 개정) |
| 배치 해시태그 | PlacementHashtag | `placement_hashtag` | Placement N:M Hashtag 정션. **`hashtag` 마스터를 제품·게시글과 공유한다** — 붙는 대상만 정션으로 가른다. 태그를 다는 시점은 **공개 전환**이고, 값은 컬렉션 검색의 `tags` 필드로 색인된다(ADR-0027 2026-08-07) |
| 데스크피드 글 | DeskFeed | `desk_feed` | 실사 사진 글 (D32·ADR-0033, 콘텐츠 모델은 D34·ADR-0037 개정). User N:1, **Placement N:1 nullable**(`placement_id` — 첨부 배치, ON DELETE SET NULL). `title`(NOT NULL)·`content`(**본문 — 마크다운, NOT NULL**. 인라인 이미지 `![alt](key)` 1~30장, 본문 안 위치가 순서 정본)·`like_count` + soft delete. **게시 상태 컬럼 없음** — 쓰는 행위가 곧 게시다. 배치 참조가 `post`와 달리 토큰이 아니라 **단일 FK**인 근거는 erd.md `desk_feed` 절 |
| 데스크피드 사진 | DeskFeedImage | `desk_feed_image` | DeskFeed 1:N. **순수 소속 레지스트리**(`id`·`desk_feed_id`·`image_key`) — `display_order`·복합 유니크는 폐기, `is_primary` 부활 없음(ADR-0037이 ADR-0036의 `display_order`를 대체). **이미지 순서·목록 대표의 정본은 `desk_feed.content` 본문 안 위치**이고, 이 표는 소속과 `imageCount`만 책임진다. FK 단독 인덱스 `idx_desk_feed_image_desk_feed_id`. 최소 1장·최대 **30장**(2026-08-11 DERO-613 개정, 이전 10장)은 WAS 강제, hard delete |
| 데스크피드 좋아요 | DeskFeedLike | `desk_feed_like` | 대상_행위 조립. user_id·desk_feed_id 유니크, hard delete. 대상별 분리(D24·D25) |
| 데스크피드 댓글 | DeskFeedComment | `desk_feed_comment` | DeskFeed 소속. 작성자 탈퇴 시 `user_id` NULL. `post_comment`와 동형, 플랫 |
| 데스크피드 해시태그 | DeskFeedHashtag | `desk_feed_hashtag` | DeskFeed N:M Hashtag 정션. `hashtag` 마스터 공유, `post_hashtag`와 동형. 태그 칩 필터(REQ-COM-16)의 근거 |
| 데스크피드 사용 제품 | DeskFeedProduct | `desk_feed_product` | DeskFeed N:M Product 정션 (ADR-0034, ≤10 WAS 강제). "이 책상에 쓰인 제품" — 상세 하단 카드 섹션에서 내부 링크(`/product/{id}`)로 이동. FK 양쪽 CASCADE, 역방향("이 제품이 쓰인 데스크피드") 인덱스 보유·화면은 후속. 소프트삭제 제품은 행 유지·화면 숨김 |
| 장바구니 아이템 | CartItem | `cart_item` | user_id·product_id·quantity. `cart` 테이블 없음 |
| AI 상상도 | GeneratedImage | `generated_image` | 일일 생성 한도 카운트 근거라 행을 지우지 않는다 |
| 추천 세팅 | Recommendation | `recommendation` | Should — 설계만 선반영. V1 스키마 범위 밖(미생성) |

⚠️ **프론트 `MonitorSpec`(TS)은 위 DB 엔티티 `Monitor`와 별개다.** `frontend/src/three/scene/monitor.ts`의 인터페이스로, D18 절차형 생성 입력값(`diagonalInch`·`aspectRatio`·`panelShape`·`standDepthMm`)을 담고 mm 치수는 거기서 파생한다. DB `monitor` 테이블도 2026-07-23부터 **같은 정본 입력**(`diagonal_inch`·`aspect_width`/`aspect_height`·`bezel_mm`·`stand_depth_mm`)을 저장하고 mm 외형은 저장하지 않는다 — 파생은 WAS가 한다. 문서에서 `MonitorSpec.*`를 보면 프론트 코드 얘기다.

- 테이블명 **단수형** 원칙. 예외 없음 — 예약어와 겹치면 복수형으로 도망가지 말고 인용부호로 쓴다 (`user` → `"user"`).
- 배치·템플릿·공개 배치는 **단일 `placement` + 상태**로 표현 (별도 테이블 금지): `publish_status` PRIVATE/PENDING/PUBLIC/FAILED (2026-07-31 `visibility`에서 개명·확장, ADR-0015), `is_template`(관리자 시딩), `source_placement_id`(리믹스 출처, nullable — 원본 삭제 시 "원본 없음" 표시).
- **책상 설정(`desk_config`)·직접 입력 규격(`custom_desk_spec`) — D18 개념어의 물리 위치는 `placement_desk` 테이블**이다 (2026-07-24 개정, 승인 박동규 — 종전 `placement`의 `desk_*` 컬럼 블록): `spec_source`(PRODUCT/CUSTOM)·`product_id`(제품 모드일 때만 채워지는 nullable FK)·`width_mm`·`depth_mm`·`height_mm`·`top_thickness_mm`·`edge_thickness_mm`(nullable, NULL = 상판과 동일)·`desk_texture_id`·`frame_type`.
  - **컬럼에 `desk_` 접두사를 붙이지 않는다** — 테이블명이 이미 책상이다. `desk` 규격 서브타입과 같은 이름을 쓰므로 제품 모드에서 규격을 복사하는 코드가 컬럼 매핑 없이 1:1이 된다. `desk_texture_id`만 남는 건 FK 명명 규칙(`<참조 테이블 단수>_id`) 때문.
  - **`desk_source` → `spec_source` 개명** — `placement.source_placement_id`(리믹스 출처)와 같은 단어가 다른 뜻으로 겹쳤다. 이 컬럼이 답하는 것은 "이 책상 **규격**이 어디서 왔나"다.
  - 배치당 책상은 여전히 정확히 1개이고 **`UNIQUE(placement_id)`가 그걸 강제한다**. 테이블로 뺀 이유는 데이터 모델링 필요가 아니라 확장 옵션이다 — 다중 책상으로 열 때 이 제약만 DROP하면 되고, 컬럼 블록이었다면 엔티티·DTO·쿼리를 전부 다시 써야 한다. 대가는 조인 1개.
  - 직접 입력 책상은 `product` 행이 없어 `placed_item`으로 가리킬 수 없다 — 책상을 `placed_item`에 합치지 않는 이유는 그대로다.
- **카테고리는 `category` 테이블 참조**로 확정 (2026-07-23 승인 — 기존 "MVP에선 `product.category` enum 컬럼" 서술을 개정). 제품은 `product.category_id` FK로 걸고, 카테고리끼리는 `category.parent_id` 자기참조로 계층을 만든다(루트는 `parent_id` NULL). 용도는 **탐색·분류 트리**라 값이 자유롭게 늘어난다("게이밍 모니터", "27인치" 같은 하위 갈래).
- **규격은 `product` + 카테고리별 규격 서브타입 5종**(슈퍼/서브 테이블)으로 나눈다 — 단일 `product_spec` 테이블이 **아니다**. 이름·가격·브랜드처럼 모든 제품이 공유하는 값은 `product`에, 실측 수치는 `desk`·`monitor`·`arm`·`light`·`prop`에 각각 `product_id`를 PK 겸 FK로 두고 1:1로 붙인다.
  - ⚠️ **`spec_type`과 `category_id`는 별개 컬럼이다.** `spec_type`은 "이 제품의 규격이 어느 서브타입 테이블에 있는가"를 가리키는 **고정 집합**(서브타입 테이블 개수만큼만 존재), `category_id`는 탐색 트리라 **자유 확장**. 둘을 하나로 묶으면 카테고리를 추가할 때마다 규격 매핑이 깨진다.
  - 모니터 제품이 `desk`에 행을 갖지 않도록 하는 정합성 강제는 **WAS 담당**(아래 CHECK 미사용 원칙).
- **머티리얼 스킨은 테이블이 아니라 `asset` 컬럼이다** (2026-07-23 승인 — 기존 `material_skin` 1:1 테이블 폐기). D19(소품 전량 GLB화) 이후 재질을 따로 입력해야 하는 대상이 **part-segmentation 관절 에셋 하나**로 줄었고, 그 존재 조건이 `asset.glb_export_mode` 하나로 완전히 결정된다 — 행이 있으면 `asset` 행도 반드시 있고 없으면 없는 관계라 별도 테이블은 과정규화였다. `texture_url`은 부활 없이 폐기(part-seg export는 텍스처를 받을 수 없다).
- **그 컬럼은 `finish` 1개다** (2026-07-23 승인 — 위 결정에서 옮겨온 재질 4컬럼 `material_class`·`base_color`·`roughness`·`metalness`를 다시 폐기): `asset.finish` `VARCHAR(20)` 허용, 값 4종 — `CLEAR_ACRYLIC`·`METALLIC`·`WHITE`·`BLACK`. `glb_export_mode = PART_SEGMENTATION`이면 필수, `TEXTURE`면 NULL(WAS 강제).
  - 근거: **PBR 수치의 정본은 코드다.** `frontend/src/three/render/materials.ts`의 `materialForSkin()`이 이미 재질 분류별 clearcoat·transmission·ior를 코드에서 강제하고 있어, DB가 거칠기·금속성을 또 받으면 정본이 둘이 되어 어긋난다. 등록자 입력도 숫자 3개 → 드롭다운 1개로 줄었다.
  - 한계: **에셋 하나에 `finish` 하나** — 로더가 전 메쉬에 같은 재질을 입힌다. 투톤이 필요해지면 `asset_part_material`(1:N) 신규 테이블로 간다(지금은 YAGNI).
  - `asset.glb_export_mode`는 **유지**된다(폐기 아님) — `finish`의 필수/NULL을 가르는 조건이 이 컬럼이다.
- **리그 매니페스트는 `arm`이 아니라 `asset`에 있다** (2026-07-23 승인 — `arm.rig_manifest` → `asset.rig_manifest`). 매니페스트 내용이 GLB 파트 이름에 묶여 있어(`mesh_1` → `clamp-base`) 제품 규격이 아니라 **에셋 파일에 종속**이다. 결정적으로 관절 제품군 4종 중 노트북·휴대폰 거치대 2종이 `spec_type = PROP`이라 `arm` 테이블에 자리가 없었다. D7·D16의 "관절 정의의 정본은 규격 DB지 메쉬가 아니다"는 그대로 유효하다 — `asset`도 규격 DB 안이다. `prop`에 각도 컬럼은 추가하지 않는다(YAGNI).
- **발광 저작값은 `asset`이 아니라 `product`에 붙는다** (2026-07-29 승인 박동규, DERO-222 — `asset.emitter_manifest` JSONB 폐기 → **`product_emitter` 테이블** 신설). ADR-0003 결정 7이 벽 RGB 스트립·선반 언더라이트를 절차 생성으로 정했고, 절차 생성 제품은 GLB가 없어 `asset` 행 자체가 없다(`asset_key` `NOT NULL`) — `asset`에 뒀다면 그 제품군은 빛을 낼 자리가 없다. `rig_manifest`가 `asset`에 있는 근거(GLB 파트 이름 종속)는 발광에 성립하지 않는다: mm 좌표와 lm은 파일이 아니라 **제품의 성질**이다.
  - 같은 개정에서 **`light`는 카탈로그 표기 마커로 격하**되고 광학 6컬럼이 nullable이 됐다. 렌더는 `product_emitter`만 읽는다. 치수 3컬럼(`width_mm`·`depth_mm`·`height_mm`)은 호환성 판정 입력이라 `NOT NULL`을 지키고, boolean 2종도 nullable boolean 금지 규칙 때문에 `NOT NULL`로 남는다.
  - 사용자가 고르는 인스턴스 값은 `placed_item`에 3컬럼이다 — `emitter_color`·`emitter_brightness_scale`·`emitter_color_temperature_k`. **`recolorable = false`면 "못 고른다", 값이 NULL이면 "안 골랐다"**로 뜻이 갈린다.
- **`arm`은 모니터암과 마이크암을 함께 담는다** (2026-07-23 승인): `product.spec_type` 값을 `MONITOR_ARM` → **`ARM`**으로 개명하고, `arm.arm_kind` `VARCHAR(20) NOT NULL`(`MONITOR`/`MIC`)로 제품군을 가른다.
  - 서브테이블(`monitor_arm`/`mic_arm`)을 만들지 않았다 — 22컬럼 중 19개가 공통이라 서브테이블이 컬럼 2개짜리 껍데기가 되고, 디스크리미네이터가 `spec_type`·`arm_kind` 2개로 늘어 WAS가 3중 정합을 봐야 한다.
  - `arm.monitor_capacity` → **`arm.device_capacity`**로 개명. 마이크암은 거치 대수가 1이 정답이지 0이 아니다 — 컬럼 이름이 "모니터"면 거짓을 저장하게 된다.
  - `arm.pivot_range_deg`는 `arm_kind = MONITOR` 전용(MIC이면 NULL).
  - `arm.is_vesa_plate_detachable`은 `BOOLEAN NOT NULL` 그대로다(nullable 완화안 철회) — nullable boolean 금지 규칙이 우선하고, VESA 지원 여부의 정본은 `product_vesa` 행 존재다.
- **암 마운트 방식은 boolean 3종이다** (2026-07-23 승인 — 기존 `arm.mount_type` enum 폐기. `arm_kind` 도입으로 마이크암에도 그대로 적용된다): `arm.is_clamp_mountable`·`arm.is_grommet_mountable`·`arm.is_wall_mountable` (`BOOLEAN NOT NULL`, 기본값 없음). 클램프와 그로밋을 **동시에** 지원하는 제품이 흔해 값 하나짜리 enum으로는 담기지 않는다. `arm_type = STAND`(스탠드형)면 셋 다 false. 판정 ①의 게이트는 `is_clamp_mountable` 하나이며 마운트별 결과를 OR로 합치지 않는다 — 상세: `docs/context/compatibility.md`.
  - 같은 결정에서 `arm.height_adjust_range_mm`도 삭제했다 — `height_max_mm − height_min_mm` 파생값이라 원본과 어긋날 수 있다. **파생 가능한 값은 컬럼으로 두지 않는다.**
  - 규격 각도는 축 이름으로 적는다: `arm.swivel_range_deg`(좌우 회전), `arm.pivot_range_deg`(피벗). 옛 `arm.swivel_deg`·`arm.rotation_deg`에서 개명했으며, 후자는 `placed_item.rotation_deg`(인스턴스 yaw)와 이름만 같고 뜻이 달라 충돌했다.
- **DB에 비즈니스 로직을 넣지 않는다 — `CHECK` 제약 미사용.** 값의 범위·조합처럼 규칙이 바뀔 수 있는 검증은 전부 WAS에서 한다. 단 `NOT NULL`·FK·`UNIQUE`는 유지하며, 특히 `UNIQUE`는 비즈니스 규칙이 아니라 **동시 요청 경쟁 조건 방어 수단**이라 남긴다(같은 좋아요 요청이 동시에 두 번 들어와도 행이 하나만 생기게).
- **찜 vs 북마크 구분** (2026-07-21): 대상이 다르면 행위 단어도 다르게 쓴다 — 제품에 붙는 건 **찜 = `like`**(`product_like`), 배치에 붙는 건 **북마크 = `bookmark`**(`placement_bookmark`). 배치 호감 표시는 기존대로 `placement_like` 유지.
- **`product` vs `*_item`** (2026-07-21): `product`는 **제품 마스터**(규격이 붙는 원본 1건). 그 제품이 어딘가에 **담긴 인스턴스**는 `<컨테이너>_item` — `placed_item`(배치에 놓임, 좌표·회전), `cart_item`(장바구니에 담김, 수량). 인스턴스가 아니라 제품 자체를 가리키면 `product`를 쓴다 (`product_like`).
- **사용자 업로드도 `product` 행이다 — `user_asset` 같은 병렬 테이블을 만들지 않는다** (2026-07-23 승인 박동규, D20). 사용자가 카테고리별 규격을 입력하므로 판정 대상이 되고, 판정 대상이면 그것은 제품이다. `spec_type`·규격 서브타입 5종·`asset`·`placed_item.product_id`가 그대로 재사용된다.
  - 가르는 컬럼은 `product.source`(`CATALOG`/`USER`) + `owner_user_id`(USER일 때만). 자작 제품에는 브랜드·가격·구매처가 없어 `brand_id`·`price_krw`·`product_url`·~~`image_key`~~를 **nullable로 완화**했고, `source`별 필수 여부는 **WAS가 강제**한다(CHECK 미사용 원칙). (`image_key`는 2026-07-30 `product_image`로 흡수되며 `product`에서 삭제됐다 — D25. 자작 제품은 이미지 행을 0개로 두면 된다.)
  - 업로드 대상은 `ARM`·`LIGHT`·`PROP` 3종(2026-08-02 개정 — 그전엔 모니터를 포함한 4종). **`DESK`·`MONITOR`는 제외** — 둘 다 절차 생성이라 `asset` 행이 없고(D18, 모니터는 2026-08-02 재개정), 사용자 책상은 REQ-ENV-05 직접 입력 규격이 덮는다.
  - 공개 조건은 `status = ACTIVE` **그리고** `asset.review_status = APPROVED` 둘 다다. 두 컬럼은 축이 다르다 — `status`는 노출 여부, `review_status`는 검수 단계.
- 장바구니는 **`cart` 테이블 없이 `cart_item`만** 둔다 (사용자당 장바구니 1개 → `cart` 행은 `user_id`뿐인 껍데기). 장바구니 여러 개가 필요해지면 그때 `cart` 신설.

## 2-2. 명명 규칙

| 단계 | 규칙 | 예 |
|---|---|---|
| 개념(ERD 개념 설계·문서) | 1부 한글 정본 용어 | 배치, 배치 아이템, 규격 |
| 논리(JPA 엔티티·API DTO) | 엔티티 PascalCase 단수, 필드 camelCase | `PlacedItem.topThicknessMm` |
| 물리(테이블·컬럼) | snake_case, **완전 단어, 약어 금지** | `placed_item.top_thickness_mm` |

- **약어 금지.** 허용 예외: `id`, `url`, 단위(`mm`, `g`, `krw`, `deg`, `k`=켈빈), 업계 표준 고유명(`vesa`, `gltf`).
- 조립 순서: `[소속/수식어]_[명사]_[단위]` — `top_thickness_mm`, `allowed_load_g`, `clamp_min_mm`.
- enum 값은 UPPER_SNAKE. API JSON 필드는 논리 camelCase 그대로.

### 접미사·접두 사전

| 종류 | 규칙 | 예 |
|---|---|---|
| PK | 항상 `id` (테이블명 반복 금지 — `product.product_id` 아님) | `product.id` |
| FK | `<참조 테이블 단수>_id` | `placement_id`, `product_id` |
| 자기참조 FK·같은 테이블 두 번 참조 | 테이블명을 되풀이하지 말고 **역할 이름**을 쓴다 — `parent_id`(계층 상위), `source_<테이블>_id`(출처) | `category.parent_id`, `placement.source_placement_id`, `follow.follower_id`·`follow.following_id` |
| boolean | `is_`·`has_` 접두. **부정형 금지** | `is_template`, `is_clamp_mountable` (✗ `is_not_public`) |
| 시각(시분초) | `_at` | `created_at`, `verified_at` |
| 감사 주체 | `_by` (감사 컬럼 2개 전용. 새로 만들지 말 것) | `created_by`, `updated_by` |
| 날짜만 | `_on` | `released_on` |
| 개수 | `_count` | `like_count`, `polygon_count` |
| 정렬 순서 | `_order` | `display_order` |
| 길이·치수 | `_mm` (mm 정수 고정) | `top_thickness_mm` |
| 무게·하중 | `_g` | `allowed_load_g` |
| 금액 | `_krw` | `price_krw` |
| 각도 | `_deg` | `rotation_deg`(인스턴스 yaw), `pivot_range_deg`·`swivel_range_deg`(규격 가동 범위) |
| 색온도 | `_k` (켈빈 정수) | `color_temperature_min_k` |
| 좌표 축 | 축마다 컬럼을 따로 둔다 — `_x`·`_y`·`_z` + 단위 | `position_x_mm`, `position_y_mm`, `position_z_mm` |
| 비율 | `_ratio` (0~1 실수) | `coverage_ratio` |
| 배율 | `_scale` (기준값에 곱하는 무단위 실수. 0~1로 갇힌 `_ratio`와 다르다) | `emitter_brightness_scale` |
| 외부 링크 | `_url` (우리 저장소 아님 — 남의 사이트를 가리키는 주소) | `brand_url`, `product_url` |
| 객체 저장소 키 | `_key` (우리 객체 저장소 object key — 조회 URL 조립용, **완성 URL 저장 금지**. 이미지 key는 안정 공개 URL로, 비공개 오브젝트(GLB·KTX2·약관)는 presigned URL로 조립한다 — ADR-0035) | `asset_key`, `image_key` |
| 서버 내부 경로 | `_path` | `glb_path` |
| 범위 한계 | `_min_<단위>`·`_max_<단위>` (접두 금지) | `clamp_min_mm`, `clamp_max_mm` |

- 범위 한계에서 **단위 접미는 값에 단위가 있을 때만** 붙인다 — `clamp_min_mm`(mm 값) vs `device_capacity`(개수). 조명 밝기는 2026-07-23에 루멘으로 확정돼 `luminous_flux_min_lm`이 됐다(옛 무단위 `brightness_min` 폐기).
- **soft delete 대상 판단 기준** (2026-07-23): `deleted_at`은 **그 자체로 존재하는 실체 테이블에만** 붙인다 — `user`·`product`·`brand`·`category`·`hashtag`·`vibe`·`vesa_spec`·`placement`·`comment`·`placement_bookmark_group`.
  - ⚠️ **토글·정션 테이블은 soft delete 하지 않는다** — `follow`·`placement_like`·`product_like`·`cart_item`·`placement_bookmark`·`product_vibe`·`product_hashtag`·`product_vesa`. 이유: `deleted_at` + `UNIQUE`는 서로 충돌한다. 언팔로우한 행을 남겨두면 재팔로우가 유니크 제약에 막히고, 피하려면 유니크에 `deleted_at`을 섞는 편법이 필요해진다. 껐다 켰다 하는 관계는 그냥 행을 지운다.
  - 규격 서브타입 5종·`asset`도 자체 `deleted_at`이 없다 — `product`와 운명을 함께하며 `product.deleted_at`이 정본이다. `placed_item`은 배치와 함께 삭제되고, `generated_image`는 일일 생성 한도 카운트의 근거라 행을 지우지 않는다.
- ⚠️ **soft delete 대상 테이블의 자연키 유니크는 부분 유니크 인덱스로 만든다** (2026-07-23 추가). 위의 `deleted_at` + `UNIQUE` 충돌은 토글·정션만의 문제가 아니라 **soft delete 하는 마스터 테이블에도 그대로 있다.** `user`는 soft delete인데 `email`에 유니크가 필요하다 — 일반 `UNIQUE`를 걸면 탈퇴한 사람이 같은 소셜 계정으로 재가입할 때 **살아있는 행이 하나도 없는데도** 제약에 막힌다. 그래서 살아있는 행만 묶는다.

  ```sql
  CREATE UNIQUE INDEX uq_user_email ON "user"(email) WHERE deleted_at IS NULL;
  ```

  - 해당 대상: `user.email` · `user(provider, provider_id)` · `brand.name` · `vibe.name` · `hashtag.name` · `vesa_spec(width_mm, height_mm)`.
  - hard delete 테이블(토글·정션)은 행을 물리로 지우므로 **일반 `UNIQUE` 그대로** 쓴다.
  - 이건 `CHECK` 제약이 아니라 **인덱스**라서 "DB에 비즈니스 로직을 넣지 않는다"(§2-1) 방침과 충돌하지 않는다 — 동시 요청 경쟁 조건을 막는다는 `UNIQUE`의 목적도 그대로다.

#### 단위 접미 → 물리 타입 고정 (2026-07-23 추가)

접미사가 같으면 물리 타입도 같다. 접미사만 정하고 타입을 안 정해 둔 탓에 같은 무게 접미사가 문서마다 `INT`와 `NUMERIC`으로 갈렸다 — 아래로 못박는다.

| 접미 | 물리 타입 | 비고 |
|---|---|---|
| `_mm` | `INT` | mm 정수 고정 |
| `_g` | `INT` | 그램 정수 고정. 표시는 kg로 환산한다 — `4500` → "4.5kg" |
| `_deg` | `INT` | 인스턴스 각도(`placed_item.rotation_deg`)만 `NUMERIC(6,2)` — 연속 실수각(REQ-SIM-18). revolute 관절 값은 `placed_item.joint_values` JSONB 안의 JSON number(도 단위) — prismatic 관절은 같은 컬럼에 mm 단위로 담긴다(2026-07-25 `joint_angles`에서 개명, ADR-0002) |
| `_inch` | `NUMERIC(4,1)` | 대각 화면 크기. 23.8·31.5인치처럼 소수 표기가 실제로 쓰인다 |
| `_krw` | `INT` | |
| `_k` | `INT` | 켈빈 |
| `_at` | `TIMESTAMPTZ` | UTC 저장 |
| `_url` · `_path` | `VARCHAR(2048)` | |
| `_key` | `VARCHAR(1024)` | S3 object key 최대 길이가 1024바이트다 — 그 이상은 저장소가 받지 않으므로 넉넉히 잡을 이유가 없다 |
| 열거값 컬럼 | `VARCHAR` + UPPER_SNAKE 값 | Postgres `ENUM` 타입은 쓰지 않는다 — 값 하나 추가에 마이그레이션이 필요해진다 |

### 동의어 충돌 — 한쪽만 쓴다

| 갈리는 쌍 | 정본 | 구분 기준 |
|---|---|---|
| name / title / nickname | **셋 다 쓰되 용도 분리** | 고유 명칭(제품명·브랜드명·카테고리명)은 `name`. 사용자가 직접 붙인 글머리(배치 제목·게시글 제목)는 `title`. **사람의 표시 이름은 `user.nickname`** — `user.name`은 금지다 (2026-07-28 개정, DERO-213). **한 엔티티에 둘 이상 두지 않는다.**<br>근거: `name`은 실명으로 읽히는 관례라 오해를 부른다. 실제로 담기는 값은 소셜 제공자가 준 표시명이지 실명이 아니다 |
| product / item | **용도 분리** | 카탈로그 제품 마스터 = `product`. 컨테이너에 담긴 인스턴스 = `<컨테이너>_item` (`placed_item`, `cart_item`). 단독 `item` 테이블·컬럼 금지 |
| placement / post | **용도 분리** | 3D 작업물 = `placement`(한글 **배치**, 커뮤니티에 올린 것은 **공개 배치**). 사용자가 쓴 글 = `post`(한글 **게시글**). 둘 다 "게시"한다고 말해서 섞이지만 **행이 따로 생기고 좋아요·댓글 대상도 따로다**(`placement_like`/`comment` vs `post_like`/`post_comment`). 한글 **게시물·포스트는 양쪽 모두에 금지** — 어느 쪽인지 가려지지 않는다 (2026-07-30 추가, D25) |
| status / state | `status` | `state` 금지 |
| type / kind | `type` 우선, `kind`는 좁은 예외 | 기본은 `type`. **한 테이블에 축이 다른 분류가 둘 필요할 때만** 두 번째를 `kind`로 쓴다 (2026-07-23 개정). 현재 유일 허용: `arm.arm_type`(형태 — 기둥형·관절형·스탠드형) vs `arm.arm_kind`(제품군 — 모니터암·마이크암). 제품 분류는 도메인 전용어 `category` |
| estimate / quote | `estimate` | `quote` 금지 |
| image / picture / photo | `image` | 나머지 금지 |
| user_id / author_id / owner_id | `user_id` | 소유·작성자 FK 모두 `user_id`. **`created_by`는 이 규칙의 예외가 아니라 다른 축이다** (2026-07-28 추가) — `user_id`는 도메인 관계(누구의 것인가, FK 있음, 조회 축이라 인덱스 있음)이고 `created_by`는 감사 기록(누가 이 행을 만들었나, FK·인덱스 없음)이다. 한 테이블에 둘 다 있을 수 있고 값이 다를 수 있다(관리자가 대신 등록한 행) |
| like / bookmark / wish / favorite | `like`·`bookmark`만 | 제품 찜 = `product_like`, 배치 다시 보기 = `placement_bookmark`. `wish`·`favorite`·`scrap` 금지 |
| 삭제 표시 | `deleted_at` (nullable) | `is_deleted` 금지 — 삭제 시각까지 남긴다 |
| version / revision | **용도 분리** | `version`은 **JPA 낙관적 락 카운터 전용**이고 `placement` 하나에만 있다(아래 감사 컬럼 절). 문서·약관의 **개정 회차는 `revision`** — `terms.revision`(같은 `code`의 몇 번째 개정인가, 1부터). 한 테이블에 둘을 함께 두지 않는다 (2026-07-28 추가, DERO-217)<br>근거: `version`을 개정 회차 뜻으로 쓰면 JPA가 그 컬럼을 잠금 세대로 오해할 자리에 도메인 값이 들어간다. 이름이 겹치는 순간 둘 중 하나는 반드시 거짓말이 된다 |

### 감사 컬럼

- `created_at` — 모든 테이블 필수.
- `updated_at` — **모든 테이블 필수** (2026-07-28 개정, 승인 박동규 DERO-210 — 종전 "행이 수정될 수 있는 테이블만"을 뒤집었다). 생성 후 변하지 않는 정션·토글·이력 테이블(`follow`, `placement_like`, `product_like`, `product_vibe`, `product_hashtag`, `product_vesa`, `generated_image`, `user_consent` 등)에서는 **영원히 NULL로 남지만 컬럼은 둔다** — "영원히 NULL인 컬럼이 읽는 사람을 속인다"에 대한 명시적 예외다. 근거: 테이블마다 감사 컬럼 구성이 갈리자 JPA `@MappedSuperclass` 상속이 3단으로 쌓였고, 새 엔티티마다 감사 종류를 골라야 해서 틀리면 컴파일은 통과하고 `ddl-auto: validate`가 **부팅에서** 죽었다. 정본: `docs/context/erd.md` 전역 규칙 "감사 컬럼".
- `deleted_at` — soft delete 대상 테이블만 추가 (대상 판단 기준은 위 접미사·접두 사전 참고). **이건 통일하지 않았다** — soft delete와 `UNIQUE`가 충돌하기 때문이다.
- `created_by` — `created_at`과 짝이라 **모든 테이블 필수** (2026-07-28 추가). `updated_by`도 `updated_at`과 짝이라 마찬가지로 전 테이블 공통이다(위 개정 반영).
- 시각은 전부 UTC 저장.
- ⚠️ **`created_by`·`updated_by`에 FK를 걸지 않는다** (2026-07-28 추가). `user.id` 값을 담지만 제약은 없다 — 주체가 지워져도 감사 기록은 남아야 하고, 시드·마이그레이션처럼 사람이 아닌 삽입이 실재하는 `user` 행을 요구하면 안 되기 때문이다. FK가 아니므로 "모든 FK 컬럼에 인덱스" 규칙의 대상도 아니다(사후 추적용이지 조회 축이 아니다). 상세 근거는 `docs/context/erd.md` 전역 규칙 "감사 컬럼" 절.
- ⚠️ **`version`은 감사 컬럼이 아니다** (2026-07-27 추가, DERO-189). 낙관적 락 카운터(JPA `@Version`)이고 **`placement` 하나에만 있다** — 접미사 없는 맨이름이 정본 표기다(`_count`·`_no` 붙이지 말 것. 개수가 아니라 잠금 세대다). 애그리거트 루트에만 두는 근거는 `docs/context/erd.md`의 `placement` 절과 ADR-0009 결정 4. 다른 테이블에 같은 이름을 복사하지 말 것. **문서·약관의 개정 회차는 `version`이 아니라 `revision`이다** — 위 동의어 충돌 표 `version / revision` 행 참고.

### 제약·인덱스 이름

`pk_<테이블>` / `fk_<테이블>_<참조테이블>` / `uq_<테이블>_<컬럼들>` / `idx_<테이블>_<컬럼들>` — 컬럼 여럿이면 `_`로 이어 붙임 (`idx_placed_item_placement_id_product_id`).

- **FK 이름 예외 — 참조 테이블명으로 구분이 안 되면 `fk_<테이블>_<컬럼명>`** (2026-07-23 추가). 한 테이블이 같은 테이블을 두 번 참조하거나 자기 자신을 참조하면 `fk_<테이블>_<참조테이블>`은 **이름이 충돌한다**. 이때만 참조 테이블명 자리에 컬럼명을 쓴다 — `fk_follow_follower_id`, `fk_follow_following_id`, `fk_category_parent_id`, `fk_placement_source_placement_id`. 참조 테이블명만으로 구분되는 평범한 FK는 기존 규칙 그대로 (`fk_placed_item_placement`).

## 2-3. 표준 단어 사전 (조립용 단일어)

| 한글 | 영문 | 한글 | 영문 |
|---|---|---|---|
| 배치 | placement | 두께 | thickness |
| 제품 | product | 폭·가로 | width |
| 규격 | spec | 깊이 | depth |
| 에셋 | asset | 높이 | height |
| 사용자 | user | 무게 | weight |
| 템플릿 | template | 허용 하중 | allowed_load |
| 찜·좋아요 | like | 물림(클램프) | clamp |
| 북마크 | bookmark | 면적 | area |
| 댓글 | comment | 거리 | distance |
| 예산 | budget | 가격 | price |
| 견적 | estimate | 좌표 | position |
| 판정 | judgment | 회전(인스턴스 yaw 전용) | rotation |
| 상상도 | generated_image | 출처·원본 | source |
| 측정 | measurement | 게시 상태 | publish_status |
| 벽 | wall | 상태 | status |
| 타공판 | pegboard | 종류 | type |
| 상판 | top | 시간대 | time_of_day |
| 카테고리 | category | 검수 | review |
| 폴리곤 | polygon | 텍스처 | texture |
| 설정 | config | 형상 | shape |
| 직접 입력 | custom | 패널 | panel |
| 프레임 | frame | 재질 | material |
| 곡률 | curvature | 반경 | radius |
| 화면비(1부 개념어) | aspect_ratio | 절차형 | procedural |
| 이름·명칭 | name | 제목 | title |
| 썸네일 | thumbnail | 순서 | order |
| 경로 | path | 이미지 | image |
| 장바구니 | cart | 수량 | quantity |
| 담긴 제품 인스턴스 | item | 제품 분위기 | vibe |
| 브랜드 | brand | 계층 상위 | parent |
| 로고 | logo | 설명 | description |
| 표시 | display | 그룹 | group |
| 이메일 | email | 제공자(소셜 로그인) | provider |
| 역할 | role | 팔로우 | follow |
| 해시태그 | hashtag | 내용(본문) | content |
| 규격 타입 | spec_type | 검수 상태 | review_status |
| 검증 | verify | 지원 | support |
| 책상 | desk | 모니터 | monitor |
| 암(모니터암·마이크암) | arm | 조명 | light |
| 소품 | prop | 표면 | surface |
| VESA 홀 규격 | vesa | 플레이트 | plate |
| 가장자리 | edge | 둥근 처리 | rounded |
| 화면비 성분(물리 컬럼) | aspect | 전체·합계 | total |
| 스탠드 | stand | 분리 가능 | detachable |
| 피벗 | pivot | 좌우 회전(스위블) | swivel |
| 상하 각도(틸트) | tilt | 조절 | adjust |
| 범위 | range | 마운트 | mount |
| 부착 가능(형용사) | mountable | — | — |
| 용량 | capacity | 세그먼트 | segment |
| 기둥 | pole | 도달 거리 | reach |
| 케이블 | cable | 관리·정리 | management |
| 관절 리그 | rig | 매니페스트 | manifest |
| 색온도 | color_temperature | 광속(밝기) | luminous_flux |
| 배광 분포 | distribution | 적층 가능 | stackable |
| 부착 표면 | mount_surface | 예산 | budget |
| 대각 인치 | diagonal_inch | 베젤 | bezel |
| 포트 | ports | 벽 면 | wall_side |
| 관절 | joint | 각도 | angle |
| 마감(재질 프리셋) | finish | 종류(제품군) | kind |
| 기기 | device | 내보내기 | export |
| 모드 | mode | 좌 | left |
| 전면 | front | 우 | right |
| 켜짐 | on | 소유자 | owner |
| 비고·사유(짧은 메모) | note | 낙관적 락 버전 | version |
| 닉네임(사용자 표시 이름) | nickname | 프로필 | profile |
| 약관 | terms | 동의 | consent |
| 개정 회차 | revision | 시행 | effective |
| 식별 코드 | code | 필수 | required |
| 동의함(boolean) | agreed | 발광체 | emitter |
| 발광점(제품 로컬 좌표) | point | 저작 기준 광속 | lumens |
| 배율 | scale | 밝기(조절 대상) | brightness |
| 리컬러 가능(형용사) | recolorable | 기본값·초기값 | default |
| 게시글 | post | — | — |
| 창문 | window | 변형(계열 안 선택지) | variant |
| 바닥 | floor | 중심(좌표) | center |

복합어 예외: `generated_image`, `allowed_load`, `time_of_day`는 단일어가 아니라 **이미 조립된 완성형**. 관용 표기라 그대로 쓰고, 여기서 더 쪼개 조립하지 않는다. (2026-07-23 개정: `aspect_ratio`는 이 목록에서 제외 — 아래 항목 참고.)

복합어 추가 (2026-07-23): `color_temperature`, `review_status`, `spec_type`, `cable_management`, `spec_source`도 이미 조립된 완성형으로 취급한다. 더 쪼개지 않되 **단위·범위 접미는 붙일 수 있다** — `color_temperature_min_k`, `color_temperature_max_k`.

⚠️ **`aspect_ratio`는 물리 컬럼으로 만들지 않는다** (2026-07-23 개정): `aspect_ratio`(화면비)는 **1부 개념어로만** 쓴다. 물리 저장은 `aspect_width` / `aspect_height` **정수 2개**로 나누고, 조립용 단어는 `aspect`를 쓴다.
근거: 마케팅 라벨과 실제 패널 비율이 다르다 — 34인치 울트라와이드는 21:9가 아니라 **43:18**(3440×1440과 일치). `'21:9'` 같은 문자열 라벨로 저장하면 화면 mm 치수가 어긋난다 (D18, §1-6 "화면비" 항목과 동일 근거).

⚠️ **`rotation`은 인스턴스 yaw 전용이다** (2026-07-23 개정): 배치 아이템이 얼마나 돌아가 있는가(`placed_item.rotation_deg`)에만 쓴다. **제품 규격의 가동 각도에는 `rotation`을 쓰지 않고 축 이름으로 적는다** — 좌우 회전은 `swivel_range_deg`, 피벗은 `pivot_range_deg`.
근거: 옛 `arm.rotation_deg`는 "이 암이 몇 도까지 꺾이나"(규격)였고 `placed_item.rotation_deg`는 "이 인스턴스가 몇 도 돌아가 있나"(상태)였다 — 이름이 같아 조인 쿼리·DTO에서 뜻이 뒤집혔다. 마운트 방식도 같은 이유로 `mountable` boolean 3종을 쓴다(§2-1).

⚠️ **발광 4단어는 기존 단어와 축이 다르다** (2026-07-29 등재, DERO-222). 비슷해 보이는 짝이 셋 있어 라이선스를 명시한다 — "같은 개념에 두 영단어 금지"에 안 걸리는 이유가 각각 다르다:
- **`lumens` vs `luminous_flux`** — 1부가 이미 **저작 추정 광속**과 **정격 광속**을 다른 용어로 가르고 있다. `lumens`는 저작자가 눈으로 맞춘 렌더 기준값(`product_emitter.lumens`), `luminous_flux`는 제조사 스펙시트의 정격 표기(`light.luminous_flux_min_lm`)다. **개념이 둘이라 단어도 둘이다.**
- **`default_color` vs `base_color`** — `base_color`는 텍스처가 없을 때의 **기저색**(`desk_texture.base_color`, 폴백), `default_color`는 사용자가 아직 안 고른 상태의 **초기값**(`product_emitter.default_color`)이다. 앞은 대체재, 뒤는 출발점이다.
- **`point` vs `position`** — `position`은 **배치 좌표계**에서 아이템이 어디 놓였나(`placed_item.position_x_mm`, 사용자가 만든다), `point`는 **제품 로컬 좌표계**에서 빛이 어디서 나오나(`product_emitter.point_x_mm`, 저작자가 굽는다)다. **셋 중 가장 약한 짝이라 `point`를 이 세 컬럼 밖으로 넓히지 않는다** — 다른 좌표는 전부 `position`이다.
- `brightness`는 새 단어가 아니다 — `light.is_brightness_adjustable`이 이미 쓰고 있었고 이번에 표에 등재만 했다. **광속 값 자체에는 계속 `luminous_flux`를 쓴다**; `brightness`는 사용자가 만지는 조절 축을 가리킬 때만이다.

⚠️ ~~`material_class`~~ · ~~`base_color`~~ · ~~`roughness`~~ · ~~`metalness`~~ **표에서 삭제** (2026-07-23 폐기): 네 단어는 `asset`의 재질 4컬럼 조립용으로만 등재돼 있었고, 그 컬럼들이 `asset.finish` 1컬럼으로 접히면서 쓸 곳이 사라졌다. PBR 수치의 정본은 코드(`materialForSkin()`)다 — **DB 컬럼명으로 되살리지 말 것**. 재질 프리셋을 가리킬 땐 `finish`, 재질 일반을 가리킬 땐 기존 `material`을 쓴다. 프론트 런타임 타입 `MaterialSkin`과 그 `class` 필드는 코드에 그대로 남는다(테이블 미러가 아니다).

새 단어 필요 시: 이 표에 추가 → 그 단어로만 조립. 같은 개념에 두 영단어 금지 (예: 견적에 quote 금지 — estimate만).

## 2-4. 열거값 사전

| 개념 | 물리 컬럼 | 값 (한글 = 코드) |
|---|---|---|
| 판정 결과 3단계 | `judgment_result` | 적합 = `FIT` / 조건부 = `CONDITIONAL` / 불가 = `INCOMPATIBLE` |
| 판정 종류 | `judgment_type` | 암↔책상 = `ARM_DESK` / 모니터↔암 = `MONITOR_ARM` / 소품↔책상 = `ITEM_DESK` — ⚠️ 여기의 `MONITOR_ARM`은 **"모니터와 암 사이의 판정"**이라는 뜻이고 아래 `spec_type`의 옛 값(제품군 = 모니터암)과 무관하다. `spec_type`이 `ARM`으로 개명된 뒤에도 이 값은 그대로다 |
| 게시 상태 | `placement.publish_status` | 비공개 = `PRIVATE` / 상상도 생성 대기 = `PENDING` / 공개 = `PUBLIC` / 생성 실패 = `FAILED` — **컬렉션 노출은 `PUBLIC` 하나뿐**이다. `PUBLIC`·`FAILED`는 서버만 정한다(ADR-0015). 2026-07-31 `visibility`(PUBLIC/PRIVATE)에서 개명·확장 — **`visibility` 표기 금지** |
| 역할 | `role` | 사용자 = `USER` / 관리자 = `ADMIN` |
| 벽면 | `placed_item.wall_side` · `placement_wall.wall_side` | 좌 = `LEFT` / 전면 = `FRONT` / 우 = `RIGHT` |
| 카메라 프리셋 | (클라이언트) | 1인칭 = `FIRST_PERSON` / 전면 = `FRONT` / 후면 = `BACK` / 측면 = `SIDE` / 탑뷰 = `TOP` |
| 시간대 | `placement.time_of_day` · `generated_image.time_of_day` | 주간 = `DAY` / 야간 = `NIGHT` — 상상도와 배치가 **같은 값 공간**을 쓴다(ADR-0030 결정 4) |
| 벽면·바닥 재질 계열 | `placement_wall.material` · `placement.floor_material` | 벽: 페인트 = `PAINT` / 우드 슬랫 = `WOOD_SLAT` / 벽돌 = `BRICK` / 대리석 = `MARBLE` / 콘크리트 = `CONCRETE`. 바닥: 우드 = `WOOD` / 타일 = `TILE` / 카펫 = `CARPET` — **WAS는 이 값으로 판정하지 않고 형식만 검증한다**(계열을 늘릴 때 백엔드 배포가 붙지 않게, ADR-0021 결정 3의 판단 계승). 변형(`variant`)은 계열이 정의하므로 여기 열거하지 않는다 |
| 규격 타입 | `product.spec_type` | 책상 = `DESK` / 모니터 = `MONITOR` / **암(모니터암·마이크암) = `ARM`** / 조명 = `LIGHT` / 소품 = `PROP` — 규격 서브타입 테이블 5종과 1:1 대응. **고정 집합**이라 서브타입 테이블이 늘 때만 값이 는다. `MONITOR_ARM`은 2026-07-23 `ARM`으로 개명(마이크암 편입) — 이 컬럼에 `MONITOR_ARM` 표기 금지 |
| 제품 카테고리 | `category` 테이블 (`product.category_id`) | **열거값이 아니라 테이블 시드 데이터** (2026-07-23 개정 — 기존 enum 초안 폐기). 초기 시드: 책상 / 모니터 / 모니터암 / 조명 / 소품. 탐색 트리라 자유 확장되며, 규격 서브타입 매핑은 `spec_type`이 따로 담당한다. **프론트 노출 분류는 2026-08-05부터 정적 10대분류로 고정**(전체 / 모니터·모니터암 / 키보드·마우스 / 음향 / 식물 / 정리·거치 / 데코 / 의자 / 조명 / 기타 — 전체 첫번째·기타 마지막, 소분류 포함 정본은 `frontend/src/constants/productCategoryGroup.ts`): 프론트는 `GET /categories`를 호출하지 않고, 백엔드 카테고리 개편·id 매핑은 별도 작업 |
| 소셜 로그인 제공자 | `user.provider` | 카카오 = `KAKAO` / 구글 = `GOOGLE` |
| 사용자 상태 | `user.status` | 활성 = `ACTIVE` / 비활성 = `INACTIVE` |
| 동의 항목 | `terms.code` | **열거값이 아니라 테이블 시드 데이터** (2026-07-28 신설, DERO-217 — 값이 데이터라 Java enum을 만들지 않는다). 현재 4종: 서비스 이용약관 = `TERMS_OF_SERVICE` / **개인정보 수집·이용 동의** = `PRIVACY_POLICY` / 마케팅 수신 = `MARKETING` / 만 14세 이상 = `AGE_OVER_14`. 항목 추가는 `terms` 행 INSERT로 끝난다(마이그레이션·배포 불필요). 필수/선택은 코드 값이 아니라 `terms.is_required`가 정한다. ⚠️ **`PRIVACY_POLICY`를 "개인정보 처리방침"으로 표기하지 않는다** (2026-08-03 정정, 승인 박동규) — 발행된 본문이 동의를 받는 수집·이용 동의서이고 `is_required = true` 동의 항목이다. 처리방침(상시 공개 고지문, 동의 대상 아님)은 아직 없는 문서이며 필요해지면 별도 `code` 행으로 추가한다. 화면 표기는 "개인정보 수집·이용 동의"로 통일한다(footer·온보딩·`/terms/privacy-policy`) |
| 제품 상태 | `product.status` | 노출 = `ACTIVE` / 숨김 = `HIDDEN` |
| 제품 출처 | `product.source` | 카탈로그 = `CATALOG` / 자작 = `USER` (2026-07-23 추가, D20. `USER`면 `owner_user_id` 필수이고 브랜드·가격·구매처는 NULL) |
| 에셋 검수 상태 | `asset.review_status` | 대기 = `PENDING` / 승인 = `APPROVED` / 반려 = `REJECTED` (2026-07-23 확정, D20 — 그전엔 값 미확정이었다). `NOT NULL DEFAULT 'PENDING'`. 대기·반려는 업로더 본인에게만 보이고 본인 배치에는 쓸 수 있다. 반려 사유는 `asset.review_note` |
| GLB export 모드 | `asset.glb_export_mode` | 파트 분할 = `PART_SEGMENTATION` / 텍스처 융합 = `TEXTURE` |
| 마감(재질 프리셋) | `asset.finish` | 투명 아크릴 = `CLEAR_ACRYLIC` / 메탈릭 = `METALLIC` / 화이트 = `WHITE` / 블랙 = `BLACK` — `glb_export_mode = PART_SEGMENTATION`이면 필수, `TEXTURE`면 NULL(WAS 강제). 에셋 1행에 값 1개 |
| ~~재질 분류~~ | — | 열거값이 아니다 — `asset.material_class`(9값 `WOOD`·`METAL`·…·`FOLIAGE`)는 등재 당일 철회했다(2026-07-23, `material_class` 표기 금지). 재질은 위 `asset.finish` 4값으로 고르고 PBR 수치는 코드가 갖는다. 프론트 런타임 타입 `MaterialSkin.class`는 코드에 남지만 DB 미러가 아니다 |
| 패널 형상 | `monitor.panel_shape` | 평면 = `FLAT` / 곡면 = `CURVED` (D18. `is_curved` 불리언 폐기) |
| 프레임 유형 | `desk.frame_type`, `placement_desk.frame_type` | T프레임 = `T_FRAME` / 다리 4개 = `FOUR_LEG` / 상판만 = `TOP_ONLY` |
| ~~책상 재질~~ | — | 열거값이 아니다 — `desk_texture` 테이블 행이다(2026-07-23 전환). `desk.desk_texture_id`·`placement_desk.desk_texture_id`가 참조한다. 시딩 4종은 월넛·오크·블랙·화이트(D18) |
| ~~마운트 유형~~ | — | 열거값이 아니다 — `arm.is_clamp_mountable`·`arm.is_grommet_mountable`·`arm.is_wall_mountable` **BOOLEAN 3종**으로 대체(2026-07-23 폐기, `arm.mount_type` 표기 금지). 클램프·그로밋을 동시에 지원하는 제품이 흔해 값 하나로 못 담는다. `arm_type = STAND`면 셋 다 false |
| 암 제품군 | `arm.arm_kind` | 모니터암 = `MONITOR` / 마이크암 = `MIC` (2026-07-23 추가 — `spec_type = ARM` 안에서 제품군을 가른다. `pivot_range_deg`는 `MONITOR` 전용) |
| 암 유형(형태) | `arm.arm_type` | 기둥형 = `POLE` / 관절형 = `ARTICULATED` / 스탠드형 = `STAND` — ⚠️ 위 `arm_kind`(제품군)와 **축이 다른** 분류다. 한 테이블의 두 번째 분류라서만 `kind`를 허용한다(§2-2 동의어 충돌) |
| 배광 분포 | `product_emitter.distribution` · `light.distribution` | 집중형 = `SPOT` / 확산형 = `FLOOD` / 주변광 = `AMBIENT` (2026-07-23 구현 3종 채택, 옛 `DIFFUSE` 폐기). 두 컬럼이 **같은 열거를 재사용한다** — 새 열거를 만들지 않는다. 렌더가 읽는 쪽은 `product_emitter`이고 거기서는 `shape = SPOT`일 때만 필수다(`POINT`면 NULL). `light` 쪽은 카탈로그 표기라 nullable (2026-07-29) |
| 발광 shape | `product_emitter.shape` | 점광 = `POINT` / 스팟 = `SPOT` (2026-07-29 신설, DERO-222). 위 **배광 분포**와 축이 다르다 — shape는 광원 종류(`PointLight`/`SpotLight`), distribution은 원뿔을 얼마나 조이나. ⚠️ **`AREA`는 DERO-227 판정 대기 — 채택되면 이 줄에 추가한다.** 지금 등재하면 "표에는 있는데 쓰면 안 되는 값"이 되고, 224가 정한 "227 판정 전까지 프로덕션 씬 사용 금지"와 어긋난다. `PROJECTOR`는 three 업스트림 API 미확정이라 적지 않는다 |
| 배치 표면 | `placed_item.surface_type` | 상판 = `TOP` / 타공판 = `PEGBOARD` / 벽 = `WALL` / 바닥 = `FLOOR` |
| 부착 표면 | `prop.mount_surface` | 위와 같은 집합. 이쪽은 제품이 **놓일 수 있는** 표면(제약), `surface_type`은 실제로 놓인 표면(결과) |
| 책상 규격 출처 | `placement_desk.spec_source` | 제품 = `PRODUCT` / 직접 입력 = `CUSTOM` — D18 배타적 2모드 |

---

# 확정 근거 (2026-07-16, 박동규 승인)

1. **개체 3계층**: 제품/규격/에셋 분리 + 배치 아이템. 메쉬-규격 분리 원칙(D7)의 데이터 모델 반영.
2. **단일 배치 + 상태**: 템플릿·공개 배치는 별도 엔티티가 아니라 배치의 상태.
3. **주체 정본**: 사용자·관리자. 단일 `user` + role (2026-07-21 `users` → `user` 단수 통일).
4. **물리 명명**: 완전 단어 snake_case, 약어 금지(표준 예외만).
5. **2부 구조**: 1부 회의·대화용 / 2부 ERD·코드용 분리 (2026-07-16 추가).
6. **세부 명명 규칙 확정** (2026-07-21 승인): §2-2에 접미사·접두 사전, 동의어 충돌 표, 감사 컬럼, 제약·인덱스 이름 규칙 추가. `name`(고유 명칭) / `title`(사용자가 붙인 글머리) 구분 채택 — 한 엔티티 병존 금지.
7. **스키마 명명·구조 확정** (2026-07-23 승인, DERO-114): erdcloud ERD를 PostgreSQL 기준으로 정리하며 9건 확정.
   1. **PK는 `id` 유지** — 테이블명을 되풀이하지 않는다(`product.product_id` 아님).
   2. **좌표·회전은 `placed_item` 컬럼** — `position_x_mm`·`position_y_mm`·`position_z_mm`·`rotation_deg`. 배치 전체를 JSON 한 덩어리로 묶던 원본 ERD의 `placement.pacement_positions`(오타 표기 그대로)는 폐기.
   3. ~~**D18 직접 입력 책상은 `placement` 컬럼**~~ — `desk_*` 블록(출처·너비·깊이·높이·상판 두께·엣지 마감 두께·재질·프레임). 배치당 책상이 정확히 1개라 별도 테이블은 조인만 늘린다는 근거였다. **아래 9로 개정** — 1:1은 유지하되 `placement_desk` 테이블로 뺐다.
   4. **카테고리는 테이블 참조로 개정** — `product.category` enum 컬럼 안을 폐기하고 `category` 테이블 + `parent_id` 자기참조 계층 채택 (§2-1).
   5. **규격은 슈퍼-서브 테이블** — 단일 `product_spec`이 아니라 `product` + 서브타입 5종(`desk`·`monitor`·`arm`·`light`·`prop`). `spec_type`(고정)과 `category_id`(자유 확장)를 분리한다.
   6. **`CHECK` 제약 미사용** — DB에 비즈니스 로직을 넣지 않는다. 검증은 WAS, DB는 `NOT NULL`·FK·`UNIQUE`만 유지(`UNIQUE`는 동시 요청 경쟁 조건 방어).
   7. **서브타입 테이블에 `_spec` 접미를 붙이지 않는다** — 초판의 `monitor_spec` 등을 원본 초안 이름(`monitor`)으로 되돌림. 5개 전부에 붙어 구분 정보가 0이고, `vesa_spec`(VESA 홀 간격 표준 룩업표, PK가 `id`)과 성격이 달라 같은 종류로 오해된다. `light`는 프론트 Three.js `Light`와 이름이 겹치지만 import alias로 처리한다 — 충돌은 프론트 한 파일에서만 생기고 DB 명명 일관성이 더 비싸다.
   8. **원본 ERD 대비 차이는 전부 기록한다** — `docs/context/erd.md` 말미 "원본 ERD 대비 변경 이력" 절이 삭제·개명·추가·정정을 사유와 함께 담는다. 정본에서 빠진 것이 결정인지 사고인지 구분되지 않으면 정본 구실을 못 한다.
   9. **승인된 결정에 필요한 컬럼 9건 반영** (2026-07-23, DERO-114 감사) — 모니터 규격의 정본을 mm에서 인치·화면비·베젤로 뒤집고(REQ-SIM-15), 벽 토글·관절 포즈·VESA 결합·머티리얼 스킨·GLB 텍스처 여부·조명 도달 거리를 스키마에 넣는다. 저장 게이트를 통과한 배치가 재로드 후 위반으로 뒤집히던 것이 근거다.
8. **테이블 1건 폐기·암 규격 정정·관절 제품군 확장** (2026-07-23 승인, DERO-116).
   1. **`material_skin` 테이블 폐기 → `asset` 흡수** — 재질 4컬럼(`material_class`·`base_color`·`roughness`·`metalness`)을 `asset`에 nullable로 옮기고 `texture_url`은 부활 없이 폐기. D19 이후 스킨이 필요한 대상이 part-segmentation 관절 에셋 하나로 줄었고 그 존재 조건이 `asset.glb_export_mode`로 완전히 결정돼, 1:1 테이블은 과정규화였다. 프론트 `MaterialSkin`(TS)은 런타임 타입으로 남는다 — 위 7.9의 "머티리얼 스킨" 항목은 이 결정으로 물리 위치가 `asset`으로 바뀌었다.
   2. **`arm.mount_type` enum 폐기 → 마운트 boolean 3종** — `is_clamp_mountable`·`is_grommet_mountable`·`is_wall_mountable`. 클램프·그로밋 동시 지원 제품을 enum 하나로 담을 수 없고, `docs/context/compatibility.md`가 이미 이 전제로 확정돼 있었다. 함께 `height_adjust_range_mm`(파생값) 삭제, `swivel_deg` → `swivel_range_deg`·`rotation_deg`(규격) → `pivot_range_deg` 개명.
   3. **재질 4컬럼 재폐기 → `asset.finish` 1컬럼** — 위 8.1로 `asset`에 옮겨온 `material_class`·`base_color`·`roughness`·`metalness`를 같은 날 다시 접었다. `finish` `VARCHAR(20)` 허용, 값 4종(`CLEAR_ACRYLIC`·`METALLIC`·`WHITE`·`BLACK`). 근거는 **PBR 수치의 정본이 코드**라는 것 — `frontend/src/three/render/materials.ts`의 `materialForSkin()`이 이미 재질별 clearcoat·transmission·ior를 강제하므로 DB가 수치를 또 받으면 정본이 둘로 갈린다. 등록자 입력도 숫자 3개에서 드롭다운 1개로 준다. 한계는 에셋 1행 = 마감 1개(투톤이 필요해지면 `asset_part_material` 1:N 신설). `glb_export_mode`는 유지 — `finish`의 필수/NULL을 가르는 조건이다. 함께 `material_class` 9값 등재(위 7.9 감사분)를 철회했다.
   4. **`rig_manifest`가 `arm` → `asset`으로 이동** — 매니페스트가 GLB 파트 이름에 묶여 있어(`mesh_1` → `clamp-base`) 제품 규격이 아니라 에셋 파일에 종속이고, 관절 제품군 4종 중 노트북·휴대폰 거치대 2종이 `spec_type = PROP`이라 `arm` 테이블에 애초에 자리가 없었다. D7·D16의 "관절 정의의 정본은 규격 DB지 메쉬가 아니다"는 그대로 유효하다 — `asset`도 규격 DB 안이다. `prop`에 각도 컬럼은 추가하지 않는다(YAGNI). 관절 부위·가동 범위의 런타임 정본은 `asset.rig_manifest`이고 `arm`의 각도 컬럼은 카탈로그 표기·필터용이다.
   5. **`spec_type` 값 `MONITOR_ARM` → `ARM`, `arm.arm_kind` 도입으로 마이크암 편입** — `arm_kind` `VARCHAR(20) NOT NULL`(`MONITOR`/`MIC`). 서브테이블(`monitor_arm`/`mic_arm`)은 만들지 않았다: 22컬럼 중 19개가 공통이라 서브테이블이 컬럼 2개짜리 껍데기가 되고 디스크리미네이터가 2개로 늘어 WAS가 3중 정합을 봐야 한다. 함께 `arm.monitor_capacity` → **`arm.device_capacity`** 개명 — 마이크암은 거치 대수가 1이 정답이지 0이 아니라, 이름이 "모니터"면 거짓을 저장하게 된다. `arm.pivot_range_deg`는 `arm_kind = MONITOR` 전용(MIC이면 NULL). `arm.is_vesa_plate_detachable`은 `BOOLEAN NOT NULL` 그대로 — nullable boolean 완화안은 철회했고(nullable boolean 금지), VESA 지원 여부의 정본은 `product_vesa` 행 존재다. §2-2의 "`kind` 금지"도 이 결정으로 좁은 예외를 갖게 됐다(한 테이블에 축이 다른 분류가 둘일 때만).
9. **책상 설정을 `placement_desk` 테이블로 분리** (2026-07-24 승인 박동규, DERO-123 — 위 7.3을 개정).
   1. **`placement`의 `desk_*` 9컬럼 → `placement_desk`.** 컬럼에서 `desk_` 접두사를 떼고 `desk` 규격 서브타입과 같은 이름을 쓴다(`width_mm`·`top_thickness_mm`·`frame_type` …). `desk_source`는 `spec_source`로 개명 — `source_placement_id`(리믹스 출처)와 단어가 겹쳤다.
   2. **`UNIQUE(placement_id)`로 배치당 책상 1개를 유지한다.** 기획은 그대로 1개다(다중 책상 미채택). 테이블로 뺀 목적은 확장 옵션 하나뿐 — 열 때 이 제약만 DROP하면 되고, 컬럼 블록이면 엔티티·DTO·쿼리를 다시 써야 한다. 백엔드 엔티티·Flyway 마이그레이션이 아직 0건인 지금이 비용 0인 시점이라는 것이 "왜 지금"의 답이다.
   3. **좌표·방 치수는 넣지 않는다.** 책상 위치(`position_*`·`rotation_deg`)와 방 치수는 책상이 1개인 한 전부 파생이고, 나중에 `ALTER TABLE ADD COLUMN`으로 붙는다. `placed_item.placement_desk_id`도 같은 이유로 보류 — 책상이 1개면 결정론적 백필이 가능하다.
   4. **스키마만 확장 준비된 것이다.** 씬 좌표 원점 규칙(`docs/context/3d-scene.md` "벽을 책상 뒷변으로 당긴다")과 `snap.ts`의 `deskTopY` 스칼라는 그대로 남아 있고, 다중 책상을 실제로 열 때 함께 손봐야 한다.
10. **무게·하중 단위를 그램 정수로 전환** (2026-07-27 승인 박동규, DERO-172). 접미사 `_kg` → `_g`, 물리 타입 `NUMERIC(5,2)` → `INT`. 대상 4컬럼 — `desk.allowed_load_g`·`monitor.weight_g`·`arm.allowed_load_g`·`prop.weight_g`. **저장은 그램 정수, UI 표시는 kg로 환산한다.** 그램에서 소수점 2자리는 10mg 정밀도라 카탈로그에 그런 표기가 없고, `_mm` 정수 고정 규칙과도 일관된다.
