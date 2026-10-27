// 약관 공개 페이지(/terms/[slug]) 전용 서버 fetch — RSC에서만 부른다.
//
// apiClient를 쓰지 않는 이유가 두 가지다. ① 모듈 스코프에 refreshCoordinator 싱글턴을 들고 있어
// 서버에서 요청 간 공유된다. ② RequestInit만 받아 Next의 `next: { revalidate }`를 넘길 수 없다.
// GET /terms는 인증이 필요 없으니(🔓) 토큰 로직 없는 순수 fetch로 충분하다.
//
// 본문 fetch도 여기(서버)에서 한다. contentUrl은 백엔드가 발급한 presigned GET URL(TTL 15분)이라
// 브라우저에 내리면 ⓐ S3 CORS에 걸리고 ⓑ 만료되는 서명이 그대로 노출된다 — 마크다운 텍스트만 넘긴다.

import 'server-only';

import { API_BASE_URL } from '@/constants/api';
import type { TermsResponse } from '@/api/onboarding';

/** 목록과 본문 모두 같은 주기로 갱신한다 — 약관 개정은 재배포 없이 이 시간 뒤에 반영된다. */
const TERMS_REVALIDATE_SECONDS = 60;

/**
 * 항목별 현행 회차 목록. generateMetadata와 페이지가 각각 부르지만 Next의 요청 메모이제이션이
 * 같은 요청 안의 동일 fetch를 합쳐 실제 호출은 한 번이다.
 */
export async function fetchCurrentTerms(): Promise<TermsResponse[]> {
  const response = await fetch(`${API_BASE_URL}/terms`, {
    next: { revalidate: TERMS_REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`약관 목록 조회 실패 — GET /terms ${response.status}`);
  }
  return (await response.json()) as TermsResponse[];
}

/** presigned GET URL에서 마크다운 원문을 읽는다. 실패를 삼키면 빈 약관 화면이 되므로 던진다. */
export async function fetchTermsMarkdown(contentUrl: string): Promise<string> {
  const response = await fetch(contentUrl, {
    next: { revalidate: TERMS_REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`약관 본문 조회 실패 — ${response.status}`);
  }
  return response.text();
}
