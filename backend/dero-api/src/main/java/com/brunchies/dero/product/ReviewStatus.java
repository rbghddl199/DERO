package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * GLB·규격 검수 단계(D20, 2026-07-23 확정).
 *
 * <p><b>{@link ProductStatus}와 다른 축이다</b> — 이쪽은 검수, 저쪽은 카탈로그 노출 여부다.
 *
 * <ul>
 *   <li>{@code PENDING} — 업로드 직후 기본값. <b>업로더 본인만</b> 보고, 자기 배치에는 바로 쓸 수 있다
 *   <li>{@code APPROVED} — 운영진 승인. 전체 라이브러리 노출
 *   <li>{@code REJECTED} — 반려. 본인만 보고 {@code review_note}에 사유가 뜬다
 * </ul>
 *
 * <p><b>승인은 "봤다"지 "실측을 보증한다"가 아니다</b> — 자작 제품 규격은 자기신고라
 * {@code source = USER}인 제품에는 승인 후에도 미인증 경고를 띄운다(D6).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ReviewStatus {
  PENDING("업로드 직후 기본값. 업로더 본인만 보고 자기 배치에는 바로 쓸 수 있다."),
  APPROVED("운영진 승인. 전체 라이브러리에 노출된다."),
  REJECTED("반려. 본인만 보고 review_note에 사유가 뜬다.");

  private final String description;
}
