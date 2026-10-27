// 모니터 곡면 패널 **지오메트리** 회귀 테스트.
// monitor.test.ts가 규격 수학(mm)을 보는 반면, 여기서는 buildProp이 실제로 만든
// 메쉬의 월드 좌표를 Box3로 재서 다음 3가지를 가둔다:
//   1) 곡면이 오목(concave)이다 — 양끝이 뷰어(+Z) 쪽으로 감긴다.
//   2) 화면/하우징이 곡률 중심을 공유해 전 구간 간격 = 패널 두께 (z-fighting 없음).
//   3) 호 시작 각도가 맞다 — 패널이 원점에서 R만큼 튀어나가지 않는다.
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three/webgpu'
import { getProduct } from '../src/three/scene/product'
import { screenSizeMm, panelSizeMm, curveSagittaMm, MONITOR_PANEL_THICKNESS_MM } from '../src/three/scene/monitor'
import { mmToM } from '../src/three/core/units'

// props.ts의 화면 텍스처는 <canvas>를 쓴다. 단위 스위트는 node 환경이라 최소 스텁을 심는다.
beforeAll(() => {
  const ctx2d = {
    fillStyle: '',
    fillRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  } as unknown as Document
})

/** 그룹의 직계 메쉬 = [하우징, 화면]. 화면은 자체발광(emissiveMap)으로 구분한다. */
async function panelMeshes(productId: string) {
  const { buildProp } = await import('../src/three/scene/props')
  const spec = getProduct(productId)!
  const g = buildProp(spec)
  const meshes = g.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true)
  const isScreen = (m: THREE.Mesh) =>
    !!(m.material as THREE.MeshStandardNodeMaterial).emissiveMap
  const screen = meshes.find(isScreen)!
  const housing = meshes.find((m) => !isScreen(m))!
  expect(screen).toBeDefined()
  expect(housing).toBeDefined()
  g.updateMatrixWorld(true)
  return {
    spec,
    screenBox: new THREE.Box3().setFromObject(screen),
    housingBox: new THREE.Box3().setFromObject(housing),
    screen,
  }
}

describe('커브드 모니터 곡면 지오메트리', () => {
  it('화면이 오목하다 — z 범위가 [0, +sag]이고 음수로 물러나지 않는다', async () => {
    const { spec, screenBox } = await panelMeshes('monitor-34-curved')
    const m = spec.monitor!
    const screenMm = screenSizeMm(m.diagonalInch, m.aspectRatio)
    // 독립 계산한 처짐(현 = 화면 폭). 메쉬는 호 길이를 폭으로 쓰므로 실제 처짐은
    // 이보다 아주 살짝 작다(34"@1800R 기준 0.8mm 차) — 상한으로 쓴다.
    const sagM = mmToM(curveSagittaMm(screenMm.widthMm, m.curvatureRadiusMm!))
    expect(sagM).toBeGreaterThan(0.03) // 34"@1800R ≈ 43.9mm

    expect(screenBox.min.z).toBeCloseTo(0, 5) // 중앙 = z 0
    expect(screenBox.max.z).toBeGreaterThan(0) // 양끝이 뷰어 쪽(+Z)
    expect(screenBox.max.z).toBeLessThanOrEqual(sagM + 1e-6)
    expect(screenBox.max.z).toBeGreaterThan(sagM - 0.002)
  })

  it('하우징이 화면 뒤로 정확히 패널 두께만큼 물러난다 (z-fighting 방지)', async () => {
    const { screenBox, housingBox } = await panelMeshes('monitor-34-curved')
    const thicknessM = mmToM(MONITOR_PANEL_THICKNESS_MM)
    // 두 셸 모두 중앙(θ=π)에서 z가 최소 — 곡률 중심을 공유하면 그 차이가 곧 두께다.
    expect(screenBox.min.z - housingBox.min.z).toBeCloseTo(thicknessM, 3)
    expect(housingBox.max.z).toBeLessThan(screenBox.max.z)
  })

  it('화면 반폭이 패널 폭의 절반을 넘지 않는다 (호 시작 각도 회귀)', async () => {
    const { spec, screenBox } = await panelMeshes('monitor-34-curved')
    const halfPanelM = mmToM(panelSizeMm(spec.monitor!).widthMm) / 2
    expect(screenBox.max.x).toBeGreaterThan(0)
    expect(screenBox.max.x).toBeLessThanOrEqual(halfPanelM)
    expect(Math.abs(screenBox.min.x)).toBeLessThanOrEqual(halfPanelM)
  })
})

describe('평면 모니터 대조군', () => {
  it('화면이 평평하다 — z 두께가 0이다', async () => {
    const { screenBox } = await panelMeshes('monitor-27')
    expect(screenBox.max.z - screenBox.min.z).toBeLessThan(1e-6)
  })
})
