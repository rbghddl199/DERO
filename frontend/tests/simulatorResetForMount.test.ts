// 마운트 리셋이 세션 스코프 상태를 남기지 않는지 — 이전 데스크의 경고 배너가 새 데스크로
// 넘어온 결함의 회귀 가드다. 스토어는 모듈 싱글턴이라 라우트를 떠나도 살아 있어서,
// resetForMount()가 빼먹은 필드는 그대로 다음 마운트로 넘어간다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/placement', () => ({
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  uploadPlacementThumbnail: vi.fn(async () => undefined),
  getPlacement: vi.fn(),
}));

import { useSimulatorStore } from '@/store/simulatorStore';

describe('resetForMount — 이전 데스크의 세션 상태를 새 마운트로 넘기지 않는다', () => {
  beforeEach(() => {
    useSimulatorStore.getState().resetForMount();
  });

  it('경고 배너가 켜진 채로 나가도 새 마운트에서는 꺼져 있다 (증상 재현)', () => {
    useSimulatorStore.setState({ warning: { on: true, msg: '⚠ 오브젝트가 겹칩니다' } });

    useSimulatorStore.getState().resetForMount();

    expect(useSimulatorStore.getState().warning).toEqual({ on: false, msg: '' });
  });

  it('같은 누락이었던 형제 필드도 비워진다', () => {
    useSimulatorStore.setState({
      saveViolations: ['겹침'],
      toast: '저장했습니다',
      moveHistory: [{ id: 'item-1' }] as never,
      redoHistory: [{ id: 'item-1' }] as never,
      selectedItemId: 'item-1',
      selectedItemName: '27인치 모니터',
      mountJudgments: { 'item-1': 'ok' } as never,
      isFullscreen: true,
      editLocked: true,
      saving: true,
      lastSavedAt: 1_700_000_000_000,
      excludedEstimateProductIds: { 'monitor-27': true },
    });

    useSimulatorStore.getState().resetForMount();

    const s = useSimulatorStore.getState();
    expect(s.saveViolations).toEqual([]);
    expect(s.toast).toBeNull();
    expect(s.moveHistory).toEqual([]);
    expect(s.redoHistory).toEqual([]);
    expect(s.selectedItemId).toBeNull();
    expect(s.selectedItemName).toBeNull();
    expect(s.mountJudgments).toEqual({});
    expect(s.isFullscreen).toBe(false);
    expect(s.editLocked).toBe(false);
    expect(s.saving).toBe(false);
    expect(s.lastSavedAt).toBeNull();
    expect(s.excludedEstimateProductIds).toEqual({});
  });

  it('리셋마다 새 배열을 준다 — 초기값과 참조를 공유하면 한쪽 push가 다른 쪽으로 번진다', () => {
    const first = useSimulatorStore.getState().moveHistory;
    useSimulatorStore.getState().resetForMount();

    expect(useSimulatorStore.getState().moveHistory).not.toBe(first);
  });
});
