package com.brunchies.dero.product;

import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 모니터 규격. {@link Product}의 JOINED 서브타입이고 PK({@code product_id})가 곧 부모 FK다.
 *
 * <p><b>인치·화면비·베젤이 정본이고 mm 외형은 파생값이다</b>(REQ-SIM-15 Must, 2026-07-21 승인
 * 박동규). 화면 mm = {@code diagonalInch} × 25.4를 화면비로 분해 → 패널 외형 = 화면 +
 * {@code bezelMm}×2 → 제품 깊이 = max({@code standDepthMm}, 패널 두께 + 곡면 처짐) → 제품 높이 =
 * 스탠드 높이 + 패널 높이. <b>mm를 저장하면 인치와 어긋난 mm가 들어가도 DB가 모른다</b> — 파생은
 * WAS가 매번 한다(프론트 {@code monitorDims()}와 같은 식).
 *
 * <p><b>화면비를 {@code "21:9"} 같은 문자열이 아니라 정수 두 컬럼으로 쪼갠 이유</b>: 마케팅 라벨과
 * 실제 패널 비율이 다르다. 34" 울트라와이드는 21:9가 아니라 43:18(3440×1440)이라 라벨을 그대로 믿으면
 * 화면 mm 치수가 어긋난다.
 *
 * <p><b>VESA는 여기 인라인 컬럼으로 두지 않는다</b> — 한 모니터가 75×75와 100×100을 동시에 지원할 수
 * 있어 단일 컬럼 쌍은 거짓말이 된다. {@code product_vesa} 정션이 정본이다.
 *
 * <p><b>boolean 2종에 기본값을 두지 않는다</b>(전역 규칙 "제약"의 명시적 예외) — 스탠드가 분리되는
 * 모니터가 미입력으로 "분리 불가"가 되면 모니터↔암 판정이 틀린 답을 낸다. 그래서 정적 팩터리의 필수
 * 인자다.
 *
 * <p><b>감사 컬럼을 매핑하지 않는다</b>(ADR-0006 결정 5) — 이 테이블에 실재하지만 의도적으로 죽여
 * 뒀다. 감사 필드는 {@link Product}가 선언한 것이 정본이고 여기서 다시 선언하면 중복 매핑으로 부팅이
 * 죽는다.
 */
