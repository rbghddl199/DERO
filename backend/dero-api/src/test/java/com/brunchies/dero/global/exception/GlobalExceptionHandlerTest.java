package com.brunchies.dero.global.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 시큐리티 없이 전역 예외 → {@code ProblemDetail} 변환만 검증한다.
 *
 * <p>{@code addFilters = false}가 필수다 — {@code @WebMvcTest}는 우리 {@code SecurityConfig}를 안 써도
 * 시큐리티 기본 체인을 붙이므로, 끄지 않으면 전부 401(POST는 CSRF로 403)이 되어 advice에 도달하지 못한다.
 */
@WebMvcTest(controllers = ProblemDetailTestController.class)
@AutoConfigureMockMvc(addFilters = false)
class GlobalExceptionHandlerTest {

	@Autowired
	MockMvc mockMvc;

	@Test
	@DisplayName("BusinessException은 선언된 status + code·한국어 detail·instance로 나간다")
	void businessException() throws Exception {
		mockMvc.perform(get("/test/business"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(404))
				.andExpect(jsonPath("$.code").value("SAMPLE_NOT_FOUND"))
				.andExpect(jsonPath("$.detail").value("샘플을 찾을 수 없습니다."))
				.andExpect(jsonPath("$.instance").value("/test/business"))
				// title은 상태 코드 reason phrase로 자동 채워진다.
				.andExpect(jsonPath("$.title").value("Not Found"))
				// type은 about:blank일 때 Spring이 바디에서 생략한다(RFC 9457 기본값 = 부재).
				// ADR-0008 예시 JSON은 이 필드를 적어 뒀지만 실제 와이어에는 안 실린다.
				.andExpect(jsonPath("$.type").doesNotExist());
	}

	@Test
	@DisplayName("검증 실패는 400 INVALID_INPUT + errors 배열이고, 한 필드의 오류 2개를 둘 다 담는다")
	void methodArgumentNotValid() throws Exception {
		mockMvc.perform(post("/test/samples")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\":\"\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"))
				.andExpect(jsonPath("$.detail").value("입력값이 올바르지 않습니다."))
				.andExpect(jsonPath("$.instance").value("/test/samples"))
				// @NotBlank와 @Size가 같은 필드에서 동시에 깨진다 — 맵이면 하나를 잃는다.
				.andExpect(jsonPath("$.errors.length()").value(2))
				.andExpect(jsonPath("$.errors[0].field").value("name"))
				.andExpect(jsonPath("$.errors[1].field").value("name"))
				.andExpect(jsonPath("$.errors[0].reason").exists())
				.andExpect(jsonPath("$.errors[1].reason").exists());
	}

