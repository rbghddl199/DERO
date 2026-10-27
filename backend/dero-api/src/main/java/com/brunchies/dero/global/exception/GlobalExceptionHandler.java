package com.brunchies.dero.global.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 전역 예외 → {@link ProblemDetail} 변환. {@link ResponseEntityExceptionHandler}를 상속하므로
 * 404·405·415·타입 불일치는 프레임워크 기본 동작이 그대로 {@code ProblemDetail}로 나간다 —
 * 손으로 핸들러를 추가하지 않는다.
 *
 * <p>이 빈이 있으면 Boot의 {@code ProblemDetailsExceptionHandler} 자동 구성은
 * {@code @ConditionalOnMissingBean(ResponseEntityExceptionHandler.class)}로 물러난다. 그래서
 * {@code spring.mvc.problemdetails.enabled}(Boot 4.1 기본값 false)를 켤 필요가 없다.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	/** {@code Number.class.isAssignableFrom}이 못 잡는 원시 타입들. */
	private static final Set<Class<?>> NUMERIC_PRIMITIVES = Set.of(
			byte.class, short.class, int.class, long.class, float.class, double.class);

	/**
	 * <b>5xx만 로그를 남긴다.</b> 4xx는 사용자 입력이 틀린 것이라 정상 흐름이고, ERROR로 찍으면
	 * 대시보드가 정상 거절로 덮여 진짜 장애가 안 보인다. 반대로 5xx를 안 남기면 클라이언트는
	 * 5xx를 받는데 Kibana에는 흔적이 하나도 없다 — 2026-08-06까지 실제로 그랬다
	 * ({@code docs/context/observability.md} §6).
	 *
	 * <p>예외를 <b>마지막 인자로</b> 넘겨 스택 트레이스를 남긴다(규칙:
	 * {@code .claude/rules/java/architecture.md} §9). {@code getMessage()}만 붙이면 프레임이 사라진다.
	 */
	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<ProblemDetail> handleBusinessException(
			BusinessException ex, HttpServletRequest request) {
		ErrorCode errorCode = ex.getErrorCode();
		if (errorCode.status().is5xxServerError()) {
			log.error("서버 오류 응답: {} {} code={}",
					request.getMethod(), request.getRequestURI(), errorCode.code(), ex);
		}
		ProblemDetail body = ProblemDetails.of(errorCode, request);
		if (!ex.getErrors().isEmpty()) {
			body.setProperty("errors", ex.getErrors());
		}
		return ResponseEntity.status(errorCode.status()).body(body);
	}

	/**
	 * 필터 층에서 잡아야 하는 예외다. 아래 {@code Exception} 캐치올이 삼키면 403이 500으로 바뀌므로
	 * 다시 던져 {@code ExceptionTranslationFilter}까지 올려보낸다. (지금은
	 * {@code authorizeHttpRequests}만 쓰므로 도달하지 않지만, method security를 켜면 즉시 경로가 열린다.)
	 */
	@ExceptionHandler(AccessDeniedException.class)
	public void rethrowAccessDenied(AccessDeniedException ex) throws AccessDeniedException {
		throw ex;
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ProblemDetail> handleUnexpectedException(
			Exception ex, HttpServletRequest request) {
		log.error("처리되지 않은 예외: {} {}", request.getMethod(), request.getRequestURI(), ex);
		return ResponseEntity.status(CommonErrorCode.INTERNAL_ERROR.status())
				.body(ProblemDetails.of(CommonErrorCode.INTERNAL_ERROR, request));
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(
			MethodArgumentNotValidException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {
		ProblemDetail body = ProblemDetails.of(
				CommonErrorCode.INVALID_INPUT, ((ServletWebRequest) request).getRequest());
		List<FieldErrorDetail> errors = ex.getBindingResult().getFieldErrors().stream()
				.map(fieldError ->
						new FieldErrorDetail(fieldError.getField(), fieldError.getDefaultMessage()))
				.toList();
		body.setProperty("errors", errors);
		return ResponseEntity.status(CommonErrorCode.INVALID_INPUT.status())
				.headers(headers)
				.body(body);
	}

	/**
	 * 바인딩 타입 불일치(예: {@code Long} 경로 변수에 {@code abc}). 프레임워크 기본 detail은
	 * {@code "Failed to convert 'id' with value: 'abc'"}처럼 <b>영어</b>이고 {@code code} 확장 필드도 없어
	 * ADR-0008 결정 2·3(한국어 detail + 안정된 코드 키)을 위반한다. 그래서 404·405·415와 달리 여기는
	 * 오버라이드한다.
	 *
	 * <p>{@code reason}에 기대 타입 이름({@code java.lang.Long})을 넣지 않는다 — 내부 타입 노출이다.
	 * 원본 메시지는 로그로만 남긴다.
	 */
	@Override
	protected ResponseEntity<Object> handleTypeMismatch(
			TypeMismatchException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {
		log.warn("요청 값 타입 불일치: {}", ex.getMessage());
		ProblemDetail body = ProblemDetails.of(
				CommonErrorCode.INVALID_INPUT, ((ServletWebRequest) request).getRequest());
		// 경로 변수·쿼리 파라미터는 MethodArgumentTypeMismatchException이라 파라미터 이름을 뽑을 수 있다.
		String field = (ex instanceof MethodArgumentTypeMismatchException mismatch)
				? mismatch.getName()
				: ex.getPropertyName();
		body.setProperty("errors", List.of(new FieldErrorDetail(field, reasonFor(ex.getRequiredType()))));
		return ResponseEntity.status(CommonErrorCode.INVALID_INPUT.status())
				.headers(headers)
				.body(body);
	}

	private static String reasonFor(Class<?> requiredType) {
		if (requiredType != null
				&& (Number.class.isAssignableFrom(requiredType) || NUMERIC_PRIMITIVES.contains(requiredType))) {
			return "숫자 형식이어야 합니다.";
		}
		return "값의 형식이 올바르지 않습니다.";
	}
}
