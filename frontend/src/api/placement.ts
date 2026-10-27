// 배치(Placement) API — GET/POST/PUT/DELETE /api/v1/placements (ADR-0009, PlacementController 1:1)
import { apiClient } from './client';
import type { CursorPage } from '@/types/api';
import type {
  GeneratedImageResponse,
  ItemSnapshot,
  ListPlacementsParams,
  PlacementDetailResponse,
  PlacementEstimateResponse,
  PlacementSaveResponse,
  PlacementSnapshot,
  PlacementSummaryResponse,
  ThumbnailUploadUrlResponse,
} from '@/types/placement';

// 목록은 커서 페이지네이션이다(ADR-0008 결정 5) — page 파라미터를 받지 않는다. 응답의 nextCursor를
// 그대로 다음 요청에 실어 보내고, 열어 보지 않는다(불투명 base64).
export async function listPlacements(
  params: ListPlacementsParams = {},
): Promise<CursorPage<PlacementSummaryResponse>> {
  const query = new URLSearchParams();
  if (params.owner !== undefined) query.set('owner', String(params.owner));
  if (params.publishStatus !== undefined) query.set('publishStatus', params.publishStatus);
  // 다건 조회는 요청 한 번이다 — 배치마다 GET /placements/{id}를 치면 게시글 본문의 임베드 토큰
  // 개수만큼 왕복이 생긴다.
  if (params.ids !== undefined && params.ids.length > 0) query.set('ids', params.ids.join(','));
  // bookmarkGroup은 bookmarked=me와 함께여야만 유효하다 — 단독으로 실으면 서버가 400이다.
  if (params.bookmarked !== undefined) query.set('bookmarked', params.bookmarked);
  if (params.bookmarkGroup !== undefined) query.set('bookmarkGroup', String(params.bookmarkGroup));
  // 태그 칩 필터 — 이름 하나와 정확히 일치하는 배치만 남는다('#' 없이 이름만, DERO-493).
  // 검색(q)과 같이 실을 수 있고 서버가 AND로 건다.
  if (params.hashtag !== undefined && params.hashtag !== '') query.set('hashtag', params.hashtag);
  if (params.sort !== undefined) query.set('sort', params.sort);
  // 검색어는 이미 '#'이 떨어진 순수 질의다(utils/searchQuery.ts) — 여기서 또 손대면 태그 표기가
  // 두 번 벗겨진다.
  if (params.q !== undefined && params.q !== '') query.set('q', params.q);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.size !== undefined) query.set('size', String(params.size));

  const search = query.toString();
  return apiClient.get<CursorPage<PlacementSummaryResponse>>(
    `/placements${search ? `?${search}` : ''}`,
    { cache: 'no-store' },
  );
}

export function getPlacement(id: number): Promise<PlacementDetailResponse> {
  return apiClient.get<PlacementDetailResponse>(`/placements/${id}`, { cache: 'no-store' });
}

export function createPlacement(snapshot: PlacementSnapshot): Promise<PlacementSaveResponse> {
  return apiClient.post<PlacementSaveResponse>('/placements', snapshot);
}

export function updatePlacement(
  id: number,
  snapshot: PlacementSnapshot,
): Promise<PlacementSaveResponse> {
  return apiClient.put<PlacementSaveResponse>(`/placements/${id}`, snapshot);
}

export function deletePlacement(id: number): Promise<void> {
  return apiClient.delete<void>(`/placements/${id}`);
}

// 리믹스 생성 — 201 + 새 배치의 상세다(DERO-343). 서버가 원본을 복제하므로 클라이언트가
// toPlacementSnapshot으로 재조립하지 않는다: 손으로 만든 사본은 출처(sourcePlacement)를 못 남긴다.
// 사본은 호출자 소유·PRIVATE이고, 원본이 없거나 PUBLIC이 아니면 404 PLACEMENT_NOT_FOUND다.
export function createPlacementRemix(id: number): Promise<PlacementDetailResponse> {
  return apiClient.post<PlacementDetailResponse>(`/placements/${id}/remixes`);
}

// 리믹스 목록 — 비로그인도 200이고 가시성 규칙이 걸린다(남의 비공개 리믹스는 안 온다).
// 원본이 안 보이면 404다.
export function listPlacementRemixes(
  id: number,
  params: { cursor?: string | null; size?: number } = {},
): Promise<CursorPage<PlacementSummaryResponse>> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.size !== undefined) query.set('size', String(params.size));

  const search = query.toString();
  return apiClient.get<CursorPage<PlacementSummaryResponse>>(
    `/placements/${id}/remixes${search ? `?${search}` : ''}`,
    { cache: 'no-store' },
  );
}

