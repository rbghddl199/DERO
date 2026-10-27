package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/**
 * 오브젝트 스토리지 경계의 에러 코드. 앞의 셋은 로컬 서명 URL 경로({@link LocalFileController})가
 * 발행하고 {@code app.storage.mode=s3}면 그 컨트롤러 자체가 없어 한 건도 나오지 않는다.
 * {@link #STORAGE_OBJECT_ACCESS_FAILED}는 반대로 {@code mode=s3}({@link S3StoragePort})만 발행한다.
 */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum StorageErrorCode implements ErrorCode {

	/** 서명이 틀렸거나 {@code exp}가 지났다. 어느 쪽인지 알려주지 않는다 — 대조 공격의 힌트가 된다. */
	STORAGE_SIGNATURE_INVALID(HttpStatus.FORBIDDEN, "잘못되었거나 만료된 파일 주소입니다."),

	/** key에 {@code ..}가 들어왔다(경로 조작). 서명 검증보다 먼저 막는다. */
	STORAGE_INVALID_KEY(HttpStatus.FORBIDDEN, "허용되지 않는 파일 경로입니다."),

	STORAGE_FILE_NOT_FOUND(HttpStatus.NOT_FOUND, "파일을 찾을 수 없습니다."),

	/**
	 * JDK 표준 알고리즘({@code HmacSHA256})과 임의 길이 키라 실제로는 도달할 수 없다. 검사 예외를
	 * 삼키지 않으면서 응답 형식만이라도 지키려고 둔 500 상수다 — ADR-0012 결정 4가
	 * {@code IllegalStateException} 대신 이 형태를 택했다({@code PRODUCT_IMAGE_NOT_OWNED} 선례).
	 */
	STORAGE_SIGN_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "파일 주소 서명에 실패했습니다."),

	/**
	 * S3 호출이 실패했다({@link S3StoragePort}). 502인 이유는 실패의 주체가 우리가 아니라 상류이기
	 * 때문이다 — {@link ImageGenerationErrorCode#IMAGE_GENERATION_FAILED}와 같은 결이다.
	 * 없는 key는 여기에 해당하지 않는다 — 포트 계약이 {@code Optional.empty()}다.
	 */
	STORAGE_OBJECT_ACCESS_FAILED(HttpStatus.BAD_GATEWAY, "파일 저장소 접근에 실패했습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
