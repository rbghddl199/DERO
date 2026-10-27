package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 암의 <b>구조</b> 분류({@code arm.arm_type}).
 *
 * <p><b>마운트 방식이 아니다</b> — 고정 방식은 boolean 3종({@code is_clamp_mountable}·
 * {@code is_grommet_mountable}·{@code is_wall_mountable})이 맡는다. 다관절 암이 클램프일 수도
 * 그로밋일 수도 있어 둘은 겹치지 않는다.
 *
 * <p><b>{@link #STAND}(자립형)이면 마운트 boolean 3개가 전부 {@code false}다</b> — WAS가 강제한다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ArmType {
  POLE("기둥형."),
  ARTICULATED("관절형."),
  STAND("스탠드형(자립형). 마운트 boolean 3종이 전부 false다.");

  private final String description;
}
