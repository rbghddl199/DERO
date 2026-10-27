# 0017 — 제품 카탈로그: 목록이 통짜 상세를 반환하고, 프론트 목업 카탈로그와 배타 전환한다

## 상태

확정 (2026-08-01, 승인 박동규 — 그릴링 세션)

## 맥락

관리자 등록 도구가 완성되어(REQ-ADM-01·02) 실제 모니터암·조명의 규격과 GLB를 admin으로 넣기
시작했다. 그 데이터가 시뮬레이터 화면에서 실제로 도는지 확인하는 것이 이번 라운드의 목적이다.

그런데 시뮬레이터가 백엔드에서 읽는 경로가 사실상 없었다.

- `GET /products`는 **`specType=DESK` 전용**이었다 — 응답 타입이 `DeskSummaryResponse`로 박혀
  있고 구현된 규격 목록 쿼리가 책상 하나뿐이라 `specType`이 필수였다.
- 라이브러리 패널이 읽는 카탈로그 정본은 프론트 코드의 `PRODUCTS`(`three/scene/product.ts`)와
  `glbLibrary`였다. 백엔드 제품과 잇는 `PRODUCT_ID_TO_SPEC_ID`는 **빈 채로** 남아, 배치 저장 시
  매핑 없는 아이템이 조용히 스킵됐다.
- 카드 미리보기는 **빌드타임 정적 PNG**(`scripts/generate-thumbnails.mjs`)라 빌드 시점에 없던
  제품은 카드가 통째로 빈다 — 실 데이터에 원리적으로 대응 불가.

즉 "admin에 넣은 것이 시뮬레이터에 뜨는가"를 물을 수 있는 배선 자체가 없었다. 이 ADR은 그
배선을 여는 결정 묶음이다. **다섯 결정이 서로의 근거라 따로 읽으면 각각이 자의적으로 보인다** —
그래서 한 문서로 묶는다.

## 결정

1. **목록이 통짜 상세를 반환한다.** `GET /products`의 원소는 `ProductDetailResponse`이고
   규격 5종 중 하나 + `asset`(presigned GLB URL·`rigManifest`·`finish`) + `emitter` +
   대표 실사 이미지를 싣는다. 커서 페이지네이션(`id asc`)은 그대로다.
   - 엔진은 드래그를 **시작하기 전에** 이미 GLB가 필요하다 — 고스트 프리뷰가 반투명 실물이고
     카드 썸네일도 GLB에서 나온다. "드롭할 때 상세를 부른다"는 성립하지 않는다.
   - `presigned GET URL TTL은 15분`이므로(`LocalPresignService`) 목록 응답은 "지금 로드하라"는
     뜻이다. 응답을 캐시하지 않는다.

2. **컬렉션 응답 모양은 하나다.** `DeskSummaryResponse`를 삭제하고 책상도 같은 원소를 쓴다.
   한 컬렉션이 `specType`에 따라 다른 스키마를 뱉는 상태를 만들지 않는다.

3. **실 모드와 목업 모드는 배타다.** `isMockApi()`가 참이면 100% 프론트 로컬 카탈로그,
   거짓이면 100% 백엔드다. **병합하지 않는다** — `PRODUCT_ID_TO_SPEC_ID` 같은 id 매핑표를
   영구 자산으로 만들지 않기 위해서다. 프론트 `PRODUCTS`·`glbLibrary`는 **목업이지 정본이
   아니다**(2026-08-01 확인, 박동규).

4. **`category`는 표시·필터 전용으로 격하한다.** 절차 생성 분기의 판별자는 `specType`이다.
   - 엔진 `ProductCategory`(10값 닫힌 유니온)는 `props.ts`의 절차 생성 `switch`와 라이브러리
     레일 필터 두 곳에서만 쓰였다. **실 데이터는 전부 GLB라 절차 생성 분기를 안 탄다** — 남는
     예외는 모니터 하이브리드(REQ-SIM-15, 패널만 절차 생성)와 책상(GLB 없음, D18)이고 둘 다
     `specType`이 정확히 판별한다.
   - 백엔드 `category`는 자유 증가 마스터에 `parent_id` 계층이다. 레일은 그 마스터를 읽어
     **동적으로 구성**한다(`parent_id IS NULL` = 대분류) — admin이 카테고리를 늘려도 프론트
     배포가 필요 없다. 아이콘 매핑만 프론트에 남는다(표시 전용).

