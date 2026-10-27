package com.brunchies.dero.placement;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 배치 게시 상태({@code placement.publish_status}). 종전 {@code visibility}(PUBLIC/PRIVATE 2값)를
 * 개명·확장한 것이다(ADR-0015 결정 1) — 업로드가 <b>비동기 파이프라인</b>이 되면서 "상상도 생성
 * 대기"와 "생성 실패"를 담을 자리가 2값에 없었다.
 *
 * <p><b>데스크 피드 노출은 {@link #PUBLIC} 하나뿐</b>이고 나머지 셋은 전부 비노출이다. 배치 하나의
 * 게시 상태를 이 컬럼 하나가 혼자 답하게 해서 "공개인데 왜 피드에 없지"를 한 컬럼으로 답할 수 있게
 * 한 것이다 — 버린 대안은 {@code visibility} + {@code thumbnail_key IS NOT NULL} 2컬럼 조합이었다.
 *
 * <p>기본값은 {@link #PRIVATE}다 — 저장한 배치가 본인 확인 없이 피드에 노출되면 되돌릴 수 없다.
 * <b>{@link #PUBLIC}과 {@link #FAILED}는 서버만 정한다</b>. 클라이언트는 올림/내림만 요청한다.
 *
 * <p><b>공개 게이트를 쏘는 시점은 {@code PRIVATE} → {@code PENDING} 전이다</b>(ADR-0015 결정 9·10) —
 * 전용 엔드포인트({@code PUT}/{@code DELETE /placements/{id}/feed-entry})가 그 자리이고, 업로드
 * 파이프라인과 함께 아직 구현 전이다. 서비스 계층을 다시 쓸 때 이 전이에 게이트를 건다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum PublishStatus {
  PRIVATE("내 작업실. 기본값이고 피드에 노출되지 않는다."),
  PENDING("업로드를 눌렀고 AI 상상도 생성 대기 중. 아직 피드에 노출되지 않는다. 서버가 정한다."),
  PUBLIC("상상도가 붙었다. 피드에 노출되는 유일한 상태다. 서버가 정한다."),
  FAILED("상상도 생성 실패. 재시도 대상이고 피드에 노출되지 않는다. 서버가 정한다.");

  private final String description;
}
