package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 제품 출처 — 운영진이 등록한 카탈로그 제품인지, 사용자가 올린 자작 제품인지(D20).
 *
 * <p>값에 따라 필수 컬럼이 갈린다: {@code CATALOG}는 {@code brand_id}·{@code price_krw}·
 * {@code product_url}·{@code image_key}가 필수이고 {@code owner_user_id}가 NULL이며,
 * {@code USER}는 정반대다. 이 스키마는 {@code CHECK}를 쓰지 않으므로 <b>강제는 WAS 소관</b>이다
 * ({@code docs/context/erd.md} {@code product} 절).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum ProductSource {
  CATALOG("운영진이 등록한 카탈로그 제품. 브랜드·가격·구매처·대표 이미지가 필수다."),
  USER("사용자가 올린 자작 제품. owner_user_id가 필수이고 브랜드·가격·구매처는 NULL이다.");

  private final String description;
}
