package com.brunchies.dero.placement.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.SpecSource;
import com.brunchies.dero.placement.dto.JudgmentDeskRequest;
import com.brunchies.dero.placement.dto.JudgmentItemRequest;
import com.brunchies.dero.placement.dto.JudgmentRequest;
import com.brunchies.dero.placement.dto.JudgmentResponse;
import com.brunchies.dero.placement.dto.JudgmentRowResponse;
import com.brunchies.dero.placement.judgment.CompatibilityJudge;
import com.brunchies.dero.placement.judgment.FootprintSpec;
import com.brunchies.dero.placement.judgment.GripSpec;
import com.brunchies.dero.placement.judgment.Judgment;
import com.brunchies.dero.placement.judgment.JudgmentKind;
import com.brunchies.dero.placement.judgment.ProductSpecs;
import com.brunchies.dero.product.Arm;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.Monitor;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.Prop;
import com.brunchies.dero.product.repository.ProductRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 저장하지 않는 호환성 판정({@code POST /api/v1/compatibility/judgments}, REQ-CMP-01~04).
 *
 * <p><b>아무것도 쓰지 않는다.</b> {@code judgment_result} 행을 만들지 않고 배치도 만들지 않는다 —
 * 판정 결과는 어느 테이블의 컬럼도 아니고 매번 재계산한다(ADR-0004). 그래서 201이 아니라 200이다.
 *
 * <p><b>비로그인도 부른다.</b> 아직 배치를 만들지 않은 사용자가 "이 암에 이 모니터가 되나"를 묻는
 * 자리라 신원이 필요 없다 — 소유자 검사도 없다.
 *
 * <p>규격은 <b>전부 서버가 DB에서 읽는다.</b> 요청이 실어 보낸 판정 결과는 물론이고 제품 모드 책상의
 * 치수도 읽지 않는다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class CompatibilityService {

	private final ProductRepository products;

	public JudgmentResponse judge(JudgmentRequest request) {
		request.desk().validate();
		Map<String, JudgmentItemRequest> byRef = indexByRef(request.items());
		Map<Long, Product> productsById = loadProducts(request.items());

		GripSpec grip = gripSpecOf(request.desk());
		FootprintSpec deskTop = deskTopFootprintOf(request.desk());

		List<JudgmentRowResponse> rows = new ArrayList<>();
		for (JudgmentItemRequest item : request.items()) {
			Product product = productsById.get(item.productId());
			addArmDesk(rows, item, product, grip);
			addMonitorArm(rows, item, product, byRef, productsById);
			addPropDesk(rows, item, product, deskTop);
		}
		return new JudgmentResponse(rows);
	}

	/** 판정 ① — 클램프 게이트가 {@code false}면 {@link CompatibilityJudge}가 빈 값을 내고 행이 안 생긴다. */
	private void addArmDesk(List<JudgmentRowResponse> rows, JudgmentItemRequest item,
			Product product, GripSpec grip) {
		if (!(product instanceof Arm arm)) {
			return;
		}
		CompatibilityJudge.judgeArmDesk(ProductSpecs.clampSpecOf(arm), grip)
				.ifPresent(judgment -> rows.add(row(JudgmentKind.ARM_DESK, item.ref(), null, judgment)));
	}

	/**
	 * 판정 ② — 결합을 시도한 모니터만. 물릴 대상이 암이 아니면 VESA 결합 자체가 성립하지 않아 판정
	 * 행을 만들지 않는다(형태 페어링의 문제이지 규격 판정의 문제가 아니다).
	 */
	private void addMonitorArm(List<JudgmentRowResponse> rows, JudgmentItemRequest item,
			Product product, Map<String, JudgmentItemRequest> byRef, Map<Long, Product> productsById) {
		if (item.mountedToRef() == null || !(product instanceof Monitor monitor)) {
			return;
		}
		JudgmentItemRequest target = byRef.get(item.mountedToRef());
		if (target == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_UNKNOWN_ITEM_REF);
		}
		if (!(productsById.get(target.productId()) instanceof Arm arm)) {
			return;
		}
		rows.add(row(JudgmentKind.MONITOR_ARM, item.ref(), target.ref(),
				CompatibilityJudge.judgeMonitorArm(
						ProductSpecs.monitorMountSpecOf(monitor), ProductSpecs.armMountSpecOf(arm))));
	}

	/** 판정 ③ — 소품 footprint가 상판 면적 안에 드는가. 겹침은 여기서 안 본다(D7/D8). */
	private void addPropDesk(List<JudgmentRowResponse> rows, JudgmentItemRequest item,
			Product product, FootprintSpec deskTop) {
		if (!(product instanceof Prop prop)) {
			return;
		}
		rows.add(row(JudgmentKind.PROP_DESK, item.ref(), null, CompatibilityJudge.judgePropDesk(
				new FootprintSpec(prop.getWidthMm(), prop.getDepthMm()), deskTop)));
	}

	private JudgmentRowResponse row(
			JudgmentKind kind, String ref, String targetRef, Judgment judgment) {
		return new JudgmentRowResponse(
				kind, ref, targetRef, judgment.result(), judgment.reasons());
	}

	/** 제품 모드면 카탈로그 책상에서, 직접 입력 모드면 요청 값에서 — {@link #deskTopFootprintOf}와 같은 갈래다. */
	private GripSpec gripSpecOf(JudgmentDeskRequest desk) {
		return desk.specSource() == SpecSource.PRODUCT
				? ProductSpecs.gripSpecOf(loadDeskProduct(desk.productId()))
				: new GripSpec(desk.topThicknessMm(), desk.edgeThicknessMm());
	}

	private FootprintSpec deskTopFootprintOf(JudgmentDeskRequest desk) {
		return desk.specSource() == SpecSource.PRODUCT
				? ProductSpecs.deskTopFootprintOf(loadDeskProduct(desk.productId()))
				: new FootprintSpec(desk.widthMm(), desk.depthMm());
	}

	private Desk loadDeskProduct(Long productId) {
		Product product = products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(
						() -> new BusinessException(PlacementErrorCode.PLACEMENT_UNKNOWN_PRODUCT));
		if (!(product instanceof Desk desk)) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_DESK_PRODUCT);
		}
		return desk;
	}

	private Map<String, JudgmentItemRequest> indexByRef(List<JudgmentItemRequest> items) {
		Map<String, JudgmentItemRequest> byRef = LinkedHashMap.newLinkedHashMap(items.size());
		for (JudgmentItemRequest item : items) {
			if (byRef.put(item.ref(), item) != null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_DUPLICATE_ITEM_REF);
			}
			if (item.ref().equals(item.mountedToRef())) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_MOUNT);
			}
		}
		return byRef;
	}

	private Map<Long, Product> loadProducts(List<JudgmentItemRequest> items) {
		Set<Long> productIds =
				items.stream().map(JudgmentItemRequest::productId).collect(Collectors.toSet());
		Map<Long, Product> byId = products.findAllById(productIds).stream()
				.filter(product -> !product.isDeleted())
				.collect(Collectors.toMap(Product::getId, product -> product));
		if (byId.size() != productIds.size()) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_UNKNOWN_PRODUCT);
		}
		return byId;
	}
}
