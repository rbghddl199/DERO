package com.brunchies.dero.placement.dto;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.TimeOfDay;
import com.brunchies.dero.placement.WallSide;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 배치 저장 요청 — <b>씬 전체 스냅샷</b>이다(ADR-0009 결정 1). 델타를 보내지 않는다: 서버가 어차피
 * 전체 씬을 봐야 재판정할 수 있고, 델타는 클라이언트가 계산한 diff를 믿는 것이라 되돌리기·다중 탭에서
 * DB가 조용히 어긋난다. {@code POST}(신규)와 {@code PUT}(기존)이 같은 본문을 쓴다.
 *
 * <p><b>{@code version}은 {@code PUT}에서만 쓴다</b> — 신규 저장에는 비교할 현재 버전이 없어
 * {@code @NotNull}을 걸지 않는다. {@code PUT}에서 NULL이면 서비스가 409로 거절한다(옛 클라이언트가
 * 버전 없이 덮어쓰는 경로를 열지 않는다).
 *
 * <p><b>게시 상태를 받지 않는다</b>(ADR-0015 결정 10) — {@code PENDING}·{@code PUBLIC}·
 * {@code FAILED}는 서버만 정하고, 공개는 {@code PUT /placements/{id}/feed-entry}가 맡는다. 스냅샷이
 * 상태를 실어 오면 클라이언트가 업로드 큐를 우회해 바로 공개할 수 있다.
 *
 * <p><b>방 표면은 {@code walls[]}·{@code floor}·{@code timeOfDay}가 정본이다</b>(ADR-0030, D31).
 * 벽 표시 여부도 {@code walls[].isOn}이다 — 옛 {@code themeKey}·{@code isWall*On}은 축소에서 사라졌다
 * (DERO-514 — 컬럼 DROP은 그 다음 배포의 V10이다).
 * <b>마감을 모르는 클라이언트가 정상이므로 생략은 "기존 유지"다</b> —
 * 스냅샷의 다른 필드와 달리 생략을 기본값으로 접으면 옛 클라이언트의 저장 한 번이 백필·신규
 * 저장된 마감을 조용히 지운다(무회귀 위반). 그래서 {@code walls[]}가 없으면 벽면 행을 아예
 * 손대지 않고, {@code walls[]}가 오면 세 면이 전부 있어야 한다(일부만 오면 400 — 안 온 면이
 * 조용히 초기화되는 것을 막는다).
 */
public record PlacementSnapshotRequest(
		@NotBlank @Size(max = 100) String title,
		String description,
		Long version,
		@NotNull Boolean isRoomLightOn,
		List<@NotNull @Valid WallSnapshot> walls,
		@Valid FloorSnapshot floor,
		TimeOfDay timeOfDay,
		@PositiveOrZero Integer budgetKrw,
		@NotNull @Valid DeskSnapshot desk,
		@NotNull @Valid List<ItemSnapshot> items) {

	/**
	 * 벽면 3면을 확정한다 — {@code walls}가 왔으면 좌·전면·우 3개를 이 순서로 돌려주고,
	 * <b>생략(null)이면 null을 돌려준다</b>(방 표면을 모르는 옛 클라이언트 — 서비스가 벽면 행을
	 * 손대지 않는다). 같은 면이 두 번 오면 400이고
	 * (나중 것이 이기게 하면 클라이언트 버그가 조용히 저장된다), 세 면이 다 오지 않아도 400이다 —
	 * 안 온 면을 기본값으로 채우면 그 면의 마감·창문이 조용히 초기화된다.
	 *
	 * <p>{@code DeskSnapshot.validate}처럼 서비스가 부른다(규칙 15 예외 — 조건부 검증).
	 */
	public List<WallSnapshot> resolveWalls() {
		if (walls == null) {
			return null;
		}
		Map<WallSide, WallSnapshot> bySide = new EnumMap<>(WallSide.class);
		for (WallSnapshot wall : walls) {
			if (bySide.put(wall.wallSide(), wall) != null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_DUPLICATE_WALL_SIDE);
			}
		}

		List<WallSnapshot> resolved = new ArrayList<>(WallSide.values().length);
		for (WallSide side : WallSide.values()) {
			WallSnapshot wall = bySide.get(side);
			if (wall == null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_WALLS_INCOMPLETE);
			}
			wall.validate();
			resolved.add(wall);
		}
		return resolved;
	}
}
