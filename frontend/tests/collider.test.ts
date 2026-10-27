import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildItemCollider, collideItems, footprintRectXZ } from '../src/three/core/collider'

function boxGroup(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  m.position.y = h / 2 // base-origin convention
  g.add(m)
  return g
}

describe('buildItemCollider', () => {
  it('one part per mesh', () => {
    const g = boxGroup(0.1, 0.1, 0.1)
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05)))
    expect(buildItemCollider(g).parts.length).toBe(2)
  })
})

describe('collideItems (SAT)', () => {
  it('interpenetrating boxes collide', () => {
    const a = boxGroup(0.1, 0.1, 0.1)
    const b = boxGroup(0.1, 0.1, 0.1)
    b.position.x = 0.05
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    const r = collideItems(buildItemCollider(a), buildItemCollider(b))
    expect(r.a.length).toBe(1)
    expect(r.b.length).toBe(1)
  })
  it('separated boxes do not collide', () => {
    const a = boxGroup(0.1, 0.1, 0.1)
    const b = boxGroup(0.1, 0.1, 0.1)
    b.position.x = 0.5
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(0)
  })
  it('face-touching boxes do not collide (snug side-by-side legal)', () => {
    const a = boxGroup(0.1, 0.1, 0.1)
    const b = boxGroup(0.1, 0.1, 0.1)
    b.position.x = 0.1
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(0)
  })
  it('stacked base-on-top contact does not collide', () => {
    const a = boxGroup(0.4, 0.004, 0.3) // mat
    const b = boxGroup(0.1, 0.05, 0.1)
    b.position.y = 0.004 // rests exactly on the mat top
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(0)
  })
  it('rotated OBB has no AABB false positive', () => {
    // long thin bar rotated 45°: its world AABB covers the cube, the OBB does not
    const bar = new THREE.Group()
    const barMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05))
    bar.add(barMesh)
    bar.rotation.y = Math.PI / 4
    const cube = boxGroup(0.1, 0.1, 0.1)
    cube.position.set(0.35, -0.05, 0.35) // (+X,+Z) corner: inside the bar's world AABB, off its OBB diagonal
    bar.updateMatrixWorld(true)
    cube.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(bar), buildItemCollider(cube)).a.length).toBe(0)
  })
  it('FK pivot rotation moves the part into collision', () => {
    // arm under a pivot: rest pose along +z misses the cube at +x; yaw +90° hits it
    const root = new THREE.Group()
    const pivot = new THREE.Object3D()
    root.add(pivot)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4))
    arm.position.z = 0.2
    pivot.add(arm)
    const cube = boxGroup(0.1, 0.1, 0.1)
    cube.position.set(0.25, -0.05, 0)
    root.updateMatrixWorld(true)
    cube.updateMatrixWorld(true)
    const armCollider = buildItemCollider(root)
    const cubeCollider = buildItemCollider(cube)
    expect(collideItems(armCollider, cubeCollider).a.length).toBe(0)
    pivot.rotation.y = Math.PI / 2 // +z arm swings to +x
    root.updateMatrixWorld(true)
    expect(collideItems(armCollider, cubeCollider).a.length).toBe(1)
  })
})

// 겹침 관용치 (DERO-375, 2026-08-03 박동규 승인): 판정용 OBB 반크기를 축마다
// 5mm 깎되 그 축 반크기의 40%를 넘지 않는다. CONTACT_EPS 0.5mm가 이미 빠져 있어
// 실효 문턱은 2×(5 + 0.5) = 11mm 겹침이다.
describe('collideItems — 겹침 관용치', () => {
  it('5mm 남짓 미만으로 파고든 것은 충돌이 아니다', () => {
    const a = boxGroup(0.1, 0.1, 0.1)
    const b = boxGroup(0.1, 0.1, 0.1)
    b.position.x = 0.1 - 0.008 // 8mm 겹침
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(0)
  })

  it('관용치를 넘게 겹치면 여전히 충돌이다', () => {
    const a = boxGroup(0.1, 0.1, 0.1)
    const b = boxGroup(0.1, 0.1, 0.1)
    b.position.x = 0.1 - 0.02 // 20mm 겹침
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(1)
  })

  // 상한이 없으면 반크기 3.5mm에서 5mm를 빼 음수가 되고, 그 파트는 판정에서 사라진다.
  it('두께 7mm 파트(아이패드)는 수축 후에도 판정에 남는다', () => {
    const a = boxGroup(0.24, 0.007, 0.17)
    const b = boxGroup(0.24, 0.007, 0.17)
    b.position.y = 0.002 // 두께 7mm 중 5mm가 겹친다
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(1)
  })

  it('두께 7mm 파트도 관용치 안의 접촉은 충돌이 아니다', () => {
    const a = boxGroup(0.24, 0.007, 0.17)
    const b = boxGroup(0.24, 0.007, 0.17)
    b.position.y = 0.007 // 위에 정확히 얹힘 (접촉)
    a.updateMatrixWorld(true)
    b.updateMatrixWorld(true)
    expect(collideItems(buildItemCollider(a), buildItemCollider(b)).a.length).toBe(0)
  })
})

