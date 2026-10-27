// 배치 업로드(컬렉션 공개)의 표시 문구·백엔드 에러 코드·폴링 주기 — publishStatus 4값은 ADR-0015 결정 1.

import type { PublishStatus } from '@/types/placement';

/** 카드 배지 문구. 컬렉션에 실제로 뜨는 건 PUBLIC 하나뿐이다. */
export const PUBLISH_STATUS_LABEL: Record<PublishStatus, string> = {
  PRIVATE: '비공개',
  PENDING: '업로드 중',
  PUBLIC: '컬렉션 공개됨',
  FAILED: '업로드 실패',
};

/** `PUT /placements/{id}/feed-entry`가 낼 수 있는 ProblemDetail.code(api-spec.md §4). */
export const PUBLISH_ERROR_CODES = {
  judgmentFailed: 'PLACEMENT_JUDGMENT_FAILED',
  thumbnailRequired: 'PLACEMENT_THUMBNAIL_REQUIRED',
  quotaExceeded: 'IMAGE_QUOTA_EXCEEDED',
  notFound: 'PLACEMENT_NOT_FOUND',
} as const;

/** 진행 조회 엔드포인트가 없어 `GET /placements/{id}`를 되풀이한다(ADR-0015 결정 10).
 *  상한을 두는 이유는 워커가 노트북이라 몇 분씩 끊길 수 있어서다 — 무한 폴링은 탭을 계속 태운다.
 *  상한 5분은 백엔드 `app.image.generation.read-timeout`(300s)과 **정확히 같다**(2026-08-02 지시로
 *  360s → 300s). 그래서 그 경계에서 끝나는 정상 생성은 감시를 놓칠 수 있다 — 넘긴 건은 알림 없이
 *  조용히 접히므로(UploadWatcherBootstrap) 사용자는 새로고침해야 결과를 본다. 1건당 최대 100요청. */
export const PUBLISH_POLL_INTERVAL_MS = 3_000;
export const PUBLISH_POLL_TIMEOUT_MS = 300_000;
