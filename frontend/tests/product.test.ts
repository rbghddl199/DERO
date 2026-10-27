import { describe, it, expect } from 'vitest'
import {
  PRODUCTS,
  getProduct,
  desks,
  props,
  lamps,
  libraryItems,
} from '../src/three/scene/product'

describe('product spec DB integrity', () => {
  it('has products with unique ids', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(8)
    const ids = new Set(PRODUCTS.map((p) => p.id))
    expect(ids.size).toBe(PRODUCTS.length)
  })

  it('has >=2 desks, the required props, and >=2 lamps', () => {
    expect(desks().length).toBeGreaterThanOrEqual(2)
    expect(lamps().length).toBeGreaterThanOrEqual(2)
    const cats = new Set(props().map((p) => p.category))
    for (const c of ['monitor', 'keyboard', 'speaker', 'water-bottle']) {
      expect(cats.has(c as never)).toBe(true)
    }
  })

  it('every product carries a valid PBR material skin', () => {
    for (const p of PRODUCTS) {
      expect(typeof p.material.class).toBe('string')
      expect(p.material.baseColor).toBeGreaterThanOrEqual(0)
      expect(p.material.roughness).toBeGreaterThanOrEqual(0)
      expect(p.material.roughness).toBeLessThanOrEqual(1)
      expect(p.material.metalness).toBeGreaterThanOrEqual(0)
      expect(p.material.metalness).toBeLessThanOrEqual(1)
    }
  })

  it('desks have a positive top thickness and plausible height (mm)', () => {
    for (const d of desks()) {
      expect(d.topThicknessMm ?? 0).toBeGreaterThan(0)
      expect(d.heightMm).toBeGreaterThan(680)
      expect(d.heightMm).toBeLessThan(800)
      expect(d.widthMm).toBeGreaterThan(d.depthMm)
    }
  })

  it('lamps carry an optical spec in the spec DB (D5)', () => {
    for (const l of lamps()) {
      expect(l.optical).toBeDefined()
      expect(l.optical!.colorTempK).toBeGreaterThan(1500)
      expect(l.optical!.colorTempK).toBeLessThan(7000)
      expect(l.optical!.lumens).toBeGreaterThan(0)
      expect(l.optical!.reachMm).toBeGreaterThan(0)
      expect(['spot', 'flood', 'ambient']).toContain(l.optical!.distribution)
    }
  })

  it('getProduct + libraryItems behave', () => {
    expect(getProduct('desk-oak-1200')?.category).toBe('desk')
    expect(getProduct('nope')).toBeUndefined()
    expect(libraryItems().some((p) => p.kind === 'surface')).toBe(false)
    expect(libraryItems().length).toBe(props().length + lamps().length)
  })
})

describe('collision-overhaul spec fields', () => {
  it('deskmat-900 exists and is stackable', () => {
    const mat = getProduct('deskmat-900')!
    expect(mat).toBeDefined()
    expect(mat.stackable).toBe(true)
    expect(mat.kind).toBe('prop')
    expect(mat.heightMm).toBeLessThanOrEqual(10)
  })
  it('monitor arm declares its support segment', () => {
    const arm = getProduct('monitor-arm-white')!
    expect(arm.rig!.supportPart).toBe('clamp-base')
    expect(Object.keys(arm.rig!.segments)).toContain(arm.rig!.supportPart!)
  })
})

describe('desk 제품 — 재질·프레임 정본 (설계 §4.1)', () => {
  it('모든 desk 제품이 deskMaterialId와 frameType을 갖는다', () => {
    for (const d of desks()) {
      expect(['walnut', 'oak', 'black', 'white']).toContain(d.deskMaterialId)
      expect(['t-frame', 'four-leg', 'top-only']).toContain(d.frameType)
    }
  })

  it('모든 desk 제품이 상판 두께를 갖는다', () => {
    for (const d of desks()) {
      expect(typeof d.topThicknessMm).toBe('number')
    }
  })

  it('desk 제품은 GLB를 쓰지 않는다 (설계 §2.1)', () => {
    for (const d of desks()) {
      expect(d.glbUrl).toBeUndefined()
    }
  })
})
