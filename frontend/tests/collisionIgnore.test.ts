// 충돌 무시 토글이 저장 게이트에서 겹침만 통과시키는지 — 경계 위반은 계속 막아야 한다
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/placement', () => ({
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  uploadPlacementThumbnail: vi.fn(async () => undefined),
  getPlacement: vi.fn(),
}));

import { createPlacement } from '@/api/placement';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useCraftProjectsStore } from '@/store/craftProjectsStore';
import type { PlacementSaveResponse } from '@/types/placement';

/** trySave가 만지는 엔진 표면만 흉내 낸다 — 위반 두 축을 인자로 갈아 끼운다.
 *  (placementSaveThumbnail.test.ts의 fakeSim과 같은 시임, 위반 플래그만 열었다.) */
function fakeSim(opts: { collision: boolean; boundary: boolean }): unknown {
  return {
    anyCollision: () => opts.collision,
    anyBoundaryViolation: () => opts.boundary,
    setCollisionIgnored: () => undefined,
    deskConfig: () => ({
      source: 'custom',
      widthMm: 1400,
      depthMm: 700,
      heightMm: 720,
      topThicknessMm: 25,
      edgeThicknessMm: null,
      deskTextureId: null,
      frameType: 't-frame',
      materialId: 'oak',
    }),
    placed: () => [
      {
        id: 'item-1',
        backendId: 501,
        spec: { id: 'monitor-27', name: '27인치 모니터' },
        center: { x: 0, y: 0.8, z: 0 },
        yawDeg: 0,
        mountedToId: null,
      },
    ],
    jointStates: () => [],
    emitterInfo: () => null,
    setBackendId: () => undefined,
  };
}

const SAVE_RESPONSE: PlacementSaveResponse = {
  id: 207,
  updatedAt: '2026-08-02T23:10:00+09:00',
  version: 1,
  items: [{ ref: 'item-1', id: 501 }],
  violations: [],
};

describe('충돌 무시 토글 — 저장 게이트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCraftProjectsStore.setState({ projects: [] });
    vi.mocked(createPlacement).mockResolvedValue(SAVE_RESPONSE);
    useSimulatorStore.setState({
      projectTitle: '내 데스크테리어',
      budgetKrw: null,
      wallState: { left: true, front: true, right: false },
      roomLightOn: true,
      localCraftId: null,
      placementId: null,
      version: null,
      collisionIgnored: false,
      // 캔버스 캡처는 WebGL이 필요해 유닛 환경에서 못 돈다 — 스토어의 기존 시임을 갈아 끼운다.
      captureThumbnail: async () => new Blob(['fake-png'], { type: 'image/png' }),
      // 기본 구현이 window.setTimeout을 쓴다(node 환경엔 window가 없다).
      showToast: () => undefined,
    });
  });

  it('토글이 꺼져 있으면 겹침이 저장을 막는다', () => {
    useSimulatorStore.setState({
      sim: fakeSim({ collision: true, boundary: false }) as never,
      collisionIgnored: false,
    });

    expect(useSimulatorStore.getState().trySave()).toEqual({ ok: false, reason: 'violation' });
    expect(createPlacement).not.toHaveBeenCalled();
  });

  it('토글이 켜져 있으면 겹침 상태에서도 저장이 진행된다', () => {
    useSimulatorStore.setState({
      sim: fakeSim({ collision: true, boundary: false }) as never,
      collisionIgnored: true,
    });

    expect(useSimulatorStore.getState().trySave().ok).toBe(true);
    expect(createPlacement).toHaveBeenCalledTimes(1);
  });

  it('경계 위반은 무시 대상이 아니라 토글이 켜져 있어도 계속 막힌다', () => {
    // 핵심 회귀 지점 — 게이트를 통째로 걷어내면 이 테스트가 깨진다.
    useSimulatorStore.setState({
      sim: fakeSim({ collision: true, boundary: true }) as never,
      collisionIgnored: true,
    });

    expect(useSimulatorStore.getState().trySave()).toEqual({ ok: false, reason: 'violation' });
    expect(createPlacement).not.toHaveBeenCalled();
  });

  it('setCollisionIgnore가 엔진 틴트 setter와 스토어 플래그를 같이 반영한다', () => {
    const setCollisionIgnored = vi.fn();
    const refreshWarning = vi.fn();
    const sim = fakeSim({ collision: true, boundary: false }) as Record<string, unknown>;
    useSimulatorStore.setState({
      sim: { ...sim, setCollisionIgnored } as never,
      refreshWarning,
    });

    useSimulatorStore.getState().setCollisionIgnore(true);

    expect(setCollisionIgnored).toHaveBeenCalledWith(true);
    expect(useSimulatorStore.getState().collisionIgnored).toBe(true);
    // 배너는 refreshWarning이 갱신한다 — 플래그를 심은 뒤에 불려야 새 값을 읽는다.
    expect(refreshWarning).toHaveBeenCalledTimes(1);
  });
});
