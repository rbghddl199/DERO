package com.brunchies.dero.placement.dto;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.SpecSource;
import com.brunchies.dero.product.FrameType;
import jakarta.validation.constraints.NotNull;

/**
 * 씬 스냅샷의 책상 부분(D18 배타적 2모드).
 *
 * <p>{@link SpecSource#PRODUCT}면 <b>{@code productId}만 보면 된다</b> — 규격·프레임·재질은 서버가
 * 그 카탈로그 책상에서 복사하고 본문에 실려 온 값은 무시한다. 클라이언트가 보낸 치수를 믿으면
 * 규격을 위조한 배치가 판정을 통과한다. {@link SpecSource#CUSTOM}이면 사용자가 줄자로 잰 값이라
 * 전부 필수다.
 */
public record DeskSnapshot(
		@NotNull SpecSource specSource,
		Long productId,
		Integer widthMm,
		Integer depthMm,
		Integer heightMm,
		Integer topThicknessMm,
		Integer edgeThicknessMm,
		Long deskTextureId,
		FrameType frameType) {

	/**
	 * 손으로 쓴 검증이 규칙 15의 예외로 남는 이유: <b>검사할 필드가 {@code specSource} 값에 따라
	 * 갈린다.</b> Bean Validation은 "다른 필드 값에 따라 이 필드가 필수"를 표현하지 못하고,
	 * {@code @NotNull}을 전부 붙이면 제품 모드가 쓰지도 않는 치수를 보내야 한다.
	 *
	 * <p>{@code edgeThicknessMm}는 {@link SpecSource#CUSTOM}에서도 선택 입력이다 — NULL은 0이 아니라
	 * "상판 두께와 같음"이고(REQ-ENV-05), 사용자는 자기 책상 앞에서 줄자를 들어야 해서다(D21).
	 */
	public void validate() {
		if (specSource == SpecSource.PRODUCT) {
			if (productId == null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_DESK_PRODUCT_ID_REQUIRED);
			}
			return;
		}
		if (widthMm == null || depthMm == null || heightMm == null || topThicknessMm == null
				|| deskTextureId == null || frameType == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_DESK_SPEC_REQUIRED);
		}
	}
}
