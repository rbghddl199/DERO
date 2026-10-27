package com.brunchies.dero.infra;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 이미지 key → 안정 공개 URL 조립(ADR-0035). 도메인 서비스가 응답 DTO에 이미지 URL을 실을 때
 * {@code presignPort.presignGet(key)} 대신 이것을 쓴다 — presigned GET은 GLB·KTX2·약관 MD처럼
 * 공개 대상이 아닌 오브젝트에만 남는다.
 *
 * <p>모드({@code local}/{@code s3})와 무관하게 URL 모양이 같다 — 수신부인
 * {@link PublicImageController}가 {@link StoragePort} 뒤에서 모드를 흡수한다.
 */
@Component
@RequiredArgsConstructor
public class PublicImageUrlResolver {

	private final StorageProperties properties;

	/** {@code key}는 null이 아니어야 한다 — null 허용 지점은 호출부가 기존 관례대로 가른다. */
	public String url(String key) {
		return properties.publicBaseUrl() + PublicImageController.BASE_PATH + "/" + key;
	}
}
