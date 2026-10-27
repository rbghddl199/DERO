// 창밖 포털 — 창 사각형에 딱 맞게 개구부에 끼우는 평면 한 장. 원근·하늘·실루엣이 전부 셰이더다 (ADR-0031 결정 1·2)
import * as THREE from 'three/webgpu';
import { windowSceneryNodes } from '@/three/render/windowNodes';
import type { WindowRectM } from '@/three/core/window';

/**
 * 벽면에서 밖으로 물러나는 거리(m) — 벽 평면과의 공면 깜빡임만 피하는 최소값이다.
 *
 * **여백·셋백은 폐지됐다**(ADR-0031 결정 1). 1차 구현은 개구부보다 1.2m 크고 0.35m 물러난
 * 판이라, 시점이 벽 위로 올라가면 "떠 있는 하늘 광고판"이 통째로 보여 반려됐다. 창 사각형
 * 크기로 개구부에 끼우면 그 노출이 **구조적으로** 사라진다 — 밖에서 보면 창문에 하늘이
 * 비치는 벽이고, 그것은 실제 건물을 밖에서 본 모습과 같다.
 */
const PORTAL_SETBACK_M = 0.002;

/**
 * 창밖 포털 한 장. **벽 메쉬의 자식으로 붙인다** — 벽이 움직이거나(책상 깊이 추종·벽 거리
 * 조절) 꺼지면 풍경도 통째로 따라가야 하고, 부모를 태우면 그 배선이 0줄이다.
 *
 * 조명을 안 받는다(`MeshBasicNodeMaterial`) — 창밖은 실내 리그의 대상이 아니다. 색은 **두 슬롯에
 * 나눠 싣는다**: 하늘·켜진 창은 `emissiveNode`(이 씬의 블룸 소스가 emissive MRT라 여기 실은
 * 것만 번진다, ADR-0031 결정 2), 지면·건물·나무는 `colorNode`다. 전부 emissive로 내면 블룸
 * 문턱이 0이라 그림 전체가 흐려져 더해지고 창밖이 파스텔로 뭉갠다(2026-08-09 반려). 밝기
 * 배율을 올려 번지게 하는 것은 여전히 금지다 — 글레어 문턱을 하늘 전체가 넘는다.
 *
 * 그림자도 주고받지 않고 `raycast`는 무력화한다(개구부는 벽걸이 배치가 통과해야 하는 구멍이다).
 *
 * `sunAlongSign`은 그 면의 햇살이 오는 쪽(벽 로컬 +1 / −1)이다 — 화면에서 밝은 쪽과 방에 드는
 * 햇살·그림자가 반대편이면 즉시 거짓말로 읽힌다. 좌 벽만 −1이다(`roomRig.SUN_POSITIONS`의
 * `left`가 −z 쪽이고 좌 벽의 along은 −z다).
 */
export function buildWindowView(
  rect: WindowRectM,
  wallHeightM: number,
  sunAlongSign: 1 | -1,
): THREE.Mesh {
  const material = new THREE.MeshBasicNodeMaterial({ color: 0x000000 });
  const { colorNode, emissiveNode } = windowSceneryNodes(sunAlongSign);
  Object.assign(material as unknown as Record<string, unknown>, { colorNode, emissiveNode });
  material.name = 'window-view';
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(rect.alongMaxM - rect.alongMinM, rect.yMaxM - rect.yMinM),
    material,
  );
  mesh.position.set(
    (rect.alongMinM + rect.alongMaxM) / 2,
    (rect.yMinM + rect.yMaxM) / 2 - wallHeightM / 2,
    -PORTAL_SETBACK_M,
  );
  mesh.raycast = () => {};
  return mesh;
}
