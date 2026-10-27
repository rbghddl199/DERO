package com.brunchies.dero.product;

import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 조명 규격. {@link Product}의 JOINED 서브타입이고 PK({@code product_id})가 곧 부모 FK다.
 *
 * <p><b>이 클래스의 광학 컬럼은 카탈로그 표시용 마커다 — 렌더는 읽지 않는다</b>(2026-07-29 확정,
 * DERO-222). 광학 정본은 {@link ProductEmitter}이고 여기가 담는 것은 <b>알려진 실제 제품
 * 사양</b>이다: 제품 상세·필터·비교표에 "3000~6500K, 800lm, 집중형"을 띄우는 값. 렌더가 쓰는 lm·
 * 반경·배광·색은 전부 {@link ProductEmitter}에서 온다 — 두 자리가 어긋나도 화면은 안 바뀌고
 * 어긋나는 것은 표기뿐이다.
 *
 * <p><b>광학 6컬럼을 nullable로 풀었다</b>(같은 개정. 종전엔 12컬럼 전부 {@code NOT NULL}이었다).
 * 가르는 선은 "판정이 먹는 값이냐 사람이 읽는 값이냐"다 — 치수 3종은 호환성 판정 ③의 입력이라
 * 결측이면 판정이 못 돌고, 색온도·광속·배광·도달 거리는 렌더가 안 읽으니 모르면 비운다. 스펙시트에
 * 루멘을 안 적는 조명 제품이 실재하는데 종전 구조는 등록자가 값을 <b>지어내게</b> 만들었고, 지어낸
 * 값이 렌더까지 지배했다.
 *
 * <p><b>조절 불가 제품은 min에 고정값을 넣고 max를 min과 같게 채운다</b>(색온도가 이미 쓰는 패턴).
 * 다만 이제 <b>강제가 아니다</b> — 값을 알면 둘 다 같은 값을 넣고, 모르면 둘 다 NULL이다.
 *
 * <p><b>boolean 2종에 기본값을 두지 않고 nullable로도 풀지 않는다</b>(전역 규칙 "제약"의 명시적
 * 예외) — 전역 규칙이 nullable boolean을 금지하고("모름"이 3상태를 만든다), 조절 손잡이 유무는 제품
 * 사진·상세페이지로 판단할 수 있어 등록자가 항상 답할 수 있는 값이다. 정적 팩터리의 필수 인자다.
 *
 * <p><b>인스턴스 값(사용자가 고른 밝기·색온도)은 {@code placed_item}이 담는다</b>(2026-07-29 실현) —
 * {@code emitter_brightness_scale}·{@code emitter_color_temperature_k}다. <b>배율이 곱해지는 기준값은
 * 이 클래스의 {@code luminousFluxMinLm}이 아니라 {@link ProductEmitter}의 {@code lumens}다</b> —
 * 인스턴스가 마커를 참조하는 일은 없다.
 *
 * <p><b>감사 컬럼을 매핑하지 않는다</b>(ADR-0006 결정 5) — 감사 필드는 {@link Product}가 선언한 것이
 * 정본이고 여기서 다시 선언하면 중복 매핑으로 부팅이 죽는다.
 */
