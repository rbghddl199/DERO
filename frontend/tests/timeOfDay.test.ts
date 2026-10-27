// 시간대 ↔ 방 조명 기본값 연동 (ADR-0030 결정 4, DERO-510). 두 값은 별개라
// 조합이 4개이고, 연동은 "시간대를 바꾸는 순간의 기본값"까지다 — 그 뒤 사용자가 조명만
// 따로 토글하면 그 선택이 이긴다. 씬은 세우지 않는다(WebGL) — 엔진 자리에 가짜를 끼운다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/placement', () => ({
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  uploadPlacementThumbnail: vi.fn(async () => undefined),
  getPlacement: vi.fn(),
}));

import { useSimulatorStore } from '@/store/simulatorStore';
import { roomConfigForPreset } from '@/three/finishes/presets';
import type { RoomConfig } from '@/three/finishes/types';

function fakeSim(): { roomLightOn: boolean; config: RoomConfig } {
  const state = { roomLightOn: true, config: roomConfigForPreset('neutral') };
  useSimulatorStore.setState({
    sim: {
      applyRoom: (config: RoomConfig) => {
        state.config = config;
      },
      roomConfig: () => state.config,
      setRoomLight: (on: boolean) => {
        state.roomLightOn = on;
      },
    } as never,
    roomConfig: state.config,
    roomLightOn: true,
    editLocked: false,
  });
  return state;
}

describe('시간대 전환', () => {
  beforeEach(() => {
    useSimulatorStore.getState().resetForMount();
  });

  it('야간으로 가면 방 조명이 기본값(끔)으로 따라 움직인다', () => {
    const sim = fakeSim();

    useSimulatorStore.getState().setTimeOfDay('NIGHT');

    expect(sim.config.timeOfDay).toBe('NIGHT');
    expect(sim.roomLightOn).toBe(false);
    expect(useSimulatorStore.getState().roomLightOn).toBe(false);
  });

  it('그 뒤 조명만 따로 켜도 시간대는 야간 그대로다 — 조합 4개가 여기서 나온다', () => {
    const sim = fakeSim();
    useSimulatorStore.getState().setTimeOfDay('NIGHT');

    useSimulatorStore.getState().setRoomLight(true);

    expect(sim.roomLightOn).toBe(true);
    expect(sim.config.timeOfDay).toBe('NIGHT');
  });

  it('활성 시간대를 다시 눌러도 사용자가 켜 둔 조명을 되돌리지 않는다', () => {
    const sim = fakeSim();
    useSimulatorStore.getState().setTimeOfDay('NIGHT');
    useSimulatorStore.getState().setRoomLight(true);

    useSimulatorStore.getState().setTimeOfDay('NIGHT');

    expect(sim.roomLightOn).toBe(true);
  });

  it('주간으로 돌아오면 조명이 다시 기본값(켬)이다', () => {
    const sim = fakeSim();
    useSimulatorStore.getState().setTimeOfDay('NIGHT');

    useSimulatorStore.getState().setTimeOfDay('DAY');

    expect(sim.config.timeOfDay).toBe('DAY');
    expect(sim.roomLightOn).toBe(true);
  });

  it('편집이 잠겨 있으면 시간대도 조명도 움직이지 않는다 — 게이트는 applyRoomConfig 하나다', () => {
    const sim = fakeSim();
    useSimulatorStore.setState({ editLocked: true });

    useSimulatorStore.getState().setTimeOfDay('NIGHT');

    expect(sim.config.timeOfDay).toBe('DAY');
    expect(sim.roomLightOn).toBe(true);
  });
});
