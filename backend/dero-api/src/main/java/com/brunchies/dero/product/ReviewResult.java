package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 운영진 검수 <b>결과</b> — {@code PUT /admin/products/{id}/review} 본문의 {@code result}.
 *
 * <p><b>{@link ReviewStatus}를 그대로 받지 않는다.</b> 저쪽은 {@code PENDING}을 포함한 <b>상태</b>라
 * 검수 요청 본문으로 쓰면 "검수 결과: 대기"라는 값이 문법적으로 합법이 된다. 결과는 둘뿐이다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ReviewResult {
	APPROVED("승인. 에셋이 전체 라이브러리에 노출된다."),
	REJECTED("반려. review_note에 사유를 남긴다.");

	private final String description;
}
