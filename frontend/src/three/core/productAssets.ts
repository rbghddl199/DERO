// GLB 제품 템플릿 — assetLoader로 1회 프리로드 후 배치마다 동기 복제(scene.placeAt 동기 유지), 관절 제품은 리그 매니페스트로 FK 피벗 체인 구성
import * as THREE from 'three/webgpu';
import type { AssetLoader } from '../render/assetLoader';
import { materialForSkin } from '../render/materials';
import { mToMm } from './units';
import {
  jointParentIndex,
  segmentPivotIndex,
  clampJoint,
  jointKind,
  resolveJointValues,
} from './rig';
import type { ProductSpec, RigJoint, RigManifest } from '../scene/product';

export interface JointState {
  /** 매니페스트 원본 — 라벨·종류·한계·커플링의 정본 (규격 DB, D7/D16) */
  joint: RigJoint;
  pivot: THREE.Object3D;
  /** 단위 방향 벡터 (회전축이자 직선 이동 방향) */
  axis: THREE.Vector3;
  /** 빌드 시점 피벗 위치 — prismatic 이동의 기준점 */
  restPos: THREE.Vector3;
  /** 현재 값 — revolute=도, prismatic=mm */
  value: number;
}

export interface ProductInstance {
  /** base-origin group: y=0 at rest-pose bottom, footprint centred on x/z */
  group: THREE.Group;
  /** articulated products only — keyed by joint id */
  joints?: Map<string, JointState>;
}

export interface ProductAssets {
  /** Fetch + parse every spec with a glbUrl. Individual failures are logged
   *  and skipped (instantiate then returns null -> parametric fallback). */
  preload(specs: ProductSpec[]): Promise<void>;
  /**
   * 템플릿을 확보하고 **실제로 배치할 spec**을 돌려준다. `meshDerivedDims` spec은 여기서
   * 실측으로 치수가 확정되므로 호출부는 반드시 반환값을 placeAt에 넘겨야 한다.
   * 실패하면 reject한다 — 배치를 중단할지 파라메트릭으로 갈지는 호출부가 정한다.
   */
  ensureTemplate(spec: ProductSpec): Promise<ProductSpec>;
  /** 드래그 전 예열. 실패를 삼키고 아무것도 돌려주지 않는다. */
  prefetch(spec: ProductSpec): void;
  /** 템플릿이 이미 메모리에 있는가 (동기 배치 경로가 콜드 여부를 알아야 할 때). */
  has(specId: string): boolean;
  instantiate(spec: ProductSpec): ProductInstance | null;
}

/**
 * 관절을 `value`로 구동한다 (자기 종류의 한계로 클램프). 적용된 값을 반환.
 * revolute는 축 둘레 회전(도), prismatic은 축 방향 평행이동(mm -> GLB 미터로 /1000).
 */
export function setJointValue(j: JointState, value: number): number {
  const v = clampJoint(j.joint, value);
  if (jointKind(j.joint) === 'prismatic') {
    j.pivot.position.copy(j.restPos).addScaledVector(j.axis, v / 1000);
  } else {
    j.pivot.quaternion.setFromAxisAngle(j.axis, THREE.MathUtils.degToRad(v));
  }
  j.value = v;
  return v;
}

/**
 * Build the FK chain in the (unscaled-local) GLB root space where the manifest
 * points live. The uniform product scale sits ON the root, so root-local pivot
 * positions need no conversion. Pivots carry translation only at build time,
 * so nested pivot position = own point minus parent pivot's point.
 */
export function buildArticulation(root: THREE.Object3D, rig: RigManifest): Map<string, JointState> {
  const pivots: THREE.Object3D[] = [];
  const joints = new Map<string, JointState>();

  rig.joints.forEach((j, i) => {
    const pivot = new THREE.Object3D();
    pivot.name = `pivot-${j.joint}`;
    const pi = jointParentIndex(rig.joints, i);
    const parentPoint = pi === -1 ? [0, 0, 0] : rig.joints[pi].point;
    pivot.position.set(
      j.point[0] - parentPoint[0],
      j.point[1] - parentPoint[1],
      j.point[2] - parentPoint[2],
    );
    (pi === -1 ? root : pivots[pi]).add(pivot);
    pivots.push(pivot);
    const restPos = pivot.position.clone();
    joints.set(j.joint, {
      joint: j,
      pivot,
      axis: new THREE.Vector3(...j.axis).normalize(),
      restPos,
      value: 0,
    });
  });

  for (const [segment, nodeNames] of Object.entries(rig.segments)) {
    const pi = segmentPivotIndex(rig.joints, segment);
    if (pi === -1) continue; // root segment stays where it is
    for (const name of nodeNames) {
      const node = root.getObjectByName(name);
      if (!node) {
        console.warn(`[productAssets] rig node "${name}" not found — segment ${segment}`);
        continue;
      }
      pivots[pi].attach(node); // preserves world transform (quantization TRS incl.)
    }
  }

  // 정지 포즈 시딩(코드리뷰 지적) — driver는 전부 value:0으로 위에서 만들어졌지만
  // 종속 관절(coupledTo)은 offset≠0이면 정지값이 0이 아니라 offset이다. 시딩을
  // 안 하면 driver를 처음 움직이기 전까지 화면상 0에 머물러(피벗 미회전) 저장된
  // 로드 경로(resolveJointValues)와 다른 포즈로 보인다.
  const restValues = resolveJointValues(rig.joints, {});
  for (const j of rig.joints) {
    setJointValue(joints.get(j.joint)!, restValues.get(j.joint) ?? 0);
  }

  return joints;
}