// 업로드(컬렉션 공개) 요청 — 202 Accepted, 본문 없음. 이 호출이 끝난 시점에 배치는 아직 컬렉션에 없다
// (ADR-0015 결정 10): 서버가 ①판정 ②스크린샷 존재 ③일일 한도 게이트를 통과시킨 뒤 PENDING으로 두고
// 큐에 넣는다. 그래서 호출부는 "접수됐다"까지만 말하고 사용자를 붙잡지 않는다.
//
// **PUT이 곧 재시도 버튼이다** — FAILED에서 다시 부르면 재투입된다(별도 재시도 엔드포인트 없음).
// 이미 PENDING이면 202지만 상태도 큐도 안 건드린다. 진행 상태는 getPlacement(id).publishStatus로만
// 본다 — 진행 조회 엔드포인트가 따로 없어 호출부가 폴링한다.
export function publishPlacementToFeed(id: number, tags?: string[]): Promise<void> {
  // 본문을 안 실으면 태그는 그대로 둔다 — 서버가 `null`을 "태그 미변경"으로 읽는다(ADR-0027 결정 5).
  // 재시도(같은 PUT)가 태그를 지우지 않는 것이 이 규칙의 이유다. 빈 배열은 "전부 제거"라서 뜻이 다르다.
  return tags === undefined
    ? apiClient.put<void>(`/placements/${id}/feed-entry`)
    : apiClient.put<void>(`/placements/${id}/feed-entry`, { tags });
}

// 공개한 뒤의 태그 수정 — 204. **공개 전환 PUT을 재사용하면 안 된다**(DERO-493): 그 호출은
// 재시도 버튼이라 PUBLIC 배치를 PENDING으로 되돌리고 AI 상상도를 다시 만들어 일일 한도까지 깎는다.
// 여기는 게이트도 큐도 안 타고 태그만 갈아 끼운다. 본문은 필수이고 빈 배열이 전부 제거다.
export function replacePlacementTags(id: number, tags: string[]): Promise<void> {
  return apiClient.put<void>(`/placements/${id}/feed-entry/tags`, { tags });
}

// 공개 취소 — 204. publishStatus가 PRIVATE로 돌아가고 컬렉션에서 내려간다. 남의 배치면 404다
// (403이 아니다 — 존재 여부 자체를 흘리지 않는다).
export function unpublishPlacementFromFeed(id: number): Promise<void> {
  return apiClient.delete<void>(`/placements/${id}/feed-entry`);
}

// 상상도 목록. 가시성은 배치를 따르고(비로그인은 PUBLIC만) 아직 안 만들어졌으면 빈 배열이다 —
// 호출부는 "없음"과 "실패"를 구분해 다뤄야 한다.
export function getGeneratedImages(id: number): Promise<GeneratedImageResponse[]> {
  return apiClient.get<GeneratedImageResponse[]>(`/placements/${id}/generated-images`, {
    cache: 'no-store',
  });
}

// 다른 사람의 배치를 "가져오기"(복제)할 때 쓴다 — getPlacement(원본id) 결과를 createPlacement에
// 그대로 넣을 수 있는 신규 저장 요청으로 바꾼다. 사본은 서버가 항상 PRIVATE로 만든다 — 스냅샷은
// 게시 상태를 실어 보내지 않는다(ADR-0015 결정 10). mountedToItemId는 원본 배치 안에서만 유효한 실제
// 아이템 id라 그대로 못 옮기므로, 원본 id → 이번 스냅샷의 ref로 다시 매핑해 마운트 관계를 보존한다
// (2026-07-30 커뮤니티 배치 가져오기).
export function toPlacementSnapshot(detail: PlacementDetailResponse): PlacementSnapshot {
  const refByOriginalItemId = new Map(
    detail.items.map((item, index) => [item.id, `import-${index}`]),
  );

  const items: ItemSnapshot[] = detail.items.map((item, index) => ({
    ref: refByOriginalItemId.get(item.id) ?? `import-${index}`,
    id: null,
    productId: item.productId,
    positionXMm: item.positionXMm,
    positionYMm: item.positionYMm,
    positionZMm: item.positionZMm,
    rotationDeg: item.rotationDeg,
    pitchDeg: item.pitchDeg,
    surfaceType: item.surfaceType,
    wallSide: item.wallSide,
    // isVesaMounted를 안 싣는다 — 결합 여부는 mountedToRef의 유무가 답한다(ADR-0009 결정 3).
    mountedToRef:
      item.mountedToItemId != null ? (refByOriginalItemId.get(item.mountedToItemId) ?? null) : null,
    jointValues: item.jointValues,
    emitterColor: item.emitterColor,
  }));

  return {
    title: detail.title,
    description: detail.description,
    version: null,
    isRoomLightOn: detail.isRoomLightOn,
    // 방 표면은 응답과 요청의 필드가 같아 그대로 옮긴다(ADR-0030) — 값을 해석하지 않는다.
    // 계열·변형을 여기서 좁히면 계열을 늘릴 때마다 가져오기 경로가 따라붙는다.
    walls: detail.walls,
    floor: detail.floor,
    timeOfDay: detail.timeOfDay,
    budgetKrw: detail.budgetKrw,
    desk: {
      specSource: detail.desk.specSource,
      productId: detail.desk.productId,
      widthMm: detail.desk.widthMm,
      depthMm: detail.desk.depthMm,
      heightMm: detail.desk.heightMm,
      topThicknessMm: detail.desk.topThicknessMm,
      edgeThicknessMm: detail.desk.edgeThicknessMm,
      deskTextureId: detail.desk.deskTextureId,
      frameType: detail.desk.frameType,
    },
    items,
  };
}

