package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.SpecType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * {@code POST /admin/products} 요청 — 운영진 제품 등록(REQ-ADM-01).
 *
 * <p><b>{@code source}를 받지 않는다.</b> 이 경로로 들어온 제품은 정의상 {@code CATALOG}이고
 * {@code USER}는 자작 업로드({@code POST /products})의 몫이다 — 본문으로 받으면 관리자 API로
 * 자작 제품을 만드는 길이 열리고, {@code owner_user_id} 필수 규칙과 충돌한다(erd.md {@code product}
 * 절의 source별 필수 표). 그래서 {@code brandId}·{@code priceKrw}·{@code productUrl}이 무조건 필수다.
 *
 * <p><b>서브타입별 요청 record를 나누는 대신 중첩 optional 객체 5개를 둔다</b>(2026-07-31 판단).
 * 명세(`docs/context/api-spec.md` §5)는 최종적으로 springdoc이 {@code specType} 판별자로
 * {@code oneOf}를 뽑는 그림이지만, 그러려면 요청 본문 타입 자체가 {@code @JsonSubTypes} 다형 계층이
 * 되어야 하고 이 리포지토리엔 그 선례가 0건이다. 다형 역직렬화를 먼저 깔면 실패가 400이 아니라
 * Jackson 예외(500)로 나가고, {@code GlobalExceptionHandler}에 그 경로를 새로 배선해야 한다.
 * 지금은 <b>평평한 본문 + WAS 검증</b>으로 간다 — {@code specType}과 짝이 맞지 않는 규격 객체는
 * {@code PRODUCT_SPEC_BODY_MISMATCH}로 거절된다. oneOf 스키마는 후속 티켓이고, 그때 바뀌는 것은
 * 이 record 하나다(엔티티·서비스 계약은 그대로).
 *
 * <p><b>{@code vesaSpecIds}는 규격 객체 안이 아니라 최상위다</b> — {@code product_vesa}가 스키마상
 * product 레벨 정션이고(erd.md), 응답 쪽({@link ProductDetailResponse})은 id가 아니라 값
 * ({@code width×height})을 실어야 해서 요청과 모양이 달라 한 칸에 못 들어간다.
 * {@code asset}·{@code emitter}·{@code images}와 같은 자리다.
 *
 * @param specType 규격 판별자. 아래 5개 중 <b>이 값에 해당하는 객체 하나만</b> 채운다
 * @param vesaSpecIds VESA 태깅(REQ-CMP-02 판정 입력). <b>{@code MONITOR}·{@code ARM}에만
 *     유효하다</b> — 다른 규격에 값을 실으면 {@code PRODUCT_VESA_NOT_APPLICABLE}(422)이다. NULL이나
 *     빈 배열은 "태깅 없음"이고 어느 규격에나 유효하다(홀 없는 모니터가 있다)
 */
public record AdminProductCreateRequest(
		@NotNull SpecType specType,
		@NotNull Long brandId,
		@NotNull Long categoryId,
		@NotBlank @Size(max = 200) String name,
		String description,
		@NotNull @Positive Integer priceKrw,
		@NotBlank @Size(max = 2048) String productUrl,
		List<Long> vesaSpecIds,
		@Valid DeskSpecRequest desk,
		@Valid MonitorSpecRequest monitor,
		@Valid ArmSpecRequest arm,
		@Valid LightSpecRequest light,
		@Valid PropSpecRequest prop) {
}
