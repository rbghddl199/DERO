package com.brunchies.dero.placement.judgment;

import com.brunchies.dero.placement.PlacementDesk;
import com.brunchies.dero.product.Arm;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductVesa;
import java.util.List;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 엔티티 → <b>판정 입력 규격 값</b> 변환. {@link CompatibilityJudge}가 엔티티를 모르게 하려고 그 경계를
 * 이 클래스 하나로 모은다 — 판정 함수가 엔티티를 받으면 DB 없이는 못 돌리고, 3D 메쉬 치수가 섞여 들어올
 * 자리도 생긴다(D7/D8).
 *
 * <p><b>여기서 읽는 것은 규격 컬럼(mm·g)뿐이다.</b> 새 축을 붙일 때도 규격 메타데이터 DB 밖(에셋
 * 바운딩 박스 등)을 참조하지 마라.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ProductSpecs {

	/** 판정 ①의 암 쪽 입력. 게이트는 {@code mounting.clamp()} 하나이고 다른 마운트 boolean은 안 읽는다. */
	public static ClampSpec clampSpecOf(Arm arm) {
		return new ClampSpec(
				arm.getMounting().clamp(), arm.getClampMinMm(), arm.getClampMaxMm());
	}

	/** 판정 ②의 암 쪽 입력. */
	public static ArmMountSpec armMountSpecOf(Arm arm) {
		return new ArmMountSpec(vesaCodes(arm), arm.getAllowedLoadG());
	}

	/** 판정 ②의 모니터 쪽 입력. */
	public static MonitorMountSpec monitorMountSpecOf(Monitor monitor) {
		return new MonitorMountSpec(vesaCodes(monitor), monitor.getWeightG());
	}

	/**
	 * 판정 ①의 책상 쪽 입력 — <b>배치에 실제로 박힌 규격</b>을 읽는다. 제품 모드면 카탈로그 책상에서
	 * 복사돼 온 값이고 직접 입력 모드면 사용자가 잰 값이라, 이 한 자리가 두 모드를 다 덮는다.
	 *
	 * <p>{@code edgeThicknessMm}를 필드로 직접 읽지 않고 {@link PlacementDesk#effectiveEdgeThicknessMm()}을
	 * 통과시킨다 — 여기 NULL은 0이 아니라 "상판 두께와 같음"이다.
	 */
	public static GripSpec gripSpecOf(PlacementDesk desk) {
		return new GripSpec(desk.getTopThicknessMm(), desk.effectiveEdgeThicknessMm());
	}

	/** 판정 ①의 책상 쪽 입력 — 카탈로그 제품 책상 직접 조회 경로(저장 전 즉답 판정). */
	public static GripSpec gripSpecOf(Desk desk) {
		return new GripSpec(desk.getTopThicknessMm(), desk.getEdgeThicknessMm());
	}

	/** 판정 ③의 상판 쪽 입력. */
	public static FootprintSpec deskTopFootprintOf(PlacementDesk desk) {
		return new FootprintSpec(desk.getWidthMm(), desk.getDepthMm());
	}

	/** 판정 ③의 상판 쪽 입력 — 카탈로그 제품 책상 직접 조회 경로. */
	public static FootprintSpec deskTopFootprintOf(Desk desk) {
		return new FootprintSpec(desk.getWidthMm(), desk.getDepthMm());
	}

	/**
	 * {@code product_vesa} 정션 → {@code "폭x높이"} 문자열 목록. 정션에 행이 없으면 빈 목록이고 그게
	 * 곧 미등록이다({@code vesa_spec}은 마스터라 NULL이라는 상태가 없다).
	 */
	public static List<String> vesaCodes(Product product) {
		return product.getVesas().stream()
				.map(ProductVesa::getVesaSpec)
				.map(spec -> "%dx%d".formatted(spec.getWidthMm(), spec.getHeightMm()))
				.toList();
	}
}
