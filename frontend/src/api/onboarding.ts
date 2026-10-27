// 온보딩(닉네임·약관) — GET /terms · POST /users/me/consents · PATCH /users/me.
// 전용 온보딩 상태 조회는 없다: 완료 여부는 GET /users/me의 onboardingRequired 하나뿐이고
// 그건 Auth Adapter가 UserSession으로 실어 온다(api-spec.md §3).

import { apiClient } from '@/api/client';
import type { components } from '@/types/openapi';

type Schemas = components['schemas'];

export type TermsResponse = Schemas['TermsResponse'];
export type ConsentCreateRequest = Schemas['ConsentCreateRequest'];
export type UserMePatchRequest = Schemas['UserMePatchRequest'];
export type UserMeResponse = Schemas['UserMeResponse'];

/** 항목별 현행 회차 하나씩. 비로그인도 200이라 가입 화면이 토큰 없이 그릴 수 있다. */
export function fetchTerms(): Promise<TermsResponse[]> {
  return apiClient.get<TermsResponse[]>('/terms');
}

/**
 * 동의 기록 → 201(본문 없음). <b>요청은 한 번</b>이다 — 항목마다 부르면 중간에 끊긴 부분 동의가
 * 남는다. 필수 항목이 빠지면 422(`USER_REQUIRED_TERMS_NOT_AGREED`)이고 서버에 아무 행도 안 남는다.
 */
export function submitConsents(termsIds: number[]): Promise<void> {
  return apiClient.post<void>('/users/me/consents', { termsIds } satisfies ConsentCreateRequest);
}

/** 닉네임 변경. 전용 경로가 아니라 프로필 수정 재사용이고, 중복이면 409로 떨어진다. */
export function updateNickname(nickname: string): Promise<UserMeResponse> {
  return apiClient.patch<UserMeResponse>('/users/me', {
    nickname,
  } satisfies UserMePatchRequest);
}
