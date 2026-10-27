package com.brunchies.dero.placement;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 배치 책상의 규격 출처({@code placement_desk.spec_source}). D18 배타적 2모드다.
 *
 * <p>{@code PRODUCT}면 카탈로그 제품에서 규격을 복사해 오고 {@code product_id}가 채워진다.
 * {@code CUSTOM}이면 사용자가 줄자로 재서 직접 입력한 값이라 {@code product_id}가 NULL이다.
 *
 * <p><b>{@code placement.source_placement_id}(리믹스 출처)와 다른 뜻이다</b> — 같은 "출처"라는
 * 단어가 겹쳐 2026-07-24에 {@code desk_source}에서 개명했다. 이 컬럼이 답하는 것은 "이 책상
 * <b>규격</b>이 어디서 왔나"다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum SpecSource {
  PRODUCT("카탈로그 제품에서 규격을 복사해 온 책상. product_id가 채워진다."),
  CUSTOM("사용자가 줄자로 재서 직접 입력한 규격. product_id가 NULL이다.");

  private final String description;
}
