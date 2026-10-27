// 게시글(Post) API — GET/POST/PUT/DELETE /api/v1/posts + 본문 이미지 2단계 presign (ADR-0013).
import { apiClient } from './client';
import { prepareImageForUpload } from '@/utils/admin/imageCompression';
import type { CursorPage } from '@/types/api';
import type {
  ListPostsParams,
  PostDetailResponse,
  PostImageResponse,
  PostImageUploadUrlsResponse,
  PostSaveRequest,
  PostSummaryResponse,
} from '@/types/post';

// 목록은 커서 페이지네이션이다(ADR-0008 결정 5) — nextCursor를 그대로 다음 요청에 실어 보내고
// 열어 보지 않는다(불투명 base64). 비로그인도 200이다.
export function listPosts(params: ListPostsParams = {}): Promise<CursorPage<PostSummaryResponse>> {
  const query = new URLSearchParams();
  if (params.hashtag !== undefined && params.hashtag !== '') query.set('hashtag', params.hashtag);
  if (params.owner !== undefined) query.set('owner', String(params.owner));
  // 검색어는 이미 '#'이 떨어진 순수 질의다(utils/searchQuery.ts).
  if (params.q !== undefined && params.q !== '') query.set('q', params.q);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.size !== undefined) query.set('size', String(params.size));

  const search = query.toString();
  return apiClient.get<CursorPage<PostSummaryResponse>>(`/posts${search ? `?${search}` : ''}`, {
    cache: 'no-store',
  });
}

export function getPost(id: number): Promise<PostDetailResponse> {
  return apiClient.get<PostDetailResponse>(`/posts/${id}`, { cache: 'no-store' });
}

export function createPost(request: PostSaveRequest): Promise<PostDetailResponse> {
  return apiClient.post<PostDetailResponse>('/posts', request);
}

/** 남의 글이면 403 `POST_NOT_OWNED`. 본문 토큰이 남의·비공개·없는 배치면 400 `POST_PLACEMENT_NOT_EMBEDDABLE`. */
export function updatePost(id: number, request: PostSaveRequest): Promise<PostDetailResponse> {
  return apiClient.put<PostDetailResponse>(`/posts/${id}`, request);
}

export function deletePost(id: number): Promise<void> {
  return apiClient.delete<void>(`/posts/${id}`);
}

export function presignPostImages(
  postId: number,
  contentTypes: string[],
): Promise<PostImageUploadUrlsResponse> {
  return apiClient.post<PostImageUploadUrlsResponse>(`/posts/${postId}/images/upload-urls`, {
    contentTypes,
  });
}

export function registerPostImage(
  postId: number,
  imageKey: string,
  isPrimary: boolean,
): Promise<PostImageResponse> {
  return apiClient.post<PostImageResponse>(`/posts/${postId}/images`, { imageKey, isPrimary });
}

export function deletePostImage(postId: number, imageId: number): Promise<void> {
  return apiClient.delete<void>(`/posts/${postId}/images/${imageId}`);
}

// 여러 장을 한 번에 올린다 — placement.ts의 uploadPlacementThumbnail과 같은 2단계 presign이다.
// ① upload-urls로 {imageKey, uploadUrl}을 파일 개수만큼 받고 ② 브라우저가 스토리지에 직접 PUT한 뒤
// ③ POST /posts/{id}/images로 key를 등록한다. 파일 바이트가 백엔드를 거치지 않는다.
//
// presign은 요청 1건이지만 등록은 파일당 1건이다(엔드포인트가 단건이라). 등록을 순차로 도는 이유는
// is_primary 부분 유니크가 게시글당 1장을 강제해서다 — 동시에 쏘면 경쟁이 생긴다.
export async function uploadPostImages(
  postId: number,
  files: readonly File[],
  markFirstAsPrimary: boolean,
): Promise<PostImageResponse[]> {
  if (files.length === 0) return [];

  // 서버 MIME표가 webp만 받는다(ADR-0035) — presign 요청 전에 브라우저에서 변환한다.
  const prepared = await Promise.all(
    files.map((file) => prepareImageForUpload(file, file.type || 'application/octet-stream')),
  );

  const presign = await presignPostImages(
    postId,
    prepared.map((item) => item.contentType),
  );

  await Promise.all(
    prepared.map(async (preparedFile, index) => {
      const item = presign.items[index];
      const uploaded = await fetch(item.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': preparedFile.contentType },
        body: preparedFile.blob,
      });
      if (!uploaded.ok) {
        throw new Error(`이미지 업로드에 실패했습니다. (status: ${uploaded.status})`);
      }
    }),
  );

  const registered: PostImageResponse[] = [];
  for (const [index, item] of presign.items.entries()) {
    registered.push(
      await registerPostImage(postId, item.imageKey, markFirstAsPrimary && index === 0),
    );
  }
  return registered;
}
