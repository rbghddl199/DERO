package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 모니터 패널 형상({@code monitor.panel_shape}).
 *
 * <p><b>{@link #FLAT}이면 {@code curvature_radius_mm}가 NULL이어야 한다</b> — 평면 모니터에 곡률은
 * 존재하지 않는다. 이 스키마는 {@code CHECK}를 쓰지 않으므로 WAS가 강제한다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum PanelShape {
  FLAT("평면. curvature_radius_mm가 NULL이어야 한다."),
  CURVED("곡면. 곡률 값은 curvature_radius_mm가 담는다.");

  private final String description;
}
