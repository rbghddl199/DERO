// 호환성 판정 API — POST /api/v1/compatibility/judgments (ADR-0004 "WAS가 정본")
import { apiClient } from './client';
import type { JudgmentRequest, JudgmentResponse } from '@/types/compatibility';

/**
 * 서버 정본 판정을 받아 온다. **저장하지 않는 계산**이라 200이고 만들어지는 리소스가 없다 —
 * 비로그인도 그대로 부를 수 있다(SecurityConfig가 이 경로만 POST 한정으로 열어 둔다).
 *
 * 프론트의 `collision.ts` 판정은 화면을 0ms에 되받아치는 **미러**이고, 이 응답이 오면 서버가
 * 이긴다(ADR-0009 결정 6). mock 모드에서 부르지 말 것 — 호출부가 걸러야 한다. 목업 카탈로그의
 * spec id는 백엔드 `product.id`가 아니라 서버가 풀 수 없다.
 */
export function judgeCompatibility(request: JudgmentRequest): Promise<JudgmentResponse> {
  return apiClient.post<JudgmentResponse>('/compatibility/judgments', request);
}
