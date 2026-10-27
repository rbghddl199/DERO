// 모니터 화면에 사용자 사진 입히기 — 절차 생성 화면 메쉬(props.ts)의 map/emissiveMap 교체 + cover 핏 + 원본 복귀.
import * as THREE from 'three/webgpu';

/** 사진 화면의 발광 세기 — 물리 스케일(CAMERA_EXPOSURE=1/20) 기준.
 *  절차 기본 화면은 11이지만 그건 "무늬 없는 은은한 글로우" 기준값이라, 실사진을 그
 *  세기로 얹으면 밝은 영역이 글레어 블룸에 하얗게 타서 내용이 안 읽힌다. 켜진 화면으로
 *  읽히는 하한과 사진이 읽히는 상한 사이 값이다. */
export const SCREEN_PHOTO_EMISSIVE_INTENSITY = 3.5;

function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardNodeMaterial[] {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats as THREE.MeshStandardNodeMaterial[];
}

/** 화면 메쉬 찾기 — 이름이 아니라 `userData.screenSurface` 플래그다(props.ts가 표시).
 *  이름 의존은 파트 개명에 조용히 깨진다 (emitterSurface와 같은 규약). */
export function findScreenMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (found) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.screenSurface === true) found = mesh;
  });
  return found;
}

export interface ScreenUvFit {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

/** 사진을 화면 비율에 맞춰 잘라 채우는(cover) UV 변환. 지오메트리는 안 건드리고
 *  texture.repeat/offset만 쓴다 — 곡면 패널의 CylinderGeometry 옆면도 UV가 0..1이라 같이 먹는다.
 *  사진이 화면보다 가로로 길면 좌우를, 세로로 길면 위아래를 잘라내고 남는 쪽을 가운데 맞춘다. */
export function coverFit(imgAspect: number, screenAspect: number): ScreenUvFit {
  const bad =
    !Number.isFinite(imgAspect) ||
    !Number.isFinite(screenAspect) ||
    imgAspect <= 0 ||
    screenAspect <= 0;
  if (bad) return { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 };
  if (imgAspect > screenAspect) {
    const repeatX = screenAspect / imgAspect;
    return { repeatX, repeatY: 1, offsetX: (1 - repeatX) / 2, offsetY: 0 };
  }
  const repeatY = imgAspect / screenAspect;
  return { repeatX: 1, repeatY, offsetX: 0, offsetY: (1 - repeatY) / 2 };
}

function imageAspectOf(tex: THREE.Texture): number {
  const img = tex.image as { width?: number; height?: number } | null;
  if (!img?.width || !img?.height) return 0;
  return img.width / img.height;
}

/** 화면 메쉬에 사진을 입히거나(`tex`) 절차 기본 화면으로 되돌린다(`null`).
 *
 *  기본 재질은 `color = 0x0d0f13`(어두운 패널)이라 사진을 map으로 얹기만 하면 곱해져서
 *  거의 검게 나온다 — 사진일 때는 색을 흰색으로 눕혀야 한다. 원본 색·세기는 첫 적용 때
 *  userData에 담아 두고 복귀에 쓴다(props.ts의 상수를 여기 복제하지 않기 위해서다).
 *
 *  충돌 틴트(`tintMesh`)와 emissive 채널을 공유하므로 applyEmitterEmissive와 같은 규약을
 *  따른다: 틴트 복원 기준선(`_origEmissiveI`)을 같이 갱신하고, 틴트가 쥐고 있는 동안은
 *  라이브 세기를 안 건드린다(안 그러면 겹침 경고 빨강이 지워지거나, 겹침이 풀릴 때 옛
 *  세기로 되돌아간다).
 *
 *  GPU 반영에는 호출부의 poke가 필요하다 — three NodeMaterialObserver의 lazy 스냅샷 함정
 *  (`emitterEmissive.ts` 주석 참고). `material.needsUpdate = true`로는 안 고쳐진다. */
export function applyScreenPhoto(root: THREE.Object3D, tex: THREE.Texture | null): void {
  const mesh = findScreenMesh(root);
  if (!mesh) return;
  const fallback = (mesh.userData.defaultScreenTexture as THREE.Texture | undefined) ?? null;
  const screenAspect = (mesh.userData.screenAspect as number | undefined) ?? 0;

  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    const fit = coverFit(imageAspectOf(tex), screenAspect);
    tex.repeat.set(fit.repeatX, fit.repeatY);
    tex.offset.set(fit.offsetX, fit.offsetY);
    tex.needsUpdate = true;
  }

  for (const mm of materialsOf(mesh)) {
    if (!mm) continue;
    if (mm.userData._origScreenColor === undefined) {
      mm.userData._origScreenColor = mm.color.getHex();
      mm.userData._origScreenEmissiveI = mm.emissiveIntensity;
    }
    const intensity = tex
      ? SCREEN_PHOTO_EMISSIVE_INTENSITY
      : (mm.userData._origScreenEmissiveI as number);

    mm.map = tex ?? fallback;
    mm.emissiveMap = mm.map;
    mm.color.setHex(tex ? 0xffffff : (mm.userData._origScreenColor as number));

    if (mm.userData._origEmissive !== undefined) mm.userData._origEmissiveI = intensity;
    if (mm.userData._tinted) continue;
    mm.emissiveIntensity = intensity;
  }
}
