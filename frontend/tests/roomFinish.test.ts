// 벽면 마감 씬 계약 — 계열/변형 폴백 · 벽면 독립 · 이관 매핑 · 부조 20mm 캡 (ADR-0030 결정 1·2·10·12)
import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import type { WallSide } from '../src/three/core/snap';
import {
  buildRoomSurfaces,
  resolveFloorFinish,
  resolveWallFinish,
  WALL_FINISHES,
  FLOOR_FINISHES,
  DEFAULT_FLOOR_FINISH,
  DEFAULT_WALL_FINISH,
} from '../src/three/finishes';
import {
  MAX_RELIEF_PROTRUSION_M,
  WALL_SIDES_ALL,
  type FinishContext,
  type RoomConfig,
} from '../src/three/finishes/types';
import {
  ROOM_PRESETS,
  ROOM_PRESET_KEYS,
  DEFAULT_ROOM_PRESET_KEY,
  roomConfigForPreset,
  roomPresetKeyOf,
  type RoomPresetKey,
} from '../src/three/finishes/presets';
import {
  DEFAULT_WALL_DISTANCE_MM,
  roomConfigFromWire,
  wallDistanceFromWire,
  wallOnFromWire,
  wallSnapshotsFromRoom,
} from '../src/utils/roomFinish';

const CTX: FinishContext = {
  wallHeightM: 2.4,
  wallWidthM: { left: 5.5, front: 6.2, right: 5.5 },
  wallPlaneCoord: { left: -1.6, front: -1.05, right: 1.6 },
  groundSizeM: 60,
  windowRectM: { left: null, front: null, right: null },
};

function config(
  walls: Record<WallSide, { material: string; variant: string }>,
  floor = DEFAULT_FLOOR_FINISH,
): RoomConfig {
  return { walls, floor, timeOfDay: 'DAY' };
}

const ALL_PAINT = config({
  left: { material: 'PAINT', variant: 'NEUTRAL' },
  front: { material: 'PAINT', variant: 'NEUTRAL' },
  right: { material: 'PAINT', variant: 'NEUTRAL' },
});

describe('마감 해석 — 미상 값은 에러가 아니라 폴백이다', () => {
  it('미상 계열은 기본 계열·기본 변형으로 떨어진다', () => {
    const r = resolveWallFinish({ material: 'GRANITE', variant: 'PINK' });
    expect(r.family).toBe(DEFAULT_WALL_FINISH.material);
    expect(r.variant).toBe(DEFAULT_WALL_FINISH.variant);
  });

  it('계열은 맞고 변형만 미상이면 그 계열의 기본 변형으로 떨어진다', () => {
    const r = resolveWallFinish({ material: 'WOOD_SLAT', variant: 'TEAK' });
    expect(r.family).toBe('WOOD_SLAT');
    expect(r.variant).toBe(WALL_FINISHES.WOOD_SLAT.defaultVariant);
  });

  it('바닥도 같은 규칙이다', () => {
    expect(resolveFloorFinish({ material: 'LAVA', variant: 'HOT' })).toEqual(DEFAULT_FLOOR_FINISH);
    expect(resolveFloorFinish({ material: 'WOOD', variant: 'TEAK' })).toEqual({
      material: 'WOOD',
      variant: FLOOR_FINISHES.WOOD.defaultVariant,
    });
  });

  it('빈 문자열·공백도 폴백이다 — 옛 배치가 안 열리면 안 된다', () => {
    expect(resolveWallFinish({ material: '', variant: '' })).toEqual({
      family: DEFAULT_WALL_FINISH.material,
      variant: DEFAULT_WALL_FINISH.variant,
    });
  });
});

