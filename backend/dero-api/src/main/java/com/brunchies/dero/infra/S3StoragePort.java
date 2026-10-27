package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.BusinessException;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * {@link StoragePort}의 S3 구현 — {@code app.storage.mode=s3}일 때만 만들어진다
 * ({@link S3PresignService}가 갈리는 것과 같은 관용구).
 *
 * <p><b>이 구현이 없으면 운영에서 상상도가 전부 404였다.</b> 운영은 {@code mode=s3}라 presign이 S3를
 * 가리키는데 {@link StoragePort} 구현이 로컬 디스크뿐이면, GMS가 만든 PNG는 컨테이너 디스크에 쓰이고
 * {@code generated_image} 행만 멀쩡히 들어간다({@code infra/CLAUDE.md}). 즉 이 클래스가
 * {@code app.image.generation.mode=gms}를 운영에서 켜기 위한 선행 조건이다.
 *
 * <p><b>{@code contentType}은 key의 확장자로 추정한다</b> — 포트 시그니처에 없어서다.
 * {@link LocalFileController}가 내려줄 때 같은 방식으로 추정하는 것과 짝이고, S3는 저장 시점의
 * Content-Type을 그대로 돌려주므로 여기서 안 넣으면 presigned GET이 PNG를
 * {@code application/octet-stream}으로 내려 브라우저가 렌더 대신 다운로드한다.
 */
@Component
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "s3")
public class S3StoragePort implements StoragePort {

	private final S3Client s3;
	private final String bucket;

	public S3StoragePort(S3Client s3Client, StorageProperties properties) {
		this.s3 = s3Client;
		this.bucket = properties.s3().bucket();
	}

	@Override
	public void store(String key, byte[] bytes) {
		PutObjectRequest request = PutObjectRequest.builder()
				.bucket(bucket)
				.key(key)
				.contentType(contentTypeOf(key))
				.build();
		try {
			s3.putObject(request, RequestBody.fromBytes(bytes));
		} catch (SdkException e) {
			// AWS SDK 예외를 ErrorCode로 번역한다 — 규칙 8이 허용하는 유일한 catch 용도다.
			throw new BusinessException(StorageErrorCode.STORAGE_OBJECT_ACCESS_FAILED);
		}
	}

	@Override
	public Optional<byte[]> load(String key) {
		GetObjectRequest request = GetObjectRequest.builder().bucket(bucket).key(key).build();
		try {
			return Optional.of(s3.getObjectAsBytes(request).asByteArray());
		} catch (NoSuchKeyException e) {
			// 없는 key는 실패가 아니다 — 포트 계약이 Optional.empty()다(LocalFileStoragePort와 같다).
			return Optional.empty();
		} catch (SdkException e) {
			// 위와 같은 번역. NoSuchKeyException이 SdkException의 하위라 순서를 바꾸면 안 된다.
			throw new BusinessException(StorageErrorCode.STORAGE_OBJECT_ACCESS_FAILED);
		}
	}

	@Override
	public void delete(String key) {
		DeleteObjectRequest request = DeleteObjectRequest.builder().bucket(bucket).key(key).build();
		try {
			s3.deleteObject(request);
		} catch (SdkException e) {
			throw new BusinessException(StorageErrorCode.STORAGE_OBJECT_ACCESS_FAILED);
		}
	}

	private static String contentTypeOf(String key) {
		return MediaTypeFactory.getMediaType(key).orElse(MediaType.APPLICATION_OCTET_STREAM).toString();
	}
}
