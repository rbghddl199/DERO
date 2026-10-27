package com.brunchies.dero.placement;

import com.brunchies.dero.product.MountSurface;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 아이템이 붙은 벽면({@code placed_item.wall_side}).
 *
 * <p>{@link MountSurface#WALL}·{@link MountSurface#PEGBOARD}일 때만 채운다. 나머지 표면은 NULL이다
 * — 바닥·상판에 놓인 물건에는 "어느 벽"이 없다.
 *
 * <p><b>없으면 재로드 시 좌표에서 벽면을 역추정해야 한다</b>. 벽 3면 토글이 배치 저장 값이라(D4)
 * 꺼진 벽에 붙은 아이템을 복원할 때 어느 벽이었는지가 정확히 필요하다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum WallSide {
  LEFT("왼쪽 벽면에 붙었다."),
  FRONT("정면 벽면에 붙었다."),
  RIGHT("오른쪽 벽면에 붙었다.");

  private final String description;
}
