// ProductAssets.ensureTemplate 단위 테스트 — 인플라이트 공유(281 회귀), meshDerivedDims 실측 확정,
// spec별 실패 격리를 가짜 로더로 검증한다. three는 import하지만 GPU는 안 건드린다(빈 Group만).
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { createProductAssets } from '../src/three/core/productAssets';
import type { AssetLoader } from '../src/three/render/assetLoader';
import type { ProductSpec } from '../src/three/scene/product';

const spec = (id: string, extra?: Partial<ProductSpec>): ProductSpec => ({
  id,
  name: `이름 ${id}`,
  kind: 'prop',
  widthMm: 200,
  depthMm: 200,
  heightMm: 200,
  material: { class: 'plastic', baseColor: 0xffffff, roughness: 0.6, metalness: 0 },
  glbUrl: `/assets/models/${id}.glb`,
  ...extra,
});

/** measureGLB/loadProductGLB만 구현한 가짜 로더 + 호출 횟수 카운터. */
function fakeLoader(opts: {
  dims?: { x: number; y: number; z: number };
  fail?: boolean;
  onLoad?: (url: string, s: ProductSpec) => void;
}): { loader: AssetLoader; readonly measureCalls: number; readonly loadCalls: number } {
  const counters = { measureCalls: 0, loadCalls: 0 };
  const loader = {
    measureGLB: async () => {
      counters.measureCalls++;
      if (opts.fail) throw new Error('404');
      return opts.dims ?? { x: 0.3, y: 0.5, z: 0.4 };
    },
    loadProductGLB: async (url: string, s: ProductSpec) => {
      counters.loadCalls++;
      if (opts.fail) throw new Error('404');
      opts.onLoad?.(url, s);
      return new THREE.Group();
    },
  } as unknown as AssetLoader;
  return {
    loader,
    get measureCalls() {
      return counters.measureCalls;
    },
    get loadCalls() {
      return counters.loadCalls;
    },
  };
}

describe('ensureTemplate 인플라이트 공유 (cookieBake DERO-281 회귀 가드)', () => {
  it('한 틱에 몰린 두 요청이 **둘 다** 결과를 받고 로드는 1회만 돈다', async () => {
    const f = fakeLoader({});
    const assets = createProductAssets(f.loader);
    const s = spec('a');
    // "이미 진행 중이면 그냥 return" 형태로 중복 제거하면 두 번째가 undefined를 받는다.
    const [first, second] = await Promise.all([assets.ensureTemplate(s), assets.ensureTemplate(s)]);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).toBe(first);
    expect(f.loadCalls).toBe(1);
    expect(assets.has('a')).toBe(true);
  });

  it('완료 후 재호출은 캐시된 spec을 즉시 돌려주고 로드를 다시 안 한다', async () => {
    const f = fakeLoader({});
    const assets = createProductAssets(f.loader);
    await assets.ensureTemplate(spec('a'));
    await assets.ensureTemplate(spec('a'));
    expect(f.loadCalls).toBe(1);
  });
});

describe('meshDerivedDims 실측 확정', () => {
  it('자리표시자 치수를 실측 mm로 갈아끼우고 플래그를 내린다', async () => {
    const f = fakeLoader({ dims: { x: 0.3, y: 0.5, z: 0.4 } });
    const assets = createProductAssets(f.loader);
    const resolved = await assets.ensureTemplate(spec('a', { meshDerivedDims: true }));
    // Box3는 m, spec은 mm. y가 높이, z가 깊이다.
    expect(resolved.widthMm).toBeCloseTo(300, 6);
    expect(resolved.heightMm).toBeCloseTo(500, 6);
    expect(resolved.depthMm).toBeCloseTo(400, 6);
    expect(resolved.meshDerivedDims).toBe(false);
  });

  it('실측한 spec을 그대로 loadProductGLB에 넘긴다 — 그래야 uniform scale이 1이 된다', async () => {
    const seen: ProductSpec[] = [];
    const f = fakeLoader({ dims: { x: 0.3, y: 0.5, z: 0.4 }, onLoad: (_u, s) => seen.push(s) });
    const assets = createProductAssets(f.loader);
    await assets.ensureTemplate(spec('a', { meshDerivedDims: true }));
    expect(seen).toHaveLength(1);
    expect(seen[0].heightMm).toBeCloseTo(500, 6);
  });

  it('원본 spec을 변형하지 않는다 (사본을 돌려준다)', async () => {
    const f = fakeLoader({ dims: { x: 0.3, y: 0.5, z: 0.4 } });
    const assets = createProductAssets(f.loader);
    const original = spec('a', { meshDerivedDims: true });
    const resolved = await assets.ensureTemplate(original);
    expect(original.heightMm).toBe(200);
    expect(original.meshDerivedDims).toBe(true);
    expect(resolved).not.toBe(original);
  });

  it('플래그가 없으면 실측을 건너뛴다 — 규격 DB 치수가 정본이다', async () => {
    const f = fakeLoader({});
    const assets = createProductAssets(f.loader);
    const resolved = await assets.ensureTemplate(spec('a'));
    expect(f.measureCalls).toBe(0);
    expect(resolved.heightMm).toBe(200);
  });

  it('glbUrl이 없으면 아무것도 안 하고 spec을 그대로 돌려준다 (절차 생성 제품)', async () => {
    const f = fakeLoader({});
    const assets = createProductAssets(f.loader);
    const s = spec('procedural', { glbUrl: undefined });
    expect(await assets.ensureTemplate(s)).toBe(s);
    expect(f.loadCalls).toBe(0);
  });
});

describe('실패 격리', () => {
  it('reject하고 다음 시도가 다시 돈다 — 404 하나가 세션을 영구히 막지 않는다', async () => {
    let fail = true;
    const loader = {
      measureGLB: async () => ({ x: 0.3, y: 0.5, z: 0.4 }),
      loadProductGLB: async () => {
        if (fail) throw new Error('404');
        return new THREE.Group();
      },
    } as unknown as AssetLoader;
    const assets = createProductAssets(loader);
    await expect(assets.ensureTemplate(spec('a'))).rejects.toThrow('404');
    expect(assets.has('a')).toBe(false);
    fail = false;
    await expect(assets.ensureTemplate(spec('a'))).resolves.toBeDefined();
    expect(assets.has('a')).toBe(true);
  });

  it('preload는 실패를 삼킨다 — 부팅이 GLB 하나 때문에 죽으면 안 된다', async () => {
    const f = fakeLoader({ fail: true });
    const assets = createProductAssets(f.loader);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(assets.preload([spec('a'), spec('b')])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('prefetch는 실패를 삼키고 reject를 밖으로 내보내지 않는다', async () => {
    const f = fakeLoader({ fail: true });
    const assets = createProductAssets(f.loader);
    expect(() => assets.prefetch(spec('a'))).not.toThrow();
    // 마이크로태스크가 다 돌 때까지 기다려도 unhandled rejection이 안 난다.
    await new Promise((r) => setTimeout(r, 0));
    expect(assets.has('a')).toBe(false);
  });
});
