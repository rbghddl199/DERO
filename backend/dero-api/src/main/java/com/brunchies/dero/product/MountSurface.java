package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 소품이 놓일 수 있는 표면({@code prop.mount_surface}).
 *
 * <p><b>이 값 집합은 {@code placed_item.surface_type}과 같은 것을 재사용한다</b> — 새 열거를 만들지
 * 않는다. 배치 시 검사가 {@code placed_item.surface_type == prop.mount_surface} 한 줄이라 두 열거로
 * 나뉘면 그 비교가 성립하지 않는다. {@code placement} 패키지가 매핑될 때 이 enum을 그대로 쓴다.
 *
 * <p><b>없으면 REQ-ENV-04(Must)를 판정할 수 없다</b> — "벽 꺼진 면에는 타공판·선반 배치 불가"를
 * 강제하려면 제품이 벽 부착형인지 알아야 하는데, {@code placed_item.surface_type}은 배치가 끝난 뒤의
 * 결과이지 제약이 아니다. 그것만으로는 마우스패드를 벽에 붙이는 것도 막을 근거가 없다.
 *
 * <p><b>지금은 제품당 표면 1개다.</b> 상판에도 선반 위에도 놓이는 제품(스피커 등)이 실제로 등록되면
 * 그때 {@code product_mount_surface} 정션으로 넓힌다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum MountSurface {
  TOP("상판."),
  PEGBOARD("타공판."),
  WALL("벽."),
  FLOOR("바닥.");

  private final String description;
}
