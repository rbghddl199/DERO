package com.brunchies.dero.image;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/** AI 상상도 도메인 에러 코드(ADR-0008 결정 3). 상태 코드는 ADR-0015 결정 8이 고정한다. */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ImageErrorCode implements ErrorCode {

	/**
	 * 결제가 붙어도 <b>이 코드 문자열은 안 바뀐다</b>(ADR-0015 결정 8) — 프론트 분기가 그대로 산다.
	 */
	IMAGE_QUOTA_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "오늘의 이미지 생성 한도를 모두 사용했습니다. 내일 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
