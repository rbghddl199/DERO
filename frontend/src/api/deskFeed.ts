// 데스크피드 API — GET/POST/PUT/DELETE /api/v1/desk-feeds + 사진 2단계 presign + 좋아요·댓글
// (D34·ADR-0037, api-spec.md §6-보).
//
// **사진 경로가 post와 동형이다**: presign으로 올린 key를 `POST /desk-feeds/{id}/images`로 등록하고
// 지울 때는 `DELETE .../images/{imageId}`다. `PUT`의 `imageKeys` 전체 교체는 없다 — 사진 순서의
// 정본이 본문 마크다운(`![alt](key)`) 안 위치이기 때문이다. 등록은 소속만 기록하므로 `isPrimary`도
// `displayOrder`도 보내지 않는다.
//
// 뷰 모델 seam이 없는 것이 의도다 — 응답 DTO가 그대로 화면 모양이고 컴포넌트가 types/deskFeed.ts를
// 직접 읽는다.

import { apiClient } from './client';
import { prepareImageForUpload } from '@/utils/admin/imageCompression';
import type { CursorPage } from '@/types/api';
import type {
  DeskFeedCommentResponse,
  DeskFeedDetailResponse,
  DeskFeedImageResponse,
  DeskFeedImageUploadUrlsResponse,
  DeskFeedSaveRequest,
  DeskFeedSummaryResponse,
  ListDeskFeedsParams,
} from '@/types/deskFeed';
import type { LikeStatusResponse } from '@/types/interaction';

// 목록은 커서 페이지네이션이다(ADR-0008 결정 5) — nextCursor는 불투명 값이라 열어 보지 않는다.
// 비로그인도 200이다. **검색(`?q=`)은 없다** — ES 색인은 후속이다(ADR-0033 결정 6).
export function listDeskFeeds(
  params: ListDeskFeedsParams = {},
): Promise<CursorPage<DeskFeedSummaryResponse>> {
  const query = new URLSearchParams();
  if (params.hashtag !== undefined && params.hashtag !== '') query.set('hashtag', params.hashtag);
  if (params.owner !== undefined) query.set('owner', params.owner);
  if (params.placementId !== undefined) query.set('placementId', String(params.placementId));
  if (params.sort !== undefined) query.set('sort', params.sort);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.size !== undefined) query.set('size', String(params.size));

  const search = query.toString();
  return apiClient.get<CursorPage<DeskFeedSummaryResponse>>(
    `/desk-feeds${search ? `?${search}` : ''}`,
    { cache: 'no-store' },
  );
}

/** 사진 0장 글(작성 → 업로드 사이)은 작성자 본인 외 404다. */
export function getDeskFeed(id: number): Promise<DeskFeedDetailResponse> {
  return apiClient.get<DeskFeedDetailResponse>(`/desk-feeds/${id}`, { cache: 'no-store' });
}

/** 작성 → 201. 사진은 이 다음의 presign 2단계가 등록한다(presign이 글 존재를 요구한다). */
export function createDeskFeed(request: DeskFeedSaveRequest): Promise<DeskFeedDetailResponse> {
  return apiClient.post<DeskFeedDetailResponse>('/desk-feeds', request);
}

/** 제목·본문·태그·배치 첨부·제품 태그 **전체 교체**다(사진은 안 실린다). 남의 글은 403. */
export function updateDeskFeed(
  id: number,
  request: DeskFeedSaveRequest,
): Promise<DeskFeedDetailResponse> {
  return apiClient.put<DeskFeedDetailResponse>(`/desk-feeds/${id}`, request);
}

export function deleteDeskFeed(id: number): Promise<void> {
  return apiClient.delete<void>(`/desk-feeds/${id}`);
}

export function presignDeskFeedImages(
  deskFeedId: number,
  contentTypes: string[],
): Promise<DeskFeedImageUploadUrlsResponse> {
  return apiClient.post<DeskFeedImageUploadUrlsResponse>(
    `/desk-feeds/${deskFeedId}/images/upload-urls`,
    { contentTypes },
  );
}

/** 등록은 소속만 기록한다 — 순서·대표 파라미터가 없다(D34·ADR-0037: 본문이 정본). */
export function registerDeskFeedImage(
  deskFeedId: number,
  imageKey: string,
): Promise<DeskFeedImageResponse> {
  return apiClient.post<DeskFeedImageResponse>(`/desk-feeds/${deskFeedId}/images`, { imageKey });
}