describe('buildRoomSurfaces — 벽면별로 다른 마감이 실제로 적용된다', () => {
  it('면마다 독립 인스턴스이고, 계열이 다르면 재질도 다르다', () => {
    const surfaces = buildRoomSurfaces(
      config({
        left: { material: 'PAINT', variant: 'NEUTRAL' },
        front: { material: 'WOOD_SLAT', variant: 'OAK' },
        right: { material: 'PAINT', variant: 'CHARCOAL' },
      }),
      CTX,
    );

    expect(surfaces.wallMaterials.left.name).toBe('PAINT/NEUTRAL');
    expect(surfaces.wallMaterials.front.name).toBe('WOOD_SLAT/OAK');
    expect(surfaces.wallMaterials.right.name).toBe('PAINT/CHARCOAL');

    const instances = WALL_SIDES_ALL.map((s) => surfaces.wallMaterials[s]);
    expect(new Set(instances).size).toBe(3);
  });

  it('한 면만 바꾸면 나머지 두 면의 마감은 그대로다', () => {
    const before = buildRoomSurfaces(ALL_PAINT, CTX);
    const after = buildRoomSurfaces(
      config({
        left: { material: 'PAINT', variant: 'NEUTRAL' },
        front: { material: 'WOOD_SLAT', variant: 'ASH' },
        right: { material: 'PAINT', variant: 'NEUTRAL' },
      }),
      CTX,
    );

    expect(after.wallMaterials.left.name).toBe(before.wallMaterials.left.name);
    expect(after.wallMaterials.right.name).toBe(before.wallMaterials.right.name);
    expect(after.wallMaterials.front.name).not.toBe(before.wallMaterials.front.name);
    expect(after.wallDecorDepthM.left).toBe(before.wallDecorDepthM.left);
    expect(after.wallDecorDepthM.front).not.toBe(before.wallDecorDepthM.front);
  });

  it('캐시하지 않는다 — 같은 설정을 두 번 지어도 새 인스턴스다', () => {
    const a = buildRoomSurfaces(ALL_PAINT, CTX);
    const b = buildRoomSurfaces(ALL_PAINT, CTX);
    expect(a.wallMaterials.left).not.toBe(b.wallMaterials.left);
    expect(a.floorMaterial).not.toBe(b.floorMaterial);
    expect(a.decor).not.toBe(b.decor);
  });

  it('장식은 면별로 태그돼 있어 그 벽의 표시·이동을 따라갈 수 있다', () => {
    const surfaces = buildRoomSurfaces(ALL_PAINT, CTX);
    const sides = surfaces.decor.children.map((o) => o.userData.wallSide as WallSide);
    expect(sides.sort()).toEqual([...WALL_SIDES_ALL].sort());
  });

  it('우드 슬랫은 판재를 InstancedMesh로 깐다 — 면당 drawcall 1', () => {
    const surfaces = buildRoomSurfaces(
      config({
        left: { material: 'WOOD_SLAT', variant: 'OAK' },
        front: { material: 'WOOD_SLAT', variant: 'OAK' },
        right: { material: 'WOOD_SLAT', variant: 'OAK' },
      }),
      CTX,
    );
    const front = surfaces.decor.children.find((o) => o.userData.wallSide === 'front')!;
    // 판재는 `buildSlats`가 돌려주는 그룹 안에 있다(창문 있는 면은 토막 길이마다 하나 —
    // 이 CTX는 창문이 없으므로 여전히 한 장이다, 2026-08-10).
    const instanced: THREE.InstancedMesh[] = [];
    front.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) instanced.push(o as THREE.InstancedMesh);
    });
    expect(instanced).toHaveLength(1);
    expect(instanced[0].count).toBeGreaterThan(1);
  });

  it('미상 계열이 들어와도 방이 지어진다', () => {
    const surfaces = buildRoomSurfaces(
      config(
        {
          left: { material: 'GRANITE', variant: 'PINK' },
          front: { material: 'PAINT', variant: 'NEUTRAL' },
          right: { material: 'PAINT', variant: 'NEUTRAL' },
        },
        { material: 'LAVA', variant: 'HOT' },
      ),
      CTX,
    );
    expect(surfaces.wallMaterials.left.name).toBe('PAINT/NEUTRAL');
    expect(surfaces.floorMaterial.name).toBe('WOOD/OAK');
  });
});

