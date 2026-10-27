// 약관 항목 코드(TERMS_OF_SERVICE) ↔ 공개 페이지 슬러그(terms-of-service) 변환과 항목 조회.
// 매핑 테이블을 두지 않는 순수 문자열 규칙이다 — 백엔드가 항목을 추가해도 프론트를 고칠 일이 없다.
// 주소는 회차가 아니라 항목 기준이라(/terms/152 없음) 항상 현행 회차가 뜬다.

import type { TermsResponse } from '@/api/onboarding';

/** TERMS_OF_SERVICE → terms-of-service */
export function termsSlugFromCode(code: string): string {
  return code.toLowerCase().replaceAll('_', '-');
}

/** terms-of-service → TERMS_OF_SERVICE */
export function termsCodeFromSlug(slug: string): string {
  return slug.toUpperCase().replaceAll('-', '_');
}

/**
 * 본문이 있는 항목만 공개 페이지를 가진다 — 관리자가 content_key를 올리지 않은 항목(AGE_OVER_14)은
 * 백엔드가 contentUrl을 null로 준다. 타입 가드로 좁혀 두면 호출부에서 다시 null 체크할 일이 없다.
 */
export function hasTermsContent(
  item: TermsResponse,
): item is TermsResponse & { contentUrl: string } {
  return typeof item.contentUrl === 'string' && item.contentUrl.length > 0;
}

/** GET /terms 응답(항목별 현행 회차)에서 슬러그에 해당하는 항목. 없으면 null → 호출부가 404. */
export function findTermsBySlug(
  terms: readonly TermsResponse[],
  slug: string,
): TermsResponse | null {
  const code = termsCodeFromSlug(slug);
  return terms.find((item) => item.code === code) ?? null;
}

/** 항목의 약관 페이지 경로. 본문이 없거나 code가 없으면 null — 링크 자체를 렌더하지 않는다. */
export function termsPagePath(item: TermsResponse): string | null {
  if (item.code === undefined || !hasTermsContent(item)) {
    return null;
  }
  return `/terms/${termsSlugFromCode(item.code)}`;
}

/**
 * 시행일 표기 — "2026년 8월 3일". effectiveAt은 date-time이라 시분초가 붙어 오는데 시행일은 날짜만
 * 쓴다. 타임존을 Asia/Seoul로 고정하는 건 이 값이 서버(RSC)에서 렌더돼 컨테이너 TZ(UTC)에 따라
 * 하루가 밀릴 수 있기 때문이다 — 한국 서비스 약관이므로 KST가 정답이다.
 */
export function formatTermsEffectiveDate(isoString: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).formatToParts(new Date(isoString));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}년 ${get('month')}월 ${get('day')}일`;
}