/**
 * 사진 한 장의 제품 태그 **전체 교체**(D37 개정·ADR-0040). 빈 배열이 곧 "태그 없음"이다.
 *
 * **글 단위 "사용된 제품" 목록 밖의 제품은 422다** — 사진 태그는 그 목록의 부분집합이라, 새로
 * 붙인 제품은 글 단위 목록을 저장하는 `PUT /desk-feeds/{id}`가 **먼저** 나가야 한다.
 */
export function replaceDeskFeedImageProducts(
  deskFeedId: number,
  imageId: number,
  productIds: readonly number[],
): Promise<DeskFeedImageResponse> {
  return apiClient.put<DeskFeedImageResponse>(
    `/desk-feeds/${deskFeedId}/images/${imageId}/products`,
    { productIds },
  );
}

export function deleteDeskFeedImage(deskFeedId: number, imageId: number): Promise<void> {
  return apiClient.delete<void>(`/desk-feeds/${deskFeedId}/images/${imageId}`);
}

// 여러 장을 한 번에 올린다 — `uploadPostImages`와 같은 2단계 presign이다. ① upload-urls로
// {imageKey, uploadUrl}을 파일 수만큼 받고 ② 브라우저가 스토리지에 직접 PUT하고 ③ 단건 등록으로
// key를 심는다. 파일 바이트가 백엔드를 거치지 않는다.
//
// **서버 MIME표가 webp만 받는다**(ADR-0035 결정 4) — presign 요청 전에 브라우저에서 변환한다.
// 이걸 빼면 presign 1단계가 400 `DESK_FEED_UNSUPPORTED_IMAGE_TYPE`으로 죽는다.
export async function uploadDeskFeedImages(
  deskFeedId: number,
  files: readonly File[],
): Promise<DeskFeedImageResponse[]> {
  if (files.length === 0) return [];

  const prepared = await Promise.all(
    files.map((file) => prepareImageForUpload(file, file.type || 'application/octet-stream')),
  );

  const presign = await presignDeskFeedImages(
    deskFeedId,
    prepared.map((item) => item.contentType),
  );
  // 계약상 요청한 순서·개수 그대로 오지만, 모자라면 아래 루프가 undefined.uploadUrl로 죽어
  // "사진 업로드 실패"가 아니라 정체불명 TypeError가 된다.
  if (presign.items.length !== files.length) {
    throw new Error('사진 업로드 주소를 받지 못했습니다. 다시 시도해주세요.');
  }

  await Promise.all(
    prepared.map(async (preparedFile, index) => {
      const item = presign.items[index];
      const uploaded = await fetch(item.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': preparedFile.contentType },
        body: preparedFile.blob,
      });
      if (!uploaded.ok) {
        throw new Error(`사진 업로드에 실패했습니다. (status: ${uploaded.status})`);
      }
    }),
  );

  // 등록은 순서를 만들지 않으므로 병렬이어도 된다 — 순서는 호출부가 본문에 쓴다.
  return Promise.all(presign.items.map((item) => registerDeskFeedImage(deskFeedId, item.imageKey)));
}

/** 좋아요 — post·placement와 같은 3동사 계약(멱등 204). GET도 🔒다(신원이 곧 답이라). */
export function getDeskFeedLike(id: number): Promise<LikeStatusResponse> {
  return apiClient.get<LikeStatusResponse>(`/desk-feeds/${id}/like`, { cache: 'no-store' });
}

export function putDeskFeedLike(id: number): Promise<void> {
  return apiClient.put<void>(`/desk-feeds/${id}/like`);
}

export function deleteDeskFeedLike(id: number): Promise<void> {
  return apiClient.delete<void>(`/desk-feeds/${id}/like`);
}

/** 댓글 — post 댓글과 달리 **실영속이다**(ADR-0033 결함 4의 처방). 목록만 비로그인 200. */
export function listDeskFeedComments(
  id: number,
  cursor?: string | null,
): Promise<CursorPage<DeskFeedCommentResponse>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiClient.get<CursorPage<DeskFeedCommentResponse>>(`/desk-feeds/${id}/comments${query}`, {
    cache: 'no-store',
  });
}

export function createDeskFeedComment(
  id: number,
  content: string,
): Promise<DeskFeedCommentResponse> {
  return apiClient.post<DeskFeedCommentResponse>(`/desk-feeds/${id}/comments`, { content });
}

/** 남의 댓글은 403이다(404가 아니다 — 본문이 이미 보여 숨길 것이 없다). */
export function deleteDeskFeedComment(id: number, commentId: number): Promise<void> {
  return apiClient.delete<void>(`/desk-feeds/${id}/comments/${commentId}`);
}