	@Test
	@DisplayName("경로 변수 타입 불일치는 400 INVALID_INPUT + 한국어 reason이 담긴 errors 배열로 나간다")
	void typeMismatch() throws Exception {
		mockMvc.perform(get("/test/samples/abc"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"))
				.andExpect(jsonPath("$.detail").value("입력값이 올바르지 않습니다."))
				.andExpect(jsonPath("$.instance").value("/test/samples/abc"))
				.andExpect(jsonPath("$.errors.length()").value(1))
				.andExpect(jsonPath("$.errors[0].field").value("id"))
				.andExpect(jsonPath("$.errors[0].reason").value("숫자 형식이어야 합니다."));
	}

	/**
	 * 회귀 방어. 프레임워크 기본 detail은
	 * {@code "Failed to convert value of type 'java.lang.String' to required type 'java.lang.Long'"}처럼
	 * 영어 + 내부 타입명을 사용자 화면에 뿌린다.
	 */
	@Test
	@DisplayName("타입 불일치 응답 바디에 내부 타입명이 새지 않는다")
	void typeMismatchDoesNotLeakInternalType() throws Exception {
		String body = mockMvc.perform(get("/test/samples/abc"))
				.andReturn()
				.getResponse()
				.getContentAsString(StandardCharsets.UTF_8);

		assertThat(body)
				.doesNotContain("java.lang.")
				.doesNotContain("Failed to convert");
	}

	@Test
	@DisplayName("OffsetDateTime 응답 필드는 오프셋을 포함한 ISO-8601로 직렬화된다")
	void offsetDateTimeSerialization() throws Exception {
		mockMvc.perform(get("/test/time"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.createdAt").value("2026-07-27T14:12:00+09:00"));
	}

	/**
	 * {@code spring.mvc.problemdetails.enabled}(Boot 4.1 기본값 false)를 켤 필요가 없다는 증거다.
	 * 그 속성이 만드는 빈은 {@code @ConditionalOnMissingBean(ResponseEntityExceptionHandler.class)}라
	 * 우리 advice가 있으면 어차피 물러난다.
	 */
	@Test
	@DisplayName("없는 경로 404도 우리 advice(ResponseEntityExceptionHandler)를 타 ProblemDetail로 나간다")
	void notFoundIsProblemDetail() throws Exception {
		mockMvc.perform(get("/test/no-such-path"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(404))
				.andExpect(jsonPath("$.title").value("Not Found"));
	}

	@Test
	@DisplayName("예상 못 한 예외는 500 INTERNAL_ERROR + 일반 문구로 나간다")
	void unexpectedException() throws Exception {
		mockMvc.perform(get("/test/boom"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
				.andExpect(jsonPath("$.detail").value("서버 오류가 발생했습니다."));
	}

	/**
	 * 여기서 로그를 검증하는 이유: 2026-08-06까지 {@code handleBusinessException}은 아무것도 남기지
	 * 않았고, 그래서 5xx {@code ErrorCode}(503 검색 불가 등)가 나가도 <b>Kibana에 흔적이 0이었다</b>.
	 * 응답 코드만 보는 테스트로는 이 회귀가 안 잡힌다 — 로그가 사라져도 200/503은 그대로다.
	 *
	 * <p><b>appender를 손으로 붙이지 않고 stdout을 본다.</b> {@code LoggerFactory.getLogger}로 로거를
	 * 꺼내는 것은 규칙 9({@code .claude/rules/java/architecture.md})가 BAD로 박아 둔 줄과 글자가 같아,
	 * 여기서의 의도(로그를 찍는 것이 아니라 받아내는 것)와 무관하게 다음 사람에게는 규칙 위반으로
	 * 보인다. 게다가 <b>stdout이 실제 수집 경로다</b>(ECS JSON → docker json-file → Filebeat →
	 * {@code app-logs-*}) — 거기서 확인하는 편이 Kibana에 무엇이 들어가는지에 더 가깝다.
	 */
	@Nested
	@ExtendWith(OutputCaptureExtension.class)
	@DisplayName("BusinessException 로깅")
	class BusinessExceptionLogging {

		@Test
		@DisplayName("4xx는 로그를 남기지 않는다 — 정상 거절이 대시보드를 덮으면 안 된다")
		void clientErrorIsNotLogged(CapturedOutput output) throws Exception {
			mockMvc.perform(get("/test/business")).andExpect(status().isNotFound());

			assertThat(output).doesNotContain("서버 오류 응답");
		}

		@Test
		@DisplayName("5xx는 ERROR로 남고 예외가 스택 트레이스로 붙는다")
		void serverErrorIsLoggedWithThrowable(CapturedOutput output) throws Exception {
			mockMvc.perform(get("/test/business-5xx"))
					.andExpect(status().isServiceUnavailable());

			assertThat(output)
					.contains("ERROR")
					.contains("서버 오류 응답: GET /test/business-5xx code=SAMPLE_UNAVAILABLE")
					// throwable을 마지막 인자로 넘겼는지 — getMessage()만 붙이면 스택이 아예 안 찍히고
					// ES의 error.stack_trace가 통째로 빈다(architecture.md 규칙 9).
					.contains("com.brunchies.dero.global.exception.BusinessException: SAMPLE_UNAVAILABLE")
					.contains("at com.brunchies.dero.global.exception.ProblemDetailTestController.business5xx");
		}
	}
}
