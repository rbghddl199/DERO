package com.brunchies.dero.catalog;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/**
 * 마스터 6종 관리자 CRUD의 에러 코드(`docs/context/api-spec.md` §9 마스터 6종 확장).
 *
 * <p>도메인 접두는 상수명 자체에 넣는다(ADR-0012 결정 6) — {@code code()}는 {@code name()}이다.
 *
 * <p><b>이름 충돌이 409인 이유</b>: 마스터 6종은 전부 부분 유니크 인덱스
 * ({@code WHERE deleted_at IS NULL})를 갖는다. DB에 맡기면 {@code DataIntegrityViolationException}이
 * 그대로 500으로 나가므로 저장 전에 {@code exists}로 먼저 막고 여기 상수로 번역한다.
 */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum CatalogErrorCode implements ErrorCode {

	CATALOG_BRAND_NOT_FOUND(HttpStatus.NOT_FOUND, "브랜드를 찾을 수 없습니다."),

	CATALOG_BRAND_NAME_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 브랜드명입니다."),

	/** 삭제 게이트 — 소프트 삭제라 FK는 안 깨지지만 제품 목록·필터가 죽은 브랜드를 계속 가리키게 된다. */
	CATALOG_BRAND_IN_USE(HttpStatus.CONFLICT, "제품이 참조 중인 브랜드는 삭제할 수 없습니다."),

	CATALOG_CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND, "카테고리를 찾을 수 없습니다."),

	CATALOG_CATEGORY_PARENT_NOT_FOUND(HttpStatus.NOT_FOUND, "상위 카테고리를 찾을 수 없습니다."),

	/**
	 * 자기 자신을 상위로 지정했거나 자기 하위 트리 안으로 옮기려 했다. 값 자체는 멀쩡한 id라 400이
	 * 아니라 422다({@code PRODUCT_SPEC_TYPE_IMMUTABLE}와 같은 자리).
	 */
	CATALOG_CATEGORY_PARENT_INVALID(
			HttpStatus.UNPROCESSABLE_ENTITY, "카테고리를 자기 자신이나 하위 카테고리의 아래로 옮길 수 없습니다."),

	CATALOG_CATEGORY_IN_USE(HttpStatus.CONFLICT, "제품이 참조 중인 카테고리는 삭제할 수 없습니다."),

	/** 자식을 남기고 부모만 지우면 그 자식들이 트리에서 떨어져 나와 탐색 UI에서 사라진다. */
	CATALOG_CATEGORY_HAS_CHILDREN(HttpStatus.CONFLICT, "하위 카테고리가 있는 카테고리는 삭제할 수 없습니다."),

	CATALOG_VIBE_NOT_FOUND(HttpStatus.NOT_FOUND, "분위기 태그를 찾을 수 없습니다."),

	CATALOG_VIBE_NAME_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 분위기 태그입니다."),

	CATALOG_HASHTAG_NOT_FOUND(HttpStatus.NOT_FOUND, "해시태그를 찾을 수 없습니다."),

	/** 같은 이름이 두 행으로 갈리면 태그 검색 결과가 반으로 쪼개진다(erd.md {@code hashtag} 절). */
	CATALOG_HASHTAG_NAME_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 해시태그입니다."),

	CATALOG_VESA_SPEC_NOT_FOUND(HttpStatus.NOT_FOUND, "VESA 규격을 찾을 수 없습니다."),

	/** 유니크가 이름이 아니라 {@code (width_mm, height_mm)} 쌍이다 — 마스터 6종 중 여기만 갈린다. */
	CATALOG_VESA_SPEC_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 VESA 홀 간격입니다."),

	CATALOG_DESK_TEXTURE_NOT_FOUND(HttpStatus.NOT_FOUND, "상판 재질을 찾을 수 없습니다."),

	CATALOG_DESK_TEXTURE_NAME_DUPLICATED(HttpStatus.CONFLICT, "이미 등록된 상판 재질명입니다."),

	/** 브랜드 로고 presign — 업로드될 바이트를 볼 수 없으니 선언된 {@code contentType}만이라도 막는다. */
	CATALOG_INVALID_IMAGE_CONTENT_TYPE(HttpStatus.BAD_REQUEST, "이미지 파일만 업로드할 수 있습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
