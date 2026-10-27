# API 명세 — 리소스·경로·메서드와 그 근거

> **이 문서의 지위**: 설계 의도 문서다. **요청·응답 필드 스키마는 여기 적지 않는다** — 계약 정본은
> 코드에서 나오는 springdoc OpenAPI이고, 프론트 타입은 거기서 `openapi-typescript`로 생성한다(ADR-0008).
> 손으로 쓴 필드 목록은 반드시 낡는다. 실제로 이 문서의 옛 판이 그렇게 낡았다(2026-07-31 전면 재작성).
>
> 여기 있는 것: **어떤 리소스가 있고, 경로가 왜 이 모양이며, 무엇을 안 만들기로 했는가.**
>
> 표기: 🔒 로그인 필요 · 🔓 비로그인 허용 · 🛡️ 관리자 전용 · ⏳ 잠정(선행 결정 대기)

## 0. 전제 — 이미 확정된 것

| 축 | 결정 | 정본 |
|---|---|---|
| 경로 접두 | `/api/v1/…` | `.claude/rules/java/architecture.md` §17 |
| 인증 | JWT 액세스 30분(Bearer·메모리) + 회전 리프레시 14일(httpOnly 쿠키·Redis) | ADR-0005 |
| 성공 응답 | **엔벨로프 없음** — 리소스 그대로. 생성 201+`Location`, 수정 200, 삭제 204 | ADR-0008 |
| 에러 응답 | RFC 9457 `ProblemDetail` + `code` 확장(검증 실패만 `errors` 배열) | ADR-0008 |
| 목록 | 사용자 대면 **커서**(`?cursor=&size=`) · 관리자 **offset**(`?page=&size=`). 총 개수 없음 | ADR-0008 |
| 시각 | `OffsetDateTime` — 오프셋 포함 ISO-8601 | ADR-0008 결정 7 |
| 배치 저장 | 씬 전체 스냅샷 + id 매칭 병합, `ref` 통일, `@Version` 낙관적 락 | ADR-0009 |
| 배치 업로드 | 비동기 파이프라인 — Redis 큐 + 로컬 워커 + presigned URL | ADR-0015 |

## 1. 경로 설계 규칙

이 다섯 줄에서 아래 모든 경로가 파생된다. **개별 엔드포인트를 규칙 밖에서 정하지 말 것** — 두 방식이
공존하는 상태가 어느 한쪽을 일관되게 쓰는 것보다 항상 비싸다.

1. **동작 표현** — ⑴ **상태가 남는 것**은 그 상태를 나타내는 **하위 리소스** + `PUT`/`DELETE`
   ⑵ **상태가 안 남는 계산**은 **네임스페이스 + 복수 명사** + `POST` → **200**(저장 안 하므로 201·`Location` 없음)
   ⑶ **동사 경로 금지**. `/judge`·`/publish`·`/approve` 같은 세그먼트를 만들지 않는다.
2. **토글은 단수 하위 리소스** — `PUT`/`DELETE /{리소스}/{id}/like` → 204. 멱등이라 더블클릭·재시도가 안전하고,
   북마크의 그룹 이동까지 같은 `PUT` 하나로 끝난다. `/likes` 복수는 "그 대상의 좋아요 전체"라는 다른 뜻이므로 쓰지 않는다.
3. **부분집합은 전부 쿼리 파라미터** — `?owner`·`?publishStatus`·`?ids`·`?hashtag`·`?categoryId`·`?specType`·`?sort`.
   경로로 승격시키지 않는다. 한 자원의 URL은 하나여야 하고, 축 하나만 경로로 올리면 나머지와 표현이 갈린다.
4. **파일 업로드는 2단계 presign, 경로는 중첩** — `POST …/upload-urls`(200) → 브라우저가 S3에 PUT →
   `POST`/`PUT`으로 key 등록. **서빙 엔드포인트는 만들지 않는다** — presigned GET URL이 리소스 응답에 실려 나간다.
5. **관리자는 `/admin/*` 별도 트리** — 사용자 목록은 커서, 관리자 목록은 offset이라 같은 경로가 두 규약을 가질 수 없다.

### 이름 규칙

- 경로 단어는 `docs/GLOSSARY.md` 2부 논리명을 따른다(물리 스키마와 1:1 아님).
- **"업로드"는 목적어로 가른다** — `POST /products/{id}/images`는 **이미지 업로드**,
  `PUT /placements/{id}/feed-entry`는 **배치 업로드**(데스크 피드 공개). 같은 단어지만 대상이 다르다.

