/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// 스팟 쿠키 색 노드 — 램프 요(yaw)를 상쇄한 UV로 베이크된 갓 마스크를 샘플해 SpotLight 빛을 깎는다 (DERO-265)
// TSL LANDMINE ISOLATION (woodGrainNode.ts:1 / contourNode.ts:1 선례): TSL 노드 체이닝을
// tsc가 타입 추론하면 메모리를 폭식한다(70GB OOM 전례). 이 프로젝트의 TSL은 전부 이런
// @ts-nocheck 파일에 격리한다 — `cookieBake.ts`는 TSL을 안 쓰므로 타입이 전부 붙어 있다.
//
// UV의 정본은 `SpotLightNode.js:142-145`다: `light.colorNode(uvw)`의 `uvw`는
// `lightShadowMatrix(light) * positionWorld`를 w로 나눈 vec3고, 프러스텀 안에서 세 성분이
// 모두 [0,1]이다(= `light.map` 경로와 같은 노드). 그 행렬은 광원/타깃 **월드 위치**만으로
// 만들어지고 우리 스팟은 수직이라 lookAt이 degenerate다 — 즉 **UV 프레임이 월드 고정이라
// 램프를 돌려도 무늬가 안 돈다.** 여기서 UV를 반대로 돌려 그걸 상쇄한다(`spot.map` 경로로는
// 불가능하고, 그게 226 ②가 map을 기각한 사유다).
//
// 거리 블러(`.blur()`)는 226 ③ 기각 — 선명 유지다. 넣지 말 것(밉맵도 그래서 안 만든다).
// 쿠키 값은 스팟 감쇠 뒤에 곱해지고 클램프가 없다 — 1을 넘으면 오히려 밝아지므로 마스크는
// 0~1로만 굽는다. 알파는 조용히 버려지므로 반드시 vec3(.rgb)를 돌려준다.
import { Fn, texture, uniform, vec2 } from 'three/tsl';
import type * as THREE from 'three/webgpu';

export interface CookieColorNode {
  /** `light.colorNode`에 **부팅 시 한 번만** 대입한다 — 재대입은 셰이더 재빌드거나
   *  (r185 Fn 프록시 버그로) 조용한 no-op이다. 어느 쪽이든 틀렸다 (235 제약). */
  colorNode: unknown;
  /** 램프 요(rad). 유니폼이라 매 프레임 갱신해도 캐시 키가 안 변한다. */
  setYaw: (rad: number) => void;
}

/** 마스크 텍스처 하나를 감싼 쿠키 노드 + 요 유니폼. 슬롯마다 1개씩 만든다. */
export function createCookieColorNode(mask: THREE.DataTexture): CookieColorNode {
  const yaw = uniform(0);
  const colorNode = Fn(([uvw]) => {
    const p = uvw.xy.sub(0.5);
    const c = yaw.cos();
    const s = yaw.sin();
    const r = vec2(p.x.mul(c).add(p.y.mul(s)), p.y.mul(c).sub(p.x.mul(s))).add(0.5);
    return texture(mask, r).rgb;
  });
  return {
    colorNode,
    setYaw: (rad: number) => {
      yaw.value = rad;
    },
  };
}
