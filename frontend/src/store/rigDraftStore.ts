// 리그 저작 도구(/dev/rig) 전역 상태 — 초안 편집·검증·3D 미리보기 동기화의 단일 정본

import { create } from 'zustand';
import {
  addJoint,
  addSegment,
  assignPart,
  emptyDraft,
  fromManifest,
  removeJoint,
  removeSegment,
  serializeJson,
  serializeTs,
  setJointKind,
  toManifest,
  updateJoint,
  type Box3Lite,
  type JointSeed,
  type RigDraft,
} from '@/three/core/rigDraft';
import { resolveJointValues, validateManifest } from '@/three/core/rig';
import {
  PRODUCTS,
  type JointKind,
  type ProductSpec,
  type RigJoint,
  type RigManifest,
} from '@/three/scene/product';
import type { RigPreview } from '@/three/scene/rigPreview';

/** 저작 대상 = 전용 GLB를 가진 제품. 절차 생성 메쉬(책상·모니터)는 리그 대상이 아니다. */
export const RIG_PRODUCTS: ProductSpec[] = PRODUCTS.filter((p) => p.glbUrl);

const DEFAULT_PRODUCT_ID = RIG_PRODUCTS[0]?.id ?? '';

/**
 * 세그먼트별 bbox — `addJoint`의 기본 피벗 제안은 **세그먼트** 키를 찾는데
 * `getPartBoxes()`는 **노드(mesh) 이름** 키다. 소속 노드 박스를 합집합해 다시 묶는다
 * (Box3Lite 구조는 같으므로 좌표 변환은 없다).
 */
function segmentBoxes(
  segments: Record<string, string[]>,
  partBoxes: Record<string, Box3Lite>,
): Record<string, Box3Lite> {
  const out: Record<string, Box3Lite> = {};
  for (const [segment, nodes] of Object.entries(segments)) {
    let box: Box3Lite | null = null;
    for (const node of nodes) {
      const b = partBoxes[node];
      if (!b) continue;
      if (!box) {
        box = { min: [...b.min], max: [...b.max] };
        continue;
      }
      for (let i = 0; i < 3; i++) {
        box.min[i] = Math.min(box.min[i], b.min[i]);
        box.max[i] = Math.max(box.max[i], b.max[i]);
      }
    }
    if (box) out[segment] = box;
  }
  return out;
}

/**
 * 관리자 화면(/admin/products/[productId])이 여는 임의 GLB. dev 라우트는 리포 카탈로그에서
 * 고르지만 관리자는 방금 업로드한 blob이나 presigned assetUrl을 연다 — 그래서 진입점이 둘이다.
 */
export interface RigAssetSource {
  url: string;
  /** 화면에 보여줄 이름(파일명 또는 "등록된 에셋") */
  label: string;
  /** 이미 저장돼 있던 매니페스트. null이면 빈 초안에서 시작한다 */
  manifest: RigManifest | null;
}

interface RigDraftState {
  // --- 3D 핸들 (Object3D를 리렌더 트리거로 쓰지 않는다 — simulatorStore와 같은 규약) ---
  preview: RigPreview | null;

  // --- 로드 상태 ---
  productId: string;
  /** 관리자 진입점이 쥐고 있는 소스. null이면 dev 카탈로그(productId) 경로다 */
  assetSource: RigAssetSource | null;
  /** loadModel()이 보정해 돌려준 파트 이름 — 매니페스트에 넣을 수 있는 유일한 이름이다 */
  parts: string[];
  partBoxes: Record<string, Box3Lite>;
  loading: boolean;
  loadError: string | null;

  // --- 저작 상태 ---
  draft: RigDraft;
  /** 매 편집마다 재계산된 validateManifest 결과 (빈 배열이면 통과) */
  errors: string[];
  selectedPart: string | null;
  hoveredPart: string | null;
  expandedJoint: string | null;
  /** driver 관절 값만 보관 — 종속 관절 값은 resolveJointValues가 매번 재계산한다 */
  driverValues: Record<string, number>;
  toast: string | null;

