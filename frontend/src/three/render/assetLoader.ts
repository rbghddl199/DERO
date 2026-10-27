// GLB 제품 로더 — GLTFLoader + KTX2Loader + MeshoptDecoder로 압축 해제 (docs/context/asset-pipeline.md 2026-07-18 확정)
//
// Module scope is three-free (type-only imports; runtime three is lazy-imported
// inside createAssetLoader) so the pure scale helpers below unit-test in the
// node-env vitest suite — same convention as units.ts/lighting.ts ("NO three import").

import type { Group, Mesh, Object3D, WebGPURenderer } from 'three/webgpu';
import {
  specToBoxDims,
  uniformScaleToSpec,
  type Dims3,
  type SpecDims,
  type UniformScaleResult,
} from '../core/units';

/** basis_transcoder.{js,wasm} copied from three/examples/jsm/libs/basis/ into
 *  public/basis/ (Next.js serves public/ at the web root). */
export const TRANSCODER_PATH = '/basis/';

// ---------------------------------------------------------------------------
// Pure helpers (three-free) — unit-tested in tests/assetLoader.test.ts
// ---------------------------------------------------------------------------

/**
 * Measured mesh bounding box (m, from Box3) + spec DB dims (mm) -> uniform
 * scale fit. Throws on a degenerate box (empty/flat GLB) — scaling by
 * Infinity/NaN must never reach the scene graph.
 */
export function computeProductScale(meshDims: Dims3, spec: SpecDims): UniformScaleResult {
  if (meshDims.x <= 0 || meshDims.y <= 0 || meshDims.z <= 0) {
    throw new Error(
      `[assetLoader] degenerate mesh bounds ${meshDims.x}x${meshDims.y}x${meshDims.z} m — GLB has no measurable geometry`,
    );
  }
  return uniformScaleToSpec(meshDims, specToBoxDims(spec));
}

/**
 * Warning text when the mesh proportions diverge >5% from the spec box
 * (asset-pipeline rule: re-generate the asset). null when within tolerance.
 */
export function scaleWarning(url: string, result: UniformScaleResult): string | null {
  if (result.withinTolerance) return null;
  return (
    `[assetLoader] ${url}: mesh proportions deviate ${(result.ratioError * 100).toFixed(1)}% ` +
    `from spec (>5% tolerance) — asset should be re-generated; applying uniform scale anyway`
  );
}

export interface ResultCache<K, V> {
  /** Cached value, or the shared in-flight promise. Never loads the same key twice. */
  get(key: K): Promise<V>;
  clear(): void;
}

/**
 * Promise-keyed memo with in-flight dedupe. A rejection evicts its entry so a
 * retry can re-run — one 404 must not poison the key for the rest of the session.
 *
 * 인플라이트 중복 제거는 결과를 **공유**해야 한다(대기자마다 같은 프로미스를 돌려준다).
 * "이미 진행 중이면 그냥 return" 형태로 쓰면 두 번째 대기자가 결과를 못 받는다
 * (cookieBake DERO-281이 그 형태로 깨졌었다).
 */
