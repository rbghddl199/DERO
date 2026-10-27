package com.brunchies.dero.placement.dto;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.PlacementWall;
import com.brunchies.dero.placement.WallSide;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/**
 * 씬 스냅샷의 벽면 하나(ADR-0030). {@code walls}를 싣는 요청은 좌·전면·우 세 면을 전부 실어야
 * 한다 — 일부만 오면 {@link PlacementSnapshotRequest#resolveWalls()}가 400으로 거절한다(안 온
 * 면이 조용히 기본 마감으로 초기화되는 것을 막는다).
 *
 * <p><b>{@code material}·{@code variant}는 형식만 검증한다</b> — 값 정본은 프론트 계열 모듈이라
 * 화이트리스트를 두면 계열을 늘릴 때마다 백엔드 배포가 붙는다(옛 {@code themeKey}의 방침 계승,
 * 값 공간이 UPPER_SNAKE라 형식만 다르다). 미상 값은 에러가 아니라 프론트가 {@code PAINT} 기본
 * 변형으로 폴백한다.
 */
public record WallSnapshot(
		@NotNull WallSide wallSide,
		Boolean isOn,
		@Positive @Max(3000) Integer distanceMm,
		@Pattern(regexp = "^[A-Z][A-Z0-9_]{0,29}$") String material,
		@Pattern(regexp = "^[A-Z][A-Z0-9_]{0,29}$") String variant,
		Boolean hasWindow,
		Integer windowCenterXMm,
		@Positive Integer windowCenterYMm,
		@Positive Integer windowWidthMm,
		@Positive Integer windowHeightMm) {

	/**
	 * 생략 필드를 기본값으로 정규화한다 — 서비스에 null 분기를 두지 않기 위해서다.
	 * {@code isOn} 기본값은 면마다 다르다
	 * — 구현 기본값이 우측 벽만 꺼짐이라(erd.md) 컬럼 기본값으로 표현할 수 없고 여기가 그 자리다.
	 * {@code distanceMm}도 같은 이유로 여기서 채운다 — 좌·우는 책상 중심 기준 1550mm, 전면은
	 * 기준이 달라(책상 뒷변) 50mm다. <b>상한 3000mm만 검증하고 하한은 안 본다</b> — 최소 거리가
	 * 책상 반폭에 걸려 규격마다 달라서, 좁은 값은 엔진이 적용 시점에 클램프한다.
	 * 마감 쌍은 <b>둘 다 생략했을 때만</b> 기본값이다 — 한쪽만 온 요청은 {@link #validate()}가
	 * 거절해야 하므로 여기서 채우면 안 된다.
	 */
	public WallSnapshot {
		if (wallSide != null && isOn == null) {
			isOn = wallSide != WallSide.RIGHT;
		}
		if (wallSide != null && distanceMm == null) {
			distanceMm = wallSide == WallSide.FRONT
					? PlacementWall.DEFAULT_FRONT_DISTANCE_MM
					: PlacementWall.DEFAULT_SIDE_DISTANCE_MM;
		}
		if (material == null && variant == null) {
			material = PlacementWall.DEFAULT_MATERIAL;
			variant = PlacementWall.DEFAULT_VARIANT;
		}
		hasWindow = hasWindow != null && hasWindow;
	}

	/**
	 * 손으로 쓴 검증이 규칙 15의 예외로 남는 이유: <b>{@code variant}의 필수 여부가 {@code material}
	 * 값에 따라 갈린다</b>({@code DeskSnapshot.validate}와 같은 사유). 계열마다 유효 변형 집합이
	 * 달라 한쪽만 온 마감을 서버가 채우면 미입력이 잘못된 변형으로 둔갑한다. 창문 4값의 넷-다-또는-
	 * 넷-다-없음은 엔티티({@code PlacementWall})가 강제한다 — 여기서 또 검사하면 두 벌이 된다.
	 */
	public void validate() {
		if (material == null || variant == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_WALL_FINISH_PAIR_REQUIRED);
		}
	}
}
