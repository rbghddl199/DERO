// 제목·설명만 고치는 화면(작업실 게시 시트·컬렉션 수정 폼)이 쓰는 수정 전용 스냅샷 회귀 —
// 저장은 통째 교체가 아니라 아이템 id 매칭 병합이라(Placement.mergeItems), id가 빠지면 제목만
// 고쳐도 placed_item 행이 전부 삭제·재삽입된다. version이 빠지면 무조건 409다.
import { describe, expect, it } from 'vitest';
import { toPlacementSnapshot, toPlacementUpdateSnapshot } from '@/api/placement';
import type { PlacementDetailResponse } from '@/types/placement';

const detail = {
  id: 7,
  version: 12,
  title: '내 책상',
  description: null,
  isRoomLightOn: true,
  timeOfDay: 'DAY',
  budgetKrw: 750_000,
  walls: [],
  floor: { finishKey: 'oak', variantKey: null },
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
  items: [
    {
      id: 501,
      productId: 27,
      positionXMm: 0,
      positionYMm: 720,
      positionZMm: 0,
      rotationDeg: 0,
      pitchDeg: 0,
      surfaceType: 'DESK_TOP',
      wallSide: null,
      mountedToItemId: null,
      jointValues: null,
      emitterColor: null,
    },
    {
      id: 502,
      productId: 31,
      positionXMm: 300,
      positionYMm: 720,
      positionZMm: 0,
      rotationDeg: 0,
      pitchDeg: 0,
      surfaceType: 'DESK_TOP',
      wallSide: null,
      mountedToItemId: 501,
      jointValues: null,
      emitterColor: null,
    },
  ],
} as unknown as PlacementDetailResponse;

describe('toPlacementUpdateSnapshot', () => {
  it('기존 아이템 id를 그대로 되돌려 싣는다 — 빠지면 서버가 행을 지우고 새로 넣는다', () => {
    expect(toPlacementUpdateSnapshot(detail).items.map((item) => item.id)).toEqual([501, 502]);
  });

  it('version을 싣는다 — null이면 낙관적 락이 무조건 409다', () => {
    expect(toPlacementUpdateSnapshot(detail).version).toBe(12);
  });

  it('결합 관계는 리믹스 변환과 같은 ref로 보존한다', () => {
    const snapshot = toPlacementUpdateSnapshot(detail);
    expect(snapshot.items[1].mountedToRef).toBe(snapshot.items[0].ref);
  });

  it('리믹스용 변환은 여전히 id·version이 비어 있다 — 신규 저장이라 그게 맞다', () => {
    const remix = toPlacementSnapshot(detail);
    expect(remix.items.map((item) => item.id)).toEqual([null, null]);
    expect(remix.version).toBeNull();
  });
});
