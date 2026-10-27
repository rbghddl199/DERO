// 업로드(컬렉션 공개) 요청 실패를 사용자에게 보여줄 문구로 바꾼다.
//
// 서버 ProblemDetail.detail이 이미 한국어 사유다(422 판정 실패·422 스크린샷 없음·429 한도 초과 —
// api-spec.md §4) — 프론트에서 코드별로 문구를 다시 쓰면 백엔드가 문구를 고칠 때 둘이 갈린다.
// 그래서 detail을 그대로 쓰고, 그게 없을 때만(네트워크 실패 등) 기본 문구로 떨어진다.

import { ApiError } from '@/api/client';

export function placementPublishErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.problem?.detail) return error.problem.detail;
  if (error instanceof ApiError) return error.message;
  return '업로드 요청에 실패했어요. 잠시 후 다시 시도해 주세요.';
}
