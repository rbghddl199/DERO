import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildDesk } from '../src/three/scene/desk'
import { DEFAULT_CUSTOM_DESK, type DeskConfig } from '../src/three/core/deskConfig'

function meshCount(g: THREE.Object3D): number {
  let n = 0
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++
  })
  return n
}

function topMesh(g: THREE.Object3D): THREE.Mesh {
  let top: THREE.Mesh | null = null
  let maxY = -Infinity
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.position.y > maxY) {
      maxY = m.position.y
      top = m
    }
  })
  return top!
}

const base: DeskConfig = { ...DEFAULT_CUSTOM_DESK }

describe('buildDesk — userData 표면 정보', () => {
  it('상판 윗면 높이는 heightMm(m 변환)와 같다', () => {
    const g = buildDesk({ ...base, heightMm: 740 })
    expect(g.userData.surfaceTopY).toBeCloseTo(0.74, 6)
  })

  it('halfWidth·halfDepth는 규격의 절반이다', () => {
    const g = buildDesk({ ...base, widthMm: 1400, depthMm: 700 })
    expect(g.userData.surfaceHalfWidth).toBeCloseTo(0.7, 6)
    expect(g.userData.surfaceHalfDepth).toBeCloseTo(0.35, 6)
  })

  it('config를 userData에 보관한다', () => {
    const g = buildDesk(base)
    expect(g.userData.config).toEqual(base)
  })
})

describe('buildDesk — 프레임 유형 (설계 §2.2)', () => {
  it('top-only는 상판 메쉬 1개뿐이다', () => {
    expect(meshCount(buildDesk({ ...base, frameType: 'top-only' }))).toBe(1)
  })

  it('four-leg은 상판 1 + 다리 4 = 5개다', () => {
    expect(meshCount(buildDesk({ ...base, frameType: 'four-leg' }))).toBe(5)
  })

  it('t-frame은 상판 1 + (기둥+발판) × 2 = 5개다', () => {
    expect(meshCount(buildDesk({ ...base, frameType: 't-frame' }))).toBe(5)
  })

  it('프레임을 바꿔도 상판 윗면 높이는 그대로다', () => {
    const a = buildDesk({ ...base, frameType: 'four-leg' })
    const b = buildDesk({ ...base, frameType: 'top-only' })
    expect(a.userData.surfaceTopY).toBeCloseTo(b.userData.surfaceTopY, 6)
  })
})

describe('buildDesk — 재질', () => {
  it('재질 id에 따라 상판 색이 달라진다', () => {
    const walnut = topMesh(buildDesk({ ...base, materialId: 'walnut' }))
    const white = topMesh(buildDesk({ ...base, materialId: 'white' }))
    const cw = (walnut.material as THREE.MeshPhysicalNodeMaterial).color.getHex()
    const cb = (white.material as THREE.MeshPhysicalNodeMaterial).color.getHex()
    expect(cw).not.toBe(cb)
  })
})

describe('buildDesk — 극단 규격에서도 깨지지 않는다', () => {
  it('최소 규격', () => {
    const g = buildDesk({ ...base, widthMm: 600, depthMm: 350, heightMm: 550, topThicknessMm: 10 })
    expect(meshCount(g)).toBeGreaterThan(0)
  })

  it('최대 규격', () => {
    const g = buildDesk({ ...base, widthMm: 3000, depthMm: 1200, heightMm: 1300, topThicknessMm: 80 })
    expect(meshCount(g)).toBeGreaterThan(0)
  })
})
