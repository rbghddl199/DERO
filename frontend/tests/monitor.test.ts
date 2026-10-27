import { describe, it, expect } from 'vitest'
import {
  aspectFraction,
  screenSizeMm,
  panelSizeMm,
  curveSagittaMm,
  monitorDims,
  MONITOR_PANEL_THICKNESS_MM,
  MONITOR_STAND_HEIGHT_MM,
  type MonitorSpec,
} from '../src/three/scene/monitor'
import { getProduct, PRODUCTS } from '../src/three/scene/product'

const flat27: MonitorSpec = {
  diagonalInch: 27,
  aspectRatio: '16:9',
  panelShape: 'flat',
  bezelMm: 8,
  standDepthMm: 130,
  vesa: ['100x100'],
  weightG: 4200,
  ports: ['HDMI 2.0', 'DP 1.4', 'USB-C'],
  resolution: [2560, 1440],
}

describe('aspectFraction', () => {
  it('16:9 = 1.777…', () => {
    expect(aspectFraction('16:9')).toBeCloseTo(16 / 9, 6)
  })

  it('울트라와이드가 더 크다', () => {
    expect(aspectFraction('21:9')).toBeGreaterThan(aspectFraction('16:9'))
    expect(aspectFraction('32:9')).toBeGreaterThan(aspectFraction('21:9'))
  })
})

describe('screenSizeMm', () => {
  it('27인치 16:9 화면은 597.73 × 336.22 mm다', () => {
    const s = screenSizeMm(27, '16:9')
    expect(s.widthMm).toBeCloseTo(597.73, 2)
    expect(s.heightMm).toBeCloseTo(336.22, 2)
  })

  it('대각선 길이가 인치 환산값과 일치한다', () => {
    const s = screenSizeMm(34, '21:9')
    expect(Math.hypot(s.widthMm, s.heightMm)).toBeCloseTo(34 * 25.4, 3)
  })

  it('같은 인치라도 화면비가 넓으면 더 넓고 낮다', () => {
    const a = screenSizeMm(32, '16:9')
    const b = screenSizeMm(32, '32:9')
    expect(b.widthMm).toBeGreaterThan(a.widthMm)
    expect(b.heightMm).toBeLessThan(a.heightMm)
  })
})

describe('panelSizeMm — 베젤 포함 외형', () => {
  it('베젤이 양쪽에 더해진다', () => {
    const screen = screenSizeMm(27, '16:9')
    const panel = panelSizeMm(flat27)
    expect(panel.widthMm).toBeCloseTo(screen.widthMm + 16, 3)
    expect(panel.heightMm).toBeCloseTo(screen.heightMm + 16, 3)
  })
})

describe('curveSagittaMm — 곡률 깊이', () => {
  it('1800R 600mm 폭의 처짐은 25.18mm다', () => {
    expect(curveSagittaMm(600, 1800)).toBeCloseTo(25.18, 2)
  })

  it('반경이 클수록(완만할수록) 처짐이 작다', () => {
    expect(curveSagittaMm(600, 4000)).toBeLessThan(curveSagittaMm(600, 1000))
  })

  it('반경이 0 이하면 0을 돌려준다 (평면 취급)', () => {
    expect(curveSagittaMm(600, 0)).toBe(0)
    expect(curveSagittaMm(600, -100)).toBe(0)
  })

  it('현이 0 이하면 0을 돌려준다 (음수 폭 방어)', () => {
    expect(curveSagittaMm(-600, 1800)).toBe(0)
  })

  it('현이 지름보다 길면 반지름으로 포화한다 (NaN 금지)', () => {
    const s = curveSagittaMm(5000, 1000)
    expect(Number.isFinite(s)).toBe(true)
    expect(s).toBeLessThanOrEqual(1000)
  })
})