5. **에셋 없는 제품은 목록에서 제외한다.** `asset IS NULL`과 `asset.review_status`가 승인이
   아닌 제품을 서버가 거른다. `DESK`는 예외다(절차 생성이라 원래 `asset` 행이 없다 — D18).
   이 목록의 소비자는 "배치 가능한 제품"을 묻는 시뮬레이터이므로 못 놓는 것을 주는 것은 계약
   위반이다. 등록 진행률은 `/admin` 목록이 답한다.

## 대안과 버린 이유

- **1B. 얇은 목록 + 드롭 시 개별 상세** — 위 결정 1의 이유로 성립하지 않는다. 결국 패널을 열 때
  N번 부르게 되어 왕복만 늘어난다.
- **1C. 얇은 목록 + `GET /products?ids=` 벌크 상세** — 왕복 수가 1A와 같은데 엔드포인트만 둘이다.
- **3B. 로컬 + 백엔드 병합 표시** — 정본이 둘이 되고 id 매핑표가 영구화된다. 저장이 조용히
  반쪽인 상태(매핑 없는 아이템 스킵)를 계속 끌고 간다.
- **4B. `categoryId` → 엔진 유니온 매핑표** — 결정 3에서 끊은 매핑표를 다른 이름으로 되살린다.
- **5B. 다 싣고 프론트가 비활성 카드로 표시** — admin 진행률 계기판은 `/admin`이 이미 한다.
  시뮬레이터에 미완성품을 흘리는 대가로 살 것이 아니다.

## 파급

- **백엔드**
  - `ProductController.list` — `specType` 필수 해제, `categoryId` 추가, 반환을
    `CursorPage<ProductDetailResponse>`로. `DeskSummaryResponse` 삭제.
  - `ProductRepository` — 서브타입별 규격 프로젝션 5종 + `asset`·`emitter`·대표 이미지의
    **id 목록 IN 조회**. **엔티티를 통째로 읽지 않는다** — `Product.asset`·`Product.emitter`는
    역방향 nullable 1:1이라 LAZY로도 지연되지 않아 부수 SELECT가 2N이다(`product/CLAUDE.md`).
  - `GET /categories`·`GET /desk-textures` 신설(사용자용 마스터 조회는 그동안 0줄이었다).
- **프론트**
  - `api/product.ts`가 `isMockApi()` 배타 분기로 전환, 라이브러리는 카테고리별 목록을
    **끝까지 프리페치**해 스토어에 적재한다(엔진의 `getSpec(id)`가 동기라 원래 필요한 모양).
  - `CategoryIcon.tsx`의 하드코딩 레일 → 백엔드 카테고리 마스터 기반 동적 구성.
  - `props.ts`의 `switch (spec.category)`는 목업 전용 경로로 격리, 실 데이터 분기는 `specType`.
  - `CraftDeskPicker.tsx`·`types/product.ts`가 통짜 원소에 맞춰 수정. `npm run api:types`
    재생성이 세트다(**백엔드가 `local` 프로파일로 떠 있어야 한다**).
- **램프 색의 정본은 `product_emitter.default_color`(hex)다.** 프론트 `OpticalSpec.colorTempK`는
  백엔드가 hex로 정본을 확정하기 전 모델이라 파생값으로 내려간다 — 슬라이더 초기 위치만 hex→K
  역변환으로 잡는다. **저작 규칙이 딸린다: 램프의 `default_color`는 흑체 궤적 위 색이어야 한다**
  (아니면 슬라이더가 엉뚱한 눈금에서 시작). `/dev/light`·admin 발광 저작 폼에 명시할 것.
- **ERD 변경 없음.** 이 세션에서 "색온도 컬럼이 없다"·"`reach_mm`과 `radius_mm`이 중복이다"라는
  지적이 나왔으나 **둘 다 오독이었다** — `erd.md`가 이미 "렌더 도달 반경은
  `product_emitter.radius_mm`, `light`의 광학 컬럼은 카탈로그 표기 마커"로 갈랐고(2026-07-29,
  DERO-222), 램프의 제품 기본 색은 `default_color`가 담는다. 기록해 두는 이유는 같은
  오독이 반복될 자리이기 때문이다.
- **이번 라운드 밖**: 배치 저장·불러오기 API(`placement/`의 컨트롤러·서비스·리포지토리·DTO는
  2026-08-01 `ed2c8a2`로 삭제됐고 재작성 대상이다) · `?q=` 서버 검색(ES 예정) ·
  vibe·hashtag 태깅 · `/brands`·`/vibes`·`/hashtags` 사용자 조회.
