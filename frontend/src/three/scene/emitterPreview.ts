// 관리자 발광 저작 프리뷰 씬 — 미니 데스크 위에 GLB 하나를 얹고 저작 중인 product_emitter 값(색·lm·반경·지점·배광)을 실시간 반영한다 (vanilla three/webgpu, React 없음)
import * as THREE from 'three/webgpu';
import { mmToM } from '../core/units';
import { materialForSkin } from '../render/materials';
import { setupEnvironment } from '../render/environment';
import { createAssetLoader, type AssetLoader } from '../render/assetLoader';
import { createRoomRig, type RoomRig } from './roomRig';
import { applyEmitterEmissive, pokeEmissive } from './emitterEmissive';
import { beamHalfAngleRad, penumbraFor } from './lighting';
import type { MaterialSkin } from './product';

/** 미니 데스크 상판 — 규격 시스템(deskConfig)을 끌어오지 않는다. 스필이 떨어질 면이면 된다. */
const TOP_W = 1.2;
const TOP_D = 0.6;
const TOP_T = 0.025;
const TOP_Y = 0.72;
/** 뒷벽 — `scene.ts` makeWall과 같은 뉴트럴 그레이. 스필이 번지는 수직면 하나. */
const WALL_W = 2.0;
const WALL_H = 1.6;
const TOP_SKIN: MaterialSkin = {
  class: 'wood',
  baseColor: 0xb98b5e,
  roughness: 0.55,
  metalness: 0,
};

/** 리컬러 뒤 몇 프레임 있다가 poke할지 — `scene.ts`의 `EMITTER_POKE_FRAMES`와 같은 값. */
const POKE_FRAMES = 2;

/** 저작 중인 발광 값 — 관리자 폼 초안(문자열)을 숫자로 편 형태다. */
export interface EmitterPreviewDraft {
  shape: 'POINT' | 'SPOT';
  /** SPOT일 때만 의미가 있다. 빔 반각·penumbra의 정본은 `scene/lighting.ts`. */
  distribution: 'SPOT' | 'FLOOD' | 'AMBIENT' | null;
  lumens: number;
  radiusMm: number;
  /** 0xRRGGBB */
  colorHex: number;
  /** 제품 로컬 mm. null이면 모델 bbox 중심을 쓴다 (ADR-0003 결정 4). */
  pointMm: { x: number; y: number; z: number } | null;
}