describe('재질 계열 5종·바닥 계열 3종 (ADR-0030 결정 2, DERO-509)', () => {
  it('ADR 표의 계열이 전부 레지스트리에 있다', () => {
    expect(Object.keys(WALL_FINISHES).sort()).toEqual(
      ['BRICK', 'CONCRETE', 'MARBLE', 'PAINT', 'WOOD_SLAT'].sort(),
    );
    expect(Object.keys(FLOOR_FINISHES).sort()).toEqual(['CARPET', 'TILE', 'WOOD'].sort());
  });

  it('계열이 자기 변형 목록을 정의한다 — UI는 이 목록을 그대로 그린다', () => {
    // 키 형식은 BE 형식 검증 정규식과 같다(`^[A-Z][A-Z0-9_]{0,29}$`) — 새 계열이 소문자
    // 변형을 내보내면 저장에서 400이고, 그 사실이 여기서 먼저 걸린다.
    for (const finish of [...Object.values(WALL_FINISHES), ...Object.values(FLOOR_FINISHES)]) {
      expect(finish.variants.length).toBeGreaterThan(0);
      expect(finish.variants.map((v) => v.key)).toContain(finish.defaultVariant);
      for (const v of finish.variants) {
        expect(v.key, `${finish.family}/${v.key}`).toMatch(/^[A-Z][A-Z0-9_]{0,29}$/);
        expect(v.label.length).toBeGreaterThan(0);
        expect(v.chipColor, `${finish.family}/${v.key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('장식 없는 계열(CONCRETE)로도 방이 지어진다 — decor가 null인 경로', () => {
    const CONCRETE = { material: 'CONCRETE', variant: 'DARK' };
    const surfaces = buildRoomSurfaces(
      config(
        { left: CONCRETE, front: CONCRETE, right: CONCRETE },
        {
          material: 'CARPET',
          variant: 'BEIGE',
        },
      ),
      CTX,
    );
    expect(surfaces.floorMaterial.name).toBe('CARPET/BEIGE');
    // 면별 그룹은 그대로 3개다(표시 상태를 따라가야 하므로) — 안이 비어 있을 뿐이다.
    expect(surfaces.decor.children).toHaveLength(3);
    for (const group of surfaces.decor.children) expect(group.children).toHaveLength(0);
  });
});

describe('부조 캡 — 연속 부조는 20mm를 넘지 않는다', () => {
  it('모든 계열·변형의 wallDecorDepthM이 캡 이하다', () => {
    for (const finish of Object.values(WALL_FINISHES)) {
      for (const v of finish.variants) {
        expect(finish.decorDepthM(v.key)).toBeLessThanOrEqual(MAX_RELIEF_PROTRUSION_M);
        expect(finish.decorDepthM(v.key)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('부조 메쉬가 방 안쪽으로 나온 깊이도 캡 이하다', () => {
    for (const [family, finish] of Object.entries(WALL_FINISHES)) {
      for (const v of finish.variants) {
        const group = finish.decor(v.key, 'front', CTX);
        if (!group) continue;
        const box = new THREE.Box3().setFromObject(group);
        // 전면 벽은 z = wallPlaneCoord.front이고 방 안쪽은 +z다.
        const protrusion = box.max.z - CTX.wallPlaneCoord.front;
        expect(
          protrusion,
          `${family}/${v.key} 부조가 ${protrusion}m 튀어나온다`,
        ).toBeLessThanOrEqual(MAX_RELIEF_PROTRUSION_M + 1e-9);
      }
    }
  });
});

describe('방 프리셋 — 기존 4종의 이관 매핑 (ADR-0030 결정 12)', () => {
  const TABLE: Record<string, [string, string, string, string]> = {
    // [좌, 전면, 우, 바닥]
    neutral: ['PAINT/NEUTRAL', 'PAINT/NEUTRAL', 'PAINT/NEUTRAL', 'WOOD/OAK'],
    'oak-warm': ['WOOD_SLAT/OAK', 'WOOD_SLAT/OAK', 'PAINT/WARM_GRAY', 'WOOD/OAK'],
    'white-clean': ['PAINT/WHITE', 'WOOD_SLAT/ASH', 'PAINT/WHITE', 'WOOD/LIGHT_OAK'],
    'dark-studio': ['PAINT/CHARCOAL', 'PAINT/CHARCOAL', 'PAINT/CHARCOAL', 'WOOD/WALNUT'],
  };

  it('네 프리셋이 이관 매핑표와 정확히 일치한다', () => {
    for (const [key, [left, front, right, floor]] of Object.entries(TABLE)) {
      const c = roomConfigForPreset(key as RoomPresetKey);
      const fmt = (f: { material: string; variant: string }) => `${f.material}/${f.variant}`;
      expect(fmt(c.walls.left), `${key} 좌`).toBe(left);
      expect(fmt(c.walls.front), `${key} 전면`).toBe(front);
      expect(fmt(c.walls.right), `${key} 우`).toBe(right);
      expect(fmt(c.floor), `${key} 바닥`).toBe(floor);
    }
  });

  it('이관본에는 창문이 없고 전부 주간이다', () => {
    for (const key of ROOM_PRESET_KEYS) {
      expect(ROOM_PRESETS[key].config.timeOfDay).toBe('DAY');
    }
  });

  it('기본 프리셋은 기본 마감과 같은 방을 만든다 — 부팅 화면 무회귀', () => {
    const c = roomConfigForPreset(DEFAULT_ROOM_PRESET_KEY);
    for (const s of WALL_SIDES_ALL) expect(c.walls[s]).toEqual(DEFAULT_WALL_FINISH);
    expect(c.floor).toEqual(DEFAULT_FLOOR_FINISH);
  });

  it('프리셋이 쓰는 계열·변형은 전부 레지스트리에 있다', () => {
    for (const key of ROOM_PRESET_KEYS) {
      const c = ROOM_PRESETS[key].config;
      for (const s of WALL_SIDES_ALL) {
        expect(resolveWallFinish(c.walls[s])).toEqual({
          family: c.walls[s].material,
          variant: c.walls[s].variant,
        });
      }
      expect(resolveFloorFinish(c.floor)).toEqual(c.floor);
    }
  });
});

describe('프리셋은 저장되지 않는다 — 프리필 버튼이다 (DERO-508)', () => {
  it('프리셋을 적용한 뒤 한 면만 고쳐도 나머지 두 면과 바닥은 그대로다', () => {
    const applied = roomConfigForPreset('oak-warm');
    // UI가 하는 일과 같은 계산: 벽 하나만 갈아 끼운다.
    const edited: RoomConfig = {
      ...applied,
      walls: { ...applied.walls, right: { material: 'PAINT', variant: 'CHARCOAL' } },
    };

    expect(edited.walls.left).toEqual(applied.walls.left);
    expect(edited.walls.front).toEqual(applied.walls.front);
    expect(edited.floor).toEqual(applied.floor);
    expect(edited.walls.right).toEqual({ material: 'PAINT', variant: 'CHARCOAL' });
  });

  it('한 면이라도 다르면 어느 프리셋도 아니다 — 칩 활성 표시가 이걸 읽는다', () => {
    const applied = roomConfigForPreset('oak-warm');
    expect(roomPresetKeyOf(applied)).toBe('oak-warm');

    expect(
      roomPresetKeyOf({
        ...applied,
        walls: { ...applied.walls, right: { material: 'PAINT', variant: 'CHARCOAL' } },
      }),
    ).toBeNull();
    expect(
      roomPresetKeyOf({ ...applied, floor: { material: 'WOOD', variant: 'WALNUT' } }),
    ).toBeNull();
  });

  it('시간대는 프리셋 일치 판정에서 보지 않는다 — 별도 축이다', () => {
    const night: RoomConfig = { ...roomConfigForPreset('neutral'), timeOfDay: 'NIGHT' };
    expect(roomPresetKeyOf(night)).toBe('neutral');
  });
});

describe('저장 형식 ↔ 씬 방 설정 (ADR-0030)', () => {
  const WIRE = [
    { wallSide: 'LEFT', isOn: true, material: 'WOOD_SLAT', variant: 'OAK' },
    { wallSide: 'FRONT', isOn: false, material: 'PAINT', variant: 'CHARCOAL' },
    { wallSide: 'RIGHT', isOn: true, material: 'PAINT', variant: 'WHITE' },
  ] as const;

  it('세 면·바닥·시간대가 그대로 씬 설정이 된다', () => {
    const config = roomConfigFromWire(WIRE, { material: 'WOOD', variant: 'WALNUT' }, 'NIGHT');
    expect(config.walls.left).toEqual({ material: 'WOOD_SLAT', variant: 'OAK' });
    expect(config.walls.front).toEqual({ material: 'PAINT', variant: 'CHARCOAL' });
    expect(config.walls.right).toEqual({ material: 'PAINT', variant: 'WHITE' });
    expect(config.floor).toEqual({ material: 'WOOD', variant: 'WALNUT' });
    expect(config.timeOfDay).toBe('NIGHT');
  });

  it('저장 → 복원 왕복에서 세 면·바닥이 보존된다', () => {
    const wallOn = { left: true, front: false, right: true };
    const before = roomConfigFromWire(WIRE, { material: 'WOOD', variant: 'WALNUT' }, 'DAY');

    const snapshots = wallSnapshotsFromRoom(before, wallOn, DEFAULT_WALL_DISTANCE_MM);
    const after = roomConfigFromWire(snapshots, before.floor, before.timeOfDay);

    expect(after).toEqual(before);
    expect(wallOnFromWire(snapshots)).toEqual(wallOn);
  });

  it('벽 거리가 왕복에서 보존되고, 필드가 없는 옛 배치는 면별 기본값으로 열린다', () => {
    const distance = { left: 900, front: 150, right: 2400 };

    const snapshots = wallSnapshotsFromRoom(
      ALL_PAINT,
      { left: true, front: true, right: true },
      distance,
    );

    expect(wallDistanceFromWire(snapshots)).toEqual(distance);
    // 전면만 기준이 달라(책상 뒷변) 기본값도 다르다 — 좌·우 1550, 전면 50.
    expect(wallDistanceFromWire(WIRE)).toEqual({ left: 1550, front: 50, right: 1550 });
  });

  it('세 면을 전부 싣는다 — 일부만 보내면 서버가 400이다', () => {
    const snapshots = wallSnapshotsFromRoom(
      ALL_PAINT,
      { left: true, front: true, right: false },
      DEFAULT_WALL_DISTANCE_MM,
    );
    expect(snapshots.map((w) => w.wallSide)).toEqual(['LEFT', 'FRONT', 'RIGHT']);
    expect(snapshots.map((w) => w.isOn)).toEqual([true, true, false]);
  });

  it('마감을 모르는 옛 배치는 기본 마감으로 열린다 — 에러가 아니다', () => {
    const config = roomConfigFromWire(null, null, null);
    for (const side of WALL_SIDES_ALL) expect(config.walls[side]).toEqual(DEFAULT_WALL_FINISH);
    expect(config.floor).toEqual(DEFAULT_FLOOR_FINISH);
    expect(config.timeOfDay).toBe('DAY');
  });

  it('한 면이 빠진 응답도 열린다 — 빠진 면만 기본 마감이다', () => {
    const config = roomConfigFromWire(
      [{ wallSide: 'FRONT', material: 'WOOD_SLAT', variant: 'ASH' }],
      undefined,
      undefined,
    );
    expect(config.walls.front).toEqual({ material: 'WOOD_SLAT', variant: 'ASH' });
    expect(config.walls.left).toEqual(DEFAULT_WALL_FINISH);
  });

  it('변형만 빠진 행도 계열은 살린다 — 계열까지 버리면 남의 방이 페인트가 된다', () => {
    const config = roomConfigFromWire(
      [{ wallSide: 'FRONT', material: 'BRICK' }],
      { material: 'TILE' },
      'DAY',
    );
    expect(config.walls.front).toEqual({
      material: 'BRICK',
      variant: WALL_FINISHES.BRICK.defaultVariant,
    });
    expect(config.floor).toEqual({
      material: 'TILE',
      variant: FLOOR_FINISHES.TILE.defaultVariant,
    });
  });

  it('아는 계열의 미상 변형은 좁힌다 — 안 좁히면 UI에 안 보인 채 그대로 되저장된다', () => {
    const config = roomConfigFromWire(
      [{ wallSide: 'LEFT', material: 'WOOD_SLAT', variant: 'TEAK' }],
      { material: 'WOOD', variant: 'BAMBOO' },
      'DAY',
    );
    expect(config.walls.left).toEqual({
      material: 'WOOD_SLAT',
      variant: WALL_FINISHES.WOOD_SLAT.defaultVariant,
    });
    expect(config.floor).toEqual({ material: 'WOOD', variant: FLOOR_FINISHES.WOOD.defaultVariant });

    // 되저장이 죽은 키를 다시 쓰지 않는다 — 스스로 낫는다.
    const snapshots = wallSnapshotsFromRoom(
      config,
      { left: true, front: true, right: true },
      DEFAULT_WALL_DISTANCE_MM,
    );
    expect(snapshots.find((w) => w.wallSide === 'LEFT')!.variant).toBe(
      WALL_FINISHES.WOOD_SLAT.defaultVariant,
    );
  });

  it('모르는 계열은 좁히지 않고 그대로 되저장한다 — 옛 번들이 새 계열을 지우면 안 된다', () => {
    const config = roomConfigFromWire(
      [{ wallSide: 'FRONT', material: 'GRANITE', variant: 'PINK' }],
      { material: 'LAVA', variant: 'HOT' },
      'DAY',
    );
    expect(config.walls.front).toEqual({ material: 'GRANITE', variant: 'PINK' });
    expect(config.floor).toEqual({ material: 'LAVA', variant: 'HOT' });

    const snapshots = wallSnapshotsFromRoom(
      config,
      { left: true, front: true, right: true },
      DEFAULT_WALL_DISTANCE_MM,
    );
    const front = snapshots.find((w) => w.wallSide === 'FRONT')!;
    expect([front.material, front.variant]).toEqual(['GRANITE', 'PINK']);

    // 화면은 씬이 폴백으로 그린다 — 폴백 결과가 저장으로 돌아오지 않는 것이 이 규칙의 전부다.
    expect(resolveWallFinish(config.walls.front).family).toBe(DEFAULT_WALL_FINISH.material);
  });

  it('벽 표시 여부는 walls[]가 정본이고, 행이 없으면 구현 기본값(우측만 꺼짐)이다', () => {
    expect(wallOnFromWire(WIRE)).toEqual({ left: true, front: false, right: true });
    expect(wallOnFromWire(null)).toEqual({ left: true, front: true, right: false });
  });

  // 창문(DERO-511) — 저장은 mm 4값 + hasWindow, 없는 면은 mm를 생략한다(ERD NULL).
  it('창문 4값이 저장 → 복원 왕복에서 보존된다', () => {
    const wire = [
      {
        wallSide: 'FRONT',
        isOn: true,
        material: 'PAINT',
        variant: 'NEUTRAL',
        hasWindow: true,
        windowCenterXMm: 600,
        windowCenterYMm: 1600,
        windowWidthMm: 1800,
        windowHeightMm: 1400,
      },
    ];
    const config = roomConfigFromWire(wire, null, 'DAY');
    expect(config.walls.front.window).toEqual({
      centerXMm: 600,
      centerYMm: 1600,
      widthMm: 1800,
      heightMm: 1400,
    });
    expect(config.walls.left.window).toBeUndefined();

    const snapshots = wallSnapshotsFromRoom(
      config,
      { left: true, front: true, right: true },
      DEFAULT_WALL_DISTANCE_MM,
    );
    const front = snapshots.find((w) => w.wallSide === 'FRONT')!;
    expect(front.hasWindow).toBe(true);
    expect(front.windowCenterXMm).toBe(600);
    expect(front.windowWidthMm).toBe(1800);
    const left = snapshots.find((w) => w.wallSide === 'LEFT')!;
    expect(left.hasWindow).toBe(false);
    expect('windowCenterXMm' in left).toBe(false); // has_window = false면 mm는 NULL(생략)

    expect(roomConfigFromWire(snapshots, null, 'DAY')).toEqual(config);
  });

  it('창문 값이 일부만 온 행은 창문 없음으로 좁힌다 — 에러가 아니다', () => {
    const config = roomConfigFromWire(
      [
        { wallSide: 'FRONT', material: 'PAINT', variant: 'NEUTRAL', hasWindow: true },
        {
          wallSide: 'LEFT',
          material: 'PAINT',
          variant: 'NEUTRAL',
          hasWindow: true,
          windowCenterXMm: 0,
          windowCenterYMm: 1600,
          windowWidthMm: 0, // 0 폭 창문은 창문이 아니다
          windowHeightMm: 1400,
        },
      ],
      null,
      null,
    );
    expect(config.walls.front.window).toBeUndefined();
    expect(config.walls.left.window).toBeUndefined();
  });
});
