'use client';
// 상단바 알림 벨 — 컬렉션 업로드 진행(시작·완료·실패)을 알린다. 종전엔 업로드 직후 로컬에서 만든
// 카드를 컬렉션에 끼워 넣어 상상도 없는 글이 컬렉션에 보였다(2026-08-02 수정) — 그 자리를 이 알림이 맡는다.
//
// 아이콘은 디자인 에셋(`@/assets/icons/notification.svg`)을 `next/image`로 쓴다(EstimatePanel과 같은
// 관례). stroke가 `#292929` 고정이라 hover로 아이콘 색은 바뀌지 않는다 — 바뀌는 건 배경(`hover:bg-fog`)
// 뿐이다. 색을 상태에 따라 바꾸려면 인라인 SVG로 되돌려 `currentColor`를 써야 한다.
//
// BodyPortal을 쓰지 않는다: <header>는 sticky이고 조상에 transform/filter가 없어 relative 기준
// absolute 앵커링이 정상 동작한다. 또 이 스토어는 skipHydration이라 SSR과 클라이언트 첫 렌더가 둘 다
// 빈 배열이므로 마운트 가드(isMounted)도 필요 없다(common/CLAUDE.md의 ScrollProgress 함정은 포털이
// SSR에서 null을 반환해서 생긴 것이다).

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import NotificationIcon from '@/assets/icons/notification.svg';
import type { InlineNoticeVariant } from '@/components/common/InlineNotice';
import { UPLOAD_NOTIFICATION_COPY, uploadNotificationHref } from '@/constants/uploadNotifications';
import { useAuthStore } from '@/store/authStore';
import { useUploadNotificationsStore } from '@/store/uploadNotificationsStore';
import { formatRelativeTime } from '@/utils/formatRelativeTime';

/** InlineNotice의 색 축을 점 하나로 옮긴 것 — 목록 항목엔 그 컴포넌트의 aside 마크업이 맞지 않는다. */
const TONE_DOT_CLASS: Record<InlineNoticeVariant, string> = {
  info: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-danger-500',
};

type Props = {
  /** 팝업 안 알림 링크로 이동할 때 호출 — 모바일 햄버거 패널이 자기 자신도 닫는 데 쓴다. */
  onNavigate?: () => void;
};

const UploadNotificationBell = ({ onNavigate }: Props) => {
  const auth = useAuthStore((s) => s.auth);
  const notifications = useUploadNotificationsStore((s) => s.notifications);
  const markAllRead = useUploadNotificationsStore((s) => s.markAllRead);
  const removeNotification = useUploadNotificationsStore((s) => s.removeNotification);
  const clearAll = useUploadNotificationsStore((s) => s.clearAll);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // TopNavbar의 프로필 버튼과 같은 판정 — status만 엄격히 보면(useIsAuthenticated) 토큰 회전 중
  // (loading) 벨이 사라졌다 다시 나타난다.
  const session =
    auth.status === 'authenticated' || (auth.status === 'error' && auth.session !== null)
      ? auth.session
      : null;

  // 파생은 셀렉터가 아니라 본문에서 — 셀렉터에서 filter하면 스냅샷마다 새 참조라 무한 리렌더다.
  const mine =
    session === null ? [] : notifications.filter((item) => item.ownerId === session.userId);
  const unreadCount = mine.filter((item) => !item.isRead).length;
  const latestUnread = mine.find((item) => !item.isRead) ?? null;

  if (session === null) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          // 부수효과는 updater 밖에서 부른다 — React는 updater를 렌더 단계에(StrictMode에선 순수성
          // 검사로 두 번) 호출하므로, 그 안에서 zustand set()을 쓰면 자기 렌더 도중에 스토어가 바뀌어
          // "Cannot update a component while rendering" 경고가 나고 부수효과도 중복 실행된다.
          if (!isOpen) markAllRead();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}건` : '알림'}
        className="text-ink hover:bg-fog relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors"
      >
        {/* alt=""는 장식 취급 — 이 버튼이 무엇인지는 위 aria-label이 말한다(EstimatePanel과 같은 관례) */}
        <Image src={NotificationIcon} alt="" width={20} height={20} />
        {/* 개수는 트리거의 aria-label이 이미 말한다 — 배지를 읽히면 중복 낭독이다 */}
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="bg-danger-500 text-paper absolute top-1 right-1 flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] leading-4 font-bold tabular-nums"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {/* 새 알림 도착을 스크린리더에 알린다 — 최신 1건만 넣는다(목록 전체를 넣으면 매번 다 읽는다) */}
      <span role="status" aria-live="polite" className="sr-only">
        {latestUnread === null
          ? ''
          : `${UPLOAD_NOTIFICATION_COPY[latestUnread.kind].title}: ${latestUnread.title}`}
      </span>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="알림"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            setIsOpen(false);
            triggerRef.current?.focus();
          }}
          className="bg-paper border-ash/40 absolute top-[calc(100%+8px)] right-0 z-50 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-lg border shadow-lg"
        >
          <div className="border-ash/20 flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-ink text-[14px] font-semibold">알림</span>
            {mine.length > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="text-ash hover:text-ink cursor-pointer text-[12px] transition-colors"
              >
                모두 지우기
              </button>
            ) : null}
          </div>

          {mine.length === 0 ? (
            <p className="text-ash px-4 py-8 text-center text-[13px]">아직 알림이 없어요.</p>
          ) : (
            <ul className="divide-ash/20 max-h-[360px] divide-y overflow-y-auto">
              {mine.map((item) => {
                const copy = UPLOAD_NOTIFICATION_COPY[item.kind];
                return (
                  <li key={item.id} className="flex items-start gap-2 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_DOT_CLASS[copy.tone]}`}
                    />
                    <Link
                      href={uploadNotificationHref(item.kind, item.placementId)}
                      onClick={() => {
                        setIsOpen(false);
                        onNavigate?.();
                      }}
                      className="min-w-0 flex-1"
                    >
                      <span className="text-ink block text-[13px] font-semibold">{copy.title}</span>
                      <span className="text-ash mt-0.5 block truncate text-[12px]">
                        {item.title}
                      </span>
                      <span className="text-ash mt-0.5 block text-[12px]">
                        {formatRelativeTime(item.createdAt)} · {copy.actionLabel}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeNotification(item.id)}
                      aria-label="알림 지우기"
                      className="text-ash hover:text-ink cursor-pointer text-[14px] leading-none transition-colors"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default UploadNotificationBell;
