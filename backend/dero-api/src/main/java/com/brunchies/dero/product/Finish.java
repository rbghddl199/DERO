package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 코드 재질 프리셋 선택지 — {@code glb_export_mode = PART_SEGMENTATION}인 에셋에만 채운다.
 *
 * <p><b>PBR 수치가 아니라 프리셋 이름 하나만 받는다</b>(2026-07-23 확정, 승인 박동규 — 그전엔
 * {@code material_class}·{@code base_color}·{@code roughness}·{@code metalness} 4컬럼이었다).
 * 색·거칠기·금속성의 정본은 코드다 — {@code frontend/src/three/render/materials.ts}의
 * {@code materialForSkin()}이 재질 분류별로 clearcoat·transmission·ior를 강제한다. DB에 같은 수치를
 * 또 받으면 정본이 둘이 되어 어긋나고, <b>어긋난 쪽이 렌더를 지배한다</b>.
 *
 * <p>값 검증은 WAS가 한다 — 스키마가 Postgres ENUM도 {@code CHECK}도 쓰지 않으므로 이 enum이
 * 유일한 방어선이다({@code docs/context/erd.md} 전역 규칙).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum Finish {
  CLEAR_ACRYLIC("투명 아크릴."),
  METALLIC("메탈릭."),
  WHITE("화이트."),
  BLACK("블랙.");

  private final String description;
}
