package com.brunchies.dero.infra;

import java.time.Duration;
import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * {@link PresignPort}의 로컬 구현 — S3 대신 <b>WAS 자신이</b> 서명한 URL을 내주고, 그 URL은
 * {@link LocalFileController}가 받아 로컬 볼륨({@link LocalFileStoragePort})에 넣고 뺀다.
 * S3 자격증명이 없는 로컬 개발과 S3 미배포 운영에서 2단계 업로드 흐름을 그대로 돌리기 위한
 * 구현이고, {@code app.storage.mode=s3}로 바꾸면 {@link S3PresignService}로 갈린다.
 *
 * <p>TTL은 S3 구현과 같은 값을 쓴다(업로드 5분 · 조회 15분) — 모드에 따라 클라이언트가 체감하는
 * 유효 시간이 달라지지 않게 한다.
 */
@Component
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "local", matchIfMissing = true)
public class LocalPresignService implements PresignPort {

	private static final Duration UPLOAD_URL_TTL = Duration.ofMinutes(5);
	private static final Duration DOWNLOAD_URL_TTL = Duration.ofMinutes(15);

	private final LocalFileSigner signer;
	private final String baseUrl;

	public LocalPresignService(LocalFileSigner signer, StorageProperties properties) {
		this.signer = signer;
		this.baseUrl = properties.localBaseUrl();
	}

	/**
	 * {@code contentType}은 서명에 넣지 않는다 — S3는 PUT 헤더와 서명을 묶지만, 여기선 받는 쪽이
	 * 우리 컨트롤러라 Content-Type을 계약으로 강제할 이유가 없다. 시그니처는 포트 계약이라 유지한다.
	 */
	@Override
	public String presignUpload(String key, String contentType) {
		return presign(HttpMethod.PUT.name(), key, UPLOAD_URL_TTL);
	}

	@Override
	public String presignGet(String key) {
		return presign(HttpMethod.GET.name(), key, DOWNLOAD_URL_TTL);
	}

	private String presign(String method, String key, Duration ttl) {
		long expiresAt = Instant.now().plus(ttl).getEpochSecond();
		return UriComponentsBuilder.fromUriString(baseUrl)
				.path(LocalFileController.BASE_PATH)
				.path("/")
				.path(key)
				.queryParam("exp", expiresAt)
				.queryParam("sig", signer.sign(method, key, expiresAt))
				.build()
				.encode()
				.toUriString();
	}
}
