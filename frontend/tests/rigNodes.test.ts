import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { getProduct } from '../src/three/scene/product'

// D16 guard: the rig manifest names GLB nodes ('mesh_0'..'mesh_9') — an asset
// re-export that renames nodes breaks articulation silently (runtime only
// console.warns and every joint rotates nothing). Parse the shipped GLB's JSON
// chunk directly (plain binary, no three import — node-env suite) and assert
// every manifest node name actually exists.

const GLB_PATH = fileURLToPath(new URL('../public/assets/monitor-arm.glb', import.meta.url))

interface GlbJson {
  nodes?: { name?: string }[]
}

function readGlbJson(path: string): GlbJson {
  const buf = readFileSync(path)
  expect(buf.readUInt32LE(0)).toBe(0x46546c67) // 'glTF' magic
  expect(buf.readUInt32LE(4)).toBe(2) // container version
  const chunkLength = buf.readUInt32LE(12)
  expect(buf.readUInt32LE(16)).toBe(0x4e4f534a) // first chunk type 'JSON'
  return JSON.parse(buf.subarray(20, 20 + chunkLength).toString('utf8')) as GlbJson
}

describe('rig manifest node names exist in the shipped monitor-arm GLB', () => {
  const rig = getProduct('monitor-arm-white')!.rig!
  const glb = readGlbJson(GLB_PATH)
  const glbNames = new Set((glb.nodes ?? []).map((n) => n.name).filter(Boolean))

  it('GLB has named nodes', () => {
    expect(glbNames.size).toBeGreaterThan(0)
  })

  it('every segment node name resolves to a GLB node', () => {
    for (const [segment, nodeNames] of Object.entries(rig.segments)) {
      for (const name of nodeNames) {
        expect(glbNames.has(name), `segment "${segment}" node "${name}" missing in GLB`).toBe(true)
      }
    }
  })
})
