// 배치 업로드(컬렉션 공개) 진행 알림 — 202를 받은 배치를 감시 목록에 넣고, PUBLIC/FAILED로
// 확정되면 알림으로 바꾼다. 감시와 알림이 같은 트랜지션에서 움직이므로 한 스토어에 둔다.
// localStorage에 저장한다 — 워커가 몇 분 걸리는 데다(PUBLISH_POLL_TIMEOUT_MS 360s) 그 사이
// 새로고침·화면 이동이 일어나므로, 감시가 메모리에만 있으면 완료 알림이 사라진다.
// skipHydration + PersistedInteractionsBootstrap의 수동 rehydrate는 다른 persist 스토어와 같다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MAX_UPLOAD_NOTIFICATIONS,
  MAX_UPLOAD_WATCHES,
  UPLOAD_NOTIFICATION_COPY,
  type UploadNotificationKind,
} from '@/constants/uploadNotifications';
import { mapSetJsonStorage } from './mapSetJsonStorage';

export type UploadNotification = {
  /** dedupe 키 — `${placementId}:${kind}`. 같은 배치를 재시도해도 같은 종류가 두 줄 쌓이지 않는다. */
  id: string;
  kind: UploadNotificationKind;
  placementId: number;
  /** 업로드 시점 제목 스냅샷 — 알림은 배치가 지워진 뒤에도 읽을 수 있어야 한다. */
  title: string;
  /** ISO 8601 — formatRelativeTime에 그대로 넣는다. */
  createdAt: string;
  isRead: boolean;
  /** 만든 사용자(UserSession.userId) — 공용 브라우저에서 남의 알림을 보여주지 않기 위한 필터 키. */
  ownerId: string;
};

export type UploadWatch = {
  placementId: number;
  title: string;
  /** 폴링 데드라인의 기준. 새로고침해도 살아야 하므로 epoch ms로 저장한다. */
  startedAt: number;
  ownerId: string;
};

/** 종료 상태 — started(진행 중)와 달리 이 둘은 감시가 끝났음을 뜻한다. */
type TerminalKind = Exclude<UploadNotificationKind, 'started'>;

type StartWatchInput = { placementId: number; title: string; ownerId: string };

type UploadNotificationsStore = {
  /** 최신순 */
  notifications: readonly UploadNotification[];
  /** 아직 PENDING인 배치들 — 전역 워처(UploadWatcherBootstrap)가 이 목록만 폴링한다. */
  watches: readonly UploadWatch[];

  /** 202 직후. 같은 배치의 기존 감시·종료 알림을 걷어내고 started를 쌓는다(재시도도 같은 PUT이다). */
  startWatch: (input: StartWatchInput) => void;
  /** 폴링이 종료 상태를 확정했을 때 — 감시를 지우고 그 결과 알림을 쌓는다. */
  resolveWatch: (placementId: number, kind: TerminalKind) => void;
  /** 알림 없이 감시만 접는다 — 배치가 삭제(404)됐거나 사용자가 공개를 취소(PRIVATE)했을 때. */
  dropWatch: (placementId: number) => void;
  /** 공개취소·삭제 — 그 배치의 감시와 알림 전부를 지운다(상세가 404가 되므로 알림은 죽은 링크다). */
  forgetPlacement: (placementId: number) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
};

const notificationId = (placementId: number, kind: UploadNotificationKind): string =>
  `${placementId}:${kind}`;

/** 같은 id를 밀어내고 앞에 붙인 뒤 상한으로 자른다 — 중복과 무한 증가를 한 곳에서 막는다. */
const pushNotification = (
  prev: readonly UploadNotification[],
  next: UploadNotification,
): readonly UploadNotification[] =>
  [next, ...prev.filter((item) => item.id !== next.id)].slice(0, MAX_UPLOAD_NOTIFICATIONS);

/** localStorage는 외부 입력이다 — 종류를 하나 없애도(2026-08-02 `timedOut` 폐기) 그 전에 저장된
 *  항목은 그대로 복원된다. 그러면 UPLOAD_NOTIFICATION_COPY 조회가 undefined라 알림 벨 렌더가
 *  통째로 죽는다. 복원 경계에서 걸러야 컴포넌트가 kind 타입을 그대로 신뢰할 수 있다. */
export const dropUnknownKinds = (persisted: unknown): unknown => {
  if (persisted === null || typeof persisted !== 'object') return persisted;
  const state = persisted as { notifications?: unknown };
  if (!Array.isArray(state.notifications)) return persisted;
  return {
    ...state,
    notifications: state.notifications.filter(
      (item): item is UploadNotification =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as UploadNotification).kind === 'string' &&
        (item as UploadNotification).kind in UPLOAD_NOTIFICATION_COPY,
    ),
  };
};

export const useUploadNotificationsStore = create<UploadNotificationsStore>()(
  persist(
    (set) => ({
      notifications: [],
      watches: [],

      startWatch: ({ placementId, title, ownerId }) => {
        set((state) => {
          // 이전 종료 알림을 먼저 지운다 — "다시 시도"를 눌렀는데 예전 실패 알림이 남아 있으면
          // 사용자가 최신 상태를 오판한다.
          const kept = state.notifications.filter(
            (item) => item.placementId !== placementId || item.kind === 'started',
          );
          return {
            notifications: pushNotification(kept, {
              id: notificationId(placementId, 'started'),
              kind: 'started',
              placementId,
              title,
              createdAt: new Date().toISOString(),
              isRead: false,
              ownerId,
            }),
            watches: [
              { placementId, title, startedAt: Date.now(), ownerId },
              ...state.watches.filter((watch) => watch.placementId !== placementId),
            ].slice(0, MAX_UPLOAD_WATCHES),
          };
        });
      },

      resolveWatch: (placementId, kind) => {
        set((state) => {
          const watch = state.watches.find((item) => item.placementId === placementId);
          if (watch === undefined) return state;
          return {
            notifications: pushNotification(state.notifications, {
              id: notificationId(placementId, kind),
              kind,
              placementId,
              title: watch.title,
              createdAt: new Date().toISOString(),
              isRead: false,
              ownerId: watch.ownerId,
            }),
            watches: state.watches.filter((item) => item.placementId !== placementId),
          };
        });
      },

      dropWatch: (placementId) => {
        set((state) => ({
          watches: state.watches.filter((watch) => watch.placementId !== placementId),
        }));
      },

      forgetPlacement: (placementId) => {
        set((state) => ({
          notifications: state.notifications.filter((item) => item.placementId !== placementId),
          watches: state.watches.filter((watch) => watch.placementId !== placementId),
        }));
      },

      markAllRead: () => {
        set((state) => ({
          notifications: state.notifications.map((item) =>
            item.isRead ? item : { ...item, isRead: true },
          ),
        }));
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((item) => item.id !== id),
        }));
      },

      clearAll: () => {
        set({ notifications: [] });
      },
    }),
    {
      name: 'dero-upload-notifications',
      // Map·Set을 안 쓰지만 mapSetJsonStorage는 SSR-safe(window 가드) JSON 스토리지라 재사용한다.
      storage: mapSetJsonStorage,
      skipHydration: true,
      // 0(version 필드가 없던 저장분)에서 반드시 한 번 돈다 — 폐기 kind를 여기서 걷어낸다.
      version: 1,
      migrate: dropUnknownKinds,
      partialize: (state) => ({ notifications: state.notifications, watches: state.watches }),
    },
  ),
);
