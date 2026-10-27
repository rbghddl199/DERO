// undo/redo 높이 단위 회귀 — restorePose 5번째 인자는 mm, 스택 pose.y는 m(center.y 출처)다.
// 변환 없이 넘기면 높이가 1/1000로 붕괴해 아이템이 바닥으로 떨어진다 (DERO-448).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSimulatorStore } from '@/store/simulatorStore';

const restorePose = vi.fn(() => true);

/** undo/redo가 실제로 만지는 엔진 표면만 흉내 낸다 — 상판 위 0.8m에 아이템 1개. */
function fakeSim(): unknown {
  return {
    placed: () => [
      { id: 'p1', center: { x: 0.1, y: 0.8, z: -0.2 }, yawDeg: 45, mountedToId: null },
    ],
    restorePose,
  };
}

describe('실행취소/다시실행 높이 단위', () => {
  beforeEach(() => {
    restorePose.mockClear();
    useSimulatorStore.setState({
      sim: fakeSim() as never,
      moveHistory: [],
      redoHistory: [],
      editLocked: false,
      selectedItemId: null,
    });
  });

  it('undo는 저장된 pose.y(m)를 mm로 바꿔 restorePose에 넘긴다', () => {
    useSimulatorStore.setState({
      moveHistory: [{ kind: 'move', id: 'p1', pose: { x: 0.3, y: 0.75, z: -0.1, yawDeg: 90 } }],
    });

    useSimulatorStore.getState().undoLastMove();

    expect(restorePose).toHaveBeenCalledTimes(1);
    const [, , , , yMm] = restorePose.mock.calls[0] as unknown as number[];
    expect(yMm).toBeCloseTo(750, 6); // m 그대로면 0.75가 들어와 mmToM에서 0.00075m로 붕괴한다
    // 반대 스택에는 현재 포즈가 m 단위 그대로 쌓인다 — 스택 규약은 center.y와 같다.
    const redone = useSimulatorStore.getState().redoHistory[0];
    if (redone?.kind !== 'move') throw new Error('move 항목이어야 한다');
    expect(redone.pose.y).toBeCloseTo(0.8, 6);
  });

  it('redo도 같은 단위 규약을 지킨다', () => {
    useSimulatorStore.setState({
      redoHistory: [{ kind: 'move', id: 'p1', pose: { x: 0.2, y: 0.9, z: 0, yawDeg: 0 } }],
    });

    useSimulatorStore.getState().redoMove();

    expect(restorePose).toHaveBeenCalledTimes(1);
    const [, , , , yMm] = restorePose.mock.calls[0] as unknown as number[];
    expect(yMm).toBeCloseTo(900, 6);
    const undone = useSimulatorStore.getState().moveHistory[0];
    if (undone?.kind !== 'move') throw new Error('move 항목이어야 한다');
    expect(undone.pose.y).toBeCloseTo(0.8, 6);
  });
});