export function createResultCache<K, V>(load: (key: K) => Promise<V>): ResultCache<K, V> {
  const entries = new Map<K, Promise<V>>();
  return {
    get(key: K): Promise<V> {
      const hit = entries.get(key);
      if (hit) return hit;
      const pending: Promise<V> = load(key).catch((e: unknown) => {
        if (entries.get(key) === pending) entries.delete(key);
        throw e;
      });
      entries.set(key, pending);
      return pending;
    },
    clear(): void {
      entries.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Loader (three runtime)
// ---------------------------------------------------------------------------

export interface ShadowFlags {
  castShadow: boolean;
  receiveShadow: boolean;
}

/**
 * 모든 로드는 URL 단위로 캐시된다(fetch·파싱 1회). 반환 Group은 항상 캐시된 원본의
 * clone이라 호출부가 마음대로 변형해도 되지만, geometry·material·texture는 원본과
 * 공유하므로 개별 dispose 금지.
 */
export interface AssetLoader {
  /**
   * Load a product GLB, measure it (Box3), uniform-scale it onto the spec DB
   * dims (mm) and stamp shadow flags on every mesh. Returns a clone of the
   * cached glTF scene Group.
   */
  loadProductGLB(url: string, spec: SpecDims, shadows?: ShadowFlags): Promise<Group>;
  /**
   * Load a GLB and measure its Box3 (m) — no scaling applied. Used for GLB
   * library items with no authored mm spec (실측 스케일 고정: 그대로 표시).
   */
  measureGLB(url: string): Promise<Dims3>;
  /**
   * Load a GLB at its authored scale — no spec fit, no shadow flags. 저작 도구용
   * (규격 mm이 아직 없거나 규격과 무관하게 GLB 자체를 봐야 하는 화면).
   */
  loadGLB(url: string): Promise<Group>;
  /** Release KTX2 transcoder web workers. */
  dispose(): void;
}

/**
 * Build the shared GLTF/KTX2/meshopt loader stack. `renderer` MUST already be
 * initialized (createRenderer() awaits renderer.init()) — KTX2 detectSupport
 * reads backend capabilities, which only exist post-init.
 */
export async function createAssetLoader(renderer: WebGPURenderer): Promise<AssetLoader> {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }, { Box3, Vector3 }] = await Promise.all(
    [
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/KTX2Loader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      import('three/webgpu'),
    ],
  );

  const ktx2Loader = new KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2Loader).setMeshoptDecoder(MeshoptDecoder);

  // One fetch + one parse per URL. measureGLB and loadProductGLB used to hit the
  // network twice for the same file (three's FileLoader only dedupes concurrent
  // requests and THREE.Cache is off), which doubled the simulator's boot cost.
  // 캐시된 source는 절대 그대로 내주지 않는다 — 호출부가 변형하므로 clone(true)로만 나간다.
  const sources = createResultCache<string, Group>(
    async (url) => (await gltfLoader.loadAsync(url)).scene,
  );
  const dims = createResultCache<string, Dims3>(async (url) => {
    const size = new Box3().setFromObject(await sources.get(url)).getSize(new Vector3());
    return { x: size.x, y: size.y, z: size.z };
  });

  async function loadProductGLB(
    url: string,
    spec: SpecDims,
    shadows: ShadowFlags = { castShadow: true, receiveShadow: true },
  ): Promise<Group> {
    const [source, meshDims] = await Promise.all([sources.get(url), dims.get(url)]);
    const root = source.clone(true);

    const result = computeProductScale(meshDims, spec);
    const warning = scaleWarning(url, result);
    if (warning) console.warn(warning);

    // Uniform only — non-uniform scale is forbidden (실측 스케일 고정).
    root.scale.setScalar(result.scale);

    root.traverse((obj: Object3D) => {
      if ((obj as Mesh).isMesh) {
        obj.castShadow = shadows.castShadow;
        obj.receiveShadow = shadows.receiveShadow;
      }
    });

    return root;
  }

  async function loadGLB(url: string): Promise<Group> {
    return (await sources.get(url)).clone(true);
  }

  function measureGLB(url: string): Promise<Dims3> {
    return dims.get(url);
  }

  function dispose(): void {
    // 캐시만 비운다 — 나눠준 clone들이 source의 geometry·material·texture를 공유하므로
    // 여기서 dispose하면 살아 있는 인스턴스가 같이 죽는다. GPU 리소스 회수는 별건이다
    // (dispose() 자체가 아직 어디서도 호출되지 않는다 — src/three/CLAUDE.md 참조).
    sources.clear();
    dims.clear();
    ktx2Loader.dispose();
  }

  return { loadProductGLB, measureGLB, loadGLB, dispose };
}
