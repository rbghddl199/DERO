// 램프 갓 쿠키 마스크 런타임 베이크 — 광원 시점에서 갓 기하만 흑백으로 구워 제품당 128² 마스크를 만든다 (DERO-265)
//
// TSL을 쓰지 않는다(순수 three) — 셰이더 노드는 `cookieNode.ts` 한 파일에만 있다.
//
// 진행형 향상(progressive enhancement)이다: 마스크의 기본값이 **흰색**이라 베이크가 늦거나
// 실패해도 화면은 "쿠키 없음"으로 정상 렌더된다. 그래서 타임아웃 폴백 화면도, 차단 대기도 없다.

import * as THREE from 'three/webgpu';
import { SHADE_MESH_NAME } from '../core/lightAuthoring';

/** **저장** 해상도 한 변(px). 226 ⑥ 판정 — 128²와 512²의 링 대비 차이가 0.005라 해상도 무차별이다. */
export const COOKIE_MASK_RES = 128;

/** **렌더** 해상도 한 변(px). 저장의 4배로 구워 4×4 박스 평균으로 내린다 — 그러면 원형
 *  경계 텍셀이 이진값(0 또는 255)이 아니라 중간값이 되어 계단이 사라진다. 226 ⑥의
 *  "해상도 무차별"은 **격자 갓의 링 대비**를 잰 판정이라 단일 원형 경계의 엣지 품질 축을
 *  덮지 않는다 — 그 판정과 충돌하지 않는다(2026-07-30 1차 부결 사유 2). */
export const COOKIE_BAKE_RES = 512;

/** 렌더 → 저장 축소 배율. 4×4 = 텍셀당 16 표본. */
const DOWNSAMPLE = COOKIE_BAKE_RES / COOKIE_MASK_RES;

/**
 * 갓 투과율 — 0이면 불투명(빔이 갓에 걸리는 바깥 고리가 통째로 죽는다), 1이면 갓이
 * 없는 것과 같다. 화면의 갓은 `emissiveIntensity = 18`로 빛나는 **반투명 종이**로 렌더되는데
 * 쿠키만 불투명으로 취급하면 서로 앞뒤가 안 맞는다(2026-07-30 1차 부결 사유 1).
 *
 * **색 공간 함정**: `new THREE.Color(0x595959)`처럼 hex로 주면 three가 sRGB로 보고 리니어로
 * 변환해 원하는 값이 안 나온다. 반드시 `setScalar`로 넣어라 — 변환 없이 작업 색공간(리니어)
 * 성분을 그대로 넣는다. RT가 `NoColorSpace`라 리드백은 `round(t × 255)`여야 한다(0.5 → 128).
 *
 * 값 0.5는 눈으로 고른 것이다 — 0.25·0.35·0.5 세 벌을 구워 비교했고, 갓 경계가 거의 안
 * 읽히고 웅덩이가 상판에 고르게 퍼지는 0.5가 채택됐다 (2026-07-30 판정 박동규).
 */
export const SHADE_TRANSMITTANCE = 0.5;

/** 베이크 대상 갓 메쉬의 이름. `props.ts`가 이 이름을 붙인다.
 *  정의는 `core/lightAuthoring.ts`에 있다 — 등록 도구(/dev/light)가 "굽힐 갓"을 세는 술어와
 *  베이크가 실제로 굽는 술어가 갈리면 도구가 조용히 거짓말을 한다. */
export { SHADE_MESH_NAME };

/** WebGL2 폴백에서 리드백이 rAF 펜스 폴링이라 영영 안 끝날 수 있다 — 이 시간이 지나면
 *  진행 중 플래그를 풀어 다음 배치 때 다시 시도한다(못 끝낸 promise는 버린다). */
const BAKE_TIMEOUT_MS = 8000;

