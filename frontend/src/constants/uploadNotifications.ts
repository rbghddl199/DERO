// 배치 업로드(컬렉션 공개) 진행 알림의 상한·문구 — 상단 알림 벨(UploadNotificationBell)이 쓴다.

import type { InlineNoticeVariant } from '@/components/common/InlineNotice';

/** persist된 배열에 상한이 없던 게 유령 카드 누수의 원인이었다 — 알림·감시 둘 다 상한을 둔다. */
export const MAX_UPLOAD_NOTIFICATIONS = 20;
/** 하루 이미지 한도가 있어 현실적으로 이걸 넘지 않지만, 방어적으로 자른다. */
export const MAX_UPLOAD_WATCHES = 5;

/** 시작과 완료(성공·실패)만 알린다 — 폴링 상한을 넘긴 건은 알림 없이 감시만 접는다(2026-08-02 요청). */
export type UploadNotificationKind = 'started' | 'succeeded' | 'failed';

type UploadNotificationCopy = {
  /** InlineNotice와 같은 의미 축을 쓴다 — 알림 항목의 점 색이 여기서 나온다. */
  tone: InlineNoticeVariant;
  title: string;
  body: string;
  actionLabel: string;
};

export const UPLOAD_NOTIFICATION_COPY: Record<UploadNotificationKind, UploadNotificationCopy> = {
  started: {
    tone: 'info',
    title: '업로드가 시작됐어요',
    body: 'AI 상상도를 만드는 중이에요. 완료되면 알려드려요.',
    actionLabel: '작업실에서 보기',
  },
  succeeded: {
    tone: 'success',
    title: '컬렉션에 공개됐어요',
    body: '상상도가 붙어 컬렉션에 올라갔어요.',
    actionLabel: '올린 데스크 보기',
  },
  failed: {
    tone: 'error',
    title: '업로드에 실패했어요',
    // 재시도 입구는 작업실 카드의 "다시 올리기"다(D33·ADR-0036 — 게시 입구가 작업실로 왔다).
    body: '상상도를 만들지 못했어요. 작업실에서 다시 올려 주세요.',
    actionLabel: '다시 올리기',
  },
};

/** 알림을 눌렀을 때 갈 곳. `succeeded`만 상세가 실제로 열린다(그때 비로소 PUBLIC이다).
 *  나머지(`started`·`failed`)는 작업실로 — 진행 중인 카드도, 다시 올리는 시트도 거기 있다
 *  (D33·ADR-0036으로 게시 입구가 작업실로 왔다). */
export function uploadNotificationHref(kind: UploadNotificationKind, placementId: number): string {
  if (kind === 'succeeded') return `/collection/${placementId}`;
  return '/craft';
}
