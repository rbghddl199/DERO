// 리그 매니페스트 저작 도구(/dev/rig)의 3D 미리보기 씬 — GLB 파트 하이라이트·FK 피벗 체인 재구성·관절 축 표시 (vanilla three, React 없음)
import * as THREE from 'three/webgpu';
import { dominantAxis } from '../core/gizmoMath';
import { buildArticulation, setJointValue, type JointState } from '../core/productAssets';
import { resolveJointValues } from '../core/rig';
import type { RigManifest } from './product';

/** 축별 색 규약은 jointGizmo.ts와 같다(X=코랄·Y=민트·Z=라벤더). 단 저기서 곱하는
 *  EXPOSURE_GAIN(=20)은 postfx가 pre-tonemap 선형 공간에 합성하기 때문에 필요한
 *  역보상이다 — 이 씬에는 postfx가 없으므로 원색 그대로 쓴다(곱하면 하얗게 탄다). */
const AXIS_COLOR: Record<'x' | 'y' | 'z', number> = {
  x: 0xd9917c,
  y: 0x82bfa8,
  z: 0x9c90dd,
};
/** 시뮬레이터 선택 아웃라인과 같은 웜 톤(postfx.ts visibleEdgeColor) */
const HIGHLIGHT_COLOR = 0xffd9a0;
/** 저작자가 임의 GLB를 얹으므로 보조 형상 크기는 모델 최대 변에 비례시킨다. */
const BEAD_RATIO = 0.022;
const ARROW_RATIO = 0.32;
const GRID_RATIO = 2.5;
/** 모델이 없거나 측정 불가일 때의 기준 크기(m) */
const FALLBACK_SIZE = 0.3;

export interface Box3Lite {
  min: [number, number, number];
  max: [number, number, number];
}

export interface RigPreview {
  /** <primitive object={...} />로 마운트할 씬 */
  scene: THREE.Scene;
  /** GLB 로드. 성공 시 파트(메쉬) 이름 목록을 돌려준다 */
  loadModel(url: string): Promise<string[]>;
  /** 파트별 bbox (GLB 루트 공간, 미터, 스케일 적용 전) — core의 defaultPivot에 먹인다 */
  getPartBoxes(): Record<string, Box3Lite>;
  /** 매니페스트 초안 반영 — 세그먼트 노드 계층을 다시 세운다 */
  setManifest(m: RigManifest | null): void;
  /** 관절 값 적용 (revolute=도, prismatic=mm). 종속 관절은 호출부가 이미 resolve한 값을 준다 */
  setJointValues(values: Map<string, number>): void;
  /** 파트 하이라이트 — null이면 해제 */
  highlightPart(node: string | null): void;
  /** 피벗 구슬·축 화살표 표시 대상 관절 id. null이면 전부 숨김 */
  focusJoint(id: string | null): void;
  /** 정지 포즈 복귀 */
  resetPose(): void;
  dispose(): void;
}

/** 로드 시점의 파트(메쉬) 원본 상태 — 피벗 재구성 시 되돌릴 좌표계와 재질. */
interface PartRecord {
  mesh: THREE.Mesh;
  /** GLB 원래 부모 — 피벗에 attach했던 것을 여기로 되돌린다 */
  parent: THREE.Object3D;
  /** 로드 직후 로컬 TRS */
  matrix: THREE.Matrix4;
  /** 하이라이트가 덮기 전의 재질 (원본은 절대 파괴하지 않는다) */
  material: THREE.Material | THREE.Material[];
}

// GLTF 로더는 모듈 1회 생성 후 공유한다. render/assetLoader.ts의 createAssetLoader를
// 쓰지 않는 이유: (1) KTX2 detectSupport에 WebGPURenderer 핸들이 필요한데
// createRigPreview()는 렌더러를 받지 않고, (2) loadProductGLB는 규격 mm로 균일
// 스케일을 먹여 돌려주는데 저작 도구는 스케일 이전 원본 좌표가 필요하다(매니페스트
// point가 그 공간이다). 여기서 다루는 것은 텍스처 없는 part-segmentation GLB라
// KTX2 없이 meshopt만으로 충분하다.
let loaderPromise: Promise<{ loadAsync(url: string): Promise<{ scene: THREE.Group }> }> | null =
  null;

function gltfLoader(): Promise<{ loadAsync(url: string): Promise<{ scene: THREE.Group }> }> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    })();
  }
  return loaderPromise;
}

