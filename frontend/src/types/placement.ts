// 배치(Placement) 도메인 와이어 타입 — 손으로 쓰지 않고 src/types/openapi.d.ts(생성 파일)에서 파생한다
import type { components } from './openapi';
import type { AlwaysPresent } from './api';

type Schemas = components['schemas'];

// 반대로 요청 스키마의 optional 필드는 `null`로도 보낼 수 있다 — Jackson이 JSON null을 그대로 Java
// null로 받는다. 프론트는 "값 없음"을 undefined가 아니라 null로 들고 다니므로(스토어·엔진 미러가 그
// 표기다) 생성 타입의 `?`에 null을 얹어 준다. 필수/선택 구분 자체는 생성 타입이 그대로 정본이다.
type NullableOptional<T> = { [K in keyof T]: undefined extends T[K] ? T[K] | null : T[K] };

export type PublishStatus = NonNullable<Schemas['PlacementDetailResponse']['publishStatus']>;
export type SpecSource = Schemas['DeskSnapshot']['specSource'];
export type FrameType = NonNullable<Schemas['DeskSnapshot']['frameType']>;
export type MountSurface = Schemas['ItemSnapshot']['surfaceType'];
export type WallSide = NonNullable<Schemas['ItemSnapshot']['wallSide']>;

// --- 저장 요청 (POST/PUT 공통 — 씬 전체 스냅샷, ADR-0009) ---
// 요청 스키마는 Bean Validation이 springdoc에 필수/선택을 알려줘 그대로 쓴다.
//
// publishStatus가 없다: PENDING·PUBLIC·FAILED는 서버만 정하고 공개는 PUT /placements/{id}/feed-entry가
// 맡는다(ADR-0015 결정 10). isVesaMounted도 없다: 결합 여부는 mountedToRef의 유무가 이미 답한다
// (ADR-0009 결정 3 "마운트 참조는 mountedToRef 하나로만").
export type DeskSnapshot = NullableOptional<Schemas['DeskSnapshot']>;
export type ItemSnapshot = NullableOptional<Schemas['ItemSnapshot']>;
// 방 표면(ADR-0030) — walls[]는 좌·전면·우 3개를 전부 실어야 하고, 일부만 오면 서버가 400이다.
// **여기만 NullableOptional을 안 씌운다** — 배열 원소는 생성 타입 그대로여야 스냅샷의
// `walls` 필드에 그대로 들어간다(내부 원소에는 그 변환이 적용되지 않기 때문).
export type WallSnapshot = Schemas['WallSnapshot'];
export type FloorSnapshot = Schemas['FloorSnapshot'];
export type PlacementSnapshot = Omit<
  NullableOptional<Schemas['PlacementSnapshotRequest']>,
  'desk' | 'items'
> & {
  desk: DeskSnapshot;
  items: ItemSnapshot[];
};

// --- 저장 응답 ---
export type ItemRefMapping = AlwaysPresent<Schemas['ItemRefMapping']>;
export type ViolationResponse = Omit<AlwaysPresent<Schemas['ViolationResponse']>, 'itemId'> & {
  itemId: number | null;
};

// version·updatedAt은 다음 저장 요청에 그대로 실어 보낸다 — 증가 폭에 기대지 말 것(한 저장에 2가
// 오르기도 한다). items는 ref → id 매핑이라 신규 아이템의 서버 id를 재조회 없이 알 수 있다.
export type PlacementSaveResponse = Omit<
  AlwaysPresent<Schemas['PlacementSaveResponse']>,
  'updatedAt' | 'items' | 'violations'
> & {
  updatedAt: string | null;
  items: ItemRefMapping[];
  violations: ViolationResponse[];
};

// --- 상세 응답 ---
export type DeskDetailResponse = Omit<
  AlwaysPresent<Schemas['DeskDetailResponse']>,
  'productId' | 'edgeThicknessMm'
> & {
  // 직접 입력 책상은 참조할 제품이 없다.
  productId: number | null;
  // NULL은 0이 아니라 "상판 두께와 동일"이다(D21).
  edgeThicknessMm: number | null;
};

export type ItemDetailResponse = Omit<
  AlwaysPresent<Schemas['ItemDetailResponse']>,
  'wallSide' | 'mountedToItemId' | 'jointValues' | 'emitterColor'
> & {
  wallSide: WallSide | null;
  mountedToItemId: number | null;
  jointValues: Record<string, number> | null;
  emitterColor: string | null;
};

