// 회전 조작 gizmo — 선택 아이템 발밑에 수평 링을 띄우고 레이캐스트로 집는다 (ADR-0022 결정 7)
import * as THREE from 'three/webgpu';
import type { RotateHandle } from './scene';

/** 상수색 오버레이 — 톤매핑 노출(CAMERA_EXPOSURE=1/20) 역보상 (src/three/CLAUDE.md). */
const EXPOSURE_GAIN = 20;
/** Y축 회전이므로 관절 기즈모의 Y축 색(민트)을 그대로 쓴다 — 축 색 규약이 하나뿐이어야
 *  사용자가 "이 색은 수직축 회전"을 한 번만 배운다 (jointGizmo.ts AXIS_COLOR.y). */
const RING_COLOR = 0x82bfa8;
const RING_TUBE_M = 0.003;
/** 레이캐스트 전용 굵기 — 보이는 링(3mm)은 손으로 집기엔 너무 얇다. `visible=false`인
 *  메쉬도 `Raycaster`는 그대로 맞힌다(layers만 본다 — src/three/CLAUDE.md의 실측 항목).
 *  이 링을 안 두면 사용자가 링을 겨우 스치고 아이템 드래그(이동)로 새어나간다. */
const RING_PICK_TUBE_M = 0.014;
const HOVER_SCALE = 1.8; // 호버 시 굵기 배율
const HOVER_GLOW_GAIN = 1.35; // 호버 시 노출 배율 위에 얹는 "약한 발광"
const OPACITY_NORMAL = 0.55;
const OPACITY_HOVER = 1.0;
const RING_SEGMENTS = 96; // 반지름이 20~40cm라 관절 링(40)보다 촘촘해야 원으로 보인다
/** 드래그 중 현재 각도 라벨을 링 평면 위로 띄우는 오프셋 (m). */
const LABEL_LIFT_M = 0.06;

export interface RotateGizmo {
  group: THREE.Group;
  /** 링을 (재)생성해 띄운다. 반지름이 아이템 규격마다 달라 지오메트리를 다시 만든다. */
  show: (handle: RotateHandle) => void;
  hide: () => void;
  /** 포즈가 바뀐 뒤 위치를 갱신한다(재생성 없음). `handle`이 null이면 숨긴다 —
   *  회전 불가 아이템(벽·결합)이나 미선택 상태다. `dragYawDeg`를 주면 현재 각도
   *  라벨을 띄우고, `null`이면 숨긴다. 생략하면 라벨 상태를 건드리지 않는다. */
  sync: (handle: RotateHandle | null, dragYawDeg?: number | null) => void;
  /** 이미 setFromCamera된 raycaster로 링을 집는다. */
  pick: (raycaster: THREE.Raycaster) => boolean;
  setHovered: (hovered: boolean) => void;
  /** 공유 머티리얼·라벨 텍스처까지 전부 해제한다(언마운트용). */
  dispose: () => void;
}

