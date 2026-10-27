package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.PanelShape;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;
import java.util.List;

/**
 * 모니터 규격 입력. 등록(POST)·수정(PATCH)이 공유하고 필수 여부를 {@link OnCreate} 그룹이 가른다.
 *
 * <p><b>mm 외형을 받지 않는다</b> — 인치·화면비·베젤이 정본이고 mm는 WAS가 매번 파생한다
 * (REQ-SIM-15). mm를 받으면 인치와 어긋난 값이 들어가도 DB가 모른다.
 *
 * <p><b>{@code panelShape = FLAT}인데 {@code curvatureRadiusMm}가 오면 거절된다</b> — 그 조합 검사는
 * 여기가 아니라 {@code Monitor} 엔티티가 한다. PATCH는 두 값 중 하나만 올 수 있어(나머지는 기존 값)
 * 요청 본문만 봐서는 판단할 수 없기 때문이다.
 */
public record MonitorSpecRequest(
		@NotNull(groups = OnCreate.class) @Positive BigDecimal diagonalInch,
		@NotNull(groups = OnCreate.class) @Positive Integer aspectWidth,
		@NotNull(groups = OnCreate.class) @Positive Integer aspectHeight,
		@NotNull(groups = OnCreate.class) @PositiveOrZero Integer bezelMm,
		@Positive Integer panelThicknessMm,
		@NotNull(groups = OnCreate.class) PanelShape panelShape,
		@Positive Integer curvatureRadiusMm,
		@NotNull(groups = OnCreate.class) @Positive Integer standDepthMm,
		@NotNull(groups = OnCreate.class) Boolean isStandDetachable,
		@NotNull(groups = OnCreate.class) Boolean isPivotSupported,
		Integer swivelMaxDeg,
		Integer heightAdjustRangeMm,
		Integer tiltMinDeg,
		Integer tiltMaxDeg,
		@NotNull(groups = OnCreate.class) @Positive Integer weightG,
		List<String> ports) {
}
