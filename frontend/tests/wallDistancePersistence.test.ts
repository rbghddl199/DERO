// 벽 거리 저장 회귀 — 사용자가 조정한 좌/우 벽 거리와 전면 벽 간격이 저장 요청에 실려야 한다.
// 증상: /craft에서 벽 거리를 바꾸고 저장한 뒤 다시 열면 기본값(좌/우 1550mm, 전면 간격 50mm)으로
// 돌아온다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/placement', () => ({
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  uploadPlacementThumbnail: vi.fn(async () => undefined),
  getPlacement: vi.fn(),
}));

import { getPlacement, updatePlacement } from '@/api/placement';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useCraftProjectsStore } from '@/store/craftProjectsStore';
import type { PlacementSaveResponse } from '@/types/placement';

/** trySave가 만지는 엔진 표면 + 벽 거리 상태만 흉내 낸다(빈 책상, 아이템 없음). */
function fakeSim(): unknown {
  const wall = { left: 1.55, right: 1.55 };
  let frontGap = 0.05;
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
    placed: () => [],
    jointStates: () => [],
    emitterInfo: () => null,
    setBackendId: () => undefined,
    wallDistance: () => ({ ...wall }),
    frontWallGap: () => frontGap,
    setWallDistance: (side: 'left' | 'right', m: number) => {
      wall[side] = m;
      return m;
    },
    setFrontWallGap: (m: number) => {
      frontGap = m;
      return m;
    },
    // --- loadPlacement가 거치는 표면 ---
    // setDesk는 새 책상 반폭으로 벽을 재클램프한다 — 복원이 이 뒤에 와야 한다는 순서 계약을
    // 여기서 재현한다(기본값으로 되돌리는 것이 실제 엔진의 동작이다).
    setDesk: () => {
      wall.left = 1.55;
      wall.right = 1.55;
      frontGap = 0.05;
    },
    jointGizmo: { hide: () => undefined },
    rotateGizmo: { hide: () => undefined },
    setWall: () => undefined,
    setRoomLight: () => undefined,
    applyRoom: () => undefined,
    wallState: () => ({ left: true, front: true, right: false }),
    roomConfig: () => ({
      walls: {
        left: { material: 'PAINT', variant: 'NEUTRAL' },
        front: { material: 'PAINT', variant: 'NEUTRAL' },
        right: { material: 'PAINT', variant: 'NEUTRAL' },
      },
      floor: { material: 'WOOD', variant: 'OAK' },
      timeOfDay: 'DAY',
    }),
    roomLightOn: () => true,
  };
}

/** loadPlacement가 읽는 최소 상세 — 아이템 0개라 제품 프리페치·배치 루프가 전부 비어 돈다. */
function detailWithDistances(): unknown {
  return {
    id: 206,
    version: 3,
    title: '내 데스크테리어',
    description: null,
    budgetKrw: null,
    isRoomLightOn: true,
    thumbnailUrl: 'https://example.test/thumb.png',
    publishStatus: 'PRIVATE',
    timeOfDay: 'DAY',
    floor: { material: 'WOOD', variant: 'OAK' },
    walls: [
      { wallSide: 'LEFT', isOn: true, distanceMm: 900, material: 'PAINT', variant: 'NEUTRAL' },
      { wallSide: 'FRONT', isOn: true, distanceMm: 150, material: 'PAINT', variant: 'NEUTRAL' },
      { wallSide: 'RIGHT', isOn: false, distanceMm: 2400, material: 'PAINT', variant: 'NEUTRAL' },
    ],
    desk: {
      specSource: 'CUSTOM',
      productId: null,
      widthMm: 1400,
      depthMm: 700,
      heightMm: 720,
      topThicknessMm: 25,
      edgeThicknessMm: null,
      deskTextureId: null,
      frameType: 'T_FRAME',
    },
    items: [],
  };
}

const SAVE_RESPONSE: PlacementSaveResponse = {
  id: 206,
  updatedAt: '2026-08-10T09:00:00+09:00',
  version: 4,
  items: [],
  violations: [],
};

describe('벽 거리 영속', () => {
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
      placementId: 206,
      version: 3,
      captureThumbnail: async () => null as never,
      showToast: () => undefined,
    });
    vi.mocked(updatePlacement).mockResolvedValue(SAVE_RESPONSE);
  });

  it('조정한 좌/우 벽 거리와 전면 간격이 저장 요청에 실린다', () => {
    const store = useSimulatorStore.getState();
    store.setWallDistance('left', 900);
    store.setWallDistance('right', 2400);
    store.setFrontWallGap(150);

    // 스토어 미러는 조정값을 들고 있다 — 화면 표시는 정상이다.
    expect(useSimulatorStore.getState().wallDistanceMm).toEqual({ left: 900, right: 2400 });
    expect(useSimulatorStore.getState().frontWallGapMm).toBe(150);

    expect(store.trySave().ok).toBe(true);

    const snapshot = vi.mocked(updatePlacement).mock.calls[0]![1];
    // 세 면 모두 실려야 한다 — 하나라도 빠지면 서버가 400이다.
    const walls = (snapshot as { walls: { wallSide: string; distanceMm: number }[] }).walls;
    expect(walls.map((w) => [w.wallSide, w.distanceMm])).toEqual([
      ['LEFT', 900],
      // 전면은 기준이 달라(책상 뒷변 간격) 같은 필드에 간격이 실린다.
      ['FRONT', 150],
      ['RIGHT', 2400],
    ]);
  });

  it('저장한 벽 거리가 재로드에서 복원된다', async () => {
    vi.mocked(getPlacement).mockResolvedValue(detailWithDistances() as never);

    await useSimulatorStore.getState().loadPlacement(206);

    // 화면 미러와 엔진이 함께 복원돼야 한다 — 미러만 맞으면 숫자는 맞는데 벽이 안 움직인다.
    expect(useSimulatorStore.getState().wallDistanceMm).toEqual({ left: 900, right: 2400 });
    expect(useSimulatorStore.getState().frontWallGapMm).toBe(150);
  });

  it('벽 거리를 바꾸면 미저장 변경으로 잡힌다', () => {
    const before = useSimulatorStore.getState().changeVersion;

    useSimulatorStore.getState().setWallDistance('left', 900);
    useSimulatorStore.getState().setFrontWallGap(150);

    // EditorTopBar의 나가기 확인이 changeVersion !== savedChangeVersion만 본다.
    expect(useSimulatorStore.getState().changeVersion).toBe(before + 2);
  });
});
