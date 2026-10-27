import { describe, it, expect } from 'vitest'
import { computeProductScale, createResultCache, scaleWarning } from '../src/three/render/assetLoader'
import { specToBoxDims } from '../src/three/core/units'

const SPEC = { widthMm: 1200, depthMm: 600, heightMm: 740 } // desk-like product

describe('computeProductScale (mesh box m + spec mm -> uniform scale)', () => {
  it('scales a proportional mesh onto the spec box (height is reference axis)', () => {
    // Exactly 2x the spec box in metres.
    const mesh = { x: 2.4, y: 1.48, z: 1.2 }
    const r = computeProductScale(mesh, SPEC)
    expect(r.scale).toBeCloseTo(0.5, 6)
    expect(r.ratioError).toBeLessThan(1e-6)
    expect(r.withinTolerance).toBe(true)
    // Applying the scale reproduces the spec dims in metres.
    const spec = specToBoxDims(SPEC)
    expect(mesh.y * r.scale).toBeCloseTo(spec.y, 6)
    expect(mesh.x * r.scale).toBeCloseTo(spec.x, 6)
    expect(mesh.z * r.scale).toBeCloseTo(spec.z, 6)
  })

  it('flags a distorted mesh (>5% ratio error) but still returns a uniform scale', () => {
    const mesh = { x: 1.0, y: 0.74, z: 0.9 } // x/z proportions badly off
    const r = computeProductScale(mesh, SPEC)
    expect(r.withinTolerance).toBe(false)
    expect(r.ratioError).toBeGreaterThan(0.05)
    expect(r.scale).toBeCloseTo(1, 6) // y-axis fit stays exact
  })

  it('throws on a degenerate bounding box instead of producing Infinity/NaN', () => {
    expect(() => computeProductScale({ x: 0, y: 1, z: 1 }, SPEC)).toThrow(/degenerate/)
    expect(() => computeProductScale({ x: 1, y: 0, z: 1 }, SPEC)).toThrow(/degenerate/)
  })
})

describe('scaleWarning', () => {
  it('is null within tolerance', () => {
    const r = computeProductScale({ x: 1.2, y: 0.74, z: 0.6 }, SPEC)
    expect(scaleWarning('/assets/desk.glb', r)).toBeNull()
  })

  it('names the url and the % deviation beyond 5%', () => {
    const r = computeProductScale({ x: 1.0, y: 0.74, z: 0.9 }, SPEC)
    const msg = scaleWarning('/assets/desk.glb', r)
    expect(msg).toContain('/assets/desk.glb')
    expect(msg).toMatch(/\d+\.\d% /)
    expect(msg).toContain('>5%')
  })
})

describe('createResultCache (in-flight dedupe + evict on rejection)', () => {
  it('loads a key once and gives every awaiter the same result', async () => {
    let calls = 0
    const cache = createResultCache<string, number>(async (k) => {
      calls++
      await Promise.resolve()
      return k.length
    })
    // 두 대기자가 완료 전에 붙는다 — 281 회귀 가드(두 번째가 결과를 못 받으면 실패).
    const [a, b] = await Promise.all([cache.get('abc'), cache.get('abc')])
    expect(a).toBe(3)
    expect(b).toBe(3)
    expect(await cache.get('abc')).toBe(3)
    expect(calls).toBe(1)
  })

  it('keys are independent', async () => {
    let calls = 0
    const cache = createResultCache<string, number>(async (k) => {
      calls++
      return k.length
    })
    expect(await cache.get('a')).toBe(1)
    expect(await cache.get('bb')).toBe(2)
    expect(calls).toBe(2)
  })

  it('evicts a rejected key so a retry can succeed', async () => {
    let calls = 0
    const cache = createResultCache<string, string>(async (k) => {
      calls++
      if (calls === 1) throw new Error('404')
      return k.toUpperCase()
    })
    await expect(cache.get('x')).rejects.toThrow('404')
    expect(await cache.get('x')).toBe('X')
    expect(calls).toBe(2)
  })

  it('clear() drops cached entries', async () => {
    let calls = 0
    const cache = createResultCache<string, number>(async () => ++calls)
    await cache.get('k')
    cache.clear()
    await cache.get('k')
    expect(calls).toBe(2)
  })
})
