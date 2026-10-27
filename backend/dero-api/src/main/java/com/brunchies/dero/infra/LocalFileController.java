package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * <b>로컬 presign 구현체({@link LocalPresignService})의 짝 — S3 전환 시 {@code app.storage.mode=s3}로
 * 비활성된다.</b> 브라우저가 S3에 직접 올리는 자리를 WAS가 대신 받아 로컬 볼륨에 넣고 뺀다.
 *
 * <p>도메인 컨트롤러가 아니라서 {@code <도메인>/controller/}가 아니라 {@code infra}에 산다 —
 * 발급기와 수신기가 한 몸이고(서명 규칙을 공유한다) 도메인 어휘를 하나도 모른다.
 *
 * <p>인가는 서명이 전부다. {@code exp}가 지났거나 {@code sig}가 안 맞으면 403이고,
 * key에 {@code ..}가 있으면 서명 검증 이전에 403이다 — {@link LocalFileStoragePort}는 key를
 * {@code baseDir}에 그대로 resolve하므로 여기가 유일한 경로 조작 방어선이다.
 */
@RestController
@RequestMapping(LocalFileController.BASE_PATH)
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "local", matchIfMissing = true)
@RequiredArgsConstructor
public class LocalFileController {

	/** {@link LocalPresignService}가 URL을 조립할 때 쓴다 — 두 곳에 적으면 조용히 갈린다. */
	public static final String BASE_PATH = "/api/v1/local-files";

	private final LocalFileSigner signer;
	private final LocalFileStoragePort storage;

	/** presigned PUT의 수신부. S3 PUT object와 같이 200이다(생성 리소스에 대한 API가 아니라 저장 자체). */
	@PutMapping("/{*key}")
	public ResponseEntity<Void> upload(
			@PathVariable String key,
			@RequestParam long exp,
			@RequestParam String sig,
			@RequestBody byte[] body) {
		storage.store(verified(HttpMethod.PUT.name(), key, exp, sig), body);
		return ResponseEntity.ok().build();
	}

	/** presigned GET의 수신부. Content-Type은 key의 확장자로 추정한다(저장 시 헤더를 남기지 않는다). */
	@GetMapping("/{*key}")
	public ResponseEntity<byte[]> download(
			@PathVariable String key,
			@RequestParam long exp,
			@RequestParam String sig) {
		String objectKey = verified(HttpMethod.GET.name(), key, exp, sig);
		byte[] bytes = storage.load(objectKey)
				.orElseThrow(() -> new BusinessException(StorageErrorCode.STORAGE_FILE_NOT_FOUND));
		return ResponseEntity.ok()
				.contentType(MediaTypeFactory.getMediaType(objectKey).orElse(MediaType.APPLICATION_OCTET_STREAM))
				.body(bytes);
	}

	/** {@code {*key}}는 앞의 {@code /}까지 잡아 오므로 떼고 나서 검사한다. */
	private String verified(String method, String rawKey, long exp, String sig) {
		String key = rawKey.startsWith("/") ? rawKey.substring(1) : rawKey;
		if (key.isBlank() || key.contains("..")) {
			throw new BusinessException(StorageErrorCode.STORAGE_INVALID_KEY);
		}
		if (!signer.isValid(method, key, exp, sig)) {
			throw new BusinessException(StorageErrorCode.STORAGE_SIGNATURE_INVALID);
		}
		return key;
	}
}
