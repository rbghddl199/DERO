// 일일 이미지 한도(REQ-IMG-03) 표시·판정 헬퍼 — 계정 단위 상한이라 배치와 무관하다.
//
// 한도 초과는 `GET /users/me/image-quota`가 아니라 **이미지를 만드는 경로**에서 터진다
// (`PUT /placements/{id}/feed-entry` → 429 `IMAGE_QUOTA_EXCEEDED`). 그래서 업로드 버튼을 가진
// 화면은 잔여 장수를 미리 보여 주고, 그럼에도 429가 오면 이 모듈의 문구로 안내한다.

import { ApiError } from '@/api/client';
import type { ImageQuotaResponse } from '@/types/user';

export const IMAGE_QUOTA_EXCEEDED_CODE = 'IMAGE_QUOTA_EXCEEDED';

/** 서버가 429 + `IMAGE_QUOTA_EXCEEDED`로 알린다. status만 보면 다른 레이트리밋과 섞인다. */
export function isImageQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 429 &&
    error.problem?.code === IMAGE_QUOTA_EXCEEDED_CODE
  );
}

export function remainingImageQuota(quota: ImageQuotaResponse): number {
  return Math.max(0, quota.dailyLimit - quota.usedToday);
}

/** 리셋 시각은 오프셋 포함 ISO-8601이라 Date가 사용자 타임존으로 정확히 옮겨 준다. */
export function formatQuotaResetAt(resetAt: string): string {
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return resetAt;

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** 429를 받았을 때 보여줄 문구. 한도 정보를 아직 못 받았으면 리셋 시각 없이 사실만 말한다. */
export function imageQuotaExceededMessage(quota: ImageQuotaResponse | null): string {
  if (quota === null) {
    return '오늘 쓸 수 있는 이미지 생성 횟수를 모두 사용했어요. 내일 다시 시도해 주세요.';
  }

  return `오늘 쓸 수 있는 이미지 ${quota.dailyLimit}장을 모두 사용했어요. ${formatQuotaResetAt(quota.resetAt)}에 다시 채워집니다.`;
}
