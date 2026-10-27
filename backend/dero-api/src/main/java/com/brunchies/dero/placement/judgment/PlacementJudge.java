package com.brunchies.dero.placement.judgment;

import com.brunchies.dero.placement.PlacedItem;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementDesk;
import com.brunchies.dero.product.Arm;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.Prop;
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * <b>저장 시점의 배치 전체 재판정</b>(ADR-0004 "WAS가 정본"). 마지막에 만진 아이템만 보면 책상 규격을
 * 나중에 바꿔 놓은 배치가 통과한다 — 그래서 매번 전체를 다시 돈다.
 *
 * <p><b>클라이언트가 보낸 판정 결과는 읽지 않는다.</b> 저장 요청 DTO에 판정 필드 자체가 없고, 본문에
 * 실려 와도 매핑되는 자리가 없어 그대로 버려진다.
 *
 * <p><b>{@code product}에 {@code instanceof}를 쓰는 것이 안전한 이유</b>: 이 경로에 들어오는
 * {@link PlacedItem}은 저장 병합이 방금 구체 타입을 꽂아 준 것들이다({@code PlacementService}가
 * {@code findAllById}로 읽어 넘긴 맵). 조회만 한 배치에 이 클래스를 쓰려면 서브타입까지
 * {@code join fetch}로 끌어와야 한다 — LAZY 프록시에 {@code instanceof}를 쓰면 조용히 거짓이 된다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class PlacementJudge {

	/**
	 * 배치 전체를 다시 판정한다. 판정을 수행하지 않은 조합은 <b>결과에 행이 없다</b>.
	 *
	 * <p>책상이 없는 배치({@code placement_desk} 미저장)는 판정 ①·③의 상대가 없어 그 두 종이 통째로
	 * 빠진다 — 상대 없는 판정을 "불가"로 적으면 규격이 아니라 편집 상태를 위반으로 보고하게 된다.
	 */
	public static List<PlacementJudgment> judge(Placement placement) {
		PlacementDesk desk = placement.getDesk();
		List<PlacementJudgment> judgments = new ArrayList<>();
		for (PlacedItem item : placement.getItems()) {
			addArmDesk(judgments, item, desk);
			addMonitorArm(judgments, item);
			addPropDesk(judgments, item, desk);
		}
		return judgments;
	}

	/**
	 * 판정 ① — {@code is_clamp_mountable = true}인 암에만. {@code arm_kind}로 가르지 않으므로
	 * {@code MIC} 마이크암도 같은 판정을 받는다.
	 */
	private static void addArmDesk(
			List<PlacementJudgment> judgments, PlacedItem item, PlacementDesk desk) {
		if (desk == null || !(item.getProduct() instanceof Arm arm)) {
			return;
		}
		CompatibilityJudge
				.judgeArmDesk(ProductSpecs.clampSpecOf(arm), ProductSpecs.gripSpecOf(desk))
				.ifPresent(judgment -> judgments.add(new PlacementJudgment(
						JudgmentKind.ARM_DESK, item.getId(), null, judgment)));
	}

	/**
	 * 판정 ② — VESA로 암에 실제로 결합된 모니터만. 결합하지 않은 모니터는 암이 하중을 지지 않으므로
	 * 판정 대상이 아니다.
	 */
	private static void addMonitorArm(List<PlacementJudgment> judgments, PlacedItem item) {
		PlacedItem target = item.getMountedToPlacedItem();
		if (!item.isVesaMounted() || target == null
				|| !(item.getProduct() instanceof Monitor monitor)
				|| !(target.getProduct() instanceof Arm arm)) {
			return;
		}
		judgments.add(new PlacementJudgment(JudgmentKind.MONITOR_ARM, item.getId(), target.getId(),
				CompatibilityJudge.judgeMonitorArm(
						ProductSpecs.monitorMountSpecOf(monitor), ProductSpecs.armMountSpecOf(arm))));
	}

	/**
	 * 판정 ③ — 상판에 놓인 소품만. 벽·페그보드·바닥에 붙은 소품은 상대가 상판이 아니다.
	 *
	 * <p>노트북 거치대·휴대폰 거치대도 {@code PROP}이라 여기로 온다 — V1에서 이 둘이 판정 ①의 대상이
	 * 아닌 것과 짝이다({@code docs/context/compatibility.md}, 2026-07-23 확정).
	 */
	private static void addPropDesk(
			List<PlacementJudgment> judgments, PlacedItem item, PlacementDesk desk) {
		if (desk == null || item.getSurfaceType() != MountSurface.TOP
				|| !(item.getProduct() instanceof Prop prop)) {
			return;
		}
		judgments.add(new PlacementJudgment(JudgmentKind.PROP_DESK, item.getId(), null,
				CompatibilityJudge.judgePropDesk(
						new FootprintSpec(prop.getWidthMm(), prop.getDepthMm()),
						ProductSpecs.deskTopFootprintOf(desk))));
	}
}