export interface EmitterPreview {
  /** `<primitive object={...} />`로 마운트할 씬 */
  scene: THREE.Scene;
  /** 모델을 실측 스케일 그대로 상판 위에 얹는다. 같은 인스턴스에서 여러 번 부를 수 있다. */
  loadModel(url: string): Promise<void>;
  /** 저작 값을 발광면 emissive + 광원에 반영한다. null이면 발광을 끈다. */
  setEmitter(draft: EmitterPreviewDraft | null): void;
  setRoomLight(on: boolean): boolean;
  roomOn(): boolean;
  /** 카메라 프레이밍용 — 모델을 얹은 뒤의 월드 bbox. 모델이 없으면 상판 기준. */
  focus(): { center: [number, number, number]; radius: number };
  /** 매 프레임 호출 — 지연 poke를 소진한다(NodeMaterialObserver 우회). */
  tick(): void;
  dispose(): void;
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

/**
 * 프리뷰 씬을 만든다. `renderer`는 이미 `createRenderer()`로 초기화된 WebGPU 렌더러여야
 * 한다 — KTX2 `detectSupport(renderer)`가 백엔드 능력을 읽고(텍스처가 박힌 GLB가
 * 그것 없이는 통째로 로드 실패), 노출 1/20 캘리브레이션이 여기 조명 세기의 전제다.
 *
 * <p>광원 두 개(PointLight·SpotLight)를 **부팅 시 만들어 두고** shape 전환은 세기로만
 * 한다 — `visible`·광원 추가/삭제는 three `LightsNode`의 셰이더 해시를 바꿔 씬 전역
 * 재빌드를 부른다(DERO-235와 같은 축).
 */
export async function createEmitterPreview(
  renderer: THREE.WebGPURenderer,
): Promise<EmitterPreview> {
  const scene = new THREE.Scene();
  setupEnvironment(scene, renderer);

  const room: RoomRig = createRoomRig(scene);

  // --- 미니 데스크 (상판 한 장 + 뒷벽) ---
  const top = new THREE.Mesh(new THREE.BoxGeometry(TOP_W, TOP_T, TOP_D), materialForSkin(TOP_SKIN));
  top.position.set(0, TOP_Y - TOP_T / 2, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  scene.add(top);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(WALL_W, WALL_H),
    new THREE.MeshStandardNodeMaterial({ color: 0xededec, roughness: 0.97, metalness: 0 }),
  );
  wall.position.set(0, WALL_H / 2, -TOP_D / 2 - 0.001);
  wall.receiveShadow = true;
  scene.add(wall);

  // --- 모델 루트: 변형 없이 담는다 — matrixWorld가 곧 제품 로컬이라야 point mm가 맞는다.
  const modelRoot = new THREE.Group();
  modelRoot.name = 'emitter-preview-model';
  modelRoot.position.set(0, TOP_Y, 0);
  scene.add(modelRoot);

  // --- 발광 광원 두 개, 부팅 시 확정 (위 주석 참고) ---
  const pointLight = new THREE.PointLight(0xffffff);
  pointLight.castShadow = false;
  pointLight.decay = 2;
  pointLight.distance = 1;
  pointLight.power = 0;
  modelRoot.add(pointLight);

  const spotLight = new THREE.SpotLight(0xffffff);
  spotLight.castShadow = false;
  spotLight.decay = 2;
  spotLight.distance = 1;
  spotLight.angle = beamHalfAngleRad('flood');
  spotLight.penumbra = penumbraFor('flood');
  spotLight.power = 0;
  modelRoot.add(spotLight);
  // 스팟은 아래를 본다 — 갓이 달린 램프의 실제 방향이고, 상판 웅덩이가 보여야 한다.
  spotLight.target.position.set(0, -1, 0);
  modelRoot.add(spotLight.target);

  let loader: AssetLoader | null = null;
  let model: THREE.Group | null = null;
  /** 모델 로컬 bbox 중심(m) — `pointMm`이 비었을 때의 폴백 (ADR-0003 결정 4). */
  const bboxCenter = new THREE.Vector3();
  let modelRadius = 0.2;
  let draft: EmitterPreviewDraft | null = null;
  let pokeCountdown = 0;

  function clearModel(): void {
    if (!model) return;
    modelRoot.remove(model);
    disposeTree(model);
    model = null;
  }

  /** 초안의 발광 지점(모델 로컬 m). 셋 다 비었으면 bbox 중심. */
  function emitterLocal(): THREE.Vector3 {
    const p = draft?.pointMm;
    if (!p) return bboxCenter;
    return new THREE.Vector3(mmToM(p.x), mmToM(p.y), mmToM(p.z));
  }

  function applyDraft(): void {
    const at = emitterLocal();
    pointLight.position.copy(at);
    spotLight.position.copy(at);
    spotLight.target.position.set(at.x, at.y - 1, at.z);

    if (!draft) {
      pointLight.power = 0;
      spotLight.power = 0;
      if (model) applyEmitterEmissive(model, 0x000000);
      pokeCountdown = POKE_FRAMES;
      return;
    }

    const distance = Math.max(mmToM(draft.radiusMm), 1e-3);
    const lumens = Math.max(draft.lumens, 0);
    pointLight.color.setHex(draft.colorHex);
    pointLight.distance = distance;
    spotLight.color.setHex(draft.colorHex);
    spotLight.distance = distance;
    // 배광은 SPOT에서만 고른다 — 미선택이면 확산형이 기본값이다(슬롯 풀과 같은 초기값).
    const dist = draft.distribution === null ? 'flood' : distributionKey(draft.distribution);
    spotLight.angle = beamHalfAngleRad(dist);
    spotLight.penumbra = penumbraFor(dist);
    // shape 전환은 세기로만 — 광원 집합을 건드리면 셰이더가 재빌드된다.
    pointLight.power = draft.shape === 'POINT' ? lumens : 0;
    spotLight.power = draft.shape === 'SPOT' ? lumens : 0;

    if (model) applyEmitterEmissive(model, draft.colorHex);
    // NodeMaterialObserver 스냅샷이 lazy라 색만 바꾸면 화면이 안 변한다 —
    // 몇 프레임 뒤 emissiveIntensity를 흔들어 강제 감지시킨다 (emitterEmissive.ts).
    pokeCountdown = POKE_FRAMES;
  }

  return {
    scene,

    async loadModel(url) {
      if (!loader) loader = await createAssetLoader(renderer);
      const root = await loader.loadGLB(url);
      clearModel();
      model = root;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      // bbox는 **modelRoot에 붙이기 전에** 잰다 — `Box3.setFromObject`는 월드 변환을 쓰므로
      // 붙인 뒤에 재면 상판 높이(TOP_Y)가 섞여 들어가고, 그 값이 modelRoot **로컬**인
      // 광원 위치와 `focus()`에 그대로 실려 발광 지점을 비웠을 때 광원이 상판 위로
      // 한 번 더 떠오른다.
      const box = new THREE.Box3().setFromObject(root);
      box.getCenter(bboxCenter);
      const size = box.getSize(new THREE.Vector3());
      modelRadius = Math.max(size.x, size.y, size.z) / 2 || 0.2;

      modelRoot.add(root);
      applyDraft();
    },

    setEmitter(next) {
      draft = next;
      applyDraft();
    },

    setRoomLight: room.setRoomLight,
    roomOn: room.roomOn,

    focus() {
      const y = TOP_Y + (model ? bboxCenter.y : 0.1);
      const radius = Math.max(model ? modelRadius : 0.25, 0.12);
      return { center: [0, y, 0], radius };
    },

    tick() {
      if (pokeCountdown === 0) return;
      if (--pokeCountdown > 0) return;
      if (model) pokeEmissive(model);
    },

    dispose() {
      clearModel();
      top.geometry.dispose();
      top.material.dispose();
      wall.geometry.dispose();
      wall.material.dispose();
      loader?.dispose();
      loader = null;
    },
  };
}

/** 와이어 열거(대문자) → `scene/lighting.ts`의 배광 키. 각도의 정본은 그쪽이다. */
function distributionKey(
  distribution: NonNullable<EmitterPreviewDraft['distribution']>,
): 'spot' | 'flood' | 'ambient' {
  switch (distribution) {
    case 'SPOT':
      return 'spot';
    case 'FLOOD':
      return 'flood';
    case 'AMBIENT':
      return 'ambient';
  }
}