// 기존 배치를 **고칠 때** 쓰는 스냅샷 — 제목·설명처럼 아이템과 무관한 필드만 바꾸는 화면
// (작업실의 컬렉션 게시 시트, 컬렉션 수정 폼)이 `PUT /placements/{id}`에 실을 몸통이다.
//
// **`toPlacementSnapshot`을 그대로 쓰면 안 된다.** 그건 리믹스(신규 저장)용이라 아이템 `id`를 전부
// null로 만드는데, 저장은 통째 교체가 아니라 **id 매칭 병합**이다(`Placement.mergeItems`): id가 안
// 실린 아이템은 "새 아이템"이고 요청에 없는 기존 id는 지워지므로, 제목만 고쳐도 `placed_item` 행이
// 전부 삭제 후 재삽입돼 id가 갈린다(값은 같아 보이지만 아이템 단위 외부 참조가 끊긴다).
// `version`도 되돌려 싣는다 — null이면 낙관적 락이 무조건 409다.
export function toPlacementUpdateSnapshot(detail: PlacementDetailResponse): PlacementSnapshot {
  const snapshot = toPlacementSnapshot(detail);
  return {
    ...snapshot,
    version: detail.version,
    // toPlacementSnapshot이 detail.items 순서를 그대로 옮기므로 인덱스로 원래 id를 되붙인다.
    items: snapshot.items.map((item, index) => ({ ...item, id: detail.items[index].id })),
  };
}

// 배치 미리보기 이미지 업로드 — 2단계 presign이다(api-spec.md §1 규칙 4).
// ① POST .../thumbnail/upload-url 로 presigned PUT URL을 받고 ② 브라우저가 스토리지에 직접 PUT한 뒤
// ③ PUT .../thumbnail 로 key를 등록한다(204). 종전 multipart POST는 없어졌다 — 파일 바이트가
// 백엔드를 거치지 않는다.
export async function uploadPlacementThumbnail(id: number, blob: Blob): Promise<void> {
  const presign = await apiClient.post<ThumbnailUploadUrlResponse>(
    `/placements/${id}/thumbnail/upload-url`,
  );

  const uploaded = await fetch(presign.uploadUrl, {
    method: 'PUT',
    // 캡처가 webp로 바뀌었다(ADR-0035) — presign 발급 쪽(PlacementService)도 image/webp로 서명한다.
    headers: { 'Content-Type': 'image/webp' },
    body: blob,
  });
  if (!uploaded.ok) {
    throw new Error(`썸네일 업로드에 실패했습니다. (status: ${uploaded.status})`);
  }

  await apiClient.put<void>(`/placements/${id}/thumbnail`, {
    thumbnailKey: presign.thumbnailKey,
  });
}

/**
 * 견적 — 배치에 올린 제품 가격 합계와 예산 대비(REQ-REC-01, api-spec.md §4).
 *
 * 🔓지만 "선택적 인증"이다 — 남의 비공개 배치 견적은 404다. 저장하지 않는 계산이라 매번
 * 현재 아이템·현재 제품 가격으로 다시 센다.
 */
export function getPlacementEstimate(id: number): Promise<PlacementEstimateResponse> {
  return apiClient.get<PlacementEstimateResponse>(`/placements/${id}/estimate`, {
    cache: 'no-store',
  });
}
