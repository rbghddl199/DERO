package com.brunchies.dero.placement.dto;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.SpecSource;
import jakarta.validation.constraints.NotNull;

/**
 * 즉답 판정 요청의 책상 부분 — {@link DeskSnapshot}과 같은 D18 배타적 2모드지만 <b>판정이 읽는 규격만</b>
 * 받는다(재질·프레임은 판정 입력이 아니다).
 *
 * <p>{@link SpecSource#PRODUCT}면 {@code productId}만 보고 규격은 서버가 카탈로그에서 읽는다 —
 * 본문에 실려 온 치수는 무시한다. 클라이언트가 보낸 치수를 믿으면 규격을 위조한 판정이 성립한다.
 *
 * @param specSource 제품 모드 / 직접 입력 모드
 * @param productId 제품 모드에서 필수
 * @param widthMm 직접 입력 모드에서 필수(판정 ③의 상판 폭)
 * @param depthMm 직접 입력 모드에서 필수(판정 ③의 상판 깊이)
 * @param topThicknessMm 직접 입력 모드에서 필수(판정 ①의 상판 두께)
 * @param edgeThicknessMm 직접 입력 모드에서도 <b>선택</b>. NULL은 0이 아니라 "상판 두께와 같음"이다(D21)
 */
public record JudgmentDeskRequest(
		@NotNull SpecSource specSource,
		Long productId,
		Integer widthMm,
		Integer depthMm,
		Integer topThicknessMm,
		Integer edgeThicknessMm) {

	/**
	 * 손으로 쓴 검증이 규칙 15의 예외로 남는 이유는 {@link DeskSnapshot#validate()}와 같다 —
	 * <b>검사할 필드가 {@code specSource} 값에 따라 갈리고</b> Bean Validation은 그걸 표현하지 못한다.
	 */
	public void validate() {
		if (specSource == SpecSource.PRODUCT) {
			if (productId == null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_DESK_PRODUCT_ID_REQUIRED);
			}
			return;
		}
		if (widthMm == null || depthMm == null || topThicknessMm == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_DESK_SPEC_REQUIRED);
		}
	}
}
