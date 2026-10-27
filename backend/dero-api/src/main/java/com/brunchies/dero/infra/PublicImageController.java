package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.BusinessException;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 이미지 공개 조회(ADR-0035) — presigned GET을 대체하는 <b>안정 URL</b>의 수신부.
 *
 * <p>presigned GET은 15분 만료 + 조회마다 URL이 달라져 구글봇 색인과 브라우저 캐시가 전부
 * 죽는다. 이 컨트롤러는 key 그대로가 URL이고 응답에 {@code immutable} 캐시를 건다 — key는
 * 업로드마다 uuid로 새로 발급되므로(같은 ADR 결정 3) 내용이 바뀌는 key가 존재하지 않는다.
 *
 * <p>인가가 없다(permitAll) — 대상 프리픽스가 전부 서비스 화면에서 공개 노출되는 이미지고,
 * key에 uuid가 있어 열거가 불가하다(ADR-0035 결정 2). <b>이미지 프리픽스만 연다</b> —
 * GLB·KTX2·약관 MD 등 나머지 오브젝트는 여전히 presigned GET 전용이다.
 *
 * <p>{@code mode=local}·{@code s3} 공통이다({@link StoragePort}가 갈린다). 도메인 컨트롤러가
 * 아니라 {@code infra}에 산다 — {@link LocalFileController}와 같은 이유로 도메인 어휘를
 * 하나도 모른다.
 */
@RestController
@RequestMapping(PublicImageController.BASE_PATH)
@RequiredArgsConstructor
public class PublicImageController {

	/** {@link PublicImageUrlResolver}가 URL을 조립할 때 쓴다 — 두 곳에 적으면 조용히 갈린다. */
	public static final String BASE_PATH = "/api/v1/images";

	/**
	 * 공개 대상 이미지 key 프리픽스 전체(ADR-0035 결정 2). 여기 없는 프리픽스는 403이다 —
	 * 이 목록이 "무엇이 인증 없이 읽히는가"의 정본이므로 프리픽스 신설 시 의도를 갖고 추가한다.
	 */
	private static final Set<String> IMAGE_KEY_PREFIXES = Set.of(
			"profile-images/",
			"placement-thumbnails/",
			"generated-images/",
			"desk-feed-images/",
			"post-images/",
			"product-images/",
			"brand-logos/");

	/** key가 uuid 버전이라 내용 불변 — 1년 + immutable이 안전하다(ADR-0035 결정 3). */
	private static final String CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";

	private final StoragePort storage;

	/** Content-Type은 key의 확장자로 추정한다 — {@link LocalFileController#download}와 같은 판단. */
	@GetMapping("/{*key}")
	public ResponseEntity<byte[]> serve(@PathVariable String key) {
		String objectKey = validated(key);
		byte[] bytes = storage.load(objectKey)
				.orElseThrow(() -> new BusinessException(StorageErrorCode.STORAGE_FILE_NOT_FOUND));
		return ResponseEntity.ok()
				.header(HttpHeaders.CACHE_CONTROL, CACHE_CONTROL_IMMUTABLE)
				.contentType(MediaTypeFactory.getMediaType(objectKey).orElse(MediaType.APPLICATION_OCTET_STREAM))
				.body(bytes);
	}

	/**
	 * {@code {*key}}는 앞의 {@code /}까지 잡아 오므로 떼고 나서 검사한다. {@code ..} 차단은
	 * {@code mode=local}의 유일한 경로 조작 방어선이다({@link LocalFileController} 참조 —
	 * {@link LocalFileStoragePort}는 key를 baseDir에 그대로 resolve한다).
	 */
	private String validated(String rawKey) {
		String key = rawKey.startsWith("/") ? rawKey.substring(1) : rawKey;
		if (key.isBlank() || key.contains("..")
				|| IMAGE_KEY_PREFIXES.stream().noneMatch(key::startsWith)) {
			throw new BusinessException(StorageErrorCode.STORAGE_INVALID_KEY);
		}
		return key;
	}
}
