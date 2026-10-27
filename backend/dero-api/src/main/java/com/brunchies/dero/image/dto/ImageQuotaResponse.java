package com.brunchies.dero.image.dto;

import java.time.OffsetDateTime;

/**
 * {@code GET /api/v1/users/me/image-quota} 응답(REQ-IMG-03, api-spec.md §3).
 *
 * <p><b>한도는 계정에 붙지 배치에 붙지 않는다</b> — 그래서 경로가 {@code /users/me/...}다. 결제
 * 모델(구독형/크레딧형)이 미정이라 잔여 크레딧·충전 필드는 두지 않는다(같은 문서 §10).
 *
 * @param usedToday 오늘 이미 만든 상상도 <b>장</b> 수. {@code generated_image} 행 수가 정본이고 그
 *     테이블은 행을 지우지 않으므로 <b>카운트가 되돌아가지 않는다</b>.
 * @param dailyLimit 하루 상한(장). {@code app.image.daily-quota}가 정본이고 업로드 1회가
 *     {@code FeedEntryService.IMAGES_PER_UPLOAD}장이라 그 배수다.
 * @param resetAt 카운트가 0으로 돌아가는 시각 — 다음 날 자정. <b>오프셋 포함 ISO-8601</b>이라
 *     클라이언트 타임존에서 어긋나지 않는다(ADR-0008 결정 7).
 */
public record ImageQuotaResponse(long usedToday, int dailyLimit, OffsetDateTime resetAt) {
}
