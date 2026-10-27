// 개구부 마감 — 둘레 창틀 트림 + 창턱 + 밸런스 박스. 백색 고정, 유리판 없음 (ADR-0031 결정 3)
import * as THREE from 'three/webgpu';
import type { WindowRectM } from '@/three/core/window';

/** 창호 백색 고정 — 실제 인테리어의 창틀 기본값이다. 벽 마감 계열 연동은 계열 룩 재설계에서
 *  값이 생기면 그때 본다(ADR-0031 결정 3). */
const TRIM_COLOR = 0xf4f2ee;

/** 방 안으로 나온 깊이(m). 커튼 전례의 20mm 캡(`MAX_RELIEF_PROTRUSION_M`)을 상속한다 —
 *  넘기면 벽걸이 아이템이 마감을 관통하는 모습이 눈에 띈다. */
const RELIEF_M = 0.018;

/** 창틀 트림이 벽을 덮는 폭(m) — 두께 0인 구멍 가장자리를 가리는 것이 이 값의 일이다. */
const TRIM_FACE_M = 0.05;

/** 창턱 높이(m)와 트림 바깥으로 더 나가는 폭(m). */
const SILL_H_M = 0.032;
const SILL_OVERHANG_M = 0.06;

/** 밸런스 박스 높이(m) — 블라인드 헤드레일을 덮는다(`scene/blind.ts`). */
const VALANCE_H_M = 0.1;

/**
 * 창문 하나의 개구부 마감. **벽 메쉬의 자식 드레싱 그룹 소속이다** — 벽이 움직이거나 꺼지면
 * 같이 가야 하고, 부모를 태우면 그 배선이 0줄이다(`windowView.ts`와 같은 이유).
 *
 * 유리판은 만들지 않는다(ADR-0031 결정 3) — 창밖은 포털이 그리므로 유리판이 더할 것은
 * 반사·틴트뿐인데 재질 비용을 못 갚는다. 마감 모듈이 아니라 씬이 짓는다: 벽 마감 계열의 권한 밖이다(ADR-0021
 * 결정 2 · ADR-0030 결정 10 경계 유지).
 *
 * 충돌·호환 판정에 안 들어간다 — 그룹 전체의 `raycast`를 무력화한다.
 */
export function buildWindowTrim(rect: WindowRectM, wallHeightM: number): THREE.Group {
  const group = new THREE.Group();
  const winW = rect.alongMaxM - rect.alongMinM;
  const centerX = (rect.alongMinM + rect.alongMaxM) / 2;
  // 벽 지오메트리 y는 중심 기준이고 창문 사각형 y는 바닥 기준이다.
  const toLocalY = (y: number): number => y - wallHeightM / 2;
  // 트림 전체가 재질 한 벌을 공유한다 — 백색 고정이라 면마다 다를 이유가 없다.
  const material = new THREE.MeshStandardNodeMaterial({
    color: TRIM_COLOR,
    roughness: 0.62,
    metalness: 0,
  });
  material.name = 'window-trim';

  /** 바닥 기준 y 구간 하나를 벽 안에서 세운다. **벽 윗변을 넘는 부분은 잘린다** — 방에
   *  천장이 없어 벽 위로 나간 마감은 공중에 뜬 판으로 보인다(창밖 여백 판이 반려된 이유와
   *  같다). 창턱 900mm 슬롯에서는 안 걸리지만 저장이 자유 mm라 원격 값은 벽 꼭대기까지
   *  올라올 수 있다(`windowRectM`은 창문만 50mm 여유로 접는다). */
  const part = (w: number, yBottom: number, yTop: number, x: number): void => {
    const top = Math.min(yTop, wallHeightM);
    const h = top - yBottom;
    if (h <= 0) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, RELIEF_M), material);
    mesh.position.set(x, toLocalY(yBottom + h / 2), RELIEF_M / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const outerW = winW + TRIM_FACE_M * 2;
  part(TRIM_FACE_M, rect.yMinM, rect.yMaxM + TRIM_FACE_M, rect.alongMinM - TRIM_FACE_M / 2);
  part(TRIM_FACE_M, rect.yMinM, rect.yMaxM + TRIM_FACE_M, rect.alongMaxM + TRIM_FACE_M / 2);
  part(outerW, rect.yMaxM, rect.yMaxM + TRIM_FACE_M, centerX);
  part(outerW + SILL_OVERHANG_M * 2, rect.yMinM - SILL_H_M, rect.yMinM, centerX);
  // 밸런스는 **개구부 안 맨 위**다 — 덮어야 할 헤드레일이 개구부 안(`scene/blind.ts`)에 있어,
  // 창틀 위에 얹으면 아무것도 안 가리고 창 위에 뜬 흰 박스로 읽힌다.
  part(winW, rect.yMaxM - VALANCE_H_M, rect.yMaxM, centerX);

  group.traverse((o) => {
    o.raycast = () => {};
  });
  return group;
}

/** 개구부 마감이 방 안으로 나온 최대 깊이(m) — 상수를 고쳐 캡을 넘기면 vitest가 잡는다. */
export const WINDOW_TRIM_MAX_PROTRUSION_M = RELIEF_M;
