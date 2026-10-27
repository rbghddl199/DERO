package com.brunchies.dero.product;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ProductErrorCode implements ErrorCode {

	PRODUCT_NOT_FOUND(HttpStatus.NOT_FOUND, "제품을 찾을 수 없습니다."),

	PRODUCT_INVALID_IMAGE_CONTENT_TYPE(
			HttpStatus.BAD_REQUEST, "이미지 파일만 업로드할 수 있습니다."),

	/**
	 * 호출부 버그다 — 다른 제품의 이미지를 루트에 붙이려 한 것이라 사용자 입력으로는 도달할 수 없다.
	 * ADR-0012 결정 4가 "호출부 버그는 {@code IllegalStateException}" 안을 버리고 <b>500짜리
	 * {@code ErrorCode} 상수</b>로 표현하기로 했다 — 그래야 응답 형식이라도 일관된다.
	 */
	PRODUCT_IMAGE_NOT_OWNED(HttpStatus.INTERNAL_SERVER_ERROR, "제품에 속하지 않은 이미지입니다."),

	/** 관리자 등록·수정이 참조한 마스터가 없다. 도메인 접두는 {@code PRODUCT_}로 통일한다(ADR-0012 결정 6). */
	PRODUCT_BRAND_NOT_FOUND(HttpStatus.NOT_FOUND, "브랜드를 찾을 수 없습니다."),

	PRODUCT_CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND, "카테고리를 찾을 수 없습니다."),

	PRODUCT_DESK_TEXTURE_NOT_FOUND(HttpStatus.NOT_FOUND, "상판 재질을 찾을 수 없습니다."),

	/** 태깅하려는 VESA 규격 마스터가 없다. 소프트 삭제된 규격도 <b>없는 것</b>으로 본다. */
	PRODUCT_VESA_SPEC_NOT_FOUND(HttpStatus.NOT_FOUND, "VESA 규격을 찾을 수 없습니다."),

	/**
	 * <b>모니터·암만 VESA를 갖는다</b>(erd.md {@code monitor}·{@code arm} 절). 404가 아니라 422인
	 * 이유는 {@link #PRODUCT_ASSET_NOT_APPLICABLE}과 같다 — 없는 게 아니라 <b>있을 수 없는</b> 것이라
	 * 다시 시도해도 달라지지 않는다. 조용히 무시하지 않는 이유는 {@code PRODUCT_SPEC_BODY_MISMATCH}와
	 * 같다 — 무시하면 "고쳤는데 안 바뀐다"가 된다.
	 */
	PRODUCT_VESA_NOT_APPLICABLE(HttpStatus.UNPROCESSABLE_ENTITY, "VESA 규격을 붙일 수 없는 제품입니다."),

	/**
	 * {@code specType}과 본문의 규격 객체가 어긋났다 — 모니터라면서 {@code desk}를 채웠거나 아무것도
	 * 안 채운 경우다. 다형 요청 스키마(oneOf)가 붙기 전까지 WAS가 이 짝을 강제한다.
	 */
	PRODUCT_SPEC_BODY_MISMATCH(HttpStatus.BAD_REQUEST, "규격 타입과 규격 본문이 일치하지 않습니다."),

	/**
	 * {@code spec_type}은 변경할 수 없다(ADR-0006 결정 4) — JPA가 엔티티 타입 변경을 지원하지 않아
	 * 행을 지우고 새로 만들어야 하고, 그 순간 {@code placed_item}·{@code cart_item}·
	 * {@code product_like}가 전부 끊어진다.
	 */
	PRODUCT_SPEC_TYPE_IMMUTABLE(HttpStatus.UNPROCESSABLE_ENTITY, "제품의 규격 타입은 바꿀 수 없습니다."),

	/**
	 * 검수 대상은 {@code asset}인데 행이 없다 — 책상·모니터는 규격값으로 절차 생성하므로 {@code asset}
	 * 행이 없다(D18, 2026-08-02 재개정).
	 */
	PRODUCT_ASSET_NOT_FOUND(HttpStatus.UNPROCESSABLE_ENTITY, "검수할 에셋이 없는 제품입니다."),

	/** 사유 없는 반려는 업로더가 무엇을 고쳐야 할지 알 수 없다(REQ-ADM-04). */
	PRODUCT_REVIEW_NOTE_REQUIRED(HttpStatus.BAD_REQUEST, "반려 사유는 필수입니다."),

	PRODUCT_SPEC_CURVATURE_NOT_ALLOWED(
			HttpStatus.UNPROCESSABLE_ENTITY, "평면 모니터에는 곡률 반경을 넣을 수 없습니다."),

	PRODUCT_SPEC_MIC_ARM_INVALID(
			HttpStatus.UNPROCESSABLE_ENTITY,
			"마이크암은 화면 피벗 범위와 VESA 플레이트 분리를 가질 수 없습니다."),

	PRODUCT_SPEC_STAND_ARM_INVALID(
			HttpStatus.UNPROCESSABLE_ENTITY, "자립형 암은 클램프·그로밋·벽 고정을 지원할 수 없습니다."),

	/**
	 * 호출부 버그다 — {@code Product}의 구체 서브타입이 5종 밖이라는 뜻이라 사용자 입력으로는 도달할
	 * 수 없다({@code PRODUCT_IMAGE_NOT_OWNED}와 같은 자리, ADR-0012 결정 4).
	 */
	PRODUCT_UNKNOWN_SPEC_SUBTYPE(HttpStatus.INTERNAL_SERVER_ERROR, "알 수 없는 규격 서브타입입니다."),

	/** 대표 지정 대상 이미지가 그 제품에 없다. */
	PRODUCT_IMAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "제품 이미지를 찾을 수 없습니다."),

	/**
	 * 제품당 실사 이미지 상한({@link Product#MAX_IMAGES}장, REQ-REC-06)을 넘겼다. 행 개수 조건이라
	 * 부분 유니크 인덱스로는 못 막아 WAS가 강제한다(erd.md {@code product_image} 절). 409인 이유는
	 * 요청 본문이 잘못된 게 아니라 <b>제품이 이미 그 상태</b>라서다 — 한 장 지우면 같은 요청이 통한다.
	 */
	PRODUCT_IMAGE_LIMIT_EXCEEDED(HttpStatus.CONFLICT, "제품 실사 이미지는 최대 8장까지 등록할 수 있습니다."),

	/**
	 * 책상·모니터({@code spec_type = DESK}·{@code MONITOR})는 규격값으로 절차 생성하므로 {@code asset}
	 * 행 자체가 없다(D18, 2026-08-02 재개정) — 404가 아니라 422다. 없는 게 아니라 <b>있을 수 없는</b>
	 * 것이라 다시 시도해도 달라지지 않는다.
	 */
	PRODUCT_ASSET_NOT_APPLICABLE(HttpStatus.UNPROCESSABLE_ENTITY, "에셋을 등록할 수 없는 제품입니다."),

	PRODUCT_INVALID_ASSET_CONTENT_TYPE(HttpStatus.BAD_REQUEST, "GLB 파일만 업로드할 수 있습니다."),

	/** part-seg export는 텍스처를 아예 주지 않아 재질을 고를 곳이 {@code finish}밖에 없다(erd.md asset 절). */
	PRODUCT_ASSET_FINISH_REQUIRED(
			HttpStatus.UNPROCESSABLE_ENTITY, "파트 분리 에셋에는 재질 프리셋이 필요합니다."),

	/** {@code TEXTURE}는 재질 정본이 GLB 안의 PBR 텍스처라, 값을 넣으면 어느 쪽이 정본인지 갈린다. */
	PRODUCT_ASSET_FINISH_NOT_ALLOWED(
			HttpStatus.UNPROCESSABLE_ENTITY, "텍스처 에셋에는 재질 프리셋을 넣을 수 없습니다."),

	PRODUCT_EMITTER_DISTRIBUTION_REQUIRED(
			HttpStatus.UNPROCESSABLE_ENTITY, "SPOT 발광체에는 배광 프리셋이 필요합니다."),

	/** {@code POINT}에는 조일 원뿔이 없다 — {@code shape}와 {@code distribution}은 축이 다르다. */
	PRODUCT_EMITTER_DISTRIBUTION_NOT_ALLOWED(
			HttpStatus.UNPROCESSABLE_ENTITY, "POINT 발광체에는 배광 프리셋을 넣을 수 없습니다."),

	/** 두 축만 들어오면 나머지 하나가 조용히 0이 되어 발광점이 제품 밖으로 나간다(erd.md 검증 표). */
	PRODUCT_EMITTER_POINT_PARTIAL(
			HttpStatus.UNPROCESSABLE_ENTITY, "발광 지점 좌표는 세 축을 모두 채우거나 모두 비워야 합니다."),

	/**
	 * 검색 엔진(ES)이 죽었거나 인덱스가 없다. <b>폴백하지 않는다</b>(ADR-0019 결정 6) — Postgres
	 * {@code ILIKE}로 흉내 내면 관련도 순서가 두 벌이 되어 "왜 어제랑 결과가 다르지"를 아무도 풀 수
	 * 없고, 조용한 폴백은 ES가 3일째 죽어 있어도 아무도 모르게 만든다. 카테고리 탐색·목록·상세는
	 * Postgres라 전부 산다 — 죽는 것은 검색 입력창 하나다.
	 */
	PRODUCT_SEARCH_UNAVAILABLE(
			HttpStatus.SERVICE_UNAVAILABLE, "검색을 일시적으로 사용할 수 없습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
