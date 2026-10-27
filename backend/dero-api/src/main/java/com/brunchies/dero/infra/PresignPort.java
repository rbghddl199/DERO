package com.brunchies.dero.infra;

/**
 * presigned URL 발급 포트 — 오브젝트 스토리지 포트({@link StoragePort})와 짝을 이룬다.
 *
 * <p>도메인 서비스는 이 인터페이스만 안다. 구현은 {@code app.storage.mode}로 갈린다 —
 * {@code s3}면 {@link S3PresignService}(AWS SDK 서명), {@code local}이면
 * {@link LocalPresignService}(WAS가 직접 서명하고 {@link LocalFileController}가 받는다).
 * S3 자격증명이 없는 로컬·S3 미배포 운영에서도 2단계 업로드 흐름을 그대로 돌리기 위한 분리다.
 */
public interface PresignPort {

	/** 업로드용 presigned PUT URL. */
	String presignUpload(String key, String contentType);

	/** 조회용 presigned GET URL. */
	String presignGet(String key);
}
