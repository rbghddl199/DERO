package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/**
 * AI 상상도 생성 포트({@link ImageGenerationPort})의 에러 코드.
 *
 * <p>이 예외는 지금 사용자 응답으로 나가지 않는다 — 생성은 큐 소비 쪽에서 돌고,
 * {@code ImagePublishWorker}가 받아 배치를 {@code FAILED}로 옮긴다. 그래도 {@code ErrorCode}로
 * 던지는 이유는 도메인 코드가 {@code RuntimeException} 원본을 그대로 흘리지 않는다는 규칙
 * (ADR-0008, 아키텍처 규칙 4·8)이 이 경계에도 그대로 적용되기 때문이고, 나중에 "생성 상태 조회"
 * 같은 API가 붙는 날 이 코드가 그대로 응답에 실린다.
 */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ImageGenerationErrorCode implements ErrorCode {

	/**
	 * 외부 생성 API가 실패했거나 약속과 다른 응답을 줬다. 502인 이유는 실패의 주체가 우리가 아니라
	 * 상류이기 때문이다 — 사용자 입력 문제가 아니므로 4xx가 아니다.
	 */
	IMAGE_GENERATION_FAILED(HttpStatus.BAD_GATEWAY, "상상도 생성에 실패했습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