@Entity
@Table(name = "light")
@DiscriminatorValue("LIGHT")
@PrimaryKeyJoinColumn(name = "product_id")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Light extends Product {

  /** 3D 배치에 필수라 {@code NOT NULL}이다. */
  @Column(name = "width_mm", nullable = false)
  private int widthMm;

  @Column(name = "depth_mm", nullable = false)
  private int depthMm;

  @Column(name = "height_mm", nullable = false)
  private int heightMm;

  @Column(name = "is_color_temperature_adjustable", nullable = false)
  private boolean isColorTemperatureAdjustable;

  /** 카탈로그 표기값. 조작 불가 제품은 여기에 고정값이 들어가고, 스펙시트에 없으면 NULL이다. */
  @Column(name = "color_temperature_min_k")
  private Integer colorTemperatureMinK;

  /** 조작 불가 제품은 min과 같은 값. */
  @Column(name = "color_temperature_max_k")
  private Integer colorTemperatureMaxK;

  @Column(name = "is_brightness_adjustable", nullable = false)
  private boolean isBrightnessAdjustable;

  /**
   * 제조사 <b>정격 광속</b>(루멘)의 카탈로그 표기값. <b>렌더는 읽지 않는다</b> — 렌더 기준값은
   * {@code ProductEmitter.lumens}다.
   */
  @Column(name = "luminous_flux_min_lm")
  private Integer luminousFluxMinLm;

  /** 조절 불가 제품은 min과 같은 값. */
  @Column(name = "luminous_flux_max_lm")
  private Integer luminousFluxMaxLm;

  /**
   * 배광 분포의 카탈로그 표기·필터용 값. 렌더가 읽는 배광은
   * {@code ProductEmitter.distribution}이다 — 같은 열거를 재사용한다.
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "distribution", length = 20)
  private Distribution distribution;

  /**
   * 정격 도달 거리(카탈로그 표기). <b>렌더 도달 반경은 {@code ProductEmitter.radiusMm}다</b> — "도달
   * 거리를 코드 상수로 박으면 램프를 새로 등록해도 코드를 고쳐야 반영된다"(REQ-ADM-02 Must)는 근거는
   * 그대로 유효하고 그 책임이 그쪽으로 옮겼을 뿐이다.
   */
  @Column(name = "reach_mm")
  private Integer reachMm;

  /**
   * 부모 필드까지 한 번에 받는 생성자 빌더.
   *
   * <p><b>클래스 레벨 {@code @Builder}·{@code @SuperBuilder}를 쓰지 않는다</b> — 전자는 상속을 다루지
   * 못해 {@link Product}의 필드 9개가 빌더에서 조용히 사라지고, 후자는 lombok 1.18.46에
   * {@code access} 속성이 아예 없어 빌더가 public이 된다. 생성자에 붙인 {@code @Builder}만
   * {@code super(...)}로 넘기는 파라미터까지 빌더에 포함한다.
   */
  @Builder(access = AccessLevel.PRIVATE)
  private Light(ProductSource source, User owner, Brand brand, Category category, String name,
      String description, Integer priceKrw, String productUrl, int widthMm,
      int depthMm, int heightMm, boolean isColorTemperatureAdjustable,
      Integer colorTemperatureMinK, Integer colorTemperatureMaxK, boolean isBrightnessAdjustable,
      Integer luminousFluxMinLm, Integer luminousFluxMaxLm, Distribution distribution,
      Integer reachMm) {
    super(source, owner, brand, category, name, description, priceKrw, productUrl);
    this.widthMm = widthMm;
    this.depthMm = depthMm;
    this.heightMm = heightMm;
    this.isColorTemperatureAdjustable = isColorTemperatureAdjustable;
    this.colorTemperatureMinK = colorTemperatureMinK;
    this.colorTemperatureMaxK = colorTemperatureMaxK;
    this.isBrightnessAdjustable = isBrightnessAdjustable;
    this.luminousFluxMinLm = luminousFluxMinLm;
    this.luminousFluxMaxLm = luminousFluxMaxLm;
    this.distribution = distribution;
    this.reachMm = reachMm;
  }

  public static Light create(ProductSource source, User owner, Brand brand, Category category,
      String name, String description, Integer priceKrw, String productUrl,
      int widthMm, int depthMm, int heightMm, boolean isColorTemperatureAdjustable,
      Integer colorTemperatureMinK, Integer colorTemperatureMaxK, boolean isBrightnessAdjustable,
      Integer luminousFluxMinLm, Integer luminousFluxMaxLm, Distribution distribution,
      Integer reachMm) {
    return Light.builder()
        .source(source)
        .owner(owner)
        .brand(brand)
        .category(category)
        .name(name)
        .description(description)
        .priceKrw(priceKrw)
        .productUrl(productUrl)
        .widthMm(widthMm)
        .depthMm(depthMm)
        .heightMm(heightMm)
        .isColorTemperatureAdjustable(isColorTemperatureAdjustable)
        .colorTemperatureMinK(colorTemperatureMinK)
        .colorTemperatureMaxK(colorTemperatureMaxK)
        .isBrightnessAdjustable(isBrightnessAdjustable)
        .luminousFluxMinLm(luminousFluxMinLm)
        .luminousFluxMaxLm(luminousFluxMaxLm)
        .distribution(distribution)
        .reachMm(reachMm)
        .build();
  }

	/**
	 * 규격을 갈아끼운다(REQ-ADM-02). 영속 엔티티라 dirty checking이 UPDATE를 낸다 — 빌더로 재조립하지
	 * 않는다(규칙 13). 부분 수정의 병합은 호출부가 끝낸 뒤 전 필드를 넘긴다.
	 *
	 * <p>광학 6종에 조합 규칙을 걸지 않는다 — 카탈로그 표기 마커라 렌더가 안 읽고, min/max를 강제하면
	 * "모른다"를 표현할 방법이 다시 사라진다(2026-07-29 개정이 되돌린 바로 그 상태다).
	 */
	public void updateSpec(int widthMm, int depthMm, int heightMm,
			boolean isColorTemperatureAdjustable, Integer colorTemperatureMinK,
			Integer colorTemperatureMaxK, boolean isBrightnessAdjustable, Integer luminousFluxMinLm,
			Integer luminousFluxMaxLm, Distribution distribution, Integer reachMm) {
		this.widthMm = widthMm;
		this.depthMm = depthMm;
		this.heightMm = heightMm;
		this.isColorTemperatureAdjustable = isColorTemperatureAdjustable;
		this.colorTemperatureMinK = colorTemperatureMinK;
		this.colorTemperatureMaxK = colorTemperatureMaxK;
		this.isBrightnessAdjustable = isBrightnessAdjustable;
		this.luminousFluxMinLm = luminousFluxMinLm;
		this.luminousFluxMaxLm = luminousFluxMaxLm;
		this.distribution = distribution;
		this.reachMm = reachMm;
	}
}