## 2. 인증 (AUTH) — 손대지 않는 영역

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/refresh` 🔓 | 리프레시 회전 |
| POST | `/auth/logout` 🔓 | 세션 무효화 |

**`/auth/logout`이 🔓인 이유** (2026-07-31 개정, 종전 🔒): 이 둘의 주체는 Bearer 액세스 토큰이 아니라
**리프레시 쿠키**다. 🔒로 강제하면 액세스 토큰이 만료된 상태 — 즉 사용자가 로그아웃을 누르는 가장 흔한
순간 — 에 401로 막혀 서버 세션이 안 끊긴다. 쿠키 path는 `/api/v1/auth`이고 근거는 ADR-0005 결정 3
개정 절이다.

소셜 로그인 시작은 `/api/oauth2/authorization/{provider}`, 콜백은 `/api/login/oauth2/code/{provider}` —
**둘 다 Spring 기본 경로가 아니다**(기본은 `/api` 없는 `/oauth2/...`·`/login/oauth2/code/...`). nginx가
백엔드로 넘기는 location이 `/api/` 하나뿐이라 기본 경로로 두면 배포에서 Next.js가 받아 404가 된다
(로컬은 nginx가 없어 증상이 안 나타난다). 근거와 배선 3곳은 **ADR-0005 결정 11**. 정본은 ADR-0005.
**2026-07-31 API 재설계 범위 밖이다** — 이 계열과 `global/`의 `ProblemDetail`·`CursorPage`·시큐리티 배선은
그대로 유지한다.

## 3. 사용자 (USR)

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET | `/terms` 🔓 | 약관 목록(항목별 최신 회차) | REQ-USR-01 |
| GET | `/users/me` 🔒 | 내 정보(+ `onboardingRequired`·`createdAt`) | REQ-USR-01 |
| PATCH | `/users/me` 🔒 | 프로필 수정(닉네임 포함) | — |
| DELETE | `/users/me` 🔒 | 회원 탈퇴(소프트 삭제) → 204 | — |
| POST | `/users/me/consents` 🔒 | 약관 동의 기록 → 201 | REQ-USR-01 |
| POST | `/users/me/profile-image/upload-url` 🔒 | presigned PUT 발급 | — |
| PUT | `/users/me/profile-image` 🔒 | key 등록(항상 덮어씀) | — |
| GET | `/users/me/image-quota` 🔒 | 오늘 쓴 장수·상한·리셋 시각 | REQ-IMG-03 |
| GET | `/users/search?q=` 🔒 | 닉네임 자동완성(멘션) — 질의 ≥1자(공백뿐이면 400), 결과 ≤10, 관련도 순. ES `users` 인덱스 재활용이라 색인 신설 없음. ES 장애는 503 `USER_SEARCH_UNAVAILABLE`(폴백 없음) | REQ-COM-18 |
| GET | `/users/{id}` 🔓 | 남의 프로필 | REQ-COM-07 |
| PUT/DELETE | `/users/{id}/follow` 🔒 | 팔로우/언팔로우 | REQ-COM-07 |
| GET | `/users/{id}/followers` · `/following` 🔓 | 팔로워·팔로잉 | REQ-COM-07 |

- **`GET /users/search`는 `/users/*` permitAll보다 앞에 선언돼야 한다**(`SecurityConfig`) — `*`가
  `"search"`에도 매치해서, 뒤에 두면 비로그인 닉네임 열거 통로가 조용히 열린다(`/users/me`가 같은
  이유로 같은 자리에 있다). 로그인을 요구하는 유일한 목적이 그 차단이다(D35·ADR-0038 결정 3).
- **자기 자신은 `/users/me`로 가리킨다.** 톱레벨 `/me` 트리를 만들지 않는다 — `/me/placements`와
  `?owner=me`가 둘 다 그럴듯해져 필터 규약이 갈린다. `/users/{내 id}`도 쓰지 않는다(남의 id로 바꿔
  부르는 시도가 기본값이 된다).
- **한도는 계정에 붙지 배치에 붙지 않는다.** 그래서 `/users/me/image-quota`다. 이 화면이 나중에
  결제("충전하기")가 붙을 자리다 — 결제 모델(구독형/크레딧형)은 **미정**이라 지금 만들지 않는다.

### 온보딩 — 신규 가입자의 닉네임·약관 (2026-08-01 신설, 승인 박동규)

D23("가입 시 닉네임 직접 입력")의 구현 경로다. **소셜 로그인만으로는 가입이 끝나지 않는다.**

- **온보딩 완료 여부는 컬럼이 아니라 파생값이다** — `user_consent`에 **필수 약관 각 항목의 최신
  `revision`** 동의 행이 다 있으면 완료다. `user.onboarded` 같은 플래그를 만들지 않는다(`terms`가
  개정되면 그 플래그가 조용히 거짓말한다 — 재동의를 받아야 할 사람이 통과한다). `erd.md` 무변경.
- `GET /users/me`의 **`onboardingRequired`**(boolean)가 그 파생값이고, 프론트는 이 하나만 보고
  온보딩 화면으로 보낸다. 별도 상태 조회 엔드포인트를 만들지 않는다.
- **닉네임 입력에 전용 경로를 파지 않는다** — `PATCH /users/me`가 이미 프로필 수정이고 닉네임은
  그 필드 하나다. 중복이면 409. 소셜 프로필 닉네임 자동 부여(`OAuth2LoginSuccessHandler`)는
  **초기값으로 남긴다** — 온보딩 화면이 그 값을 미리 채워 보여준다.
- `POST /users/me/consents`는 **동의 항목 배열을 한 번에** 받는다(`termsId` 목록). 항목마다 한 번씩
  부르면 중간에 끊긴 부분 동의 상태가 생긴다. 필수 항목이 빠졌으면 422.
- **철회 경로는 만들지 않는다** — 필수 약관 철회는 탈퇴와 같은 뜻이고, 선택 약관은 지금 없다.

### 회원 탈퇴 (2026-08-06 신설)

`DELETE /users/me`는 **소프트 삭제**다 — `user.status`를 `INACTIVE`로, `deleted_at`을 현재 시각으로
바꾼다(하드 삭제 아님, `docs/context/erd.md`의 soft delete 대상 규약 그대로). 이후
`requireActiveUser`를 거치는 모든 🔒 API가 이 사용자를 거부한다(먼저 `getMe`부터).

- **리프레시 쿠키·Redis 세션 정리는 이 응답에 없다** — `user`는 `auth`를 모른다(ADR-0007,
  `LayerDependencyTest`가 기계적으로 강제). 프론트가 `DELETE /users/me` 성공 직후 기존
  `POST /auth/logout`을 이어 불러 세션까지 마저 정리하고 로그인 화면으로 보낸다. 새 인증 관련
  엔드포인트는 만들지 않는다 — §2가 "손대지 않는 영역"이라고 못 박은 이유이기도 하다.
- **하드 삭제·익명화는 지금 하지 않는다** — `follow`·`*_like`·`*_bookmark`·`cart_item`은 `user_id`
  `ON DELETE CASCADE`라 하드 삭제하면 그 행들이 통째로 사라지지만, `placement`·`comment`·`post`·
  `post_comment`는 `ON DELETE SET NULL`이라 작성자 없는 콘텐츠로 남는다(erd.md FK 정책). 소프트
  삭제는 이 정책들을 전혀 안 건드리고 "로그인 못 하게" 막는 것으로 충분하다 — 실제 행 정리(익명화
  또는 배치 잡)가 필요해지면 별도 결정.

## 4. 배치 (ENV·SIM) → `docs/context/3d-scene.md`

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET | `/placements` 🔓 | 목록. `?owner`·`?publishStatus`·`?ids`·`?hashtag`·`?bookmarked=me`·`?bookmarkGroup`·`?sort=latest\|popular`·`?cursor`·`?size`. **`?hashtag`는 태그 이름 하나와 정확히 일치**하는 배치만 남긴다(2026-08-07 DERO-493, `GET /posts?hashtag=`와 같은 규약 — `'#'` 없이 이름만). 데스크 피드의 태그 칩이 이걸 쓴다: 받아 온 페이지 안에서 거르면 커서 너머를 못 찾는다. 응답 한 줄에는 **`tags`**(문자열 배열, `'#'` 없음, 없으면 빈 배열)와 **`totalPriceKrw`**(2026-08-10 DERO-550)가 실린다. **`totalPriceKrw`가 데스크 값이고 `budgetKrw`는 사용자가 정한 예산이다** — 둘을 바꿔 쓰면 화면이 "가격"이라며 예산을 그린다(DERO-547에서 실제로 그랬다). 합계 규칙은 `GET /placements/{id}/estimate`와 **같은 함수**라 두 화면이 갈리지 않는다: 인스턴스 단위 합, 직접 입력 규격 책상은 0(D18), 아이템이 없으면 0(`null` 아님). 페이지의 id 묶음으로 집계 두 방이라 카드 수만큼 왕복이 늘지 않는다 | REQ-COM-01 |
| GET | `/placements?q=` 🔓 | **서버 검색**(2026-08-07, DERO-490 — ADR-0027). ES가 관련도 순으로 배치 id를 주고 상세는 Postgres에서 읽는다. 검색 대상은 **제목·설명·태그·작성자 닉네임**이고 넷 중 하나만 맞아도 걸린다 — 종전 `DeskFeedGallery` 클라이언트 필터의 동작 그대로다(그 필터는 DERO-492에서 걷혔다 — 화면은 이제 이 파라미터를 탄다). `owner`·`publishStatus`·`ids`·`bookmarked` 필터와 **같이** 걸리지만 **`sort`는 안 걸린다**(관련도 순서가 곧 정렬이다). **작성자는 별도 결과 섹션이 아니다**: `users` 인덱스에서 닉네임이 맞은 userId를 찾아 배치 질의의 필터로 넘긴다(ADR-0027 결정 2). **색인은 전량이고 노출 판정은 Postgres다**(결정 4) — `PRIVATE` 배치도 색인에 있지만 가시성 술어가 목록과 같은 것이라 남의 결과에는 안 나온다. **커서에 담기는 값이 다르다** — 목록은 복합 커서(정렬키+id), 검색은 오프셋(불투명 문자열이라 호출부는 영향 없음). ES가 죽으면 **503 `PLACEMENT_SEARCH_UNAVAILABLE`**(닉네임 쪽이면 `USER_SEARCH_UNAVAILABLE`), 폴백 없음 | REQ-COM-13 |
| POST | `/placements` 🔒 | 생성 — 씬 전체 스냅샷 → 201+`Location` | REQ-SIM-06 |
| GET | `/placements/{id}` 🔓 | 상세(아이템·책상·벽·조명 포함) | REQ-SIM-06 |
| PUT | `/placements/{id}` 🔒 | 저장 — 스냅샷 전체 교체(id 매칭 병합) → 200 | REQ-SIM-06 |
| DELETE | `/placements/{id}` 🔒 | 삭제 | — |
| POST | `/placements/{id}/thumbnail/upload-url` 🔒 | 스크린샷 presigned PUT | — |
| PUT | `/placements/{id}/thumbnail` 🔒 | 스크린샷 key 등록(덮어씀) → 204 | — |
| **PUT** | **`/placements/{id}/feed-entry`** 🔒 | **배치 업로드 → 202 Accepted**. 본문은 선택이고 실리는 것은 **태그 배열**뿐이다(`{"tags": [...]}`, 2026-08-07 DERO-490 — ADR-0027 결정 5) | REQ-COM-04 |
| **PUT** | **`/placements/{id}/feed-entry/tags`** 🔒 | **태그만 교체 → 204**(2026-08-07 DERO-493). 본문 `{"tags": [...]}`은 **필수**이고 빈 배열이 전부 제거다 — 재시도 호출이 없어 여기선 `null`이 "미변경"의 뜻을 갖지 않는다(위 `PUT`과 반대). **게시 상태도 큐도 안 건드린다**: 공개된 뒤 태그를 고치려고 위 `PUT`을 다시 부르면 `PUBLIC`이 `PENDING`으로 되돌아가 상상도를 다시 만들고 한도를 깎는다 | REQ-COM-13 |
| **DELETE** | **`/placements/{id}/feed-entry`** 🔒 | 피드에서 내림 → 204 | REQ-COM-04 |
| POST | `/placements/{id}/remixes` 🔒 | 리믹스 — 서버가 복사 → 201+`Location`(새 배치). **본문 없음** | REQ-COM-02·03 |
| GET | `/placements/{id}/remixes` 🔓 | 이 배치를 리믹스한 것들(커서, 가시성 적용) | — |
| GET | `/placements/{id}/estimate` 🔓 | 견적 합산·예산 대비 | REQ-REC-01 |
| GET | `/placements/{id}/generated-images` 🔓 | AI 상상도(업로드 1회당 1장) | REQ-IMG-01 |
| GET/PUT/DELETE | `/placements/{id}/like` 🔒 | 좋아요 — `GET`은 상태 조회(`{liked, likeCount}`, 재접속 후 버튼 상태 복원. 2026-08-02 역기입, DERO-342) | REQ-COM-05 |
| GET/PUT/DELETE | `/placements/{id}/bookmark` 🔒 | 북마크(`PUT` 본문에 그룹) — `GET`은 상태 조회(`{bookmarked, groupId}`, 2026-08-02 역기입) | REQ-COM-05·08 |
| GET/POST | `/placements/{id}/comments` 🔓/🔒 | 댓글 | REQ-COM-06 |
| DELETE | `/placements/{id}/comments/{commentId}` 🔒 | 댓글 삭제 | REQ-COM-06 |

### 배치의 🔓는 "선택적 인증"이지 "무조건 공개"가 아니다

(2026-07-31 확정, 승인 박동규.) `GET /placements`·`GET /placements/{id}`는 `permitAll`이지만
**응답 범위가 로그인 여부에 따라 달라진다.**

| 호출자 | 보이는 것 |
|---|---|
| 비로그인 | `publishStatus = PUBLIC`인 배치만 |
| 로그인 | `PUBLIC` + **본인 소유 비공개** |

상세도 같은 규칙이고, 규칙에 안 맞으면 404다(403이 아니다 — 존재 여부 자체를 흘리지 않는다).

**이 절이 필요한 이유**: 🔓만 보고 배선하면 비로그인이 남의 비공개 배치를 목록으로 보고 상세까지 연다.
D14는 비로그인에게 커뮤니티 열람만 허용했는데 🔓 표기 하나로는 그 경계가 표현되지 않는다.
실제로 `PlacementRepository.findSummaries`는 `where p.deletedAt is null`뿐이라 **가시성 조건이 없었고**,
`anyRequest().permitAll()` 기간 동안 그대로 새고 있었다.

그래서 서비스가 **nullable `userId`**를 받고 쿼리가 분기한다. `Authentication`이 null일 수 있는 경로라는
뜻이고, 이 저장소에서 "인증은 선택이지만 신원이 응답을 바꾸는" 첫 자리다. `?owner=me` 같은 뒤따르는
필터도 전부 이 자리에 얹힌다.

### 목록 카드의 표지는 `primaryImageUrl`이다

(2026-08-02 역기입, DERO-365.) 목록 한 줄은 이미지 URL을 **둘** 싣는다 — `primaryImageUrl`은
대표 상상도(`generated_image.is_primary`)이고 `thumbnailUrl`은 시뮬레이터 스크린샷이다. 데스크 피드
카드는 앞쪽, 내 작업실 카드는 뒤쪽을 쓴다(ADR-0015 결정 7 표). 업로드 전 배치는 상상도가 없어
`primaryImageUrl`이 `null`이다.

### 방 표면은 `walls[]` · `floor` · `timeOfDay`다

(2026-08-09, ADR-0030 결정 1·3 — 옛 `themeKey` 한 줄과 `isWall*On` 3개는 API에서 사라졌다(DERO-514).)
저장 스냅샷과 상세 응답이 같은 모양을 쓴다:

- **`walls[]` — 좌·전면·우 3행.** 행마다 `wallSide` · `isOn`(벽 표시 여부의 정본) · `material` ·
  `variant` · `hasWindow` + 창문 mm 4값(`windowCenterXMm`·`windowCenterYMm`·`windowWidthMm`·
  `windowHeightMm`). 응답은 **항상 3행**이고 순서는 좌·전면·우 고정이다.
- **`floor`** — `material`·`variant`. 바닥은 면이 하나라 테이블을 만들지 않았다.
- **`timeOfDay`** — `DAY` | `NIGHT`.

**요청이 `walls`를 실으면 세 면이 전부 있어야 한다** — 두 면만 오면 `400 PLACEMENT_WALLS_INCOMPLETE`,
같은 면이 두 번 오면 `400 PLACEMENT_DUPLICATE_WALL_SIDE`다(안 온 면을 기본값으로 채우면 그 면의
마감·창문이 조용히 초기화된다). **창문 4값은 넷 다 있거나 넷 다 없다.** 반대로 `walls`·`floor`·
`timeOfDay`를 **통째로 생략하면 "기존 유지"다** — 방 표면을 모르는 클라이언트의 저장 한 번이 저장된
마감을 지우면 안 된다.

**서버 검증은 형식(`^[A-Z][A-Z0-9_]{0,29}$`, UPPER_SNAKE)까지다.** 값 화이트리스트도 enum도 두지
않는다 — 룩의 정본이 프론트 계열 모듈이라 값을 백엔드에서 닫으면 계열 하나 늘릴 때마다 배포가 붙는다.
WAS는 이 값으로 아무 판정도 하지 않고, **미상 값은 에러가 아니라 프론트가 그 계열 기본 변형으로
폴백한다**(계열 코드를 지웠다고 옛 배치가 안 열리면 안 된다). 리믹스 복사본은 원본의 벽면 3행·바닥·
시간대를 물려받는다.

### 리믹스는 서버가 복사한다 — 요청 본문이 없다

(2026-08-02 역기입, DERO-343.) `POST /placements/{id}/remixes`는 본문을 받지 않는다. 클라이언트가
상세를 받아 재조립해 `POST /placements`로 보내는 방식을 쓰지 않는 이유가 **출처가 자기 신고가 되어
위조 가능**하기 때문이고, 그 규칙은 "본문의 출처 값을 안 읽는다"가 아니라 **"읽을 본문 자체가 없다"**
로 지켜야 한다.

- **원본이 `PUBLIC`일 때만 성립하고 아니면 404다** — 가시성 규칙과 같은 답이라 "그 id의 비공개 배치가
  존재한다"를 흘리지 않는다. **내 비공개 배치도 404다**(복제는 리믹스가 아니다).
- 복사본은 호출자 소유·`PRIVATE`이고 아이템·배치 책상·벽 3면·방 조명·테마·예산을 그대로 갖는다.
  `like_count`·스크린샷·AI 상상도는 **안 물려받는다** — 남의 반응과 남이 찍은 화면이다.
- **`ref`·`mountedToRef` 재매핑은 `Placement.copyOf` 한 곳에서만 일어난다.** 복사본의 결합이 원본
  아이템 id를 가리키면 두 배치가 한 그래프로 엮여 원본을 고칠 때 남의 복사본이 따라 움직인다
  (회귀 테스트 `PlacementRemixPersistenceTest.결합_재매핑`).
- **원본이 삭제돼도 리믹스는 살아남는다** — `fk_placement_source_placement_id`는 물리 삭제 때만 도는
  FK이고 배치 삭제는 소프트 삭제다. 상세 응답의 `sourcePlacement.available`이 `false`가 되고 프론트가
  "원본 없음"을 그린다. **"리믹스가 아니다"(`sourcePlacement`가 `null`)와 다른 상태다.**

### 아이템 엔드포인트는 없다

`placed_item`은 URL을 갖지 않는다. 쓰기는 전부 `PUT /placements/{id}` 스냅샷을 통과한다 —
`@Version`이 `Placement`에만 있어서(ADR-0009 결정 4) 아이템 단위 쓰기는 충돌을 감지할 수 없고,
ADR-0007이 *"쓰기는 루트를 통과, 읽기는 자유"*로 이미 답했다.

**확장 경로는 열려 있다**: id 매칭 병합 덕에 `placed_item.id`가 저장마다 바뀌지 않고 상세 응답에 이미
실린다. 아이템별 댓글·핀 같은 요구가 실제로 오면 그때 `GET /placements/{id}/items/{itemId}`와 그 하위를
추가해도 기존 계약이 안 깨진다. **지금 미리 파지 않는다** — 아무도 안 부르는 엔드포인트가 있으면 다음
사람이 거기에 `PATCH`를 붙인다.

### `PUT /placements/{id}/feed-entry`가 하는 일

```
① 호환성 판정 게이트      위반이면 422 PLACEMENT_JUDGMENT_FAILED — 큐에 넣지 않는다
② thumbnail_key 존재 확인  없으면 422 — 스크린샷이 AI 상상도의 입력이다
③ 일일 한도 확인           초과면 429 IMAGE_QUOTA_EXCEEDED
④ 태그 반영 + publish_status = PENDING, Redis 큐에 투입 → 202 Accepted
```

- **태그를 다는 시점이 여기다**(ADR-0027 결정 5, 2026-08-07): `PRIVATE` 배치의 태그는 아무도 못 보고, 이
  화면이 이미 사용자에게 "남에게 보일 것"을 묻는 자리다. `hashtag` 마스터는 제품·게시글과 공유하고
  정션만 `placement_hashtag`다. **본문에 `tags`가 없으면(또는 본문 자체가 없으면) 태그를 건드리지
  않고, 빈 배열이면 전부 뗀다** — `PUT`이 곧 재시도 버튼이라 본문 없는 재호출이 실재하는데 그것을
  "태그 없음"으로 읽으면 재시도 한 번에 태그가 조용히 지워진다. 태그는 게이트를 **다 넘은 뒤**
  반영되므로 판정·한도에서 튕긴 요청의 태그는 남지 않는다.

- **202인 이유**: 이 호출이 끝난 시점에 배치는 아직 피드에 없다. 200·204는 "다 됐다"는 뜻이라 거짓말이 된다.
- **게이트가 ①에 있는 이유**: 나중에 판정하면 생성 비용과 한도를 쓰고 나서 버린다. 그리고 "업로드됐다"는
  피드백을 준 몇 분 뒤에 뒤집게 된다.
- **재시도는 같은 호출이다.** `PUT`이 멱등이라 `FAILED` 상태에서 다시 부르면 재투입된다. 별도 재시도
  엔드포인트를 만들지 않는다.
- **이미 `PUBLIC`인 배치를 수정해도 재생성하지 않는다.** 자동 재생성은 제목만 고쳐도 한도를 태운다.
  사용자가 다시 누를 때만 소모된다 — 대신 피드 카드가 낡을 수 있고, 그건 프론트가 안내한다.
- **공개한 뒤의 태그 수정은 여기가 아니라 `PUT .../feed-entry/tags`다**(2026-08-07 DERO-493).
  이 `PUT`은 재시도 버튼이라 다시 부르면 `PUBLIC` 배치가 `PENDING`으로 되돌아가 상상도를 다시 만들고
  일일 한도를 깎는다 — 태그 한 줄 고치자고 치를 값이 아니다. 저쪽은 게이트를 하나도 타지 않고 태그만
  갈아 끼운 뒤 색인을 다시 만든다.
- 상태 진행은 `GET /placements/{id}`의 `publishStatus`로 확인한다. 별도 진행 조회 엔드포인트는 없다.

**큐는 WAS 안 스레드가 소비하고, 생성기는 GMS다** (2026-08-06, D29·ADR-0025): `app.image.generation.mode`가
`gms`면 실제 생성기, 기본값 `stub`이면 스크린샷 key를 그대로 상상도 자리에 꽂고 `is_primary`를 지정한 뒤
`PENDING → PUBLIC`으로 전이시킨다. **로컬 노트북 python 워커 + SSH 터널 기획은 폐기됐고, 이 루프가
최종형이다** — 갈아탈 대상이 생겨도 바뀌는 것은 `ImageGenerationPort` 구현이지 API·상태기계·큐가 아니다.
**③ 일일 한도는 스텁 경로에서 차감하지 않는다**(AI 생성이 아니므로) — 판단 지점 코드는 그대로 두고
스텁일 때만 건너뛴다.

**생성 호출은 트랜잭션 밖에서 돈다.** 재료 읽기와 행 쓰기만 각각 짧은 트랜잭션이고, 그 사이 생성이
도는 동안 사용자가 `DELETE .../feed-entry`로 내리면 **만든 그림을 버린다**(명시적 취소가 이긴다).
API 표면에는 안 보이지만 `PENDING`이 오래 걸릴 때 커넥션이 물려 있지 않다는 뜻이다.

### 리믹스는 서버가 한다

클라이언트가 상세를 받아 새 스냅샷으로 재조립해 `POST /placements`로 보내는 방식은 쓰지 않는다.
①출처(`source_placement_id`)가 클라이언트 자기 신고라 위조 가능하고 ②"원본이 `PUBLIC`일 때만" 게이트를
걸 자리가 없고 ③`ref`·`mountedToRef` 재매핑이 서버와 클라이언트 두 곳에 살아 드리프트가 나고
④왕복이 두 번이다.

## 5. 제품 (CAT·CMP·COM 자작)

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET | `/products` 🔓 | 목록. `?specType`·`?categoryId`·`?vibe`·`?hashtag`·`?source`·`?owner`·`?cursor`. **`categoryId`는 하위 트리 전체로 롤업**한다(대분류를 주면 중·소분류 제품까지, 2026-08-04 — 옛 부모 1단 롤업은 3단 트리의 소분류를 빠뜨렸다). **반복해서 실을 수 있다** — `?categoryId=52&categoryId=53`(콤마 구분도 같다)이면 각 id의 하위 트리를 롤업한 **합집합**이고, 하나만 실은 기존 호출은 동작이 그대로다. 최대 100개, 넘기면 400 `COMMON_INVALID_INPUT`(자르면 빠진 카테고리가 "제품 없음"으로 읽히므로 거절한다). 프론트 '전체' 탭이 "책상을 뺀 대분류 전부"를 이 형태로 건다 — 파라미터를 생략하면 책상까지 섞인다(2026-08-05) | REQ-REC-05, REQ-COM-11 |
| GET | `/products?q=` 🔓 | **서버 검색**(2026-08-06, DERO-384 — ADR-0019). ES가 관련도 순으로 제품 id를 주고 상세는 Postgres에서 읽는다. `specType`·`categoryId` 필터와 **같이** 걸린다. `q`가 없으면 등록순 목록 그대로다. **커서에 담기는 값이 다르다** — 등록순은 마지막 id, 검색은 오프셋(불투명 문자열이라 호출부는 영향 없음). ES가 죽으면 **503 `PRODUCT_SEARCH_UNAVAILABLE`**, 폴백 없음 | REQ-SIM-01 |
| GET | `/products/suggestions?q=` 🔓 | **검색어 추천**(2026-08-07, DERO-385 — ADR-0019 결정 1의 요구 ③). 입력창 아래 드롭다운에 세울 **문자열 목록**(`{"suggestions": [...]}`, 최대 10개)이다. 자료구조가 목록 검색과 다르다 — 이쪽은 별도 FST(completion suggester)라 키 입력마다 불러도 싸고, `?q=`는 역색인을 타 결과 **제품**을 갱신한다. **ES가 준 문자열을 그대로 내보내지 않는다** — id로 Postgres를 다시 읽어 목록·검색과 같은 노출 술어를 태운다(숨김·검수 대기 제품 이름이 새면 눌러도 0건이다). `q`가 비면 ES를 안 부르고 빈 목록, ES가 죽으면 **503 `PRODUCT_SEARCH_UNAVAILABLE`** | REQ-SIM-01 |
| GET | `/products?liked=me` 🔒 | 내가 찜한 제품 목록(2026-08-02 역기입, DERO-356) | REQ-COM-05 |
| GET | `/products/{id}` 🔓 | 상세(규격 포함) | — |
| POST | `/products` 🔒 | 자작 제품 업로드(`source=USER`) → 201 | REQ-COM-09 |
| PATCH | `/products/{id}` 🔒 | 내 업로드 수정 | REQ-COM-10 |
| DELETE | `/products/{id}` 🔒 | 내 업로드 삭제 | REQ-COM-10 |
| POST | `/products/{id}/images/upload-urls` 🔒 | presigned PUT 발급 | — |
| POST | `/products/{id}/images` 🔒 | key 등록 → 201 | — |
| DELETE | `/products/{id}/images/{imageId}` 🔒 | 이미지 삭제 | — |
| GET/PUT/DELETE | `/products/{id}/like` 🔒 | 좋아요 — `GET`은 상태 조회(2026-08-02 역기입) | REQ-COM-05 |
| GET | `/categories` · `/vibes` · `/hashtags` · `/brands` · `/desk-textures` · `/vesa-specs` 🔓 | 마스터 | — |

- **컬렉션은 `/products` 하나다.** 서브타입별 `/desks`·`/monitors`를 만들지 않는다 —
  `spec_type`(5값 고정)과 `category`(자유 증가)는 **축이 둘**인데, 하나만 경로로 승격시키면 같은 문제
  (제품 좁히기)를 두 방식으로 푼다. 그리고 `placed_item.product_id`·`cart_item`·좋아요가 전부 단일
  `product.id`를 참조하므로 컬렉션이 쪼개지면 "이 id가 어느 컬렉션 소속인가"를 URL이 못 말한다.
  사용자 업로드도 같은 `product` 행이다(D20).
- 다형 응답은 `specType` 판별자로 springdoc이 `oneOf`를 뽑고, `openapi-typescript`가 판별 유니온을 만든다.
- **목록 원소 = 상세 원소다** (2026-08-01 확정, 승인 박동규 — ADR-0017). `GET /products`가 규격 +
  `asset`(presigned GLB URL·`rigManifest`) + `emitter` + **대표 실사 이미지 1장**을 통째로 싣는다.
  시뮬레이터는 드래그를 **시작하기 전에** GLB가 필요해서(고스트 프리뷰가 반투명 실물) 얇은 목록이
  성립하지 않는다. 실사 이미지 전체(최대 8장)는 `GET /products/{id}`에만 실린다. **서브타입 전용
  요약 DTO를 만들지 않는다** — 옛 `DeskSummaryResponse`가 그 형태였고 삭제됐다.
- **`GET /products`는 배치 가능한 제품만 돌려준다** (같은 결정). `asset`이 없거나 검수 미통과인 제품은
  목록에서 제외한다 — `DESK`만 예외다(절차 생성이라 원래 `asset` 행이 없다, D18). 등록 진행률은
  `GET /admin/products?status=`가 답한다.
- **이름 검색은 `?q=`다** (2026-08-06 구현, DERO-384 — ADR-0019가 2026-08-01의 "이름 검색 파라미터를 만들지 않는다"를 대체한다). 그 결정의 전제였던 *전량 프리페치 후 클라 필터*가 라이브러리 지연 로딩(DERO-374)으로 깨졌다 — 손에 20개뿐인데 그 위에서만 거르니 "불러온 목록 안에서만 검색"이 됐다. Postgres `LIKE`를 부결한 근거(인덱스·erd 동결·prefix 오답)는 그대로고, ES가 그 셋을 전부 피한다. **정본은 Postgres다** — ES는 id만 돌려주고 노출 규칙(숨김·검수·소프트 삭제)과 규격·카테고리 필터는 전부 Postgres 쿼리가 판정한다.
- **가정**: 규격 수치 필터(`?minWidthMm=`·`?inch=`)는 없다 — REQ에 없다. 생기면 `/products`의 쿼리
  파라미터가 서브타입별로 갈리므로 그때 이 절을 재검토한다.
- **내 업로드 관리에 `/users/me/products`를 만들지 않는다** — `?owner=me` + `PATCH /products/{id}`로 충분하다.
- **`?liked=me`도 같은 이유로 경로가 아니라 쿼리 파라미터다**(2026-08-02 구현, DERO-356 — §1 규칙 3).
  마이페이지 찜 목록·시뮬레이터 좋아요 패널이 "내가 찜한 제품 **전체**"를 요구하는데 단건
  `GET /products/{id}/like`뿐이라 성립하지 않던 자리다. 원소는 `GET /products`와 **같은 목록 원소**이고
  (찜 목록 전용 요약 DTO 없음) 커서·`size` 규약도 같다. 정렬은 **최근 찜한 순**이고 커서는 찜 행 기준이다.
  값은 `me`만 받는다 — 남의 찜 목록은 열지 않고, 다른 값이면 400이다(조용히 전체 목록으로 흘리지 않는다).
  **비로그인은 401**인데 그 판정은 `SecurityConfig`가 아니라 핸들러가 한다 — 시큐리티 매처는 쿼리
  파라미터를 못 보고 `GET /api/v1/products/**`는 카탈로그 열람용 `permitAll`이다(D14).
  찜한 뒤 숨겨지거나 검수 미통과가 된 제품은 카탈로그 노출 규칙에 걸려 목록에서 빠진다.
  **구현 위치는 `community` 패키지다** — `product`가 `product_like`를 알면 의존 방향이 뒤집히므로
  (ADR-0007 결정 7) 같은 경로를 `params = "liked"` 조건으로 나눠 컨트롤러 둘이 나눠 받는다.
- **마스터 6종 중 사용자용으로 만든 것은 둘이다**(DERO-325 백엔드 · 335 프론트 배선 완료):
  **`/categories`**(라이브러리 레일을 `parent_id IS NULL` 대분류로 동적 구성 — ADR-0017 결정 4)와
  **`/desk-textures`**(책상 재질 — 프론트 임시표 `DESK_TEXTURE_ID_TO_MATERIAL`은 이때 삭제됐고
  재질 선택 UI·렌더 스킨이 모두 이 응답에서 나온다). `/brands`·`/vibes`·`/hashtags`는 시뮬레이터가
  읽지 않아 보류. `/vesa-specs`도 보류다 — 판정에 필요한 것은 VESA **값 문자열**이고 그건 제품 응답에
  실려 온다(아래 §9).

### `/products` 아래 없는 엔드포인트는 404가 아니라 400으로 온다

**`GET /products/{productId}`가 리터럴 경로를 전부 삼킨다.** 2026-08-07 실측: `GET /products/suggestions?q=…`가 매핑 없는 서버에서 `400 INVALID_INPUT` + `errors[0].field=productId`("숫자 형식이어야 합니다")였다. **증상이 400이라 "프론트가 파라미터를 잘못 보냈다"로 오진하기 쉽다** — `field`가 `productId`인데 내가 그 경로 변수를 안 보냈다면 그건 "그 엔드포인트가 이 서버에 없다"는 뜻이다(브랜치가 안 머지됐거나 옛 판이 떠 있다). 새 리터럴 하위 경로를 추가할 때 Spring이 `/{productId}`보다 정확 매치를 먼저 고르므로 순서 조정은 필요 없다.

## 6. 게시글 (COM) → ADR-0011·0013

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET | `/posts` 🔓 | 목록. `?hashtag`·`?owner`·`?cursor` | REQ-COM-12 |
| GET | `/posts?q=` 🔓 | **서버 검색**(2026-08-07, DERO-491 — ADR-0027). ES가 관련도 순으로 게시글 id를 주고 본문은 Postgres에서 읽는다. 검색 대상은 **제목·본문·태그·작성자 닉네임**이고 넷 중 하나만 맞아도 걸린다 — 종전 `CommunityGallery` 클라이언트 필터의 동작 그대로다(그 필터는 DERO-492에서 걷혔다 — 화면은 이제 이 파라미터를 탄다). `hashtag`·`owner` 필터와 **같이** 걸린다. **작성자는 별도 결과 섹션이 아니다**: `users` 인덱스에서 닉네임이 맞은 userId를 찾아 게시글 질의의 필터로 넘긴다(ADR-0027 결정 2 — 결과를 사람/글로 나누지 않는다). **커서에 담기는 값이 다르다** — 최신순은 마지막 id, 검색은 오프셋(불투명 문자열이라 호출부는 영향 없음). 본문의 `[[placement:ID]]` 토큰은 **색인에서 걷는다**(Postgres 정본은 그대로) — 안 걷으면 `placement`와 배치 id 숫자가 검색어로 걸린다. ES가 죽으면 **503 `POST_SEARCH_UNAVAILABLE`**(닉네임 쪽이면 `USER_SEARCH_UNAVAILABLE`), 폴백 없음 | REQ-COM-12 |
| POST | `/posts` 🔒 | 작성 → 201 | REQ-COM-12 |
| GET/PUT/DELETE | `/posts/{id}` | 상세·수정·삭제 | REQ-COM-12 |
| POST | `/posts/{id}/images/upload-urls` 🔒 | presigned PUT 발급 | — |
| POST | `/posts/{id}/images` 🔒 | key 등록 → 201 | — |
| DELETE | `/posts/{id}/images/{imageId}` 🔒 | 이미지 삭제 | — |
| GET/PUT/DELETE | `/posts/{id}/like` 🔒 | 좋아요 — `GET`은 상태 조회(2026-08-02 역기입) | — |
| GET/POST | `/posts/{id}/comments` 🔓/🔒 | 댓글 — ⚠ **미구현**(2026-08-10 실측: `PostController`에 posts CRUD 5개뿐, `PostComment` 엔티티만 존재). 화면 댓글은 세션 메모리라 새로고침에 증발한다. 데스크피드 쪽은 `desk_feed_comment` 실구현으로 처방(REQ-COM-17), 커뮤니티 쪽 배선은 별건 | — |
| DELETE | `/posts/{id}/comments/{commentId}` 🔒 | 댓글 삭제 — ⚠ 위와 같이 미구현 | — |

- **배치 참조 엔드포인트가 없다.** 참조는 본문 `content` 안의 `[[placement:ID]]` 토큰이 전부다(ADR-0013).
  프론트는 토큰에서 뽑은 id들을 **`GET /placements?ids=…` 한 번**으로 가져온다 — 글 하나에 배치가 여러 개라
  개별 조회하면 왕복이 N번이 된다. 이게 §1 규칙 3(부분집합=쿼리)을 고른 결정적 이유다.
- **삽입 후보 목록**은 `GET /placements?owner=me&publishStatus=PUBLIC`이다(ADR-0013 결정 3 — 본인의 공개 배치만).
- **게시글에 북마크는 없다**(ADR-0013 결정 6). 좋아요·댓글은 배치와 **대상별로 테이블이 따로**라
  경로도 따로다.

## 6-보. 데스크피드 (COM) → D32·ADR-0033 — **구현 완료** (콘텐츠 계약은 D34·ADR-0037 개정 반영 중)

2026-08-10 확정·구현(REQ-COM-17). 종전 데스크피드가 쓰던 `GET/POST /posts` + 마커 해시태그 경로를 대체한다.
백엔드는 DERO-560·561, 프론트는 562~566에서 붙었다. **2026-08-11 D34·ADR-0037(에디터 회귀·SEO)로
콘텐츠 계약이 재개정됐다** — 아래 표의 각 행 주석이 정본이고, 구현 전까지 운영은 ADR-0036 계약으로 돈다.

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET | `/desk-feeds` 🔓 | 목록. `?hashtag`(사용자 태그 — 마커 점유가 사라져 칩 필터가 성립) ·`?owner`·`?placementId`(역방향 — "이 배치의 실사 사진")·`?sort=latest\|popular`·`?cursor`·`?size` | REQ-COM-16·17 |
| POST | `/desk-feeds` 🔒 | 작성 → 201. **`title` 필수(≤100)·`content` 마크다운 본문 필수**(인라인 `![alt](key)` **1~30장** — 2026-08-11 DERO-613이 상한을 10장에서 올렸다. 본문 안 위치가 순서 정본 — 2026-08-11 ADR-0037이 ADR-0036의 plain text·선택을 재개정)·태그 ≤5·`productIds` ≤10(사용된 제품 — 초과는 400, 존재하지 않거나 삭제된 제품은 422)·`placementId` 선택(본인 PUBLIC 배치만 — 아니면 422) | REQ-COM-16 |
| GET/PUT/DELETE | `/desk-feeds/{id}` | 상세·수정·삭제. **GET은 비로그인 공개**(ADR-0037 결정 4 — `liked`·본인 판정은 응답에서 빼고 별도 클라 조회로 분리, SSR·크롤러가 이 응답을 읽는다). PUT은 `title`·`content`(마크다운 — 이미지 순서는 본문이 정본)·태그·`productIds`·`placementId` 첨부/해제. ~~`imageKeys` 전체 교체~~는 ADR-0037이 폐기(이미지 등록/삭제 엔드포인트로 회귀). 상세 응답에 `usedProducts` 제품 요약 카드(내부 링크용 — 소프트삭제 제품은 숨김) | REQ-COM-16·17 |
| POST | `/desk-feeds/{id}/images/upload-urls` 🔒 | presigned PUT 발급(post 이미지와 같은 2단계, MIME은 `image/webp`만 — ADR-0035) | — |
| POST/DELETE | `/desk-feeds/{id}/images`(`/{imageId}`) 🔒 | key 등록·삭제 (ADR-0037 — `00b4a6a1` 원형에서 `isPrimary`·`displayOrder` 파라미터 없이. 레지스트리 소속만 기록, 순서는 본문이 정본) | — |
| PUT | `/desk-feeds/{id}/images/{imageId}/products` 🔒 | **사진별 제품 태그 전체 교체** → 200(D37 개정·ADR-0040). body `{ productIds }`는 **필수**이고 빈 배열이 곧 "태그 없음"이다(null과 갈리면 "안 건드림"으로 읽힌다). **글 단위 `usedProducts` 목록의 부분집합만 허용** — 그 밖의 제품은 422(상세 응답이 id만 실어 화면이 그 목록에서 이름·가격을 찾는다). 사진별 상한은 없다(글 단위 ≤10이 천장). 상세 응답의 `images[]`에 `productIds`가 함께 실린다 | REQ-COM-16 |
| GET/PUT/DELETE | `/desk-feeds/{id}/like` 🔒 | 좋아요 — post와 같은 3동사 계약 | — |
| GET/POST | `/desk-feeds/{id}/comments` 🔓/🔒 | 댓글 — **실구현**(post 댓글과 달리 처음부터 영속) | REQ-COM-16 |
| DELETE | `/desk-feeds/{id}/comments/{commentId}` 🔒 | 댓글 삭제(본인만) | — |

- **멘션 해석은 서버가 동봉한다**(D35·ADR-0038 결정 2) — 목록·상세·댓글 응답에 `mentions: [{userId,
  nickname}]`이 실린다. 본문·댓글 텍스트에는 닉네임이 아니라 **안정 userId 토큰 `[[user:ID]]`**만
  저장되고(닉변·닉네임 재선점에 안전), 프론트는 이 표로 치환만 한다. **탈퇴·부재 사용자는 목록에서
  빠진다** — 화면 폴백("@알 수 없음", 링크 없음)이 "목록에 없으면" 한 조건으로 서게 하려는 계약이다.
  스키마 변경 없음(멘션 컬럼·정션 테이블 부결).

- ~~프론트는 `PUT imageKeys` 전체 교체로 `display_order`를 정한다~~ → **이미지는 등록/삭제 엔드포인트, 순서는 본문이 정본** (2026-08-11 ADR-0037 — ADR-0036의 전체 교체 계약을 재폐기. 정본 왕복 이력: 0034 폐기 → 0036 부활 → 0037 재폐기). 목록 응답은 대표 이미지 key(본문 첫 이미지)와 `imageCount`(레지스트리 카운트)를 내려준다 — 카드 사진 수 뱃지·라이트박스용.
- **첨부 후보 목록**은 `GET /placements?owner=me&publishStatus=PUBLIC` 재사용이다 — post 토큰 삽입 후보와 같은 쿼리(ADR-0013 결정 3).
- **검색 파라미터(`?q=`)는 없다** — ES 색인은 후속(ADR-0033 결정 6).

## 7. 커머스

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET/POST | `/cart-items` 🔒 | 장바구니 목록·담기 | — |
| PATCH/DELETE | `/cart-items/{id}` 🔒 | 수량 변경·빼기 | — |
| GET/POST | `/bookmark-groups` 🔒 | 북마크 그룹 | REQ-COM-08 |
| PATCH/DELETE | `/bookmark-groups/{id}` 🔒 | 그룹 수정·삭제 | REQ-COM-08 |

**`GET /bookmarks`는 없어졌다**(2026-08-02 역기입, DERO-343 · 승인 박동규). 342가 잠정으로 판
경로이고 그때 이미 "배치 목록이 생기면 흡수하고 지운다"고 적혀 있었다 — §1 규칙 3(부분집합=쿼리)대로
`GET /placements?bookmarked=me`(+`?bookmarkGroup=`)가 그 자리를 가져갔다(§4). 응답이 북마크 행이
아니라 배치 요약이라 마이페이지 카드가 썸네일 URL과 배치 상세 링크를 그대로 쓴다 — 잠정 응답
`BookmarkResponse`가 `thumbnail_key` 원문만 실어 못 그리던 자리다. **담은 시각 정렬은 잃었다**:
`?bookmarked=me`의 정렬은 배치 최신순(`?sort=latest`)이지 북마크 순서가 아니다.

**`PUT /placements/{id}/bookmark`의 본문 없음은 "그룹 유지"다**(같은 날 개정). 본문 없음 = 담기만 하고
그룹을 안 건드림 · `{"groupId": 3}` = 이동 · `{"groupId": null}` = 명시적 해제. 그룹 선택 UI가 없는
갤러리 카드가 쏘는 빈 `PUT`이 이동으로 해석되면 이미 그룹에 담아 둔 북마크가 사용자가 시킨 적 없이
풀린다 — 342가 카드 북마크를 로컬 스토어로 남겨 둔 이유 둘 중 하나였다.

`cart` 테이블이 없으므로(사용자당 1개라 껍데기, GLOSSARY §2) 경로도 톱레벨 `/cart-items`다.

## 8. 계산 — 저장하지 않는 것

| 메서드 | 경로 | 상태 | 설명 | REQ |
|---|---|---|---|---|
| POST | `/compatibility/judgments` 🔓 | **200** | 적합/조건부/불가 + 사유 수치 | REQ-CMP-01~04 |
| POST | `/compatibility/alternatives` 🔓 | 200 | "불가" 시 대안 제품 | REQ-CMP-06 |
| POST | `/recommendations` 🔓 | 200 | 예산·니즈 기반 세팅 추천 | REQ-REC-02 |

**201이 아니라 200인 이유**: 결과를 저장하지 않으므로(ADR-0004) 만들어진 리소스가 없고 줄
`Location`도 없다. 이 셋이 §1 규칙 1⑵의 전부다.

## 9. 관리자 (ADM) 🛡️ → `docs/context/asset-pipeline.md`

| 메서드 | 경로 | 설명 | REQ |
|---|---|---|---|
| GET | `/admin/products` | 검수 대기 등 관리 목록. `?status`·`?brandId`·`?categoryId`·`?keyword`(제품명 부분 검색)·**`?page=&size=`(offset)** | REQ-ADM-04 |
| POST | `/admin/search/reindex` | **검색 전량 재색인**(2026-08-06, DERO-384). 새 인덱스를 채운 뒤 별칭만 스왑해 **도는 동안에도 검색이 산다**. 색인 수를 돌려준다. `AFTER_COMMIT` 이벤트 색인이 실패했을 때의 복구 수단이다(ADR-0019 결정 3) | — |
| POST | `/admin/search/posts/reindex` · `/admin/search/users/reindex` | **게시글·닉네임 인덱스 전량 재색인**(2026-08-07, DERO-491). 제품과 같은 절차·같은 응답 본문(`indexedCount`)이다. 제품이 먼저 `/reindex`를 차지했으므로 뒤에 붙는 인덱스는 이름을 붙여 가른다 | — |
| POST | `/admin/search/placements/reindex` | **배치 인덱스 전량 재색인**(2026-08-07, DERO-490). 같은 절차·같은 응답 본문이다. **부팅은 빈 인덱스만 만들므로 배포 후 한 번은 눌러야 한다** — 안 누르면 에러도 로그도 없이 검색이 0건이다 | — |
| POST | `/admin/products` | 제품 등록(규격 메타데이터) → 201 | REQ-ADM-01 |
| PATCH | `/admin/products/{id}` | 규격·메타데이터 수정 | REQ-ADM-02 |
| DELETE | `/admin/products/{id}` | 삭제 | REQ-ADM-02 |
| PUT | `/admin/products/{id}/review` | 승인·반려(본문에 결과·사유) → 204 | REQ-ADM-04 |
| POST | `/admin/products/{id}/asset/upload-url` | GLB presign 발급 → 200 | REQ-ADM-01 |
| PUT | `/admin/products/{id}/asset` | key + `exportMode`·`finish`·`rigManifest` 등록. 재업로드 = 같은 PUT 덮어씀 → 200 | REQ-ADM-01 |
| PUT | `/admin/products/{id}/emitter` | 발광 저작값 upsert → 200 | REQ-ADM-01 |
| DELETE | `/admin/products/{id}/emitter` | 발광 없는 제품으로 → 204 | REQ-ADM-02 |
| PUT/DELETE | `/admin/placements/{id}/template` | 템플릿 시딩·해제 | REQ-ADM-03 |

마스터 6종(2026-07-31 확장, 승인 박동규 — 시드 데이터를 SQL이 아니라 관리자 UI로 넣는다):

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET/POST · PATCH/DELETE `/{id}` | `/admin/brands` · `/admin/categories` · `/admin/vibes` · `/admin/hashtags` · `/admin/vesa-specs` · `/admin/desk-textures` | 전부 offset. 이름 충돌 409 |
| POST | `/admin/brands/{id}/logo/upload-url` | 로고 presign |
| POST | `/admin/desk-textures/{id}/map-upload-urls` | 맵 3종(albedo·roughness·normal) presign. key 등록은 `PATCH /admin/desk-textures/{id}` 본문 — 별도 등록 엔드포인트 없음 |

- **검수 대상은 `asset`이 아니라 `product`다** — 사용자 업로드도 `product` 행이기 때문이다(D20).
- `GET /products/{id}` 단건 상세는 **공유한다**. 표현이 같고 페이지네이션이 없다. 단 `PENDING`/`REJECTED` 자작 제품은 업로더 본인 외에 **ADMIN도** 열람한다 — 검수자가 못 보면 검수가 성립하지 않는다.
- **에셋 DELETE는 없다.** 에셋 없는 제품이 유효한 건 `DESK`뿐이라 "제거"가 유효 상태가 아니다 — 교체는 같은 PUT.
- **제품 이미지는 §5 경로를 재사용한다**(권한을 "owner **또는** ADMIN"으로) + 대표 지정 `PUT /products/{id}/images/{imageId}/primary` → 204(규칙 2 토글 패턴, 서버가 기존 대표 해제).
- **운영진 등록 에셋은 즉시 `APPROVED`다**(erd.md asset 절) — 검수 큐는 자작 업로드용이다.
- **VESA 태깅은 제품 등록·수정 본문에 실린다**(2026-08-01 확정, 승인 박동규 — 신설). `product_vesa`
  조인 테이블과 마스터 CRUD는 있는데 **제품에 붙이는 경로가 통째로 없었다** — `AdminProductCreateRequest`·
  `AdminProductPatchRequest`에 `vesaSpecIds`가 없고 `ProductDetailResponse`에도 VESA가 없어서,
  REQ-CMP-02(모니터↔암 VESA 일치)와 REQ-SIM-22(자석 결합 3단계 판정)의 **입력이 백엔드에서 안 나왔다**.
  별도 하위 리소스(`PUT /admin/products/{id}/vesa-specs`)를 파지 않는다 — 규격의 일부라 제품 본문과
  같은 트랜잭션에서 굳는 게 맞고, 등록자가 규격을 입력하는 화면이 곧 그 화면이다.
  `product_vibe`·`product_hashtag`도 같은 구멍이지만 **이번엔 안 만든다** — 시뮬레이터가 읽지 않는다.

## 10. 잠정·미정

| 항목 | 막는 것 |
|---|---|
| ~~⏳ GLB 에셋 업로드 경로~~ | **확정 (2026-07-31, 승인 박동규 — 136 선결정)**: presign 2단계 계약 고정(§9). 131이 미결이어도 계약은 그대로 두고 **presign 발급을 `infra` 포트 뒤에 숨겨** 로컬 구현(WAS 서명 URL + 로컬 볼륨)으로 시작한다 — 131이 S3/CloudFront를 고르면 포트 구현만 교체, API·DB 무변경. 근거는 ADR 예정 |
| ⏳ AI 상상도 미리 보기 | **보류**(2026-07-31) — 생성 입구는 업로드 하나로 유지. 나중에 붙이면 한도·상태기계를 같이 재검토 |
| ~~미정~~ | **확정 (2026-08-01, D28)**: `?sort=latest`(기본)·`popular`(좋아요순) 2값. 팔로잉 피드는 안 만든다 |
| 미정 | 결제 모델(구독형 vs 크레딧형). `GET /users/me/image-quota`와 429 코드는 어느 쪽이 와도 재사용된다 |

## 11. 2026-07-31 재설계에서 삭제된 것

옛 판에 있었으나 **의도적으로 없앤** 경로다. 다시 만들지 말 것.

| 삭제된 경로 | 왜 |
|---|---|
| `/products/desks` | 필터를 경로로 올린 것. `/products?specType=DESK`로 흡수 |
| `/products/images/presign` | 대상이 경로에 없어 권한 검사가 분기 하나로 뭉친다. `/products/{id}/images/upload-urls`로 대체 |
| `GET /placements/{id}/thumbnail`(바이트 반환) | 파일 서빙 엔드포인트를 만들지 않는다 — presigned URL이 응답에 실린다 |
| `POST /placements/{id}/save` | `POST`/`PUT /placements`가 흡수(ADR-0009) |
| `/placements/{id}/items/*` 7종 | 아이템은 URL을 갖지 않는다(위 §4) |
| `PATCH /placements/{id}/visibility` | `PUT`/`DELETE /placements/{id}/feed-entry`로 대체. `visibility` 컬럼 자체가 `publish_status`로 개명됐다 |
| `POST /placements/{id}/remix` | 명사 `remixes`로. 클라이언트 복사 방식도 폐기 |
| `POST /placements/{id}/generated-images` | 생성 입구는 업로드 하나(§10 보류 항목) |
| `/users/me/products/{id}` | `?owner=me` + `/products/{id}`로 충분 |
| `DELETE /comments/{id}` | 대상이 둘(배치·게시글)이라 중첩 경로로 가름 |

## 12. 프론트 소비 상태 — per-domain (2026-08-14 이주, H-21)

`frontend/src/api/CLAUDE.md` 종전 per-domain 표 전문. **현재 상태(mock/real·조용히 깨지는 지점)의 정본은 그 파일의 감축 표**이고,
여기는 감축 때 내린 상세 — 엔드포인트 경로·파라미터·티켓 번호·날짜·삭제된 대안 — 의 보존본이다(예: 감축 표에만 있는 Desk feed 행은 표 스냅샷 이후 신설).
원 출처: DERO-546 H-21 주차 파일(2026-08-14 이주 완료·삭제).

### Per-domain 상세 표 (이주 시점 2026-08-14 기준 아카이브 — **현재 상태 정본은 `frontend/src/api/CLAUDE.md`의 감축 표**, 이 표는 경로·티켓·날짜·삭제된 대안의 상세 보존본이다)

| Domain | File | State |
|---|---|---|
| Auth | `auth/actualAdapter.ts` | real only (port/adapter) |
| Onboarding (terms, nickname) | `onboarding.ts` | real only (plain functions) — `GET /terms`, `POST /users/me/consents`, `PATCH /users/me`. Onboarding-complete is not here: it rides on `UserSession.onboardingRequired` (auth adapter) |
| Placement save/list/upload | `placement.ts`, `craft.ts` | real only (plain functions). `listPlacements` takes an options object: `owner` (incl. `'me'`), `publishStatus`, `ids`, `bookmarked` (`'me'`, logged-in only), `bookmarkGroup` (only together with `bookmarked`), `sort`, `cursor`, `size`. **Remix = `createPlacementRemix`/`listPlacementRemixes`** (DERO-343) — the server must do the copy for `PlacementDetailResponse.sourcePlacement` (origin) to be recorded. **`/craft` must pass `owner: 'me'`**: the list is optionally authenticated, so omitting it returns "everything public + mine" with no error and no symptom besides the count (2026-08-01, DERO-339). **Upload (feed publish) is 3 functions: `publishPlacementToFeed`/`unpublishPlacementFromFeed`/`getGeneratedImages`** (DERO-340, -341). `PUT feed-entry` returns **202 with no body** — success means "queued", not "live in the feed", and since no endpoint reports progress, callers poll `getPlacement(id).publishStatus`. **Since 2026-08-02 the single poller is the global watcher `components/common/UploadWatcherBootstrap.tsx`** (was `craft/DeskPublishControl.tsx`; lifted so done/failed notifications reach the top bell even after leaving the screen). **Retry is the same PUT** — calling it again from `FAILED` re-queues. Failure text comes straight from the server `detail` via `utils/placementPublishError.ts` |
| Product image upload | `productImage.ts` | real only (plain functions) |
| Desk template cards (`/craft/new`) | `getDeskTemplates` in `product.ts` | mock/real branch (`isMockApi()`) — `GET /products?specType=DESK` |
| Full catalog (simulator) | `getDeskTextures`/`getProductPage` in `product.ts` | mock/real branch — `GET /desk-textures`, `/products` (cursor pages of 20 via `useCatalogPage`; **`q=` is server search since 2026-08-06** — Elasticsearch + Nori, ADR-0019; it coexists with cursor and categoryId, **has no fallback** and answers 503 `PRODUCT_SEARCH_UNAVAILABLE` when ES is down, which callers must show rather than render as 0 results; the old fetch-everything `prefetchCatalog` was deleted 2026-08-05 when `/product` also moved to cursor paging). Server `categoryId` filtering is on since 2026-08-05: group/sub `categoryId`s are hardcoded from the **live DB category tree** (roots 52–61, subs 62–78 — measured via `GET /categories`; local and www.dero.life are seeded identically. ⚠ the repo seed file `product-catalog-seed.sql` still says flat 900–908 and is stale — hardcoding those returned 0 products everywhere). A group is one root id (the server rolls up the subtree — sending root+children ids duplicates products, `categoryIdsOf()` guards this); multi-id sequential cursor streams in `useCatalogPage` remain for 소분류 multi-select. `getCategories` was deleted 2026-08-05 — categories are a static frontend canon (`constants/productCategoryGroup.ts`), `GET /categories` is never called. **The consumer is the engine, not the API layer**: `setCatalog()` in `three/scene/product.ts` takes it and swaps the source behind `getProduct`/`libraryItems`, triggered only by `initEngine` in `simulatorStore.ts` (simulator boot) — pages that never boot the simulator (e.g. mypage) still see mock `PRODUCTS`. **`getDeskTextures` alone has two consumers** (DERO-335): besides engine boot, `components/craft/CraftDeskPicker.tsx` (new-deskterior wizard) calls it directly because that screen must draw material choices without an engine. `initEngine` also calls this one **in mock mode** (the other two are real-only) — both modes need it to resolve a saved placement's `deskTextureId` into a render skin |
| Product list/detail (`/product`, `/product/[productId]`) | `components/product/ProductGrid.tsx` (list, client), `app/product/[productId]/page.tsx` (detail, server) | mock/real branch. **List is client cursor paging since 2026-08-05**: `ProductGrid` calls `useCatalogPage(categoryIds)` — same hook, page size (20) and per-id stream behavior as the simulator row above; `app/product/page.tsx` no longer prefetches in real mode (mock still passes the static `libraryItems()` array down). Search/sort/like filters therefore only cover loaded pages (user-accepted trade, reversing the 2026-08-02 full-prefetch decision). Detail stays a Server Component on `GET /products/{id}` (`getProductById`). ARM specs carry `ARM_FALLBACK_DIMS_MM` tagged `meshDerivedDims: true` and are only measured later by `ensureTemplate` on the simulator path — harmless on a screen with no 3D placement or collision. **`getProductById` has had two consumers since 2026-08-02** — the product detail page and collection detail's "used items" (`CollectionDetail` dedupes `items[].productId` from `GET /placements/{id}` and fires them in parallel; that path skips `toProductSpec` since name/brand/price/image are already in the DTO). Bulk `?ids=` exists as `ProductCatalogService.listByIds()` in the backend but is not exposed over HTTP — that is the right answer once item counts grow |
| Collection list | `collection.ts` | **real only** (2026-08-01, DERO-339 — mock generator `components/collection/collectionPosts.ts` deleted). `getCollectionPage(sort, cursor, q, tag)` hits `GET /placements?publishStatus=PUBLIC` (**`q=` is server search since 2026-08-07**, DERO-492 · ADR-0027 — relevance order replaces `sort`, **no fallback**, 503 `PLACEMENT_SEARCH_UNAVAILABLE` when ES is down and callers must show it rather than render 0 results); detail entry uses `getCollectionPost(id)` fetching one summary row via `?ids=` (the detail response has no author nickname or like count). **Tags are server values since 2026-08-07** (DERO-493): the summary's `tags` goes straight onto the card, `tag` becomes `?hashtag=` (exact name match, chip filter), and tag writes are `publishPlacementToFeed(id, tags)` / `replacePlacementTags(id, tags)` — the latter is `PUT .../feed-entry/tags`, **never a second `PUT .../feed-entry`**, which would re-run the publish gate and burn image quota. Bookmark counts still have no endpoint and stay 0. **The cover is only `primaryImageUrl`** (one representative AI image, 2026-08-02): `toCollectionPost` puts it in `CollectionPost.thumbnailUrl`, and the server summary's `thumbnailUrl` (3D screenshot) is unused in the feed (it is for workspace cards, ADR-0015 decision 7). List and detail share the same summary, so both screens show the same image |
| Community posts | `post.ts` (raw) + `community.ts` (view-model seam) | **real only** (2026-08-03, DERO-345) — `GET/POST/PUT/DELETE /posts` (**`?q=` is server search since 2026-08-07**, DERO-492 · ADR-0027; it coexists with `hashtag`/`owner`, has **no fallback**, and answers 503 `POST_SEARCH_UNAVAILABLE` when ES is down), body images via 2-step presign (`/posts/{id}/images/upload-urls` → browser PUT → `POST /posts/{id}/images`). `community.ts` only maps `PostSummaryResponse`/`PostDetailResponse` → `CommunityPost` (screen model); components use that, writes/uploads use `post.ts`. **Image presign requires the post to exist first** — new posts must go `POST /posts` → upload → replace body blob URLs → `PUT /posts/{id}`. The list response has no per-user `liked` or bookmark (bookmarks do not exist at all — ADR-0013 decision 6): list hearts/bookmarks come from the local override store, only detail reads the server via `GET /posts/{id}/like` |
| Community comments | none | No post-comment endpoint in the contract — lives only in `store/communityCommentsStore.ts` (session memory). Placement comments (`comment.ts`) are a different resource, not reusable |
| My liked products | `getLikedProducts` in `product.ts` | real only — `GET /products?liked=me` (🔒, DERO-356). Elements are the same `ProductDetailResponse` as the catalog list, so `catalogAdapter.toProductSpec` is reused as-is. **Sole consumer is `syncFromServer()` in `store/productLikesStore.ts`** — in real mode the server is canon for product likes (toggles are written via `interaction.ts` PUT/DELETE), and at boot `PersistedInteractionsBootstrap` overwrites the localStorage value with this after confirming login. `syncFromServer()` **returns the received products** because mypage likes have no simulator engine catalog (`libraryItems()` is still mock) and cannot draw cards from ids alone — fetching separately would duplicate the request and blank the list in between. **Keys differ per mode**: mock `'monitor-27'`, real `'27'` (`String(dto.id)`) |
| Like / bookmark toggle | `interaction.ts` | real only (plain functions, DERO-342) — `PUT/DELETE/GET /{placements\|products\|posts}/{id}/like`, `/placements/{id}/bookmark`. Toggles are idempotent 204 (no body), so **callers re-confirm with a GET after success** — client-computed counts drift on rapid clicks. Saving a bookmark and moving its group are the same single PUT (no move-only endpoint) — **with no body it is a partial update that only adds and leaves the existing group alone**, so gallery cards without a group picker use `putPlacementBookmarkKeepingGroup` (sending `{groupId: null}` silently unassigns an existing group, DERO-343). Post (`posts`) likes exist as functions with no consumer — community has nowhere to attach yet |
| Bookmark group CRUD | `bookmark.ts` | real only — `GET/POST/PATCH/DELETE /bookmark-groups`. **The list of bookmarked placements is not here** — it is `GET /placements?bookmarked=me&bookmarkGroup=` (`placement.ts`); the former `GET /bookmarks` was deleted 2026-08-02 (DERO-343) because the placement summary already carries a presigned thumbnail URL and the placement id, giving mypage cards their image and detail link. `bookmarkGroup` is valid only alongside `bookmarked=me` (400 on its own) |
| Placement comments | `comment.ts` | real only — `GET/POST /placements/{id}/comments`, `DELETE .../{commentId}`. Only the list GET returns 200 when logged out |
| Profile / follow / profile image / image quota | `user.ts` | real only (plain functions, DERO-344) — `GET /users/{id}` (200 logged out), `PUT/DELETE /users/{id}/follow` (idempotent 204), `GET /users/{id}/followers` and `/following` (cursor), `POST /users/me/profile-image/upload-url` + `PUT /users/me/profile-image` (2-step presign), `GET /users/me/image-quota`. **Follow toggle is also 204, so the response has no new follower count** — callers re-confirm with `getUserProfile` (same convention as likes; no localStorage). `UserProfileResponse.following` is **always false when logged out**, indistinguishable from "not following". Self-follow is 422 `USER_SELF_FOLLOW_NOT_ALLOWED`, so the screen does not render the button at all. Types are hand-written in `types/user.ts` (regeneration needs a running backend — same precedent as `types/placement.ts`) |
| Cart | none (**deliberately deleted**) | **Backend `/cart-items` (GET/POST, PATCH/DELETE) and the `cart_item` table are alive, but no frontend code calls them** — the `/cart` screen, `AddToCartButton`, `api/cart.ts` and `types/cart.ts` were deleted on 2026-08-02 at the user's request (scope fixed as: leave the backend). Do not "restore" the frontend just because you saw a dead API — reviving means `git revert` of that commit, and ask 박동규 first |
| Compatibility judgment | `compatibility.ts` | real only (plain functions) — `POST /compatibility/judgments` (200, not persisted, allowed logged out). **It is not that there is no mock branch — in mock mode it is never called**: mock catalog spec ids are not backend `product.id`, so the server cannot resolve them. That gate lives in the caller (`simulatorStore.confirmMountWithServer`), not the API layer. The frontend `collision.ts` judgment stays — it is the 0ms mirror, overwritten when the server response arrives (ADR-0004, ADR-0009 decision 6) |
| Recommendation judgment | none (not implemented) | `POST /recommendations` and `POST /compatibility/alternatives` both have 0-line backend controllers |

## 13. 에러 응답 파싱 — ProblemDetail (프론트, 같은 이주)

`frontend/src/api/CLAUDE.md` 종전 본문(감축본에서 반환 타입 시그니처와 `hasOwnProperty(...)` 구현 디테일을 내렸다).

`parseApiProblemDetail(value): ApiProblemDetail | null` in `src/utils/problemDetail.ts` validates the ADR-0008 `ProblemDetail` shape — `request()` in `client.ts` uses it for `ApiError.problem` in every domain. Auth (`src/utils/auth/problemDetail.ts`) layers only the `type` default (`about:blank`) on top for its own `ProblemDetail`; new domains never need to handle `type`.
- **Do not fail-closed on a body without an `errors` key** (2026-08-01 measured bug, fixed). Backend `ProblemDetails.of` carries only `code` and `instance`; `errors` is added by `GlobalExceptionHandler` **only for validation failures** (Bean Validation, type mismatch) — 401/403/404/409 bodies have no such key. The parser required `hasOwnProperty('errors')`, so those responses all returned `null`, `ApiError.problem` went empty, and **the Korean `detail` and the `code` the frontend branches on vanished together.** It surfaced in the 401 auto-rotation: `AUTH_SESSION_REVOKED` was misclassified as ordinary expiry and refresh fired once more at an unrecoverable session. **No error is thrown, so it is invisible** (just a generic message and one extra retry). Before requiring a new field, confirm in `ProblemDetails.of` that the backend puts it on **every** response.