// 상세 응답의 방 표면. 요청 쪽 `WallSnapshot`/`FloorSnapshot`과 필드가 같다 — 리믹스·가져오기가
// 응답을 그대로 요청으로 옮길 수 있는 이유다.
export type WallDetailResponse = AlwaysPresent<Schemas['WallDetailResponse']>;
export type FloorResponse = AlwaysPresent<Schemas['FloorResponse']>;

// 리믹스의 원본 배치 출처(DERO-343). available=false면 원본이 삭제된 것이라 링크를 걸 수 없다 —
// 그때도 "원본 없음"을 표시해야 하므로 필드 자체는 온다.
export interface SourcePlacementResponse {
  id: number;
  title: string | null;
  ownerId: number | null;
  ownerNickname: string | null;
  available: boolean;
}

// thumbnailUrl은 presigned GET URL이다 — 파일 서빙 엔드포인트를 만들지 않는다(api-spec.md §11).
// 아직 캡처 전이면 null이다.
//
// sourcePlacement는 openapi.d.ts에 아직 없어(백엔드를 띄워야 재생성된다) 손으로 얹는다 — null이면
// 리믹스가 아니라 원본 배치다.
export type PlacementDetailResponse = Omit<
  AlwaysPresent<Schemas['PlacementDetailResponse']>,
  'description' | 'budgetKrw' | 'thumbnailUrl' | 'updatedAt' | 'desk' | 'items' | 'walls' | 'floor'
> & {
  description: string | null;
  budgetKrw: number | null;
  thumbnailUrl: string | null;
  updatedAt: string | null;
  desk: DeskDetailResponse;
  items: ItemDetailResponse[];
  // 방 표면은 항상 3면이 실린다(ADR-0030) — 생성 타입은 원소의 필드까지 optional로 두므로
  // 여기서 좁힌다. 옛 서버 응답을 대비한 런타임 폴백은 `utils/roomFinish.ts`가 진다.
  walls: WallDetailResponse[];
  floor: FloorResponse;
  sourcePlacement: SourcePlacementResponse | null;
};

// --- 썸네일 2단계 presign ---
export type ThumbnailUploadUrlResponse = AlwaysPresent<Schemas['ThumbnailUploadUrlResponse']>;
export type ThumbnailRegisterRequest = Schemas['ThumbnailRegisterRequest'];

// --- 목록 ---
// GET /placements는 2026-08-01에 생겼다(DERO-339). 아직 손으로 쓴 타입인 이유는 백엔드가 떠
// 있어야만 openapi.d.ts를 다시 뽑을 수 있어서다(`npm run api:types`) — 다음 재생성 때 위 타입들처럼
// Schemas['PlacementSummaryResponse']에서 파생시킬 것. 필드는 백엔드 record와 1:1이다.
//
// ownerId·ownerNickname은 둘 다 null일 수 있다 — placement.user가 ON DELETE SET NULL이라 작성자가
// 탈퇴해도 공개 배치는 컬렉션에 남는다. thumbnailUrl은 presigned GET URL이고 캡처 전이면 null이다.
//
// 표지는 둘로 갈린다(ADR-0015 결정 7, api-spec.md §4): 컬렉션 카드는 대표 상상도 primaryImageUrl을,
// 작업실 카드는 스크린샷 thumbnailUrl을 쓴다. primaryImageUrl도 presigned GET URL이고 상상도를
// 만들기 전이면 null이다.
//
// isTemplate은 운영진 시딩 템플릿 표시다(REQ-ADM-03). 노출 여부와는 무관하다 — 컬렉션에 걸리는 건
// 여전히 publishStatus === 'PUBLIC' 하나가 정한다. 관리자 화면이 토글 뒤 재조회로 상태를 확인하는
// 근거가 이 필드다.
//
// isBookmarked·bookmarkGroupId는 요청자 기준이다(DERO-343) — 비로그인이면 각각 false·null이라
// "북마크 안 함"과 구분되지 않는다. 갤러리 카드가 이걸 그대로 그린다(로컬 오버라이드 없음).
export interface PlacementSummaryResponse {
  id: number;
  title: string;
  description: string | null;
  /** 공개 전환 때 붙인 해시태그 이름들(DERO-493). `'#'`은 없고 태그가 없으면 빈 배열이다. */
  tags: string[];
  publishStatus: PublishStatus;
  isTemplate: boolean;
  budgetKrw: number | null;
  likeCount: number;
  ownerId: number | null;
  ownerNickname: string | null;
  createdAt: string;
  updatedAt: string | null;
  thumbnailUrl: string | null;
  primaryImageUrl: string | null;
  isBookmarked: boolean;
  bookmarkGroupId: number | null;
}

