import { describe, it, expect } from 'vitest'
import { mmToM, mToMm, specToBoxDims, uniformScaleToSpec } from '../src/three/core/units'

describe('units mm<->m', () => {
  it('converts mm to m', () => {
    expect(mmToM(1000)).toBe(1)
    expect(mmToM(740)).toBeCloseTo(0.74, 6)
  })
  it('converts m to mm (round trip)', () => {
    expect(mToMm(1)).toBe(1000)
    expect(mToMm(mmToM(615))).toBeCloseTo(615, 6)
  })
})

describe('specToBoxDims', () => {
  it('maps width->x, height->y, depth->z in metres', () => {
    const d = specToBoxDims({ widthMm: 1200, depthMm: 600, heightMm: 740 })
    expect(d.x).toBeCloseTo(1.2, 6)
    expect(d.y).toBeCloseTo(0.74, 6)
    expect(d.z).toBeCloseTo(0.6, 6)
  })
})

describe('uniformScaleToSpec (5% tolerance)', () => {
  it('accepts a proportional mesh (ratioError ~0)', () => {
    const spec = specToBoxDims({ widthMm: 1200, depthMm: 600, heightMm: 740 })
    const mesh = { x: 2.4, y: 1.48, z: 1.2 } // exactly 2x the spec
    const r = uniformScaleToSpec(mesh, spec)
    expect(r.ratioError).toBeLessThan(1e-6)
    expect(r.withinTolerance).toBe(true)
    expect(r.scale).toBeCloseTo(0.5, 6)
  })
  it('rejects a distorted mesh (>5% ratio error)', () => {
    const spec = specToBoxDims({ widthMm: 1200, depthMm: 600, heightMm: 740 })
    const mesh = { x: 1.0, y: 0.74, z: 0.9 } // x/z badly off
    const r = uniformScaleToSpec(mesh, spec)
    expect(r.ratioError).toBeGreaterThan(0.05)
    expect(r.withinTolerance).toBe(false)
  })
})
