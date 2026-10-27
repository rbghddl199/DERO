package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 조명의 배광 분포({@code light.distribution}) — SpotLight의 cone 각·penumbra로 표현된다.
 *
 * <p><b>구현 3종을 정본으로 채택한 값이다</b>(2026-07-23 확정). 문서·GLOSSARY는 {@code DIFFUSE}·
 * {@code SPOT} 2종이었고 프론트는 {@code spot}·{@code flood}·{@code ambient} 3종에 등록 램프가 실제로
 * {@code flood}를 쓰고 있었다 — {@code DIFFUSE}가 어디에도 매핑되지 않는 유령 값이라 구현 쪽을 택했다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum Distribution {
  SPOT("집중형. 원뿔을 좁게 조인다."),
  FLOOD("확산형. 원뿔을 넓게 연다."),
  AMBIENT("주변광 프리셋.");

  private final String description;
}
