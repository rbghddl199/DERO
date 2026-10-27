// 온보딩 화면의 순수 규칙 — 어디로 보낼지, 제출 버튼을 언제 열지, 어떤 실패를 필드에 붙일지.
// 렌더링 없이 검증할 수 있게 컴포넌트에서 분리한다(vitest는 node 환경이라 DOM이 없다).

import type { TermsResponse } from '@/api/onboarding';
import { sanitizeReturnTo } from '@/utils/auth/returnTo';

export const ONBOARDING_PATH = '/onboarding';

/** 중복 닉네임의 백엔드 코드(UserErrorCode). 이 값만 입력칸에 붙이고 나머지는 화면 전체 오류다. */
export const NICKNAME_DUPLICATED_CODE = 'USER_NICKNAME_DUPLICATED';

/**
 * 로그인 직후 목적지. 온보딩이 남아 있으면 원래 가려던 곳을 쿼리로 넘겨 온보딩 화면이 이어받는다 —
 * 저장소의 returnTo는 콜백에서 이미 한 번 소비되므로 여기서 잃어버리면 복구할 방법이 없다.
 */
export function resolvePostLoginDestination(
  onboardingRequired: boolean,
  returnTo: string | null,
): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (!onboardingRequired) {
    return safeReturnTo;
  }
  return safeReturnTo === '/'
    ? ONBOARDING_PATH
    : `${ONBOARDING_PATH}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

/** 필수 항목이 하나라도 안 체크돼 있으면 제출을 막는다. 선택 항목은 조건이 아니다. */
export function canSubmitConsents(
  terms: TermsResponse[],
  checkedIds: ReadonlySet<number>,
): boolean {
  const required = terms.filter((item) => item.required === true);
  if (required.length === 0) {
    return false;
  }
  return required.every((item) => item.id !== undefined && checkedIds.has(item.id));
}

/** 서버로 보낼 동의 목록 — 체크된 것 전부(선택 항목 포함)를 한 번에 싣는다. */
export function checkedTermsIds(terms: TermsResponse[], checkedIds: ReadonlySet<number>): number[] {
  return terms
    .map((item) => item.id)
    .filter((id): id is number => id !== undefined && checkedIds.has(id));
}
