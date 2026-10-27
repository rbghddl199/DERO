package com.brunchies.dero.placement.judgment;

/**
 * 판정 ①의 암 쪽 입력 — 클램프 게이트와 물림 범위. <b>엔티티가 아니라 규격 값이다</b>(mm).
 *
 * <p><b>{@code clampMountable}은 {@code arm_kind}와 무관하다</b> — {@code MIC} 마이크암도 이 값이
 * {@code true}면 모니터암과 똑같이 판정 ①을 받는다. 클램프가 상판을 무는 물리는 팔 끝에 무엇이
 * 달렸는지와 상관없다({@code docs/context/compatibility.md}, 2026-07-23 확정).
 *
 * <p><b>다른 마운트 boolean({@code is_grommet_mountable}·{@code is_wall_mountable})은 여기 없다.</b>
 * 마운트별 결과를 OR로 합치면 클램프 물림 범위를 초과한 암이 "그로밋도 되니까"로 통과한다 — 애초에
 * 입력으로 받지 않아 합칠 수 없게 둔다.
 *
 * @param clampMountable {@code arm.is_clamp_mountable}. {@code false}면 판정 ①을 <b>수행하지 않는다</b>
 * @param clampMinMm 물림 최소 두께. NULL은 미등록이고 0으로 치환하지 않는다
 * @param clampMaxMm 물림 최대 두께. NULL은 미등록이고 무한대로 치환하지 않는다
 */
public record ClampSpec(boolean clampMountable, Integer clampMinMm, Integer clampMaxMm) {
}