describe('monitorDims — 파생 외형 치수', () => {
  // 49인치 32:9 @ 800R: 처짐(≈269.8mm)이 스탠드 깊이(130mm)를 압도하는 케이스.
  // 곡률 계산을 지우면 depthMm이 130으로 떨어져 이 테스트가 깨진다.
  const ultrawide49: MonitorSpec = {
    diagonalInch: 49,
    aspectRatio: '32:9',
    panelShape: 'curved',
    curvatureRadiusMm: 800,
    bezelMm: 0,
    standDepthMm: 130,
    vesa: ['100x100'],
    weightG: 14500,
    ports: ['HDMI 2.1', 'DP 1.4'],
    resolution: [5120, 1440],
  }

  it('곡률이 스탠드 깊이를 지배하면 depthMm = 패널두께 + 처짐이다', () => {
    const panel = panelSizeMm(ultrawide49)
    expect(panel.widthMm).toBeCloseTo(1198.12, 2)

    const sag = curveSagittaMm(panel.widthMm, 800)
    expect(sag).toBeCloseTo(269.78, 2)
    expect(sag).toBeGreaterThan(ultrawide49.standDepthMm)

    const dims = monitorDims(ultrawide49)
    expect(dims.depthMm).toBeCloseTo(MONITOR_PANEL_THICKNESS_MM + sag, 6)
    expect(dims.depthMm).toBeCloseTo(297.78, 2)
    expect(dims.depthMm).not.toBeCloseTo(ultrawide49.standDepthMm, 0)
  })

  it('heightMm = 스탠드 높이 + 패널 높이다', () => {
    const dims = monitorDims(ultrawide49)
    expect(dims.heightMm).toBeCloseTo(
      MONITOR_STAND_HEIGHT_MM + panelSizeMm(ultrawide49).heightMm,
      6,
    )
    expect(dims.heightMm).toBeCloseTo(526.97, 2)
  })

  it('평면 패널은 스탠드 깊이가 depthMm를 결정한다', () => {
    expect(monitorDims(flat27).depthMm).toBe(flat27.standDepthMm)
  })

  it('스탠드 깊이는 제품별 규격이다 — 34" 커브드가 27" 평면보다 깊다', () => {
    // 수용기준 7의 depth 근거. 두 제품 다 처짐(46.36mm) < 스탠드라 스탠드가 지배한다.
    const flat = getProduct('monitor-27')!.monitor!
    const curved = getProduct('monitor-34-curved')!.monitor!
    expect(flat.standDepthMm).toBe(130)
    expect(curved.standDepthMm).toBe(230)
    expect(monitorDims(curved).depthMm).toBeGreaterThan(monitorDims(flat).depthMm)
  })
})

describe('monitor 제품 등록', () => {
  it('등록된 모든 모니터의 해상도 비가 aspectRatio 라벨과 일치한다 (1% 이내)', () => {
    const monitors = PRODUCTS.filter((p) => p.monitor)
    expect(monitors.length).toBeGreaterThan(0)
    for (const p of monitors) {
      const m = p.monitor!
      const fromResolution = m.resolution[0] / m.resolution[1]
      const fromLabel = aspectFraction(m.aspectRatio)
      expect(Math.abs(fromResolution - fromLabel) / fromLabel).toBeLessThan(0.01)
    }
  })

  it('monitor-27이 monitor 규격을 갖는다', () => {
    const m = getProduct('monitor-27')!
    expect(m.monitor).toBeDefined()
    expect(m.monitor!.vesa).toEqual(['100x100'])
    expect(m.monitor!.ports.length).toBeGreaterThan(0)
  })

  it('모니터 제품은 GLB를 쓰지 않는다 (설계 §2.4)', () => {
    expect(getProduct('monitor-27')!.glbUrl).toBeUndefined()
    expect(getProduct('monitor-34-curved')!.glbUrl).toBeUndefined()
  })

  it('커브드 모니터 제품이 곡률 반경을 갖는다', () => {
    const c = getProduct('monitor-34-curved')!
    expect(c.monitor!.panelShape).toBe('curved')
    expect(c.monitor!.curvatureRadiusMm).toBeGreaterThan(0)
  })

  it('등록된 모니터의 widthMm는 파생 외형 폭과 일치한다', () => {
    for (const id of ['monitor-27', 'monitor-34-curved']) {
      const p = getProduct(id)!
      expect(p.widthMm).toBeCloseTo(panelSizeMm(p.monitor!).widthMm, 0)
    }
  })
})
