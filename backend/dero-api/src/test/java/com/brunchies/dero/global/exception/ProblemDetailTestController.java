package com.brunchies.dero.global.exception;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 테스트 전용 컨트롤러. 도메인 컨트롤러가 아직 0개라 전역 층을 태울 대상이 필요하다.
 * 프로덕션 코드에서 참조하지 말 것.
 */
@RestController
public class ProblemDetailTestController {

	/** 응답 시각 직렬화 검증용 고정 값 — ADR-0008 결정 7의 예시와 같은 값이다. */
	static final OffsetDateTime FIXED_TIME =
			OffsetDateTime.of(2026, 7, 27, 14, 12, 0, 0, ZoneOffset.ofHours(9));

	/** 도메인 enum 예시. 실제 도메인 코드는 각 도메인 패키지에 둔다(ADR-0008 결정 3). */
	@Getter
	@Accessors(fluent = true)
	@AllArgsConstructor(access = AccessLevel.PRIVATE)
	enum TestErrorCode implements ErrorCode {
		SAMPLE_NOT_FOUND(HttpStatus.NOT_FOUND, "샘플을 찾을 수 없습니다."),
		/** 5xx만 로그를 남기는지 보기 위한 짝. 운영의 PRODUCT_SEARCH_UNAVAILABLE과 같은 자리다. */
		SAMPLE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "샘플을 일시적으로 사용할 수 없습니다.");

		private final HttpStatus status;
		private final String detail;

		@Override
		public String code() {
			return name();
		}
	}

	record CreateSampleRequest(@NotBlank @Size(min = 3) String name) {
	}

	record TimeResponse(OffsetDateTime createdAt) {
	}

	@GetMapping("/test/business")
	void business() {
		throw new BusinessException(TestErrorCode.SAMPLE_NOT_FOUND);
	}

	@GetMapping("/test/business-5xx")
	void business5xx() {
		throw new BusinessException(TestErrorCode.SAMPLE_UNAVAILABLE);
	}

	@PostMapping("/test/samples")
	void createSample(@Valid @RequestBody CreateSampleRequest request) {
	}

	/** 타입 불일치 검증용 — {@code Long} 경로 변수에 문자열을 넣으면 바인딩이 깨진다. */
	@GetMapping("/test/samples/{id}")
	void getSample(@PathVariable Long id) {
	}

	@GetMapping("/test/time")
	TimeResponse time() {
		return new TimeResponse(FIXED_TIME);
	}

	@GetMapping("/test/boom")
	void boom() {
		throw new IllegalStateException("의도된 폭발");
	}
}