export function createProductAssets(loader: AssetLoader): ProductAssets {
  const templates = new Map<string, THREE.Group>();
  /** 실측이 끝나 배치에 쓸 수 있는 spec (meshDerivedDims가 false로 확정된 사본) */
  const resolved = new Map<string, ProductSpec>();
  const inFlight = new Map<string, Promise<ProductSpec>>();

  async function acquire(spec: ProductSpec): Promise<ProductSpec> {
    if (!spec.glbUrl) return spec;
    // 자리표시자 치수를 그대로 loadProductGLB에 넘기면 computeProductScale이 실제 메쉬를 그
    // 상자에 우겨넣어 찌그러진다 — 실측을 먼저 확정한다. 로더가 URL 단위로 캐시하므로
    // 여기 measureGLB + loadProductGLB는 fetch 1회·파싱 1회다.
    let placeSpec = spec;
    if (spec.meshDerivedDims) {
      const d = await loader.measureGLB(spec.glbUrl);
      placeSpec = {
        ...spec,
        widthMm: mToMm(d.x),
        depthMm: mToMm(d.z),
        heightMm: mToMm(d.y),
        meshDerivedDims: false,
      };
    }
    templates.set(spec.id, await loader.loadProductGLB(spec.glbUrl, placeSpec));
    return placeSpec;
  }

  function ensureTemplate(spec: ProductSpec): Promise<ProductSpec> {
    const done = resolved.get(spec.id);
    if (done) return Promise.resolve(done);
    // 진행 중이면 **같은 프로미스를 돌려준다** — "이미 진행 중이면 return"으로 대기자를 버리면
    // 한 틱에 몰린 배치가 통째로 결과를 못 받는다 (cookieBake DERO-281).
    const running = inFlight.get(spec.id);
    if (running) return running;
    const pending = acquire(spec)
      .then((s) => {
        resolved.set(spec.id, s);
        inFlight.delete(spec.id);
        return s;
      })
      .catch((e: unknown) => {
        inFlight.delete(spec.id);
        throw e;
      });
    inFlight.set(spec.id, pending);
    return pending;
  }

  function prefetch(spec: ProductSpec): void {
    if (!spec.glbUrl || resolved.has(spec.id)) return;
    void ensureTemplate(spec).catch(() => {
      /* 예열 실패는 조용히 둔다 — 실제 배치 시점에 다시 시도하고 그때 사용자에게 알린다. */
    });
  }

  async function preload(specs: ProductSpec[]): Promise<void> {
    await Promise.all(
      specs
        .filter((s) => s.glbUrl)
        .map((s) =>
          ensureTemplate(s).catch((e: unknown) => {
            console.error(`[productAssets] failed to load ${s.glbUrl}`, e);
          }),
        ),
    );
  }

  function instantiate(spec: ProductSpec): ProductInstance | null {
    const tpl = templates.get(spec.id);
    if (!tpl) return null;
    const inner = tpl.clone(true);

    let joints: Map<string, JointState> | undefined;
    if (spec.rig) joints = buildArticulation(inner, spec.rig);

    if (spec.glbUntextured) {
      // Part-segmentation export ships no textures — one skin material per
      // placed instance (per-instance so the collision tint never leaks).
      // 파트별 충돌 틴트가 이웃 파트로 번지지 않게 메쉬마다 개별 스킨 인스턴스
      inner.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = materialForSkin(spec.material);
      });
    } else {
      // Clone materials so collision-tint emissive stays per instance
      // (textures are still shared with the template).
      inner.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
      });
    }

    // Base-origin convention (same as buildProp): bottom at y=0, x/z centred.
    const outer = new THREE.Group();
    outer.add(inner);
    const box = new THREE.Box3().setFromObject(inner);
    inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    outer.userData.spec = spec;
    return { group: outer, joints };
  }

  return {
    preload,
    ensureTemplate,
    prefetch,
    has: (specId: string) => templates.has(specId),
    instantiate,
  };
}
