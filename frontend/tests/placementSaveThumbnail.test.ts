// 배치 재저장 시 서버 썸네일 갱신 회귀 — 아이템을 올리고 다시 저장하면 PUT 경로도 업로드를 타야 한다
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/placement', () => ({
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  uploadPlacementThumbnail: vi.fn(async () => undefined),
  getPlacement: vi.fn(),
}));

import { createPlacement, updatePlacement, uploadPlacementThumbnail } from '@/api/placement';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useCraftProjectsStore } from '@/store/craftProjectsStore';
import type { PlacementSaveResponse } from '@/types/placement';

const CAPTURED = new Blob(['fake-png'], { type: 'image/png' });

/** trySave가 실제로 만지는 엔진 표면만 흉내 낸다 — 아이템 1개가 상판에 올라간 상태다. */
function fakeSim(): unknown {
  return {
    anyCollision: () => false,
    anyBoundaryViolation: () => false,
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

function saveResponse(id: number): PlacementSaveResponse {
  return {
    id,
    updatedAt: '2026-08-02T11:50:00+09:00',
    version: 4,
    items: [{ ref: 'item-1', id: 501 }],
    violations: [],
  };
}

/** fire-and-forget 체인(캡처 → 저장 응답 → 업로드)이 전부 풀릴 때까지 마이크로태스크를 흘린다. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('배치 저장 후 서버 썸네일 갱신', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCraftProjectsStore.setState({ projects: [] });
    useSimulatorStore.setState({
      sim: fakeSim() as never,
      projectTitle: '내 데스크테리어',
      budgetKrw: null,
      wallState: { left: true, front: true, right: false },
      roomLightOn: true,
      localCraftId: null,
      // 캔버스 캡처는 WebGL이 필요해 유닛 환경에서 못 돈다 — 스토어의 기존 시임을 갈아 끼운다.
      captureThumbnail: async () => CAPTURED,
      // 기본 구현이 window.setTimeout을 쓴다(node 환경엔 window가 없다).
      showToast: () => undefined,
    });
  });

  it('이미 저장된 배치를 다시 저장하면 같은 배치 id로 썸네일을 다시 올린다', async () => {
    useSimulatorStore.setState({ placementId: 206, version: 3 });
    vi.mocked(updatePlacement).mockResolvedValue(saveResponse(206));

    const result = useSimulatorStore.getState().trySave();
    await flush();

    expect(result.ok).toBe(true);
    expect(updatePlacement).toHaveBeenCalledTimes(1);
    // 회귀 지점 — 갱신(PUT) 경로에는 업로드가 아예 없어서 S3 그림이 최초 저장본으로 굳었다.
    expect(uploadPlacementThumbnail).toHaveBeenCalledWith(206, CAPTURED);
  });

  it('신규 저장이면 서버가 채번한 id로 올린다', async () => {
    useSimulatorStore.setState({ placementId: null, version: null });
    vi.mocked(createPlacement).mockResolvedValue(saveResponse(207));

    useSimulatorStore.getState().trySave();
    await flush();

    expect(uploadPlacementThumbnail).toHaveBeenCalledWith(207, CAPTURED);
  });

  it('저장이 실패하면 썸네일을 올리지 않는다', async () => {
    useSimulatorStore.setState({ placementId: 206, version: 3 });
    vi.mocked(updatePlacement).mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    useSimulatorStore.getState().trySave();
    await flush();

    expect(uploadPlacementThumbnail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
