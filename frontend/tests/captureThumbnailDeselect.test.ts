// 미리보기 캡처 회귀 — 선택 아웃라인·기즈모가 프레임에 찍히지 않고, 캡처 후 원복돼야 한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useSimulatorStore } from '@/store/simulatorStore';

// 캡처는 webp다(ADR-0035) — canvasToWebpBlob이 blob.type을 검사하므로 목도 webp여야 한다.
const BLOB = new Blob(['fake-webp'], { type: 'image/webp' });

/** drawImage가 불린 순간의 아웃라인·기즈모 상태 — 이게 실제로 찍히는 프레임이다. */
interface Snapshot {
  outline: THREE.Object3D[] | null;
  gizmoVisible: boolean[];
}

function setup(): {
  snapshot: () => Snapshot;
  gizmoGroups: THREE.Group[];
  setOutline: ReturnType<typeof vi.fn>;
  itemGroup: THREE.Group;
} {
  const itemGroup = new THREE.Group();
  const rotateGroup = new THREE.Group();
  const jointGroup = new THREE.Group();
  const guideGroup = new THREE.Group();
  // 선택 중 + 경계 위반이라 셋 다 떠 있는 상태에서 캡처한다.
  rotateGroup.visible = true;
  jointGroup.visible = true;
  guideGroup.visible = true;

  let outline: THREE.Object3D[] | null = null;
  const setOutline = vi.fn((objects: THREE.Object3D[]) => {
    outline = objects;
  });
  let captured: Snapshot = { outline: null, gizmoVisible: [] };

  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => {
        captured = {
          outline,
          gizmoVisible: [rotateGroup.visible, jointGroup.visible, guideGroup.visible],
        };
      },
    }),
    toBlob: (cb: (b: Blob | null) => void) => cb(BLOB),
  };

  // vitest 환경이 node라 document·requestAnimationFrame이 없다 — 캡처 경로가 쓰는 만큼만 채운다.
  vi.stubGlobal('document', { createElement: () => fakeCanvas });
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    cb();
    return 0;
  });

  useSimulatorStore.setState({
    renderer: {
      getSize: (v: THREE.Vector2) => v.set(1280, 720),
      setSize: () => undefined,
      domElement: fakeCanvas,
    } as never,
    camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100),
    postfx: { setOutline } as never,
    sim: {
      rotateGizmo: { group: rotateGroup },
      jointGizmo: { group: jointGroup },
      boundaryGuide: { group: guideGroup },
      placed: () => [{ id: 'item-1', group: itemGroup }],
    } as never,
    selectedItemId: 'item-1',
    hoveredItemId: null,
    // 실제 스토어에선 init()이 클로저로 심는 함수 — 유닛에선 같은 로직을 최소로 흉내 낸다.
    refreshOutline: () => {
      const { selectedItemId, sim } = useSimulatorStore.getState();
      const item = sim?.placed().find((i) => i.id === selectedItemId);
      setOutline(item ? [item.group] : []);
    },
  });

  return {
    snapshot: () => captured,
    gizmoGroups: [rotateGroup, jointGroup, guideGroup],
    setOutline,
    itemGroup,
  };
}

describe('미리보기 캡처와 선택 표시', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('캡처되는 프레임에는 아웃라인·기즈모가 없다', async () => {
    const { snapshot } = setup();

    const blob = await useSimulatorStore.getState().captureThumbnail();

    expect(blob).toBe(BLOB);
    expect(snapshot().outline).toEqual([]);
    expect(snapshot().gizmoVisible).toEqual([false, false, false]);
  });

  it('캡처가 끝나면 선택 표시를 원래대로 돌려놓는다', async () => {
    const { gizmoGroups, setOutline, itemGroup } = setup();

    await useSimulatorStore.getState().captureThumbnail();

    expect(gizmoGroups.map((g) => g.visible)).toEqual([true, true, true]);
    expect(setOutline).toHaveBeenLastCalledWith([itemGroup]);
  });
});
