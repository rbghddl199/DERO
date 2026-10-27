package com.brunchies.dero.infra;

import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

/**
 * {@link PresignPort}의 S3 구현 — 업로드는 PUT(브라우저가 직접 S3에 올린다), 조회는 GET(WAS가 응답
 * 조립 시점에 완성 URL을 만든다, {@code docs/context/architecture-map.md} 파일 서빙 결정).
 *
 * <p>{@code app.storage.mode=s3}일 때만 만들어진다. 기본값은 {@code local}이라 S3 자격증명이 없는
 * 로컬·S3 미배포 운영에서는 {@link LocalPresignService}가 대신 배선된다.
 */
@Component
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "s3")
public class S3PresignService implements PresignPort {

	private static final Duration UPLOAD_URL_TTL = Duration.ofMinutes(5);
	private static final Duration DOWNLOAD_URL_TTL = Duration.ofMinutes(15);

	private final S3Presigner s3Presigner;
	private final String bucket;

	public S3PresignService(S3Presigner s3Presigner, StorageProperties properties) {
		this.s3Presigner = s3Presigner;
		this.bucket = properties.s3().bucket();
	}

	@Override
	public String presignUpload(String key, String contentType) {
		PutObjectRequest putObjectRequest = PutObjectRequest.builder()
				.bucket(bucket)
				.key(key)
				.contentType(contentType)
				.build();

		PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
				.signatureDuration(UPLOAD_URL_TTL)
				.putObjectRequest(putObjectRequest)
				.build();

		return s3Presigner.presignPutObject(presignRequest).url().toString();
	}

	@Override
	public String presignGet(String key) {
		GetObjectRequest getObjectRequest = GetObjectRequest.builder()
				.bucket(bucket)
				.key(key)
				.build();

		GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
				.signatureDuration(DOWNLOAD_URL_TTL)
				.getObjectRequest(getObjectRequest)
				.build();

		return s3Presigner.presignGetObject(presignRequest).url().toString();
	}
}
