import { describe, it, expect } from 'vitest'
import { clampGripMm, footprintAreaM2, footprintFitsSurface } from '../src/three/core/collision'
import { getProduct } from '../src/three/scene/product'

const mug = getProduct('mug-ceramic')!
const keyboard = getProduct('keyboard-tkl')!

describe('footprintAreaM2', () => {
  it('is width*depth in m^2', () => {
    expect(footprintAreaM2(keyboard)).toBeCloseTo(0.36 * 0.14, 6)
    expect(footprintAreaM2(mug)).toBeGreaterThan(0)
  })
})

describe('clampGripMm (D21 — 판정 ①과 씬의 물림 낙차가 공유하는 값)', () => {
  it('엣지 마감이 두꺼우면 그쪽이 물림 두께다', () => {
    expect(clampGripMm({ topThicknessMm: 25, edgeThicknessMm: 45 })).toBe(45)
  })

  it('엣지가 얇거나 미등록이면 상판 두께다', () => {
    expect(clampGripMm({ topThicknessMm: 30, edgeThicknessMm: 18 })).toBe(30)
    expect(clampGripMm({ topThicknessMm: 30 })).toBe(30)
  })
})

describe('footprintFitsSurface', () => {
  it('keyboard fits the 1200 desk; the desk does not fit on the keyboard', () => {
    const desk = getProduct('desk-oak-1200')!
    expect(footprintFitsSurface(keyboard, desk)).toBe(true)
    expect(footprintFitsSurface(desk, keyboard)).toBe(false)
  })
})
