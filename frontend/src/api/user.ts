// 사용자 프로필·팔로우·프로필 이미지·이미지 한도 API (DERO-344, UserController 1:1).
//
// 팔로우 토글은 좋아요·북마크와 같은 계약이다 — PUT/DELETE 둘 다 멱등 204(본문 없음)라 카운트를
// 클라이언트가 계산하면 연타에 어긋난다. 호출부는 성공 후 getUserProfile로 서버 값을 다시 확정한다
// (api/interaction.ts와 같은 관례).

import { apiClient } from './client';
import { prepareImageForUpload } from '@/utils/admin/imageCompression';
import type { CursorPage } from '@/types/api';
import type { components } from '@/types/openapi';
import type {
  FollowUserResponse,
  ImageQuotaResponse,
  ProfileImageUploadUrlResponse,
  UserProfileResponse,
  UserSearchResultResponse,
} from '@/types/user';

type UserMeResponse = components['schemas']['UserMeResponse'];

/** 백엔드가 받아 주는 프로필 이미지 MIME — 그 밖은 400 `USER_INVALID_IMAGE_CONTENT_TYPE`이다. */
export const PROFILE_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type ProfileImageContentType = (typeof PROFILE_IMAGE_CONTENT_TYPES)[number];

export function isProfileImageContentType(value: string): value is ProfileImageContentType {
  return (PROFILE_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/** 남의 프로필. 비로그인도 200이고, 없는 사용자는 404 `USER_NOT_FOUND`다. */
export function getUserProfile(userId: number): Promise<UserProfileResponse> {
  return apiClient.get<UserProfileResponse>(`/users/${userId}`, { cache: 'no-store' });
}

/** 멱등 204 — 두 번 눌러도 팔로워 수는 1만 는다. 자기 자신이면 422 `USER_SELF_FOLLOW_NOT_ALLOWED`. */
export function followUser(userId: number): Promise<void> {
  return apiClient.put<void>(`/users/${userId}/follow`);
}

/** 멱등 204 — 안 팔로우한 상태에서 눌러도 204다. */
export function unfollowUser(userId: number): Promise<void> {
  return apiClient.delete<void>(`/users/${userId}/follow`);
}

function followPagePath(
  userId: number,
  kind: 'followers' | 'following',
  cursor: string | null,
  size: number,
): string {
  const query = new URLSearchParams();
  if (cursor) query.set('cursor', cursor);
  query.set('size', String(size));
  return `/users/${userId}/${kind}?${query.toString()}`;
}

/** 커서 페이지네이션. `nextCursor`는 불투명 문자열이라 열어 보지 않고 그대로 다음 요청에 싣는다. */
export function listFollowers(
  userId: number,
  cursor: string | null = null,
  size = 20,
): Promise<CursorPage<FollowUserResponse>> {
  return apiClient.get<CursorPage<FollowUserResponse>>(
    followPagePath(userId, 'followers', cursor, size),
    { cache: 'no-store' },
  );
}

export function listFollowing(
  userId: number,
  cursor: string | null = null,
  size = 20,
): Promise<CursorPage<FollowUserResponse>> {
  return apiClient.get<CursorPage<FollowUserResponse>>(
    followPagePath(userId, 'following', cursor, size),
    { cache: 'no-store' },
  );
}

/**
 * 프로필 이미지 2단계 presign 업로드 — placement 썸네일(`uploadPlacementThumbnail`)과 같은 관례다.
 * ① `POST /users/me/profile-image/upload-url`로 URL을 받고 ② 브라우저가 스토리지에 **직접** PUT한 뒤
 * ③ `PUT /users/me/profile-image`로 key를 등록한다. ②는 apiClient를 안 쓴다 — 우리 Authorization
 * 헤더를 얹으면 presign 서명 검증이 깨진다.
 *
 * 등록 응답(UserMeResponse)에 갱신된 presigned `profileImageUrl`이 실려 오므로 호출부는 재조회 없이
 * 화면을 바로 갱신한다.
 */
export async function uploadProfileImage(file: File): Promise<UserMeResponse> {
  // 서버 MIME표가 webp만 받는다(ADR-0035) — 업로드 전에 브라우저에서 변환한다.
  const prepared = await prepareImageForUpload(file, file.type);

  const presign = await apiClient.post<ProfileImageUploadUrlResponse>(
    '/users/me/profile-image/upload-url',
    { contentType: prepared.contentType },
  );

  const uploaded = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': prepared.contentType },
    body: prepared.blob,
  });
  if (!uploaded.ok) {
    throw new Error(`프로필 이미지 업로드에 실패했습니다. (status: ${uploaded.status})`);
  }

  return apiClient.put<UserMeResponse>('/users/me/profile-image', {
    imageKey: presign.imageKey,
  });
}

/** 오늘 쓴 장수·상한·리셋 시각. 한도는 계정에 붙는다(배치가 아니라) — 그래서 경로가 /users/me다. */
export function getImageQuota(): Promise<ImageQuotaResponse> {
  return apiClient.get<ImageQuotaResponse>('/users/me/image-quota', { cache: 'no-store' });
}

/**
 * 회원 탈퇴 → 204. 소프트 삭제만 한다 — 세션(리프레시 쿠키·Redis) 정리는 이 응답에 안 실려 있다
 * (user는 auth를 모른다, ADR-0007). 호출부가 성공 뒤 반드시 `authRuntime.logout()`을 이어 불러야
 * 세션까지 마저 정리된다(`user/CLAUDE.md` 백엔드 트랩과 동일한 이유).
 */
export function withdrawAccount(): Promise<void> {
  return apiClient.delete<void>('/users/me');
}

/**
 * 멘션 자동완성 후보 — **로그인 필수**다(비로그인은 401). 질의는 최소 1자이고 서버가 최대 10명을
 * 관련도 순으로 답한다(D35·ADR-0038 결정 3).
 *
 * **503 `USER_SEARCH_UNAVAILABLE`은 "0명"이 아니라 그 사실을 말한다** — ES 폴백이 없어서다
 * (ADR-0019 결정 6). 호출부는 빈 목록으로 뭉개지 말고 그 상태를 그대로 그린다.
 */
export function searchUsers(query: string): Promise<UserSearchResultResponse[]> {
  return apiClient.get<UserSearchResultResponse[]>(`/users/search?q=${encodeURIComponent(query)}`, {
    cache: 'no-store',
  });
}
