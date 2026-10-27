package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 암이 무엇을 거치하는가({@code arm.arm_kind}).
 *
 * <p><b>마이크암은 별도 테이블이 아니라 이 값으로 갈린다</b>(2026-07-23 확정) — {@code arm} 22컬럼 중
 * 19개가 두 종류 공통이라 서브테이블 하나가 컬럼 한두 개를 담게 되어 조인 한 단을 더 파는 값이 안
 * 난다. 더 큰 비용은 판별자가 2개가 되는 것이다: {@code CHECK}를 쓰지 않는 이 스키마는
 * {@code spec_type}↔서브타입 행↔{@code arm_kind} 3중 정합을 전부 WAS가 봐야 한다.
 *
 * <p>{@link ArmType}(구조 분류)과 직교한다 — 마이크암에도 폴형·다관절·자립형이 전부 있다.
 *
 * <p><b>{@link #MIC}일 때 WAS가 강제하는 것</b>: {@code pivot_range_deg}는 NULL(마이크암엔 화면 세로
 * 회전이라는 개념이 없다) · {@code is_vesa_plate_detachable}는 {@code false} · {@code product_vesa}에
 * 이 제품의 행이 없다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ArmKind {
  MONITOR("모니터암. pivot_range_deg를 채우고 VESA 결합 대상이다."),
  MIC("마이크암. pivot_range_deg는 NULL이고 VESA 결합 대상이 아니다.");

  private final String description;
}