export function createRotateGizmo(): RotateGizmo {
  const group = new THREE.Group();
  group.name = 'rotate-gizmo';
  group.visible = false;

  const materials = new Map<string, THREE.MeshBasicNodeMaterial>();
  function materialFor(hovered: boolean): THREE.MeshBasicNodeMaterial {
    const key = String(hovered);
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color(RING_COLOR).multiplyScalar(
          EXPOSURE_GAIN * (hovered ? HOVER_GLOW_GAIN : 1),
        ),
        transparent: true,
        opacity: hovered ? OPACITY_HOVER : OPACITY_NORMAL,
        depthTest: false, // 아이템 실루엣 안쪽에 묻히면 집을 수 없다
        depthWrite: false,
      });
      materials.set(key, m);
    }
    return m;
  }

  // 현재 각도 라벨(예: "45°") — 동시에 하나만 드래그되므로 공유 1개.
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 160;
  labelCanvas.height = 64;
  const labelCtx = labelCanvas.getContext('2d')!;
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelMaterial = new THREE.SpriteMaterial({
    map: labelTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  labelMaterial.color = new THREE.Color(0xffffff).multiplyScalar(EXPOSURE_GAIN);
  const labelSprite = new THREE.Sprite(labelMaterial);
  labelSprite.renderOrder = 4;
  labelSprite.visible = false;
  labelSprite.scale.set(0.09, 0.036, 1);
  group.add(labelSprite);

  function drawLabel(text: string): void {
    const w = labelCanvas.width;
    const h = labelCanvas.height;
    labelCtx.clearRect(0, 0, w, h);
    labelCtx.font = 'bold 34px system-ui, sans-serif';
    labelCtx.textAlign = 'center';
    labelCtx.textBaseline = 'middle';
    labelCtx.lineWidth = 6;
    labelCtx.strokeStyle = 'rgba(0,0,0,0.9)'; // 어떤 배경에서도 읽히도록 외곽선
    labelCtx.strokeText(text, w / 2, h / 2);
    labelCtx.fillStyle = '#ffffff';
    labelCtx.fillText(text, w / 2, h / 2);
    labelTexture.needsUpdate = true;
  }

  /** 보이는 링 + 집는 링. 굵기만 다른 같은 원이라 위치를 같이 옮긴다. */
  let ring: THREE.Mesh | null = null;
  let pickRing: THREE.Mesh | null = null;
  let normalGeo: THREE.BufferGeometry | null = null;
  let hoverGeo: THREE.BufferGeometry | null = null;
  let hovered = false;

  function clear(): void {
    if (ring) {
      group.remove(ring);
      ring = null;
    }
    if (pickRing) {
      group.remove(pickRing);
      pickRing.geometry.dispose();
      pickRing = null;
    }
    normalGeo?.dispose();
    hoverGeo?.dispose();
    normalGeo = null;
    hoverGeo = null;
    labelSprite.visible = false;
    hovered = false;
  }

  function place(handle: RotateHandle): void {
    const [x, y, z] = handle.center;
    ring?.position.set(x, y, z);
    pickRing?.position.set(x, y, z);
    labelSprite.position.set(x, y + LABEL_LIFT_M, z);
  }

  function show(handle: RotateHandle): void {
    clear();
    // 토러스의 기본 축은 +Z라 rotateX로 눕혀야 수평 링이 된다 (jointGizmo와 같은 규약).
    normalGeo = new THREE.TorusGeometry(handle.radius, RING_TUBE_M, 8, RING_SEGMENTS).rotateX(
      Math.PI / 2,
    );
    hoverGeo = new THREE.TorusGeometry(
      handle.radius,
      RING_TUBE_M * HOVER_SCALE,
      8,
      RING_SEGMENTS,
    ).rotateX(Math.PI / 2);
    ring = new THREE.Mesh(normalGeo, materialFor(false));
    ring.name = 'rotate-ring';
    ring.renderOrder = 3; // 아웃라인(2) 위
    group.add(ring);

    pickRing = new THREE.Mesh(
      new THREE.TorusGeometry(handle.radius, RING_PICK_TUBE_M, 6, RING_SEGMENTS).rotateX(
        Math.PI / 2,
      ),
      materialFor(false),
    );
    pickRing.name = 'rotate-ring-pick';
    pickRing.visible = false;
    group.add(pickRing);

    place(handle);
    group.visible = true;
  }

  function hide(): void {
    clear();
    group.visible = false;
  }

  function sync(handle: RotateHandle | null, dragYawDeg?: number | null): void {
    if (!handle) {
      if (group.visible) hide();
      return;
    }
    if (!ring) return; // show 전이면 아무것도 안 한다 — 표시 책임은 호출부(스토어)다
    place(handle);
    if (dragYawDeg === undefined) return; // 생략 — 라벨 상태 불변(상시 sync용)
    if (dragYawDeg === null) {
      labelSprite.visible = false;
      return;
    }
    drawLabel(`${Math.round(dragYawDeg)}°`);
    labelSprite.visible = true;
  }

  function pick(raycaster: THREE.Raycaster): boolean {
    if (!group.visible || !pickRing) return false;
    return raycaster.intersectObject(pickRing, false).length > 0;
  }

  function setHovered(next: boolean): void {
    if (next === hovered || !ring) return;
    hovered = next;
    ring.material = materialFor(hovered);
    ring.geometry = hovered ? hoverGeo! : normalGeo!;
  }

  function dispose(): void {
    hide();
    for (const m of materials.values()) m.dispose();
    materials.clear();
    labelTexture.dispose();
    labelMaterial.dispose();
    group.remove(labelSprite);
  }

  return { group, show, hide, sync, pick, setHovered, dispose };
}
