package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 발광체가 빛을 뿌리는 방식({@code product_emitter.shape}) — <b>런타임 광원 종류가 여기서 갈린다</b>.
 *
 * <p>{@link Distribution}과는 축이 다르다: 이 열거는 런타임이 {@code PointLight}를 만드느냐
 * {@code SpotLight}를 만드느냐를 고르고, {@code Distribution}은 그 원뿔을 얼마나 좁게 조이느냐다.
 * {@code POINT}에는 조일 원뿔이 없어 {@code distribution}이 NULL이다(WAS 강제).
 *
 * <p><b>{@code AREA}를 넣지 않는다</b> — DERO-227이 부결 확정했다(2026-07-30). 프로덕션 카메라
 * 프리셋 어디서도 안 보이고 그림자가 영구 불가라, 죽은 열거값과 죽은 렌더 분기를 미리 사지 않는다.
 * {@code PROJECTOR}는 three.js 업스트림 API가 미확정이라 아예 적지 않는다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum EmitterShape {
  POINT("PointLight. 사방으로 뿌린다. 큐브맵이라 씬 6패스여서 그림자 배정에서 빠진다."),
  SPOT("SpotLight. 원뿔로 쏜다. 그림자 배정 대상이고 배광 분포가 원뿔 각을 고른다.");

  private final String description;
}