// --- 상상도(AI 생성 이미지) ---
// `GET /placements/{id}/generated-images`. 한 업로드가 1장을 만들고 그게 곧 대표다(2026-08-06 3→1)
// (ADR-0015 결정 6) — 각도를 구분하는 컬럼이 없으므로 순서는 `createdAt`이 답한다. `url`은 만료 없는
// 안정 공개 URL이라 common/RemoteImage(next/image)에 그대로 넘긴다(ADR-0035 결정 1).
//
// 위 PlacementSummaryResponse와 같은 이유로 아직 손으로 쓴다 — 백엔드가 떠 있어야만 openapi.d.ts를
// 다시 뽑을 수 있다(`npm run api:types`). 필드는 백엔드 record와 1:1이다.
export type TimeOfDay = 'DAY' | 'NIGHT';

export interface GeneratedImageResponse {
  id: number;
  url: string;
  isPrimary: boolean;
  timeOfDay: TimeOfDay;
  createdAt: string;
}

/** `?sort` — 2값뿐이고 팔로잉컬렉션는 없다(D28). 그 밖의 값은 백엔드가 400으로 막는다. */
export type PlacementSort = 'latest' | 'popular';

/**
 * `GET /placements`의 쿼리 파라미터. 전부 선택이고 생략하면 "보이는 것 전부, 최신순"이다.
 *
 * 가시성은 서버가 정한다 — 비로그인은 `PUBLIC`만, 로그인은 `PUBLIC` + 본인 비공개까지다. 그래서
 * `owner: 'me'`는 로그인 상태에서만 성립하고 비로그인이면 401 `PLACEMENT_OWNER_ME_REQUIRES_LOGIN`이다.
 *
 * `bookmarked: 'me'`도 로그인 전용이다(401 `PLACEMENT_BOOKMARKED_ME_REQUIRES_LOGIN`). `bookmarkGroup`은
 * **`bookmarked: 'me'`와 함께일 때만** 유효하다 — 단독으로 보내면 400이다. 정렬은 북마크를 담은
 * 순서가 아니라 배치 자체의 `sort`를 따른다(DERO-343).
 */
export interface ListPlacementsParams {
  owner?: 'me' | number;
  publishStatus?: PublishStatus;
  ids?: number[];
  /** 태그 이름 하나와 **정확히 일치**하는 배치만(DERO-493). `'#'`은 붙이지 않는다 —
   *  표기일 뿐이고 저장된 `hashtag.name`에는 없다. `q`와 같이 실으면 AND다. */
  hashtag?: string;
  bookmarked?: 'me';
  bookmarkGroup?: number | 'none';
  sort?: PlacementSort;
  /**
   * 서버 검색어(제목·설명·태그·작성자, ADR-0027). 다른 필터와 **같이** 걸리고, 실리면 `sort`는
   * 무시된다 — 관련도 순서가 곧 정렬이다. ES가 죽으면 이 파라미터를 실은 요청만 503
   * `PLACEMENT_SEARCH_UNAVAILABLE`이고 폴백은 없다(ADR-0019 결정 6).
   */
  q?: string;
  cursor?: string | null;
  size?: number;
}

/**
 * `GET /placements/{id}/estimate` — 배치에 올린 제품 가격 합계와 예산 대비(REQ-REC-01).
 *
 * 합계는 **인스턴스 단위**다 — `placed_item`에 수량 컬럼이 없어 같은 제품을 둘 놓으면 두 번
 * 더해진다. **직접 입력 규격 책상은 빠진다**(D18) — 카탈로그 제품이 아니라 살 대상이 아니다.
 *
 * `budgetKrw`가 null이면 예산 대비 3필드가 전부 null이다(합계는 그래도 나온다).
 */
export interface PlacementEstimateResponse {
  totalPriceKrw: number;
  budgetKrw: number | null;
  isOverBudget: boolean | null;
  /** `budgetKrw - totalPriceKrw` — 양수는 남은 예산, 음수는 초과분. */
  differenceKrw: number | null;
}
