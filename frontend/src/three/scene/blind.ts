// 베네시안 블라인드 — 위에서 절반 남짓 내려오고(화면 기준 1/3) 슬랫이 반쯤 열린 고정 상태 한 벌. 백색·정적 (ADR-0031 결정 4)
import * as THREE from 'three/webgpu';
import type { WindowRectM } from '@/three/core/window';

/** 백색 고정 — 개폐·틸트 UI는 만들지 않는다(저장 필드·UI·BE로 번지는 기획 재개봉이라
 *  범위 밖, ADR-0031 결정 4). 고정 상태 하나로 룩은 완성된다. */
const SLAT_COLOR = 0xf7f6f2;

/** 슬랫 폭(m)·두께(m)·수직 피치(m). 피치보다 폭이 넓어야 닫힌 각에서 창을 다 덮는다. */
const SLAT_DEPTH_M = 0.024;
const SLAT_THICK_M = 0.0015;
const SLAT_PITCH_M = 0.022;

/**
 * 슬랫 기울기(rad) — 45°가 "반개"다. 수평(0°)이면 폭 24mm가 피치 22mm를 덮어 완전히 닫히고,
 * 수직(90°)이면 활짝 열린다. 45°에서 가려지는 폭은 24·cos45 = 17mm라 5mm(23%)가 열려 있고,
 * 그 틈으로 창밖이 과노출로 하얗게 날아가는 것이 레퍼런스의 룩이다(ADR-0031 결정 2·4).
 */
const SLAT_TILT_RAD = Math.PI / 4;

/** 헤드레일(m) — 개구부 안 맨 위에 서고, 밸런스 박스(`scene/windowTrim.ts`, 돌출 18mm)가
 *  앞에서 덮는다. **깊이는 밸런스보다 얕아야 한다** — 같으면 앞면이 공면이라 z-파이팅이다. */
const RAIL_H_M = 0.04;
const RAIL_DEPTH_M = 0.012;

/** 창문 좌우 안쪽으로 물러나는 폭(m) — 개구부에 끼워진 모습이라야 창틀에 달린 것으로 읽힌다. */
const SIDE_INSET_M = 0.012;

/**
 * 개구부 높이 중 블라인드가 덮는 비율 — 위에서부터 이만큼만 내려온 고정 상태다. 나머지
 * 아래쪽은 창밖이 그대로 보인다(포털이 개구부 전체를 이미 그린다).
 *
 * **1/3이 아니라 0.58인 것은 HUD 툴바 때문이다** — 표준 창(창턱 900mm·높이 1400mm)은 윗변
 * 520mm(37%)가 툴바 뒤라, 물리적으로 1/3만 내리면 그 구간이 통째로 가려져 화면에 한 픽셀도
 * 안 나온다(2026-08-09 실측, `three/CLAUDE.md` 함정 ③). 0.45면 가려진 520mm를 빼고 110mm가
 * 남아 보이는 유리의 위쪽만 얇게 덮는다 — 기준은 물리 비율이 아니라 화면이다(2026-08-09
 * "좀만 더 높게": 0.58이면 히어로에서 밑단이 수평선에 딱 걸려 하늘·스카이라인이 0px였다).
 */
const COVER_RATIO = 0.45;

/** 바텀레일(m) — 내려온 슬랫 뭉치의 아래를 받는 무게 바. 이게 없으면 슬랫이 허공에서
 *  끊긴 것으로 읽힌다. 깊이는 헤드레일과 같다. */
const BOTTOM_RAIL_H_M = 0.026;

/**
 * 창문 하나에 걸리는 블라인드 한 벌. **벽 메쉬의 자식 드레싱 그룹 소속이다**(`windowView.ts`와
 * 같은 이유 — 벽 이동·표시 추종이 공짜다).
 *
 * **정적이다**(ADR-0031 결정 4): 블라인드는 물리상 흔들리지 않으므로 커튼의 스웨이 셰이더는
 * 삭제됐고, 여기에는 애니메이션 유니폼이 없다.
 *
 * 슬랫은 `InstancedMesh` 한 벌이다 — 절반 남짓만 내려와도 수십 장이라 메쉬로 세우면 드로우콜이
 * 그만큼 는다. 그림자는 주지 않는다: 햇살은 개구부 전체로 들어와 **바닥 웅덩이**를 만드는 것이
 * 결정 2의 인상이고, 2mm/텍셀 그림자맵에 22mm 피치 줄무늬를 얹으면 에일리어싱만 는다.
 *
 * 충돌·호환 판정에 안 들어간다 — 그룹 전체의 `raycast`를 무력화한다.
 */
export function buildBlind(rect: WindowRectM, wallHeightM: number): THREE.Group {
  const group = new THREE.Group();
  const winW = rect.alongMaxM - rect.alongMinM;
  const centerX = (rect.alongMinM + rect.alongMaxM) / 2;
  // 벽 지오메트리 y는 중심 기준이고 창문 사각형 y는 바닥 기준이다.
  const toLocalY = (y: number): number => y - wallHeightM / 2;
  const slatW = winW - SIDE_INSET_M * 2;

  const material = new THREE.MeshStandardNodeMaterial({
    color: SLAT_COLOR,
    roughness: 0.88,
    metalness: 0,
  });
  material.name = 'blind';

  const railY = toLocalY(rect.yMaxM) - RAIL_H_M / 2;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(slatW, RAIL_H_M, RAIL_DEPTH_M), material);
  rail.position.set(centerX, railY, RAIL_DEPTH_M / 2);
  rail.receiveShadow = true;
  group.add(rail);

  // 헤드레일 아래부터 덮는 높이만큼만 채운다 — 고정 상태 하나뿐이다.
  const coverBottomY = toLocalY(rect.yMaxM - (rect.yMaxM - rect.yMinM) * COVER_RATIO);
  const bottomRail = new THREE.Mesh(
    new THREE.BoxGeometry(slatW, BOTTOM_RAIL_H_M, RAIL_DEPTH_M),
    material,
  );
  bottomRail.position.set(centerX, coverBottomY + BOTTOM_RAIL_H_M / 2, RAIL_DEPTH_M / 2);
  bottomRail.receiveShadow = true;
  group.add(bottomRail);

  const topY = railY - RAIL_H_M / 2 - SLAT_PITCH_M / 2;
  const bottomY = coverBottomY + BOTTOM_RAIL_H_M + SLAT_PITCH_M / 2;
  const count = Math.max(1, Math.floor((topY - bottomY) / SLAT_PITCH_M) + 1);
  const slats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(slatW, SLAT_THICK_M, SLAT_DEPTH_M),
    material,
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(SLAT_TILT_RAD, 0, 0));
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < count; i++) {
    m.compose(new THREE.Vector3(centerX, topY - i * SLAT_PITCH_M, 0), q, scale);
    slats.setMatrixAt(i, m);
  }
  slats.instanceMatrix.needsUpdate = true;
  slats.receiveShadow = true;
  group.add(slats);

  group.traverse((o) => {
    o.raycast = () => {};
  });
  return group;
}

/** 블라인드가 방 안으로 나온 최대 깊이(m) — 상수를 고쳐 20mm 캡을 넘기면 vitest가 잡는다.
 *  기운 슬랫의 돌출은 폭의 절반에 sin(기울기)를 곱한 값이다. */
export const BLIND_MAX_PROTRUSION_M = Math.max(
  RAIL_DEPTH_M,
  (SLAT_DEPTH_M / 2) * Math.sin(SLAT_TILT_RAD) + SLAT_THICK_M / 2,
);