  // --- actions ---
  attachPreview: (preview: RigPreview) => void;
  detachPreview: () => void;
  selectProduct: (id: string) => Promise<void>;
  /** 관리자 진입점 — 임의 GLB를 열고 저장돼 있던 매니페스트를 초안으로 얹는다 */
  openAssetSource: (source: RigAssetSource) => Promise<void>;
  /** 관리자 화면을 떠날 때 소스를 놓는다 — 안 놓으면 다음 /dev/rig 방문이 이 GLB를 연다 */
  closeAssetSource: () => void;
  hoverPart: (node: string | null) => void;
  selectPart: (node: string | null) => void;
  createSegment: (name: string) => void;
  deleteSegment: (name: string) => void;
  setPartSegment: (node: string, segment: string | null) => void;
  setSupportPart: (segment: string | null) => void;
  setMountPart: (segment: string | null) => void;
  createJoint: (seed: JointSeed) => void;
  patchJoint: (id: string, patch: Partial<RigJoint>) => void;
  changeJointKind: (id: string, kind: JointKind) => void;
  deleteJoint: (id: string) => void;
  expandJoint: (id: string | null) => void;
  setDriverValue: (id: string, value: number) => void;
  resetPose: () => void;
  copyTs: () => Promise<void>;
  copyJson: () => Promise<void>;
  showToast: (msg: string) => void;
}

/** 제품을 연달아 바꿀 때 늦게 도착한 loadModel 응답이 최신 초안을 덮지 않게 하는 표. */
let loadToken = 0;

