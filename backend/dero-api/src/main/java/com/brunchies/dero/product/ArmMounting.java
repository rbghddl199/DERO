package com.brunchies.dero.product;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * 암의 고정 방식 지원 여부 3종. {@link Arm}에 {@code @Embedded}로 실린다.
 *
 * <p><b>{@code arm} 테이블의 같은 3컬럼에 그대로 매핑된다</b> — {@code @Embedded}는 별도 테이블을
 * 만들지 않는다. 스키마는 그대로고 자바 쪽 모양만 바뀐다.
 *
 * <p><b>enum 하나가 아니라 boolean 3종인 이유</b>(2026-07-23 확정. {@code mount_type}
 * CLAMP/GROMMET/WALL 폐기) — 클램프와 그로밋을 <b>동시에</b> 지원하는 암이 흔해 단일 enum은 둘 중
 * 하나를 버려야 하고, 버린 쪽이 판정에서 사라진다.
 *
 * <p><b>따로 떼어 값 객체로 만든 이유</b>: 셋 다 {@code boolean}이라 정적 팩터리의 위치 인자로 늘어놓으면
 * <b>순서가 바뀌어도 컴파일이 통과한다.</b> {@code false}는 정당한 값이라 검증으로도 못 잡고, 컬럼
 * 기본값도 금지라(전역 규칙 "제약"의 명시적 예외) 결측을 메울 방법이 없다 — 스탠드형 암이 "클램프 가능"으로
 * 기록되면 판정 ①이 틀린 답을 낸다. 이름 있는 컴포넌트로 묶으면 스왑이 불가능해지고, record의 정규 생성자가
 * 셋 다 요구해 결측도 컴파일 단계에서 막힌다.
 *
 * <p><b>판정 게이트는 {@link #clamp()} 하나이고 마운트별 결과를 OR로 합치지 않는다</b>
 * ({@code docs/context/compatibility.md} 판정 ①). 합치면 클램프 물림 범위를 넘은 암이 "그로밋도
 * 되니까"로 통과한다. {@code clamp = false}인 암은 판정 ① 자체를 수행하지 않는다("불가"도 아니다).
 *
 * @param clamp 클램프(상판 물림) 지원. <b>판정 ①의 게이트</b>
 * @param grommet 그로밋(타공 관통) 지원. 책상 쪽에 대응 규격(홀 지름)이 없어 V1 판정 입력이 아니다
 * @param wall 벽 부착 지원. 그로밋과 같은 이유로 V1 판정 입력이 아니다
 */
@Embeddable
public record ArmMounting(
    @Column(name = "is_clamp_mountable", nullable = false) boolean clamp,
    @Column(name = "is_grommet_mountable", nullable = false) boolean grommet,
    @Column(name = "is_wall_mountable", nullable = false) boolean wall) {
}
