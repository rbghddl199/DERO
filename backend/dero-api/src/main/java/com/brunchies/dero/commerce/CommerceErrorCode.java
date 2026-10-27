package com.brunchies.dero.commerce;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/** 구매 도메인 에러 코드(ADR-0008 결정 3). 상태 코드 배정은 그 규칙표를 따른다. */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum CommerceErrorCode implements ErrorCode {

	/**
	 * <b>남의 장바구니 항목도 여기로 온다 — 403이 아니라 404다.</b> 소유자 조건이 조회 쿼리 안에
	 * 있어서 남의 행은 애초에 안 잡히고, 403으로 답하면 "그 id의 항목이 존재한다"를 흘린다
	 * (북마크 그룹과 같은 규칙).
	 */
	CART_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "장바구니 항목을 찾을 수 없습니다."),
	CART_ITEM_UNKNOWN_PRODUCT(HttpStatus.BAD_REQUEST, "존재하지 않는 제품은 담을 수 없습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
