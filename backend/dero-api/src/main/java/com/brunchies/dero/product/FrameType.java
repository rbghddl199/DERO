package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 책상 프레임 구조({@code desk.frame_type}).
 *
 * <p>{@code TOP_ONLY}는 상판만 파는 제품이다 — 다리가 없으니 {@code height_mm}는 상판 두께를 포함한
 * 명목 높이로 등록한다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum FrameType {
  T_FRAME("T프레임."),
  FOUR_LEG("다리 4개."),
  TOP_ONLY("상판만 파는 제품. 다리가 없어 height_mm는 상판 두께를 포함한 명목 높이다.");

  private final String description;
}
