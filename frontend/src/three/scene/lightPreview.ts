// 조명 등록 도구(/dev/light)의 3D 미리보기 씬 — GLB 로드(KTX2 포함) + light_origin 마커 + lampShade 하이라이트 (vanilla three, React 없음)
import * as THREE from 'three';
import {
  analyzeLightAsset,
  collectShadeMeshes,
  type LightAssetAnalysis,
} from '../core/lightAuthoring';
import { TRANSCODER_PATH } from '../render/assetLoader';

/** 마커 구슬 반경을 모델 최대 변에 비례시킨다 — 저작자가 임의 크기 GLB를 얹는다. */
const MARKER_RATIO = 0.02;
/** 시뮬레이터 선택 아웃라인과 같은 웜 톤 (postfx.ts visibleEdgeColor) */
const MARKER_COLOR = 0xffd9a0;
const SHADE_HIGHLIGHT_COLOR = 0x82bfa8;

export interface Box3Lite {
  min: [number, number, number];
  max: [number, number, number];
}

export interface LightLoadResult {
  analysis: LightAssetAnalysis;
  /** 카메라 프레이밍용 모델 bbox (m) */
  bounds: Box3Lite;
  /** GLB의 전체 노드 이름 — 이름 오타(`Light_Origin`·`lampshade`)를 눈으로 찾는 용도 */
  nodeNames: string[];
}

export interface LightPreview {
  /** <primitive object={...} />로 마운트할 씬 */
  scene: THREE.Scene;
  loadModel(url: string): Promise<LightLoadResult>;
  /** 갓 메쉬 하이라이트 on/off */
  setShadeHighlight(on: boolean): void;
  dispose(): void;
}

// GLTF 로더는 렌더러마다 하나다 — KTX2 `detectSupport(renderer)`가 백엔드 능력을 읽으므로
// 렌더러 없이는 KTX2 텍스처가 담긴 GLB가 통째로 로드 실패한다. `rigPreview.ts`는 텍스처
// 없는 part-segmentation GLB만 다뤄 KTX2를 뺐지만 조명 GLB는 텍스처가 박혀 있어 필수다
// (docs/context/asset-pipeline.md, `render/assetLoader.ts`와 같은 스택).
async function createGltfLoader(renderer: THREE.WebGLRenderer): Promise<{
  loadAsync(url: string): Promise<{ scene: THREE.Group }>;
  ktx2: { dispose(): void };
}> {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/KTX2Loader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  const ktx2 = new KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  return { loadAsync: (url) => loader.loadAsync(url), ktx2 };
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        const tex = v as THREE.Texture | null;
        if (tex && tex.isTexture) tex.dispose();
      }
      m.dispose();
    }
  });
}

export function createLightPreview(renderer: THREE.WebGLRenderer): LightPreview {
  const scene = new THREE.Scene();
  // 최소 씬 — 모델 + 중립 조명 + 그리드뿐(rigPreview와 같은 규약). scene.background은 CSS 담당.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a938a, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const grid = new THREE.GridHelper(1, 10, 0x8b8f98, 0x565a63);
  scene.add(grid);

  // 모델은 이 그룹에 **변형 없이** 그대로 담는다 — matrixWorld가 곧 제품 로컬 좌표여야
  // light_origin의 mm 변환이 맞는다(lightAuthoring.analyzeLightAsset의 전제).
  const modelRoot = new THREE.Group();
  modelRoot.name = 'light-preview-model';
  scene.add(modelRoot);

  const markerGeometry = new THREE.SphereGeometry(1, 16, 12);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, depthTest: false });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.renderOrder = 2;
  marker.visible = false;
  scene.add(marker);

  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: SHADE_HIGHLIGHT_COLOR,
    wireframe: true,
  });
  /** 하이라이트가 덮기 전의 갓 재질 — 원본은 절대 파괴하지 않는다 */
  const shadeOriginals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  let loaderHandle: Awaited<ReturnType<typeof createGltfLoader>> | null = null;
  let model: THREE.Group | null = null;
  let highlightOn = false;

  function clearModel(): void {
    shadeOriginals.clear();
    if (!model) return;
    modelRoot.remove(model);
    disposeTree(model);
    model = null;
  }

  function applyHighlight(): void {
    for (const [mesh, original] of shadeOriginals) {
      mesh.material = highlightOn ? highlightMaterial : original;
    }
  }

  return {
    scene,

    async loadModel(url) {
      if (!loaderHandle) loaderHandle = await createGltfLoader(renderer);
      const gltf = await loaderHandle.loadAsync(url);
      clearModel();
      model = gltf.scene;
      modelRoot.add(model);

      const analysis = analyzeLightAsset(model);

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z) || 0.3;
      grid.scale.setScalar(span * 2.5);

      marker.visible = analysis.originM !== null;
      if (analysis.originM) {
        marker.position.set(analysis.originM.x, analysis.originM.y, analysis.originM.z);
        marker.scale.setScalar(span * MARKER_RATIO);
      }

      for (const mesh of collectShadeMeshes(model)) {
        shadeOriginals.set(mesh, mesh.material);
      }
      applyHighlight();

      const nodeNames: string[] = [];
      model.traverse((o) => {
        if (o.name) nodeNames.push(o.name);
      });

      return {
        analysis,
        bounds: {
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        },
        nodeNames,
      };
    },

    setShadeHighlight(on) {
      highlightOn = on;
      applyHighlight();
    },

    dispose() {
      clearModel();
      markerGeometry.dispose();
      markerMaterial.dispose();
      highlightMaterial.dispose();
      grid.dispose();
      loaderHandle?.ktx2.dispose();
      loaderHandle = null;
    },
  };
}