@Entity
@Table(name = "monitor")
@DiscriminatorValue("MONITOR")
@PrimaryKeyJoinColumn(name = "product_id")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Monitor extends Product {

  /**
   * 대각 화면 크기 — <b>형상 생성의 정본 입력</b>. 23.8·31.5인치처럼 소수 표기가 실제로 쓰여
   * {@code NUMERIC(4,1)}이고, {@code double}은 반올림이 조용히 어긋나 {@link BigDecimal}로 받는다.
   */
  @Column(name = "diagonal_inch", nullable = false, precision = 4, scale = 1)
  private BigDecimal diagonalInch;

  /** 화면비 가로 항. */
  @Column(name = "aspect_width", nullable = false)
  private int aspectWidth;

  /** 화면비 세로 항. */
  @Column(name = "aspect_height", nullable = false)
  private int aspectHeight;

  /** 화면 둘레 베젤 폭(한쪽). 패널 외형 = 화면 + 이 값×2. */
  @Column(name = "bezel_mm", nullable = false)
  private int bezelMm;

  /** 제품별 실측 두께. <b>NULL이면 제네릭 28mm를 쓴다</b>. */
  @Column(name = "panel_thickness_mm")
  private Integer panelThicknessMm;

  @Enumerated(EnumType.STRING)
  @Column(name = "panel_shape", nullable = false, length = 10)
  private PanelShape panelShape;

  /**
   * 곡률 반경(1800R 등). <b>{@link PanelShape#FLAT}이면 NULL이어야 한다</b> — 평면 모니터에 곡률은
   * 존재하지 않는다. 그래서 nullable이고 {@link Integer}다. {@code CHECK}를 쓰지 않으므로 WAS가
   * 강제한다.
   */
  @Column(name = "curvature_radius_mm")
  private Integer curvatureRadiusMm;

  /** 기본 스탠드 발판 깊이. 27" 평면 130 / 34" 곡면 230(CONTEXT.md D18, 2026-07-21 승인). */
  @Column(name = "stand_depth_mm", nullable = false)
  private int standDepthMm;

  @Column(name = "is_stand_detachable", nullable = false)
  private boolean isStandDetachable;

  /** 피벗(세로 회전) 지원. */
  @Column(name = "is_pivot_supported", nullable = false)
  private boolean isPivotSupported;

  @Column(name = "swivel_max_deg")
  private Integer swivelMaxDeg;

  /** 기본 스탠드 높이 조절 폭. */
  @Column(name = "height_adjust_range_mm")
  private Integer heightAdjustRangeMm;

  @Column(name = "tilt_min_deg")
  private Integer tiltMinDeg;

  @Column(name = "tilt_max_deg")
  private Integer tiltMaxDeg;

  /** <b>암 허용 하중 판정(REQ-CMP-02)의 필수 입력</b>이라 {@code NOT NULL}이다. */
  @Column(name = "weight_g", nullable = false)
  private int weightG;

  /**
   * 표시 전용 포트 목록({@code ["HDMI 2.0", "DP 1.4"]}). <b>판정에 쓰이지 않는다</b> — 없으면 제품
   * 상세에 포트 정보를 표시할 곳이 없을 뿐이다.
   *
   * <p>erd.md가 정한 JSONB 구조가 <b>문자열 배열</b>이라 별도 레코드 타입을 만들지 않았다. 포트마다
   * 규격·개수 같은 필드가 필요해지면 그때 레코드로 승격한다.
   */
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "ports", columnDefinition = "jsonb")
  private List<String> ports;

  /**
   * 부모 필드까지 한 번에 받는 생성자 빌더.
   *
   * <p><b>클래스 레벨 {@code @Builder}·{@code @SuperBuilder}를 쓰지 않는다</b> — 전자는 상속을 다루지
   * 못해 {@link Product}의 필드 9개가 빌더에서 조용히 사라지고, 후자는 lombok 1.18.46에
   * {@code access} 속성이 아예 없어 빌더가 public이 된다. 생성자에 붙인 {@code @Builder}만
   * {@code super(...)}로 넘기는 파라미터까지 빌더에 포함한다.
   */
  @Builder(access = AccessLevel.PRIVATE)
  private Monitor(ProductSource source, User owner, Brand brand, Category category, String name,
      String description, Integer priceKrw, String productUrl,
      BigDecimal diagonalInch, int aspectWidth, int aspectHeight, int bezelMm,
      Integer panelThicknessMm, PanelShape panelShape, Integer curvatureRadiusMm,
      int standDepthMm, boolean isStandDetachable, boolean isPivotSupported,
      Integer swivelMaxDeg, Integer heightAdjustRangeMm, Integer tiltMinDeg,
      Integer tiltMaxDeg, int weightG, List<String> ports) {
    super(source, owner, brand, category, name, description, priceKrw, productUrl);
    this.diagonalInch = diagonalInch;
    this.aspectWidth = aspectWidth;
    this.aspectHeight = aspectHeight;
    this.bezelMm = bezelMm;
    this.panelThicknessMm = panelThicknessMm;
    this.panelShape = panelShape;
    this.curvatureRadiusMm = curvatureRadiusMm;
    this.standDepthMm = standDepthMm;
    this.isStandDetachable = isStandDetachable;
    this.isPivotSupported = isPivotSupported;
    this.swivelMaxDeg = swivelMaxDeg;
    this.heightAdjustRangeMm = heightAdjustRangeMm;
    this.tiltMinDeg = tiltMinDeg;
    this.tiltMaxDeg = tiltMaxDeg;
    this.weightG = weightG;
    this.ports = ports;
    validateSpec();
  }

  public static Monitor create(ProductSource source, User owner, Brand brand, Category category,
      String name, String description, Integer priceKrw, String productUrl,
      BigDecimal diagonalInch, int aspectWidth, int aspectHeight, int bezelMm,
      Integer panelThicknessMm, PanelShape panelShape, Integer curvatureRadiusMm,
      int standDepthMm, boolean isStandDetachable, boolean isPivotSupported,
      Integer swivelMaxDeg, Integer heightAdjustRangeMm, Integer tiltMinDeg,
      Integer tiltMaxDeg, int weightG, List<String> ports) {
    return Monitor.builder()
        .source(source)
        .owner(owner)
        .brand(brand)
        .category(category)
        .name(name)
        .description(description)
        .priceKrw(priceKrw)
        .productUrl(productUrl)
        .diagonalInch(diagonalInch)
        .aspectWidth(aspectWidth)
        .aspectHeight(aspectHeight)
        .bezelMm(bezelMm)
        .panelThicknessMm(panelThicknessMm)
        .panelShape(panelShape)
        .curvatureRadiusMm(curvatureRadiusMm)
        .standDepthMm(standDepthMm)
        .isStandDetachable(isStandDetachable)
        .isPivotSupported(isPivotSupported)
        .swivelMaxDeg(swivelMaxDeg)
        .heightAdjustRangeMm(heightAdjustRangeMm)
        .tiltMinDeg(tiltMinDeg)
        .tiltMaxDeg(tiltMaxDeg)
        .weightG(weightG)
        .ports(ports)
        .build();
  }

	/**
	 * 규격을 갈아끼운다(REQ-ADM-02). 영속 엔티티라 dirty checking이 UPDATE를 낸다 — 빌더로 재조립하지
	 * 않는다(규칙 13). 부분 수정의 병합은 호출부가 끝낸 뒤 전 필드를 넘긴다.
	 */
	public void updateSpec(BigDecimal diagonalInch, int aspectWidth, int aspectHeight, int bezelMm,
			Integer panelThicknessMm, PanelShape panelShape, Integer curvatureRadiusMm,
			int standDepthMm, boolean isStandDetachable, boolean isPivotSupported,
			Integer swivelMaxDeg, Integer heightAdjustRangeMm, Integer tiltMinDeg, Integer tiltMaxDeg,
			int weightG, List<String> ports) {
		this.diagonalInch = diagonalInch;
		this.aspectWidth = aspectWidth;
		this.aspectHeight = aspectHeight;
		this.bezelMm = bezelMm;
		this.panelThicknessMm = panelThicknessMm;
		this.panelShape = panelShape;
		this.curvatureRadiusMm = curvatureRadiusMm;
		this.standDepthMm = standDepthMm;
		this.isStandDetachable = isStandDetachable;
		this.isPivotSupported = isPivotSupported;
		this.swivelMaxDeg = swivelMaxDeg;
		this.heightAdjustRangeMm = heightAdjustRangeMm;
		this.tiltMinDeg = tiltMinDeg;
		this.tiltMaxDeg = tiltMaxDeg;
		this.weightG = weightG;
		this.ports = ports;
		validateSpec();
	}

	/**
	 * {@code CHECK}를 쓰지 않으므로 조합 규칙은 WAS가 강제한다(erd.md {@code monitor} 절) — <b>평면
	 * 모니터에 곡률은 존재하지 않는다</b>. 생성과 수정 <b>양쪽</b>에서 부르는 이유는 검증이 두 곳으로
	 * 갈리면 어느 쪽이 도는지 알 수 없어지기 때문이다(PATCH는 부분 입력이라 요청 본문만 봐서는 판단할
	 * 수도 없다 — {@code panelShape}만 바꾸고 곡률은 그대로 두는 요청이 정확히 이 함정이다).
	 */
	private void validateSpec() {
		if (panelShape == PanelShape.FLAT && curvatureRadiusMm != null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_SPEC_CURVATURE_NOT_ALLOWED);
		}
	}
}
