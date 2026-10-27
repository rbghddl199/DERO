// 작업실 로고·나가기 버튼·뒤로가기가 저장 상태에 따라 확인창을 올바르게 결정하는지 검증한다.
// 2026-08-06부터 트리거 종류는 관여하지 않는다 — 셋 다 hasUnsavedChanges 하나로 통일.

import { describe, expect, it } from 'vitest';

import { shouldConfirmSimulatorExit } from '@/utils/simulatorExit';

describe('simulator exit confirmation', () => {
  it('저장하지 않은 변경이 있으면 안내창을 연다', () => {
    expect(shouldConfirmSimulatorExit(true)).toBe(true);
  });

  it('저장하지 않은 변경이 없으면 안내창 없이 그냥 나간다', () => {
    expect(shouldConfirmSimulatorExit(false)).toBe(false);
  });
});
