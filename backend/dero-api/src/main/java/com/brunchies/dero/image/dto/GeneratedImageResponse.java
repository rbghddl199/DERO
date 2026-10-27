package com.brunchies.dero.image.dto;

import com.brunchies.dero.placement.TimeOfDay;
import java.time.OffsetDateTime;

/**
 * 상상도 1장({@code GET /placements/{id}/generated-images}).
 *
 * <p>{@code imageKey}가 아니라 <b>presigned GET URL</b>을 싣는다 — 파일 서빙 엔드포인트를 만들지
 * 않는 규칙(api-spec.md §11) 때문에 key만 주면 프론트가 열 방법이 없다.
 *
 * <p>각도 필드가 없다(ADR-0015 결정 6). 생성기가 {@code SIDE}라고 라벨한 것을 정말 측면으로
 * 그렸는지 검증할 방법이 없어 미검증 값이 사실처럼 굳기 때문이고, 업로드가 1장이 된 지금은(D29)
 * 각도라는 축 자체가 없다. 순서는 {@code createdAt}이 답한다.
 */
public record GeneratedImageResponse(
		Long id, String url, boolean isPrimary, TimeOfDay timeOfDay, OffsetDateTime createdAt) {}
