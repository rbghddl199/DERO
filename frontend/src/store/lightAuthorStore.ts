// 조명 등록 도구(/dev/light) 전역 상태 — GLB 로드·판정 결과·빔 프리셋 선택의 단일 정본

import { create } from 'zustand';
import type { LightAssetAnalysis, PointMm } from '@/three/core/lightAuthoring';
import { GLB_LIBRARY } from '@/three/scene/glbLibrary';
import type { Box3Lite, LightPreview } from '@/three/scene/lightPreview';
import { PRODUCTS } from '@/three/scene/product';

/** 빔 반각 프리셋 키. 정본은 `three/scene/lighting.ts`의 `beamHalfAngleRad`다. */
export const DISTRIBUTIONS = ['spot', 'flood', 'ambient'] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number];

export interface LightSource {
  url: string;
  label: string;
}

/**
 * 도구가 바로 열어볼 수 있는 리포 안 GLB. 조명 GLB는 아직 0장이라 이 목록은 전부
 * `light_origin`·`lampShade`가 없는 제품이다 — 경고 경로 확인용이고, 실제 저작물은
 * 파일 선택(`loadFile`)으로 연다.
 */
export const LIGHT_SOURCES: LightSource[] = [
  ...PRODUCTS.flatMap((p) => (p.glbUrl ? [{ url: p.glbUrl, label: `${p.name} (${p.id})` }] : [])),
  ...GLB_LIBRARY.map((e) => ({ url: e.url, label: e.name })),
];

interface LightAuthorState {
  // --- 3D 핸들 (Object3D를 리렌더 트리거로 쓰지 않는다 — rigDraftStore와 같은 규약) ---
  preview: LightPreview | null;

  // --- 로드 상태 ---
  /** 화면에 보여줄 소스 이름 (라이브러리 라벨 또는 파일명) */
  sourceLabel: string;
  /** 드롭다운 선택값. 파일을 열면 빈 문자열이 된다 */
  selectedUrl: string;
  /**
   * 관리자 화면(/admin/products/[productId])이 여는 임의 GLB. dev 라우트는 리포 카탈로그에서
   * 고르지만 관리자는 presigned assetUrl이나 업로드 blob을 연다 — blob URL의 수명은 그쪽 소유다.
   */
  assetSource: { url: string; label: string } | null;
  loading: boolean;
  loadError: string | null;

  // --- 판정 ---
  analysis: LightAssetAnalysis | null;
  bounds: Box3Lite | null;
  nodeNames: string[];
  distribution: Distribution;
  shadeHighlight: boolean;

  toast: string | null;

  attachPreview: (preview: LightPreview) => void;
  detachPreview: () => void;
  selectSource: (url: string) => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  /** 관리자 진입점 — URL 수명은 호출부가 소유한다(blob이면 호출부가 revoke). */
  openAssetSource: (url: string, label: string) => Promise<void>;
  /** 관리자 화면을 떠날 때 소스를 놓는다 — 안 놓으면 다음 /dev/light 방문이 이 GLB를 연다 */
  closeAssetSource: () => void;
  setDistribution: (d: Distribution) => void;
  toggleShadeHighlight: () => void;
  copyPointJson: () => Promise<void>;
  copyPointField: (key: keyof PointMm) => Promise<void>;
  showToast: (msg: string) => void;
}

/** 소스를 연달아 바꿀 때 늦게 도착한 로드 응답이 최신 판정을 덮지 않게 하는 표. */
let loadToken = 0;
/** 파일 선택으로 만든 blob URL — 다음 로드 때 반드시 되돌려준다(안 하면 GLB가 통째로 샌다). */
let objectUrl: string | null = null;

function releaseObjectUrl(): void {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

export const useLightAuthorStore = create<LightAuthorState>((set, get) => {
  /** URL 하나를 로드해 판정까지 반영한다. 라이브러리 선택과 파일 선택이 공유하는 몸통. */
  const load = async (url: string, label: string, selectedUrl: string): Promise<void> => {
    const { preview } = get();
    const token = ++loadToken;
    set({
      sourceLabel: label,
      selectedUrl,
      loading: true,
      loadError: null,
      analysis: null,
      bounds: null,
      nodeNames: [],
    });
    if (!preview) {
      set({ loading: false });
      return;
    }
    try {
      const result = await preview.loadModel(url);
      // 늦게 온 응답이 최신 선택을 덮거나 죽은 씬을 건드리지 않게 한다.
      if (token !== loadToken || get().preview !== preview) return;
      preview.setShadeHighlight(get().shadeHighlight);
      set({
        analysis: result.analysis,
        bounds: result.bounds,
        nodeNames: result.nodeNames,
        loading: false,
      });
    } catch (err: unknown) {
      if (token !== loadToken || get().preview !== preview) return;
      set({ loading: false, loadError: err instanceof Error ? err.message : String(err) });
    }
  };

  return {
    preview: null,

    sourceLabel: '',
    selectedUrl: LIGHT_SOURCES[0]?.url ?? '',
    assetSource: null,
    loading: false,
    loadError: null,

    analysis: null,
    bounds: null,
    nodeNames: [],
    distribution: 'flood',
    shadeHighlight: true,

    toast: null,

    attachPreview(preview) {
      set({ preview });
      // 관리자 화면은 캔버스가 붙기 전에 소스를 지정한다 — 그 소스가 있으면 카탈로그보다 우선한다.
      const { assetSource } = get();
      if (assetSource) void get().openAssetSource(assetSource.url, assetSource.label);
      else void get().selectSource(get().selectedUrl);
    },

    detachPreview() {
      // dispose는 캔버스가 한다 — 여기선 참조만 끊어 늦게 온 응답이 죽은 씬을 건드리지 않게.
      set({ preview: null, analysis: null, bounds: null, nodeNames: [] });
    },

    async selectSource(url) {
      releaseObjectUrl();
      // dev 드롭다운·파일 열기를 만지면 관리자 소스는 버린다 — 둘이 남으면 다음 마운트가 갈린다.
      set({ assetSource: null });
      const label = LIGHT_SOURCES.find((s) => s.url === url)?.label ?? url;
      await load(url, label, url);
    },

    async loadFile(file) {
      releaseObjectUrl();
      set({ assetSource: null });
      objectUrl = URL.createObjectURL(file);
      await load(objectUrl, file.name, '');
    },

    async openAssetSource(url, label) {
      // 이 store가 만든 blob은 되돌려주되 인자로 받은 URL은 건드리지 않는다(호출부 소유).
      releaseObjectUrl();
      set({ assetSource: { url, label } });
      await load(url, label, '');
    },

    closeAssetSource() {
      set({ assetSource: null });
    },

    setDistribution(d) {
      set({ distribution: d });
    },

    toggleShadeHighlight() {
      const shadeHighlight = !get().shadeHighlight;
      set({ shadeHighlight });
      get().preview?.setShadeHighlight(shadeHighlight);
    },

    async copyPointJson() {
      const point = get().analysis?.pointMm;
      if (!point) {
        get().showToast('light_origin 노드가 없어 복사할 값이 없습니다');
        return;
      }
      await copyToClipboard(JSON.stringify(point, null, 2), 'point_*_mm JSON', get().showToast);
    },

    async copyPointField(key) {
      const point = get().analysis?.pointMm;
      if (!point) {
        get().showToast('light_origin 노드가 없어 복사할 값이 없습니다');
        return;
      }
      await copyToClipboard(String(point[key]), key, get().showToast);
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
