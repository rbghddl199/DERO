// 업로드 알림 스토어의 dedupe·상한·감시 해소 규칙 — 유령 알림이 쌓이거나 지워지지 않는 걸 막는다.
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_UPLOAD_NOTIFICATIONS } from '@/constants/uploadNotifications';
import { dropUnknownKinds, useUploadNotificationsStore } from '@/store/uploadNotificationsStore';

const OWNER = 'u-1';

const start = (placementId: number, title = `desk-${placementId}`) => {
  useUploadNotificationsStore.getState().startWatch({ placementId, title, ownerId: OWNER });
};

describe('uploadNotificationsStore', () => {
  beforeEach(() => {
    useUploadNotificationsStore.setState({ notifications: [], watches: [] });
  });

  it('같은 배치를 두 번 startWatch해도 감시와 알림이 각각 하나뿐이다', () => {
    start(1);
    start(1);

    const state = useUploadNotificationsStore.getState();
    expect(state.watches).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.id).toBe('1:started');
  });

  it('startWatch는 그 배치의 이전 실패 알림을 지운다 — 재시도 중에 옛 실패가 남으면 오판한다', () => {
    start(1);
    useUploadNotificationsStore.getState().resolveWatch(1, 'failed');
    expect(useUploadNotificationsStore.getState().notifications.map((n) => n.id)).toContain(
      '1:failed',
    );

    start(1);

    const ids = useUploadNotificationsStore.getState().notifications.map((n) => n.id);
    expect(ids).toEqual(['1:started']);
  });

  it('resolveWatch는 감시를 지우고 결과 알림을 남긴다', () => {
    start(1, '내 첫 데스크');

    useUploadNotificationsStore.getState().resolveWatch(1, 'succeeded');

    const state = useUploadNotificationsStore.getState();
    expect(state.watches).toHaveLength(0);
    expect(state.notifications[0]).toMatchObject({
      id: '1:succeeded',
      kind: 'succeeded',
      placementId: 1,
      title: '내 첫 데스크',
      ownerId: OWNER,
    });
  });

  it('감시가 없는 배치의 resolveWatch는 아무 알림도 만들지 않는다', () => {
    useUploadNotificationsStore.getState().resolveWatch(99, 'succeeded');

    expect(useUploadNotificationsStore.getState().notifications).toHaveLength(0);
  });

  it('dropWatch는 알림 없이 감시만 접는다 — 공개취소·삭제는 알릴 게 없다', () => {
    start(1);

    useUploadNotificationsStore.getState().dropWatch(1);

    const state = useUploadNotificationsStore.getState();
    expect(state.watches).toHaveLength(0);
    expect(state.notifications.map((n) => n.id)).toEqual(['1:started']);
  });

  it('forgetPlacement는 그 배치의 감시와 알림 전부를 지운다', () => {
    start(1);
    start(2);
    useUploadNotificationsStore.getState().resolveWatch(1, 'succeeded');

    useUploadNotificationsStore.getState().forgetPlacement(1);

    const state = useUploadNotificationsStore.getState();
    expect(state.notifications.every((n) => n.placementId === 2)).toBe(true);
    expect(state.watches.map((w) => w.placementId)).toEqual([2]);
  });

  it(`알림은 ${MAX_UPLOAD_NOTIFICATIONS}개로 잘린다 — persist된 배열이 무한히 자라지 않는다`, () => {
    for (let placementId = 1; placementId <= MAX_UPLOAD_NOTIFICATIONS + 1; placementId += 1) {
      start(placementId);
    }

    const { notifications } = useUploadNotificationsStore.getState();
    expect(notifications).toHaveLength(MAX_UPLOAD_NOTIFICATIONS);
    // 최신순이라 마지막에 넣은 것이 앞에 오고, 가장 오래된 1번이 밀려난다
    expect(notifications[0]?.id).toBe(`${MAX_UPLOAD_NOTIFICATIONS + 1}:started`);
    expect(notifications.map((n) => n.id)).not.toContain('1:started');
  });

  it('markAllRead는 미읽음을 전부 읽음으로 바꾼다', () => {
    start(1);
    start(2);

    useUploadNotificationsStore.getState().markAllRead();

    expect(useUploadNotificationsStore.getState().notifications.every((n) => n.isRead)).toBe(true);
  });

  it('removeNotification·clearAll은 알림만 지우고 감시는 남긴다', () => {
    start(1);
    start(2);

    useUploadNotificationsStore.getState().removeNotification('1:started');
    expect(useUploadNotificationsStore.getState().notifications.map((n) => n.id)).toEqual([
      '2:started',
    ]);

    useUploadNotificationsStore.getState().clearAll();
    const state = useUploadNotificationsStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.watches).toHaveLength(2);
  });
});

// localStorage에 남은 폐기 kind가 그대로 복원돼 알림 벨이 죽었다(2026-08-02 `timedOut` 제거 직후).
describe('dropUnknownKinds (persist migrate)', () => {
  const known = {
    id: '1:started',
    kind: 'started',
    placementId: 1,
    title: 'desk-1',
    createdAt: '2026-08-02T07:00:00.000Z',
    isRead: false,
    ownerId: OWNER,
  };
  const retired = { ...known, id: '9:timedOut', kind: 'timedOut', placementId: 9, title: 'stale' };

  it('폐기된 kind의 알림을 버리고 알려진 kind만 남긴다', () => {
    const migrated = dropUnknownKinds({ notifications: [retired, known], watches: [] }) as {
      notifications: { id: string }[];
    };

    expect(migrated.notifications.map((n) => n.id)).toEqual(['1:started']);
  });

  it('watches는 손대지 않는다 — 스키마가 바뀐 적 없다', () => {
    const watches = [{ placementId: 1, title: 'desk-1', startedAt: 1785000000000, ownerId: OWNER }];

    const migrated = dropUnknownKinds({ notifications: [], watches }) as { watches: unknown[] };

    expect(migrated.watches).toEqual(watches);
  });

  it('객체가 아니거나 notifications가 배열이 아닌 저장분에도 죽지 않는다', () => {
    expect(dropUnknownKinds(null)).toBeNull();
    expect(dropUnknownKinds('broken')).toBe('broken');
    expect(dropUnknownKinds({ notifications: undefined })).toEqual({ notifications: undefined });
  });
});
