package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.SpecType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * {@code PATCH /admin/products/{id}} 요청 — 규격·메타데이터 부분 수정(REQ-ADM-02).
 *
 * <p><b>NULL은 "안 바꾼다"는 뜻이다.</b> 그래서 nullable 필드를 다시 NULL로 되돌리는 것은 이 경로로
 * 할 수 없다(예: {@code description} 지우기). 부분 수정에서 "누락"과 "명시적 null"을 가르려면
 * 필드마다 {@code JsonNullable} 같은 래퍼가 필요한데, 그 요구가 실제로 온 적이 없어 지금 사지 않는다.
 *
 * <p><b>{@code specType}은 받되 바꿀 수 없다.</b> 아예 안 받으면 클라이언트가 잘못된 규격 객체를
 * 보냈을 때 조용히 무시되고, 받아서 검사하면 {@code PRODUCT_SPEC_TYPE_IMMUTABLE}(422)로 시끄럽게
 * 실패한다. 규격 종류를 바꾸려면 {@code product} 행을 지우고 새로 만들어야 하는데 그 순간
 * {@code placed_item}·{@code cart_item}·{@code product_like}가 전부 끊어진다(ADR-0006 결정 4).
 *
 * <p><b>{@code source}는 이 경로가 다루지 않는다</b> — 출처가 바뀌면 필수 컬럼 규칙이 통째로
 * 뒤집힌다(erd.md {@code product} 절의 source별 필수 표).
 *
 * <p><b>{@code status}는 여기서 다룬다</b>(2026-07-31 추가) — 카탈로그 노출 축이라 축이 다르긴
 * 하지만, 값이 2개뿐인 열거를 위해 하위 리소스를 따로 파면(§1 규칙 1⑴) 관리자 수정 폼이 한 화면의
 * 저장을 두 번의 요청으로 나눠야 하고 그 사이에 반쪽만 반영된 상태가 생긴다. 전이 자체는 여전히
 * 엔티티가 갖는다 — 서비스가 {@code Product.hide()}·{@code activate()}를 부른다. 잘못된 값은 enum
 * 바인딩이 400으로 거른다.
 *
 * <p><b>{@code vesaSpecIds}에는 {@code JsonNullable}이 필요 없다</b> — 리스트는 {@code []}로 "비움"을
 * 직접 표현할 수 있어서 위 첫 문단의 딜레마(누락 vs 명시적 null)가 생기지 않는다. NULL은 다른 필드와
 * 같이 "안 바꾼다"이고, 빈 배열은 "전부 뗀다"다. {@code vesaSpecIds}가 최상위인 사유는
 * {@link AdminProductCreateRequest} 참고.
 *
 * @param vesaSpecIds VESA 태깅 교체. <b>{@code MONITOR}·{@code ARM}에만 유효하다</b> — 다른 규격에
 *     값을 실으면 {@code PRODUCT_VESA_NOT_APPLICABLE}(422)이다. NULL은 안 바꾸고, 빈 배열은 전부 뗀다
 */
public record AdminProductPatchRequest(
		SpecType specType,
		Long brandId,
		Long categoryId,
		@Size(max = 200) String name,
		String description,
		@Positive Integer priceKrw,
		@Size(max = 2048) String productUrl,
		ProductStatus status,
		List<Long> vesaSpecIds,
		@Valid DeskSpecRequest desk,
		@Valid MonitorSpecRequest monitor,
		@Valid ArmSpecRequest arm,
		@Valid LightSpecRequest light,
		@Valid PropSpecRequest prop) {
}