export interface CookieMaskStats {
  /**
   * 마스크의 **내접원 안** 평균 통과율(0~1). 이게 화면에 실제로 나오는 무늬의 세기다.
   *
   * 이진 임계(`v < 128` 카운트)는 못 쓴다 — 투과율이 생기면 갓이 가린 자리의 값이 곧 `t·255`라
   * 임계를 넘나들며 통계가 통째로 뒤집힌다(`t = 0.5`면 127.5가 임계에 걸린다). 평균은 그런
   * 절벽이 없고 기하 예측도 깔끔하다: `beamMean = 1 − (1 − t) × 0.8013`
   * (0.8013 = `lamp-task` 빔 안 차폐 면적비, 1차 실측 0.8018).
   *
   * **내접원**인 이유: 베이크 카메라(`spot.shadow.camera`)의 프러스텀은 원뿔이 아니라
   * **정사각형**이라 마스크 네 귀퉁이는 빔 반각의 √2배(= 스팟 감쇠가 0인 영역)까지 뻗는다.
   * 전체 평균은 화면에 안 나오는 귀퉁이를 같이 세고, 빔 반각이 좁을수록 그 오염이 커진다.
   */
  beamMean: number;
  min: number;
  max: number;
  mean: number;
}

/** 아직 아무것도 안 구운 슬롯(= 흰 마스크)의 통계. */
export const WHITE_MASK_STATS: CookieMaskStats = {
  beamMean: 1,
  min: 255,
  max: 255,
  mean: 255,
};

/** 구운 마스크를 슬롯에 싣는 콜백. 슬롯마다 하나이고 굽기당 여러 개가 대기할 수 있다 (281). */
export type CookieApply = (px: Uint8Array, stats: CookieMaskStats) => void;

export interface CookieBaker {
  /**
   * 이 제품의 마스크를 요청한다. 캐시에 있으면 그 자리에서 `apply`를 부르고, 없으면
   * 백그라운드로 굽고 나서 부른다. 실패·지연은 조용히 무시된다 — 그동안 마스크는 흰색이라
   * 쿠키가 없는 것과 같다. 같은 제품을 같은 틱에 여러 번 요청해도 한 번만 굽는다.
   */
  request(
    specId: string,
    lampGroup: THREE.Object3D,
    spot: THREE.SpotLight,
    apply: CookieApply,
  ): void;
  /** 완료된 베이크 횟수(회귀 가드용) — 램프를 돌리거나 다시 놓아도 늘면 안 된다. */
  bakeCount(): number;
}

/** 굽기에 필요한 것만 담는다 — `apply` 콜백은 요청마다 다르므로 여기 있지 않고 `waiting`에 모인다
 *  (제품당 굽기 1회 : 슬롯당 적용 1회, DERO-281). */
interface BakeRequest {
  specId: string;
  lampGroup: THREE.Object3D;
  spot: THREE.SpotLight;
}

interface CookieMask {
  px: Uint8Array;
  stats: CookieMaskStats;
}

function statsOf(px: Uint8Array): CookieMaskStats {
  const res = COOKIE_MASK_RES;
  const n = res * res;
  const half = res / 2;
  let sum = 0;
  let min = 255;
  let max = 0;
  let beamSum = 0;
  let beamTotal = 0;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const v = px[(y * res + x) * 4];
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      // 내접원 = 빔 반각 안쪽. 밖은 스팟 감쇠가 0이라 화면에 안 나온다.
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;
      if (dx * dx + dy * dy <= half * half) {
        beamTotal++;
        beamSum += v;
      }
    }
  }
  return {
    beamMean: +(beamSum / beamTotal / 255).toFixed(4),
    min,
    max,
    mean: +(sum / n).toFixed(2),
  };
}

/** 512² 리드백을 4×4 박스 평균으로 128²로 내린다 — 경계 텍셀이 중간값이 되어 톱니가 없어진다.
 *  R만 쓰지 않고 RGBA 4채널을 다 평균한다: 셰이더가 `.rgb`를 샘플하므로 회색조 마스크라도
 *  채널이 어긋나면 색이 튄다. */
function downsample(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(COOKIE_MASK_RES * COOKIE_MASK_RES * 4);
  const k = DOWNSAMPLE;
  const inv = 1 / (k * k);
  for (let oy = 0; oy < COOKIE_MASK_RES; oy++) {
    for (let ox = 0; ox < COOKIE_MASK_RES; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < k; sy++) {
        const row = ((oy * k + sy) * COOKIE_BAKE_RES + ox * k) * 4;
        for (let sx = 0; sx < k; sx++) {
          const i = row + sx * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
        }
      }
      const o = (oy * COOKIE_MASK_RES + ox) * 4;
      out[o] = Math.round(r * inv);
      out[o + 1] = Math.round(g * inv);
      out[o + 2] = Math.round(b * inv);
      out[o + 3] = Math.round(a * inv);
    }
  }
  return out;
}