// Regression: meshopt + KHR_mesh_quantization GLB props (e.g. monitor-arm-white)
// store positions in raw integer units with the dequantization scale on the node
// matrix, so geometry.boundingBox is centred thousands of units from the mesh
// origin. The three OBB addon's applyMatrix4 only ADDS the matrix translation to
// the centre (never scales/rotates it), which parked the collider OBB ~thousands
// of units away — the real arm then never collided and its support footprint
// always read outside the desk. worldOBB now recomputes the centre with the full
// transform. Mirrors the mechanism without loading a GLB.
describe('quantized-style geometry (raw-int box + dequant scale on node matrix)', () => {
  function centeredBox(size: number, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size)))
    g.position.set(x, y, z)
    g.updateMatrixWorld(true)
    return g
  }
  function quantizedArm(): THREE.Group {
    const DEQUANT = 1e-4 // dequant scale on the node matrix, as gltfpack emits
    const arm = new THREE.Group()
    const node = new THREE.Object3D()
    node.scale.setScalar(DEQUANT)
    arm.add(node)
    const geom = new THREE.BoxGeometry(2000, 2000, 2000)
    geom.translate(3000, 3000, 3000) // boundingBox centre far from origin (raw units)
    node.add(new THREE.Mesh(geom))
    arm.updateMatrixWorld(true)
    // world box: centre (3000,3000,3000)*1e-4 = (0.3,0.3,0.3), half 1000*1e-4 = 0.1
    return arm
  }
  it('OBB footprint lands at the world position, not the raw-int centre', () => {
    const fp = footprintRectXZ(buildItemCollider(quantizedArm()).parts)!
    expect(fp.minX).toBeCloseTo(0.2, 3)
    expect(fp.maxX).toBeCloseTo(0.4, 3)
    expect(fp.minZ).toBeCloseTo(0.2, 3)
    expect(fp.maxZ).toBeCloseTo(0.4, 3)
  })
  it('collides with a box overlapping its world position', () => {
    const arm = buildItemCollider(quantizedArm())
    const probe = buildItemCollider(centeredBox(0.1, 0.3, 0.3, 0.3))
    expect(collideItems(arm, probe).a.length).toBe(1)
  })
  it('does NOT collide with a box at the raw-int coordinates (the pre-fix ghost region)', () => {
    const arm = buildItemCollider(quantizedArm())
    const ghost = buildItemCollider(centeredBox(0.1, 3000, 3000, 3000))
    expect(collideItems(arm, ghost).a.length).toBe(0)
  })
})

describe('footprintRectXZ', () => {
  it('projects world OBB corners to XZ', () => {
    const g = boxGroup(0.2, 0.1, 0.4)
    g.position.set(1, 0, 2)
    g.updateMatrixWorld(true)
    const r = footprintRectXZ(buildItemCollider(g).parts)!
    expect(r.minX).toBeCloseTo(0.9, 3)
    expect(r.maxX).toBeCloseTo(1.1, 3)
    expect(r.minZ).toBeCloseTo(1.8, 3)
    expect(r.maxZ).toBeCloseTo(2.2, 3)
  })
  it('empty parts -> null', () => {
    expect(footprintRectXZ([])).toBeNull()
  })
})

describe('buildItemCollider — 숨긴 메쉬 제외 (모니터 스탠드)', () => {
  it('visible=false 메쉬는 충돌 파트에서 빠진다', () => {
    const g = new THREE.Group()
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    b.visible = false
    g.add(a, b)
    expect(buildItemCollider(g).parts.length).toBe(1)
  })

  it('숨긴 부모 아래 메쉬도 빠진다', () => {
    const g = new THREE.Group()
    const holder = new THREE.Group()
    holder.visible = false
    holder.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
    g.add(holder)
    expect(buildItemCollider(g).parts.length).toBe(0)
  })
})
