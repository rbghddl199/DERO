package com.brunchies.dero.product;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.global.exception.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 제품의 <b>발광 저작값 정본</b>(2026-07-29 신설, D5 개정·ADR-0003·DERO-222). {@link Product}
 * 1:1이되 <b>관계가 nullable</b>이다 — 빛을 내지 않는 제품은 행이 없다.
 *
 * <p><b>발광은 {@code spec_type}과 직교한다</b> — 조명 제품({@link Light})이든 PC 본체 RGB
 * ({@link Prop})든 같은 행 구조를 쓴다. 용도가 조명이 아닌 제품을 {@code spec_type = LIGHT}로 넣으면
 * 탐색·견적·호환성이 오염된다.
 *
 * <p><b>부모가 {@link Asset}이 아니라 {@link Product}다.</b> ADR-0003 결정 7이 벽 RGB 스트립·선반
 * 언더라이트를 절차 생성으로 정했는데, 절차 생성 제품은 GLB가 없어 {@code asset} 행을 만들 수 없다
 * ({@code asset.asset_key}가 {@code NOT NULL}이다) — {@code asset}에 매달았다면 그 제품군은 빛을 낼
 * 자리가 아예 없다. {@code rig_manifest}가 {@code asset}에 있는 근거(GLB 파트 이름 종속)도 여기엔
 * 성립하지 않는다: mm 좌표와 lm은 <b>파일이 아니라 제품의 성질</b>이라 재export해도 안 바뀐다.
 *
 * <p><b>제품당 발광체 1개다</b>(ADR-0003 결정 4·6). {@code product_id}가 PK라 DB가 그걸 강제한다 —
 * 옛 {@link Asset}의 발광 매니페스트 JSONB는 문서 약속으로만 지켰다. 애그리거트 안이라
 * {@code ProductEmitterRepository}를 만들지 않는다(ADR-0007) — 저장·삭제는 {@link Product}를
 * 통과한다({@link Product#attachEmitter(ProductEmitter)}).
 *
 * <p><b>{@link Light}와 겹치지 않는다</b> — {@code light}의 광학 컬럼은 제조사 정격의 카탈로그
 * 표기이고 여기는 렌더 정본이다. 둘이 어긋나도 화면은 안 바뀌고 어긋나는 것은 표기뿐이다.
 *
 * <p>값 검증은 전부 <b>WAS 소관</b>이다(이 스키마는 {@code CHECK}를 쓰지 않는다):
 * {@code shape = SPOT}이면 {@code distribution} 필수 · {@code POINT}면 NULL,
 * {@code point_*_mm}는 셋 다 채우거나 셋 다 NULL, {@code defaultColor}는 {@code '#RRGGBB'} 표기,
 * {@code lumens}·{@code radiusMm}는 양수.
 */
@Entity
@Table(name = "product_emitter")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class ProductEmitter extends BaseEntity {

  /** {@link MapsId}가 {@code product}의 id를 그대로 가져오므로 직접 채우지 않는다. */
  @Id
  private Long productId;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "product_id")
  private Product product;

  /** 빛을 어떻게 뿌리는가 — 런타임 광원 종류가 여기서 갈린다. */
  @Enumerated(EnumType.STRING)
  @Column(name = "shape", nullable = false, length = 20)
  private EmitterShape shape;

  /**
   * 배광 프리셋. <b>{@link Light}와 같은 열거를 재사용한다</b> — 새 열거를 만들지 않는다.
   *
   * <p>{@link EmitterShape#SPOT}이면 필수, {@link EmitterShape#POINT}면 NULL이다(WAS 강제). 각·
   * penumbra 수치는 DB에 두지 않는다 — 프리셋 이름 하나만 받고 정본은 프론트
   * {@code frontend/src/three/scene/lighting.ts}다({@code asset.finish}와 같은 판단이자 선례).
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "distribution", length = 20)
  private Distribution distribution;

  /**
   * <b>저작 기준 광속</b>(lm) — 사용자 배율이 곱해지기 전의 값이다. 렌더가 쓰는 값은
   * {@code lumens × placed_item.emitter_brightness_scale}이고 배율이 NULL이면 1배다.
   *
   * <p>단위를 lm으로 고정하는 이유는 {@code CAMERA_EXPOSURE} 한 번의 캘리브레이션을 그대로 재사용해
   * 신규 등록 제품이 씬 전용 보정 없이 균형 잡히게 하기 위함이다. Rec.709 휘도로 정규화한 값이다 —
   * 정규화하지 않으면 시안 대비 마젠타가 블룸 문턱을 넘지 못한다(2026-07-25 실측).
   */
  @Column(name = "lumens", nullable = false)
  private int lumens;

  /** 빛의 도달 반경 — {@code PointLight.distance}·{@code SpotLight.distance} 컷오프. */
  @Column(name = "radius_mm", nullable = false)
  private int radiusMm;

  /**
   * 사용자가 색을 고를 수 있는가. <b>기본값을 두지 않는다</b>(전역 규칙 "제약"의 명시적 예외) —
   * {@code false} 기본값이면 미저작이 조용히 "색 고정"으로 둔갑해 리컬러 가능한 제품에서 색 선택
   * UI가 아예 안 뜬다. 정적 팩터리의 필수 인자다.
   */
  @Column(name = "recolorable", nullable = false)
  private boolean recolorable;

  /** {@code '#RRGGBB'}. 고정 발광의 최종색이자 가변 발광의 초기값. */
  @Column(name = "default_color", nullable = false, length = 7)
  private String defaultColor;

  /**
   * <b>제품 로컬 좌표계</b>의 발광 지점. 셋 다 있거나 셋 다 없거나다(WAS 강제) — 두 축만 들어오면
   * 나머지 하나가 조용히 0이 되어 발광점이 제품 밖으로 나간다. 셋 다 NULL이면 bbox 중심이고 대개
   * 그게 맞다.
   */
  @Column(name = "point_x_mm")
  private Integer pointXMm;

  @Column(name = "point_y_mm")
  private Integer pointYMm;

  @Column(name = "point_z_mm")
  private Integer pointZMm;

  public static ProductEmitter create(Product product, EmitterShape shape,
      Distribution distribution, int lumens, int radiusMm, boolean recolorable,
      String defaultColor, Integer pointXMm, Integer pointYMm, Integer pointZMm) {
    requireValidCombination(shape, distribution, pointXMm, pointYMm, pointZMm);
    return ProductEmitter.builder()
        .product(product)
        .shape(shape)
        .distribution(distribution)
        .lumens(lumens)
        .radiusMm(radiusMm)
        .recolorable(recolorable)
        .defaultColor(defaultColor)
        .pointXMm(pointXMm)
        .pointYMm(pointYMm)
        .pointZMm(pointZMm)
        .build();
  }

	/**
	 * 발광 저작값 재등록 — {@code PUT /admin/products/{id}/emitter}가 upsert라 같은 행을 갈아끼운다.
	 * 영속 엔티티라 dirty checking이 UPDATE를 낸다(규칙 13).
	 */
	public void replace(EmitterShape shape, Distribution distribution, int lumens, int radiusMm,
			boolean recolorable, String defaultColor, Integer pointXMm, Integer pointYMm,
			Integer pointZMm) {
		requireValidCombination(shape, distribution, pointXMm, pointYMm, pointZMm);
		this.shape = shape;
		this.distribution = distribution;
		this.lumens = lumens;
		this.radiusMm = radiusMm;
		this.recolorable = recolorable;
		this.defaultColor = defaultColor;
		this.pointXMm = pointXMm;
		this.pointYMm = pointYMm;
		this.pointZMm = pointZMm;
	}

	/**
	 * erd.md {@code product_emitter} 절의 검증 표 중 <b>필드끼리 서로를 보는 두 줄</b>을 지킨다
	 * (이 스키마는 {@code CHECK}를 쓰지 않으므로 WAS가 강제한다):
	 * {@code shape = SPOT}이면 {@code distribution} 필수 · {@code POINT}면 NULL,
	 * {@code point_*_mm}는 셋 다 채우거나 셋 다 NULL.
	 *
	 * <p>같은 표의 나머지 줄({@code defaultColor}의 {@code '#RRGGBB'} 표기 · {@code lumens}·
	 * {@code radiusMm} 양수)은 <b>단일 필드 제약</b>이라 요청 DTO의 Bean Validation이 맡는다 —
	 * 규칙 15가 손 검증을 금지한 자리다. 조건부라 표현할 수 없는 두 줄만 여기 남는다.
	 */
	private static void requireValidCombination(EmitterShape shape, Distribution distribution,
			Integer pointXMm, Integer pointYMm, Integer pointZMm) {
		if (shape == EmitterShape.SPOT && distribution == null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_EMITTER_DISTRIBUTION_REQUIRED);
		}
		if (shape == EmitterShape.POINT && distribution != null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_EMITTER_DISTRIBUTION_NOT_ALLOWED);
		}

		boolean allEmpty = pointXMm == null && pointYMm == null && pointZMm == null;
		boolean allFilled = pointXMm != null && pointYMm != null && pointZMm != null;
		if (!allEmpty && !allFilled) {
			throw new BusinessException(ProductErrorCode.PRODUCT_EMITTER_POINT_PARTIAL);
		}
	}
}