function disposeMaterial(m: THREE.Material): void {
  // map/normalMap/emissiveMap… 을 나열하지 않고 텍스처인 슬롯을 전부 훑는다.
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    const tex = v as THREE.Texture | null;
    if (tex && tex.isTexture) tex.dispose();
  }
  m.dispose();
}

export function createRigPreview(): RigPreview {
  const scene = new THREE.Scene();
  // 최소 씬 — 모델 + 중립 조명 + 그리드뿐. 책상·벽·postfx·그림자·충돌은 저작에
  // 필요 없다(배치 맥락이 없다). scene.background도 두지 않는다: ACES + 노출
  // 보정 아래에서 상수색 배경은 짙게 눌리므로 캔버스 배경은 CSS가 담당한다.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a938a, 2.0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 4, 3);
  scene.add(key);

  const grid = new THREE.GridHelper(1, 10, 0x8b8f98, 0x565a63);
  scene.add(grid);

  const modelRoot = new THREE.Group();
  modelRoot.name = 'rig-preview-model';
  scene.add(modelRoot);

  // --- 피벗 마커(구슬 + 양방향 축 화살표) ---
  const beadGeo = new THREE.SphereGeometry(1, 20, 14);
  const beadMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bead = new THREE.Mesh(beadGeo, beadMat);
  const arrowPos = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0));
  const arrowNeg = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0));
  const marker = new THREE.Group();
  marker.name = 'rig-preview-joint-marker';
  marker.add(bead, arrowPos, arrowNeg);
  marker.visible = false;
  modelRoot.add(marker);

  const highlightMat = new THREE.MeshStandardMaterial({
    color: HIGHLIGHT_COLOR,
    emissive: new THREE.Color(HIGHLIGHT_COLOR),
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0,
  });

  let glbRoot: THREE.Object3D | null = null;
  const parts = new Map<string, PartRecord>();
  let partBoxes: Record<string, Box3Lite> = {};
  let manifest: RigManifest | null = null;
  let joints = new Map<string, JointState>();
  let pivots: THREE.Object3D[] = [];
  let highlighted: string | null = null;
  let focusedJointId: string | null = null;
  let modelSize = FALLBACK_SIZE;

  function setMarkerScale(): void {
    bead.scale.setScalar(modelSize * BEAD_RATIO);
    const len = modelSize * ARROW_RATIO;
    arrowPos.setLength(len, len * 0.22, len * 0.1);
    arrowNeg.setLength(len, len * 0.22, len * 0.1);
    grid.scale.setScalar(modelSize * GRID_RATIO);
  }
  setMarkerScale();

  function highlightPart(node: string | null): void {
    if (highlighted === node) return;
    if (highlighted) {
      const prev = parts.get(highlighted);
      if (prev) prev.mesh.material = prev.material; // 원본 복구 (재질을 파괴하지 않는다)
    }
    highlighted = null;
    if (!node) return;
    const rec = parts.get(node);
    if (!rec) return;
    rec.mesh.material = highlightMat;
    highlighted = node;
  }

  function focusJoint(id: string | null): void {
    focusedJointId = id;
    const st = id === null ? undefined : joints.get(id);
    if (!st) {
      marker.visible = false;
      modelRoot.add(marker); // 피벗이 사라져도 마커는 살려둔다
      return;
    }
    // 피벗 노드에 매단다 — FK 체인을 그대로 타므로 부모 관절을 움직여도 따라간다.
    // 축 벡터는 피벗의 부모 공간 기준이지만, revolute의 회전은 그 축을 자기 자신으로
    // 보내고 prismatic은 회전이 없으므로 피벗 로컬에서도 같은 방향이다.
    st.pivot.add(marker);
    marker.position.set(0, 0, 0);
    const color = AXIS_COLOR[dominantAxis(st.joint.axis)];
    beadMat.color.setHex(color);
    arrowPos.setDirection(st.axis);
    arrowNeg.setDirection(st.axis.clone().negate());
    arrowPos.setColor(color);
    arrowNeg.setColor(color);
    marker.visible = true;
  }

  function applyValues(values: Map<string, number>): void {
    for (const [id, v] of values) {
      const st = joints.get(id);
      // 관절 구동은 런타임(core/productAssets.setJointValue)과 같은 코드 —
      // prismatic /1000, restPos 기준 절대 이동이 여기서 갈리면 안 된다.
      if (st) setJointValue(st, v);
    }
  }

  function resetPose(): void {
    if (!manifest) return;
    applyValues(resolveJointValues(manifest.joints, {}));
  }

  function teardownRig(): void {
    modelRoot.add(marker); // 피벗과 함께 삭제되지 않게 먼저 떼어낸다
    marker.visible = false;
    for (const rec of parts.values()) {
      rec.parent.add(rec.mesh);
      rec.matrix.decompose(rec.mesh.position, rec.mesh.quaternion, rec.mesh.scale);
    }
    for (const p of pivots) p.removeFromParent();
    pivots = [];
    joints = new Map();
  }

  /** 공유 buildArticulation을 부르고, teardownRig가 되돌릴 피벗 목록을 붙잡아 둔다. */
  function buildRig(): void {
    const root = glbRoot;
    const rig = manifest;
    if (!root || !rig) return;
    joints = buildArticulation(root, rig);
    pivots = [...joints.values()].map((j) => j.pivot);
  }

  function setManifest(m: RigManifest | null): void {
    manifest = m;
    teardownRig();
    buildRig();
    focusJoint(focusedJointId);
  }

  function disposeModel(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) disposeMaterial(m);
    });
  }

  function clearModel(): void {
    highlightPart(null); // 공유 하이라이트 재질이 GLB 재질로 오인돼 dispose되지 않게
    teardownRig();
    if (glbRoot) {
      modelRoot.remove(glbRoot);
      disposeModel(glbRoot);
      glbRoot = null;
    }
    parts.clear();
    partBoxes = {};
    manifest = null;
    modelSize = FALLBACK_SIZE;
  }

  async function loadModel(url: string): Promise<string[]> {
    const loader = await gltfLoader();
    const gltf = await loader.loadAsync(url); // 실패 시 기존 모델은 그대로 둔다
    const pending = manifest; // 모델을 갈아끼워도 저작 중인 초안은 다시 얹는다
    clearModel();

    const root: THREE.Object3D = gltf.scene;
    glbRoot = root;
    modelRoot.add(root);
    // 계층 행렬을 먼저 확정해야 파트 bbox를 GLB 루트 공간으로 정확히 환산한다.
    root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const names: string[] = [];
    const boxes: Record<string, Box3Lite> = {};
    const bounds = new THREE.Box3();

    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // 이름 없는/중복 노드는 저작 UI에서 지목할 수 없으므로 여기서 유일하게 만든다.
      let name = mesh.name || `mesh_${names.length}`;
      for (let n = 2; parts.has(name); n++) name = `${mesh.name || 'mesh'}_${n}`;
      mesh.name = name;

      // Box3.setFromObject은 visible=false 노드까지 삼킨다(src/three/CLAUDE.md) —
      // 파트별 지오메트리 bbox를 직접 GLB 루트 공간으로 옮겨 그 함정을 피한다.
      mesh.geometry.computeBoundingBox();
      const local = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
      const box = mesh.geometry.boundingBox!.clone().applyMatrix4(local);

      names.push(name);
      boxes[name] = {
        min: [box.min.x, box.min.y, box.min.z],
        max: [box.max.x, box.max.y, box.max.z],
      };
      bounds.union(box);
      parts.set(name, {
        mesh,
        parent: mesh.parent ?? root,
        matrix: mesh.matrix.clone(),
        material: mesh.material,
      });
    });

    partBoxes = boxes;
    const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
    modelSize = Math.max(size.x, size.y, size.z) || FALLBACK_SIZE;
    setMarkerScale();
    setManifest(pending);
    return names;
  }

  function dispose(): void {
    clearModel();
    beadGeo.dispose();
    beadMat.dispose();
    highlightMat.dispose();
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
    // ArrowHelper의 line/cone 지오메트리는 three 모듈 전역 싱글턴이다 — arrow.dispose()를
    // 부르면 앱의 다른 ArrowHelper까지 같이 죽는다. 인스턴스 소유인 머티리얼만 해제한다.
    for (const a of [arrowPos, arrowNeg]) {
      (a.line.material as THREE.Material).dispose();
      (a.cone.material as THREE.Material).dispose();
    }
    key.dispose();
    hemi.dispose();
    scene.clear();
  }

  return {
    scene,
    loadModel,
    getPartBoxes: () => ({ ...partBoxes }),
    setManifest,
    setJointValues: applyValues,
    highlightPart,
    focusJoint,
    resetPose,
    dispose,
  };
}
