// 장식 발광 emissive 적용 — 발광면 메쉬 선택 + 충돌 틴트 기준선 갱신 + NodeMaterialObserver 우회 poke. 시뮬레이터 씬과 관리자 발광 프리뷰가 같은 규칙을 쓰도록 한 모듈로 뽑았다 (ADR-0003).
import * as THREE from 'three/webgpu';
import { selectEmitterMeshes } from './emitters';

/** 장식 발광 emissive 세기 — 물리 스케일(CAMERA_EXPOSURE=1/20) 기준. 램프 셰이드
 *  18보다 위, 즉 "확산 셰이드보다 밝은 네온"이라는 아트 방향 앵커 하나뿐이다.
 *  제품별 보정이 아니라 씬 상수다 — lumens는 PointLight.power로만 간다 (ADR-0003 결정 5). */
export const EMITTER_EMISSIVE_INTENSITY = 25;

/** 감시 대상 속성을 눈에 안 보이는 폭으로 흔드는 값 (아래 poke 주석 참고). */
const EMITTER_POKE_EPSILON = 1e-4;

function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardNodeMaterial[] {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats as THREE.MeshStandardNodeMaterial[];
}

/** 발광 emissive를 **발광면 메쉬에만** 입힌다 (블룸이 읽는 채널 = emissive × intensity).
 *  전 메쉬에 칠하면 키보드가 백라이트가 아니라 통째로 빛나는 플라스틱 덩어리가 된다 —
 *  어느 메쉬가 발광면인지는 `userData.emitterSurface`로 형상 생성 코드가 표시하고,
 *  표시가 없으면(GLB) 전 메쉬 폴백이다 (`selectEmitterMeshes`).
 *  충돌 틴트와 emissive를 공유하므로 두 가지를 같이 한다: 라이브 값 갱신 + 틴트의
 *  복원 기준선 갱신. 기준선을 안 고치면 충돌이 풀릴 때 "발광 도입 전" 색으로
 *  돌아가 발광이 죽는다. 틴트가 켜져 있는 동안은 기준선만 고친다.
 *
 *  `intensity`에 0을 주면 발광이 꺼진다(사용자 토글) — 블룸이 읽는 MRT 채널이
 *  emissive × intensity라 0이면 **구조적으로** 안 번진다(threshold 튜닝과 무관).
 *  색은 그대로 남긴다 — 다시 켤 때 되돌릴 값이자, 꺼진 채로도 색 스와치가
 *  정직해야 하기 때문. */
export function applyEmitterEmissive(
  root: THREE.Object3D,
  hex: number,
  intensity: number = EMITTER_EMISSIVE_INTENSITY,
): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  const lit = selectEmitterMeshes(meshes, (m) => m.userData.emitterSurface === true);
  for (const mesh of lit) {
    for (const mm of materialsOf(mesh)) {
      if (!mm || !mm.emissive) continue;
      if (mm.userData._origEmissive !== undefined) {
        mm.userData._origEmissive = hex;
        mm.userData._origEmissiveI = intensity;
      }
      if (mm.userData._tinted) continue;
      mm.emissive.setHex(hex);
      mm.emissiveIntensity = intensity;
    }
  }
}

// --- three NodeMaterialObserver 우회 (2026-07-25 실측) --------------------
// three는 재질 상태 스냅샷을 **lazy하게** 만든다(NodeMaterialObserver.getMaterialData).
// 스냅샷이 우리 쓰기 **뒤에** 처음 만들어지면 새 값이 기준선으로 박혀 "변한 게 없다"로
// 판정되고, 이미 올라간 옛 색이 GPU에 그대로 남는다 — 카메라를 움직이거나 아이템을
// 옮길 때까지 옛 색이 보인다. `material.needsUpdate = true`로는 안 고쳐진다. 그래서
// 리컬러 한두 프레임 뒤에 감시 대상 속성(emissiveIntensity)을 눈에 안 보이는 폭으로
// 한 번 더 흔들어 강제로 감지시킨다. ±로 번갈아 흔들므로 값이 한쪽으로 흐르지 않는다.
/** 트리 안 모든 재질의 `emissiveIntensity`를 ±1e-4로 번갈아 흔든다. */
export function pokeEmissive(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mm of materialsOf(mesh)) {
      if (!mm || !mm.emissive) continue;
      const up = !mm.userData._pokedUp;
      mm.userData._pokedUp = up;
      mm.emissiveIntensity += up ? EMITTER_POKE_EPSILON : -EMITTER_POKE_EPSILON;
    }
  });
}