export function createCookieBaker(renderer: THREE.WebGPURenderer): CookieBaker {
  const cache = new Map<string, CookieMask>();
  const inFlight = new Set<string>();
  /** 탭이 숨겨져 있어 못 시작한 요청들(제품당 1건). `visibilitychange`에서 그대로 다시 태운다. */
  const deferred = new Map<string, BakeRequest>();
  /**
   * 굽는 중인 제품의 **대기 콜백들**. 굽기는 제품당 1회지만 적용은 **슬롯마다** 필요하다 —
   * 같은 제품 램프를 같은 틱에 여러 대 놓으면(저장 레이아웃 복원이 정확히 그렇다) 2번째부터의
   * 요청은 캐시 미스 + 굽는 중이라 되돌아가는데, 그때 `apply`까지 같이 버리면 그 슬롯은
   * 마스크를 영영 못 받는다. 이후 재배정이 있으면 캐시 히트로 복구되지만, 배치가 한 틱에
   * 몰리면 그 재배정도 전부 굽기 완료 전이라 복구 기회가 없다 (DERO-281 실측:
   * `lamp-task` 3대 중 슬롯 0만 무늬, 40초 뒤에도 그대로).
   */
  const waiting = new Map<string, CookieApply[]>();
  let bakes = 0;
  let visibilityHooked = false;

  // 갓은 불투명 차폐물이 아니다 — 마스크 값이 곧 통과율이라, 빔이 갓에 걸리는 바깥 고리가
  // 죽는 대신 `SHADE_TRANSMITTANCE`만큼만 깎인다. hex가 아니라 `setScalar`여야 한다(위 상수 주석).
  const shadeMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  shadeMaterial.color.setScalar(SHADE_TRANSMITTANCE);

  /** 갓 메쉬를 광원 시점으로 굽고 RenderTarget을 돌려준다. 갓이 없으면 null.
   *  **전 구간 동기다** — `await` 사이에 rAF 프레임이 끼어들어 우리 RT에 본 씬이 그려지는
   *  창을 아예 없앤다(`scene.ts`의 `renderContactShadows()`와 같은 형태). */
  function renderMask(req: BakeRequest): THREE.RenderTarget | null {
    const shades: THREE.Mesh[] = [];
    req.lampGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name === SHADE_MESH_NAME) shades.push(o as THREE.Mesh);
    });
    if (shades.length === 0) return null;

    req.lampGroup.updateWorldMatrix(true, true);
    req.spot.updateWorldMatrix(true, false);
    req.spot.target.updateWorldMatrix(true, false);
    // 쿠키 UV의 정본은 `light.shadow.matrix`다 — 그 행렬을 만든 카메라를 그대로 베이크
    // 카메라로 쓴다. fov/aspect/near/far를 다시 계산하면 어긋날 자리만 늘어난다.
    req.spot.shadow.updateMatrices(req.spot);
    const cam = req.spot.shadow.camera;

    // 마스크는 **정준 방향으로** 굽는다. 위 행렬은 광원/타깃 월드 위치만으로 만들어져
    // 램프 요를 따라 돌지 않으므로, 요를 안 빼고 구우면 "구울 때의 요"가 마스크에 박혀
    // 셰이더의 회전 보정과 이중 계상된다. 갓은 `rotation.z = 0.12`로 기울어 회전 대칭이
    // 아니라서 이게 실제로 눈에 보인다.
    const pivot = new THREE.Vector3();
    req.lampGroup.getWorldPosition(pivot);
    const unyaw = new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationY(-req.lampGroup.rotation.y))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));

    const bakeScene = new THREE.Scene();
    bakeScene.background = new THREE.Color(0xffffff);
    for (const shade of shades) {
      const clone = shade.clone(true);
      clone.matrixAutoUpdate = false;
      clone.matrix.multiplyMatrices(unyaw, shade.matrixWorld);
      clone.matrixWorldNeedsUpdate = true;
      clone.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // 갓은 광원을 감싸는 껍데기라 카메라가 **안쪽 면**을 본다 — FrontSide면 통째로
        // 안 그려져 마스크가 조용히 흰색이 된다.
        mesh.material = shadeMaterial;
        // 격리 씬에 receiveShadow 물체가 0개라 켜는 순간 쿠키가 조용히 사라진다(221).
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
      bakeScene.add(clone);
    }

    // 톤매핑은 건드리지 않는다. `Renderer.currentToneMapping`이 출력 타깃이 아닐 때 항상
    // `NoToneMapping`이라(`renderers/common/Renderer.js:2500-2504`) 이 렌더는 구조적으로
    // 톤매핑을 안 거친다. 반대로 `renderer.toneMapping`을 만지면 `needsFrameBufferTarget`이
    // 뒤집혀 본 씬의 출력 패스 구성과 그 캐시 키까지 흔든다 — 순손해다.
    // 저장은 128²지만 렌더는 512²다 — 아래에서 4×4 박스 평균으로 내린다. 221 실측이 리드백을
    // 해상도 무관 warm 7.7~8.3ms로 쟀으니 1MB 리드백도 예산 문제가 아니다.
    const rt = new THREE.RenderTarget(COOKIE_BAKE_RES, COOKIE_BAKE_RES);
    rt.texture.colorSpace = THREE.NoColorSpace;
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(bakeScene, cam);
    renderer.setRenderTarget(prevRT);
    return rt;
  }

  async function bake(req: BakeRequest): Promise<void> {
    let rt: THREE.RenderTarget | null = null;
    try {
      rt = renderMask(req);
      if (rt === null) return; // 갓이 없는 램프 — 흰 마스크 그대로 둔다
      // 8비트 RT라 리드백은 항상 Uint8Array다.
      const hi = (await renderer.readRenderTargetPixelsAsync(
        rt,
        0,
        0,
        COOKIE_BAKE_RES,
        COOKIE_BAKE_RES,
      )) as Uint8Array;
      const px = downsample(hi);
      const mask: CookieMask = { px, stats: statsOf(px) };
      cache.set(req.specId, mask);
      bakes++;
      // 이 제품을 기다리던 **모든** 슬롯에 적용한다 — 요청자 하나만 부르면 281이 재발한다.
      const queued = waiting.get(req.specId) ?? [];
      waiting.delete(req.specId);
      for (const apply of queued) apply(mask.px, mask.stats);
    } catch {
      // 조용히 포기한다 — 마스크는 흰색이라 화면은 "쿠키 없음"으로 정상이고,
      // 다음 배치 때 캐시 미스로 다시 시도된다.
    } finally {
      rt?.dispose();
      inFlight.delete(req.specId);
      // 성공 경로는 위에서 이미 비웠다. 실패·갓 없음 경로에서 대기 목록을 남기면 다음 요청이
      // "굽는 중"으로 오인해 되돌아간다 — 마스크는 흰색이라 화면은 정상이고, 다음 배치가
      // 캐시 미스로 다시 굽는 것이 맞는 동작이다.
      waiting.delete(req.specId);
    }
  }

  function hookVisibility(): void {
    if (visibilityHooked) return;
    visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const pending = [...deferred.values()];
      deferred.clear();
      for (const req of pending) start(req);
    });
  }

  function start(req: BakeRequest): void {
    // WebGL2 폴백의 `readRenderTargetPixelsAsync`는 rAF로 펜스를 폴링한다
    // (`webgl-fallback/utils/WebGLUtils.js:275-315`) — 탭이 숨겨지면 영원히 안 끝난다.
    if (document.visibilityState !== 'visible') {
      deferred.set(req.specId, req);
      hookVisibility();
      return;
    }
    inFlight.add(req.specId);
    setTimeout(() => {
      inFlight.delete(req.specId);
      // 대기 목록도 같이 풀어야 다음 배치가 실제로 다시 굽는다 — 안 풀면 이 제품은
      // "영원히 굽는 중"이 되어 어느 슬롯도 마스크를 못 받는다.
      waiting.delete(req.specId);
    }, BAKE_TIMEOUT_MS);
    void bake(req);
  }

  return {
    request(specId, lampGroup, spot, apply): void {
      const hit = cache.get(specId);
      if (hit) {
        apply(hit.px, hit.stats);
        return;
      }
      // 굽기는 제품당 1회지만 적용은 슬롯마다다 — 콜백을 먼저 모으고 나서 중복 굽기를 막는다.
      const queued = waiting.get(specId);
      if (queued) queued.push(apply);
      else waiting.set(specId, [apply]);
      if (inFlight.has(specId)) return;
      start({ specId, lampGroup, spot });
    },
    bakeCount: () => bakes,
  };
}
