package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.PlacementDesk;
import com.brunchies.dero.placement.SpecSource;
import com.brunchies.dero.product.FrameType;

/**
 * 상세 응답의 책상 부분. 저장 요청({@link DeskSnapshot})과 대칭이지만 <b>전부 확정값이다</b> —
 * 제품 모드에서도 서버가 복사해 둔 실제 규격이 나간다.
 */
public record DeskDetailResponse(
		SpecSource specSource,
		Long productId,
		int widthMm,
		int depthMm,
		int heightMm,
		int topThicknessMm,
		Integer edgeThicknessMm,
		Long deskTextureId,
		FrameType frameType) {

	/**
	 * {@code edgeThicknessMm}는 <b>원본 그대로 내보낸다</b>({@code effectiveEdgeThicknessMm()}가
	 * 아니다) — NULL은 "상판 두께와 같음"이라는 사용자 입력 상태이고, 그걸 채워 보내면 재로드한 폼이
	 * 사용자가 비워 둔 칸을 채워진 것으로 보여 준다. 판정이 쓰는 실효값 계산은 서버 몫이다.
	 */
	public static DeskDetailResponse from(PlacementDesk desk) {
		return new DeskDetailResponse(
				desk.getSpecSource(),
				desk.getProduct() == null ? null : desk.getProduct().getId(),
				desk.getWidthMm(),
				desk.getDepthMm(),
				desk.getHeightMm(),
				desk.getTopThicknessMm(),
				desk.getEdgeThicknessMm(),
				desk.getDeskTexture().getId(),
				desk.getFrameType());
	}
}
