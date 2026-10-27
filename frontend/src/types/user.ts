// 사용자 프로필·팔로우·프로필 이미지·이미지 한도 와이어 타입 (DERO-344).
//
// openapi.d.ts에서 파생하지 않고 손으로 쓴다 — 재생성(`npm run api:types`)이 백엔드가 local
// 프로파일로 떠 있기를 요구하는데 이 계약의 백엔드는 아직 develop에 없다. types/placement.ts의
// PlacementSummaryResponse가 같은 이유로 손으로 쓰인 선례다. 다음 재생성 때 Schemas에서 파생시킬 것.
//
// 이미 생성 타입이 있는 UserMeResponse는 여기서 다시 선언하지 않는다 — api/onboarding.ts가
// openapi.d.ts에서 파생한 것을 그대로 쓴다.

/** `GET /users/{userId}` — 비로그인도 200이다. */
export interface UserProfileResponse {
  id: number;
  nickname: string;
  /** presigned GET URL이라 그대로 `<img src>`에 넣는다(파일 서빙 엔드포인트를 만들지 않는다). */
  profileImageUrl: string | null;
  followerCount: number;
  followingCount: number;
  /** 조회자가 이 사람을 팔로우 중인가. **비로그인이면 항상 false**라 "안 팔로우함"과 구분되지 않는다. */
  following: boolean;
}

/** `GET /users/{userId}/followers`·`/following`의 페이지 원소. */
export interface FollowUserResponse {
  id: number;
  nickname: string;
  profileImageUrl: string | null;
}

/** `POST /users/me/profile-image/upload-url` — 1단계 presign 발급. */
export interface ProfileImageUploadUrlResponse {
  imageKey: string;
  /** 스토리지로 바로 PUT하는 URL이다 — apiClient를 태우면 안 된다(Authorization 헤더가 서명을 깬다). */
  uploadUrl: string;
}

/** `GET /users/me/image-quota` — 계정 단위 일일 상한(배치 단위가 아니다). */
export interface ImageQuotaResponse {
  usedToday: number;
  dailyLimit: number;
  /** 오프셋 포함 ISO-8601 — 클라이언트 타임존에서 리셋 시각이 어긋나지 않는다. */
  resetAt: string;
}

/**
 * `GET /users/search?q=` 한 줄 — 멘션 자동완성 후보(D35·ADR-0038 결정 3).
 *
 * **로그인 사용자에게만 나간다** — 비로그인에 열면 닉네임 열거 통로가 된다. `userId`가 그대로
 * 본문에 박히는 `[[user:ID]]` 토큰의 ID다.
 */
export interface UserSearchResultResponse {
  userId: number;
  nickname: string;
  /** 만료 없는 공개 URL(ADR-0035). 프로필 사진을 안 올렸으면 null. */
  profileImageUrl: string | null;
}
