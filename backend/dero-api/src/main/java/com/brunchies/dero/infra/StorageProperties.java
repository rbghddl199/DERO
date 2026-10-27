package com.brunchies.dero.infra;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.storage.*} 프로퍼티 바인딩 — 로컬 디스크·S3 설정을 한 곳에 모은다.
 *
 * @param mode {@code local}(기본) 또는 {@code s3}. {@link PresignPort} 구현체 선택 스위치다 —
 *     {@link LocalPresignService}·{@link LocalFileController}와 {@link S3PresignService}가
 *     이 값의 {@code @ConditionalOnProperty}로 갈린다.
 * @param localSignSecret {@code mode=local}의 서명 키({@link LocalFileSigner}). 로컬·검증용
 *     기본값이 공통 yaml에 박혀 있다 — S3 없이 도는 동안의 임시 값이라 운영 시크릿으로 쓰지 않는다.
 * @param localBaseUrl {@code mode=local}이 발급하는 URL의 오리진.
 * @param publicBaseUrl 이미지 안정 공개 URL의 오리진(ADR-0035, {@link PublicImageUrlResolver}).
 *     모드와 무관하게 항상 우리 서비스 도메인이다 — presign과 달리 스토리지가 아니라 WAS가
 *     응답하는 주소라서다. 운영 값은 prod 프로파일이 덮는다.
 */
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(
		String mode,
		String localDir,
		String localSignSecret,
		String localBaseUrl,
		String publicBaseUrl,
		S3 s3) {

	public record S3(String bucket, String region, String accessKey, String secretKey) {}
}
