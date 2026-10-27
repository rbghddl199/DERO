package com.brunchies.dero.product.dto;

/**
 * Bean Validation 그룹 — <b>등록(POST)에서만</b> 도는 제약을 표시한다.
 *
 * <p><b>왜 필요한가</b>: 규격 요청 record 5종을 등록(POST)과 부분 수정(PATCH)이 공유한다. 등록은
 * 규격 boolean·필수 치수가 전부 채워져야 하고(erd.md 전역 규칙 — 기본값을 두지 않으므로 미입력이
 * 조용히 {@code false}로 둔갑할 여지 자체를 없앤다), 수정은 같은 필드가 "안 바꾼다"는 뜻의 NULL로
 * 온다. 같은 record에 {@code @NotNull}을 그냥 달면 PATCH가 전 필드를 다시 보내야 한다.
 *
 * <p>대안이었던 "등록용·수정용 record를 따로 만든다"는 규격 5종 × 2벌 = 10개 record가 되고, 필드가
 * 하나 늘 때마다 두 곳을 고쳐야 해 조용히 어긋난다. 그룹은 표준 Bean Validation 기능이라
 * {@code MethodArgumentNotValidException} → 400 경로도 그대로 재사용된다(손 검증 금지 규칙 15 유지).
 *
 * <p>사용법: 등록 핸들러는 {@code @Validated({Default.class, OnCreate.class})},
 * 수정 핸들러는 {@code @Valid}(= {@code Default}만). <b>등록 쪽에 {@code Default.class}를 빠뜨리면</b>
 * {@code @Positive}·{@code @NotBlank} 같은 그룹 없는 제약이 통째로 안 돈다.
 */
public interface OnCreate {
}