export const useRigDraftStore = create<RigDraftState>((set, get) => {
  /** 초안을 확정한다 — 검증을 돌리고, 통과했을 때만 씬에 얹고 현재 포즈를 다시 먹인다. */
  const pushDraft = (next: RigDraft): void => {
    const manifest = toManifest(next);
    const errors = validateManifest(manifest);
    set({ draft: next, errors });
    const { preview, driverValues } = get();
    if (!preview) return;
    // 반려된 초안은 씬에 얹지 않는다 — buildArticulation은 없는 세그먼트·노드를 조용히
    // 건너뛰므로 반쯤 조립된 계층이 남고, 저작자는 그걸 "됐다"고 오독한다.
    if (errors.length > 0) {
      preview.setManifest(null);
      return;
    }
    preview.setManifest(manifest);
    preview.setJointValues(resolveJointValues(manifest.joints, driverValues));
  };

  /**
   * 세그먼트 하나를 가리키는 매니페스트 필드(supportPart·mountPart)를 바꾼다.
   * rigDraft.ts에 전용 함수가 없어 여기서 만든다 — toManifest/fromManifest 왕복이 깊은 복사다.
   * null이면 키를 **지운다**. 빈 문자열로 남기면 없는 세그먼트를 가리키는 매니페스트가 된다.
   */
  const setSegmentRef = (key: 'supportPart' | 'mountPart', segment: string | null): void => {
    const next = fromManifest(toManifest(get().draft));
    if (segment) next[key] = segment;
    else delete next[key];
    pushDraft(next);
  };

  /** hover가 우선, 없으면 선택된 파트를 비춘다 (3D 클릭 → 행 선택이 3D에도 보이게). */
  const syncHighlight = (): void => {
    const { preview, hoveredPart, selectedPart } = get();
    preview?.highlightPart(hoveredPart ?? selectedPart);
  };

  /** GLB 하나를 열고 초안을 얹는다 — dev 카탈로그와 관리자 소스가 공유하는 몸통. */
  const loadInto = async (url: string | null, manifest: RigManifest | null): Promise<void> => {
    const { preview } = get();
    const token = ++loadToken;
    set({
      loading: true,
      loadError: null,
      selectedPart: null,
      hoveredPart: null,
      expandedJoint: null,
      driverValues: {},
    });
    if (!url || !preview) {
      set({ loading: false });
      return;
    }
    try {
      const parts = await preview.loadModel(url);
      if (token !== loadToken || get().preview !== preview) return;
      set({ parts, partBoxes: preview.getPartBoxes(), loading: false });
      pushDraft(manifest ? fromManifest(manifest) : emptyDraft());
      preview.focusJoint(null);
    } catch (e) {
      if (token !== loadToken || get().preview !== preview) return;
      set({ loading: false, loadError: e instanceof Error ? e.message : 'GLB 로드 실패' });
    }
  };

  return {
    preview: null,

    productId: DEFAULT_PRODUCT_ID,
    assetSource: null,
    parts: [],
    partBoxes: {},
    loading: false,
    loadError: null,

    draft: emptyDraft(),
    errors: [],
    selectedPart: null,
    hoveredPart: null,
    expandedJoint: null,
    driverValues: {},
    toast: null,

    attachPreview(preview) {
      set({ preview });
      // 관리자 화면은 캔버스가 붙기 전에 소스를 지정한다 — 그 소스가 있으면 카탈로그보다 우선한다.
      const { assetSource } = get();
      if (assetSource) void get().openAssetSource(assetSource);
      else void get().selectProduct(get().productId);
    },

    detachPreview() {
      // dispose는 캔버스가 한다 — 여기선 참조만 끊어 늦게 온 응답이 죽은 씬을 건드리지 않게.
      set({ preview: null, parts: [], partBoxes: {} });
    },

    async selectProduct(id) {
      const spec = RIG_PRODUCTS.find((p) => p.id === id);
      // dev 드롭다운을 만지면 관리자 소스는 버린다 — 둘이 남으면 다음 마운트가 어느 쪽인지 갈린다.
      set({ productId: id, assetSource: null });
      await loadInto(spec?.glbUrl ?? null, spec?.rig ?? null);
    },

    async openAssetSource(source) {
      set({ assetSource: source });
      await loadInto(source.url, source.manifest);
    },

    closeAssetSource() {
      set({ assetSource: null });
    },

    hoverPart(node) {
      set({ hoveredPart: node });
      syncHighlight();
    },

    selectPart(node) {
      set({ selectedPart: node });
      syncHighlight();
    },

    createSegment(name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      pushDraft(addSegment(get().draft, trimmed));
    },

    deleteSegment(name) {
      pushDraft(removeSegment(get().draft, name));
    },

    setPartSegment(node, segment) {
      pushDraft(assignPart(get().draft, node, segment));
    },

    setSupportPart(segment) {
      setSegmentRef('supportPart', segment);
    },

    setMountPart(segment) {
      setSegmentRef('mountPart', segment);
    },

    createJoint(seed) {
      const { draft, partBoxes } = get();
      pushDraft(addJoint(draft, seed, segmentBoxes(draft.segments, partBoxes)));
      get().expandJoint(seed.joint);
    },

    patchJoint(id, patch) {
      pushDraft(updateJoint(get().draft, id, patch));
    },

    changeJointKind(id, kind) {
      pushDraft(setJointKind(get().draft, id, kind));
    },

    deleteJoint(id) {
      pushDraft(removeJoint(get().draft, id));
      if (get().expandedJoint === id) get().expandJoint(null);
    },

    expandJoint(id) {
      set({ expandedJoint: id });
      get().preview?.focusJoint(id);
    },

    setDriverValue(id, value) {
      const driverValues = { ...get().driverValues, [id]: value };
      set({ driverValues });
      const { preview, draft, errors } = get();
      if (!preview || errors.length > 0) return;
      preview.setJointValues(resolveJointValues(draft.joints, driverValues));
    },

    resetPose() {
      set({ driverValues: {} });
      get().preview?.resetPose();
    },

    async copyTs() {
      await copyToClipboard(serializeTs(get().draft), 'TS 블록', get().showToast);
    },

    async copyJson() {
      await copyToClipboard(serializeJson(get().draft), 'JSON', get().showToast);
    },

    showToast(msg) {
      set({ toast: msg });
      window.setTimeout(() => {
        if (get().toast === msg) set({ toast: null });
      }, 2000);
    },
  };
});

async function copyToClipboard(
  text: string,
  what: string,
  showToast: (msg: string) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${what}을 클립보드에 복사했습니다`);
  } catch {
    // https가 아니거나 권한이 없으면 writeText가 거부된다 — 조용히 실패하면 안 된다.
    showToast(`${what} 복사 실패 — 클립보드 권한을 확인하세요`);
  }
}
