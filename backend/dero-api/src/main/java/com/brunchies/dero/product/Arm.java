package com.brunchies.dero.product;

import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Embedded;
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
 * 모니터암·마이크암 규격. {@link Product}의 JOINED 서브타입이고 PK({@code product_id})가 곧 부모 FK다.
 *
 * <p><b>마이크암도 이 테이블이다</b>({@link ArmKind}로 갈린다, 2026-07-23 확정 승인 박동규) — 22컬럼 중
 * 19개가 두 종류 공통이라 서브테이블을 파는 값이 안 난다.
 *
 * <p><b>마운트 방식은 enum 하나가 아니라 boolean 3종이고, {@link ArmMounting} 값 객체로 묶여 있다</b> —
 * 그렇게 나눈 근거와 판정 ①의 게이트 규칙은 그 record의 주석이 정본이다.
 *
 * <p><b>각도 컬럼 4종({@code tiltMinDeg}·{@code tiltMaxDeg}·{@code swivelRangeDeg}·
 * {@code pivotRangeDeg})은 카탈로그 표기·필터용이다</b> — 런타임 관절 클램프의 정본은
 * {@code asset.rig_manifest}의 관절별 한계각이다. <b>두 곳이 어긋나면 매니페스트가 씬을 지배한다</b> —
 * 각도 컬럼을 조작 한계로 읽어 클램프에 쓰면 매니페스트를 고친 날 조용히 다른 포즈가 나온다.
 *
 * <p><b>boolean 5종({@link ArmMounting}의 3종 포함)·{@code deviceCapacity}에 기본값을 두지 않는다</b>
 * (전역 규칙 "제약"의 명시적 예외) — 듀얼 암을 실측하지 않으면 조용히 1대로 기록된다. 전부 정적 팩터리의
 * 필수 인자다.
 *
 * <p><b>VESA는 여기 인라인 컬럼으로 두지 않는다</b> — 암 1개가 75×75와 100×100을 동시에 지원할 수 있어
 * {@code product_vesa} 정션이 정본이다.
 *
 * <p><b>WAS가 강제하는 조합 규칙</b>({@code CHECK}를 쓰지 않으므로): {@link ArmKind#MIC}이면
 * {@code pivotRangeDeg}는 NULL · {@code isVesaPlateDetachable}는 {@code false} ·
 * {@code product_vesa}에 행이 없다. {@link ArmType#STAND}이면 {@link ArmMounting}의 3종이 전부
 * {@code false}다.
 *
 * <p><b>감사 컬럼을 매핑하지 않는다</b>(ADR-0006 결정 5) — 감사 필드는 {@link Product}가 선언한 것이
 * 정본이고 여기서 다시 선언하면 중복 매핑으로 부팅이 죽는다.
 */
@Entity
@Table(name = "arm")
@DiscriminatorValue("ARM")
@PrimaryKeyJoinColumn(name = "product_id")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Arm extends Product {

  /** 거치 대상 구분. */
  @Enumerated(EnumType.STRING)
  @Column(name = "arm_kind", nullable = false, length = 20)
  private ArmKind armKind;

  /** <b>구조 분류지 마운트 방식이 아니다</b> — 고정 방식은 아래 boolean 3종이 맡는다. */
  @Enumerated(EnumType.STRING)
  @Column(name = "arm_type", nullable = false, length = 30)
  private ArmType armType;

  /**
   * 거치 가능 대수. 마이크암도 1이 정답이라 컬럼 이름이 {@code monitor_capacity}가 아니다 —
   * {@code monitor_}였다면 마이크암 행에 들어간 1이 "모니터 1대"라는 거짓이 된다.
   */
  @Column(name = "device_capacity", nullable = false)
  private int deviceCapacity;

  /** 관절 세그먼트 개수. */
  @Column(name = "segment_count")
  private Integer segmentCount;

  /** 폴 타입일 때. */
  @Column(name = "pole_height_mm")
  private Integer poleHeightMm;

  /** 전후 도달 범위. */
  @Column(name = "reach_min_mm")
  private Integer reachMinMm;

  @Column(name = "reach_max_mm")
  private Integer reachMaxMm;

  /**
   * 거치 높이 범위. <b>{@code height_adjust_range_mm}를 두지 않는다</b> —
   * {@code heightMaxMm - heightMinMm}인 파생값이라 저장하면 세 값이 어긋난 행이 만들어져도 DB가
   * 모른다.
   */
  @Column(name = "height_min_mm")
  private Integer heightMinMm;

  @Column(name = "height_max_mm")
  private Integer heightMaxMm;

  /**
   * 고정 방식 지원 여부 3종. <b>{@code arm} 테이블의 같은 3컬럼에 그대로 실린다</b> —
   * {@code @Embedded}는 테이블을 만들지 않는다. 묶은 이유는 {@link ArmMounting}에 적었다.
   */
  @Embedded
  private ArmMounting mounting;

  /** 클램프 물림 최소 두께. 암↔책상 판정 근거. */
  @Column(name = "clamp_min_mm")
  private Integer clampMinMm;

  /** 클램프 물림 최대 두께. */
  @Column(name = "clamp_max_mm")
  private Integer clampMaxMm;

  @Column(name = "tilt_min_deg")
  private Integer tiltMinDeg;

  @Column(name = "tilt_max_deg")
  private Integer tiltMaxDeg;

  /**
   * 좌우 스위블 <b>총 가동 범위</b>. tilt만 min/max 쌍이고 이쪽은 단일값이라 이름에 "범위"를 박지
   * 않으면 한쪽 끝값으로 읽힌다.
   */
  @Column(name = "swivel_range_deg")
  private Integer swivelRangeDeg;

  /**
   * 화면 피벗(세로 회전) <b>총 가동 범위</b>. {@link ArmKind#MONITOR} 전용이다 — 마이크암엔 화면 세로
   * 회전이라는 개념 자체가 없어 NULL이다.
   */
  @Column(name = "pivot_range_deg")
  private Integer pivotRangeDeg;

  /**
   * 마이크암엔 VESA 플레이트가 없지만 nullable로 완화하지 않는다 — 전역 규칙이 nullable boolean을
   * 금지하고(3상태가 되어 WAS가 컬럼마다 null 분기를 하게 된다), VESA 지원 여부의 정본은 이미
   * {@code product_vesa} 행 존재다. "플레이트가 분리되지 않는다"는 마이크암에 대해 참이라
   * {@code false}로 충분하다.
   */
  @Column(name = "is_vesa_plate_detachable", nullable = false)
  private boolean isVesaPlateDetachable;

  @Column(name = "has_cable_management", nullable = false)
  private boolean hasCableManagement;

  /**
   * <b>모니터 무게 판정(REQ-CMP-02)의 나머지 절반</b>이라 {@code NOT NULL}이다 — 결측이면 판정이
   * 성립하지 않는다.
   */
  @Column(name = "allowed_load_g", nullable = false)
  private int allowedLoadG;

  /**
   * 부모 필드까지 한 번에 받는 생성자 빌더.
   *
   * <p><b>클래스 레벨 {@code @Builder}·{@code @SuperBuilder}를 쓰지 않는다</b> — 전자는 상속을 다루지
   * 못해 {@link Product}의 필드 9개가 빌더에서 조용히 사라지고, 후자는 lombok 1.18.46에
   * {@code access} 속성이 아예 없어 빌더가 public이 된다. 생성자에 붙인 {@code @Builder}만
   * {@code super(...)}로 넘기는 파라미터까지 빌더에 포함한다.
   */
  @Builder(access = AccessLevel.PRIVATE)
  private Arm(ProductSource source, User owner, Brand brand, Category category, String name,
      String description, Integer priceKrw, String productUrl,
      ArmKind armKind, ArmType armType, int deviceCapacity, Integer segmentCount,
      Integer poleHeightMm, Integer reachMinMm, Integer reachMaxMm, Integer heightMinMm,
      Integer heightMaxMm, ArmMounting mounting, Integer clampMinMm, Integer clampMaxMm,
      Integer tiltMinDeg, Integer tiltMaxDeg, Integer swivelRangeDeg, Integer pivotRangeDeg,
      boolean isVesaPlateDetachable, boolean hasCableManagement, int allowedLoadG) {
    super(source, owner, brand, category, name, description, priceKrw, productUrl);
    this.armKind = armKind;
    this.armType = armType;
    this.deviceCapacity = deviceCapacity;
    this.segmentCount = segmentCount;
    this.poleHeightMm = poleHeightMm;
    this.reachMinMm = reachMinMm;
    this.reachMaxMm = reachMaxMm;
    this.heightMinMm = heightMinMm;
    this.heightMaxMm = heightMaxMm;
    this.mounting = mounting;
    this.clampMinMm = clampMinMm;
    this.clampMaxMm = clampMaxMm;
    this.tiltMinDeg = tiltMinDeg;
    this.tiltMaxDeg = tiltMaxDeg;
    this.swivelRangeDeg = swivelRangeDeg;
    this.pivotRangeDeg = pivotRangeDeg;
    this.isVesaPlateDetachable = isVesaPlateDetachable;
    this.hasCableManagement = hasCableManagement;
    this.allowedLoadG = allowedLoadG;
    validateSpec();
  }

  public static Arm create(ProductSource source, User owner, Brand brand, Category category,
      String name, String description, Integer priceKrw, String productUrl,
      ArmKind armKind, ArmType armType, int deviceCapacity, Integer segmentCount,
      Integer poleHeightMm, Integer reachMinMm, Integer reachMaxMm, Integer heightMinMm,
      Integer heightMaxMm, ArmMounting mounting, Integer clampMinMm, Integer clampMaxMm,
      Integer tiltMinDeg, Integer tiltMaxDeg, Integer swivelRangeDeg, Integer pivotRangeDeg,
      boolean isVesaPlateDetachable, boolean hasCableManagement, int allowedLoadG) {
    return Arm.builder()
        .source(source)
        .owner(owner)
        .brand(brand)
        .category(category)
        .name(name)
        .description(description)
        .priceKrw(priceKrw)
        .productUrl(productUrl)
        .armKind(armKind)
        .armType(armType)
        .deviceCapacity(deviceCapacity)
        .segmentCount(segmentCount)
        .poleHeightMm(poleHeightMm)
        .reachMinMm(reachMinMm)
        .reachMaxMm(reachMaxMm)
        .heightMinMm(heightMinMm)
        .heightMaxMm(heightMaxMm)
        .mounting(mounting)
        .clampMinMm(clampMinMm)
        .clampMaxMm(clampMaxMm)
        .tiltMinDeg(tiltMinDeg)
        .tiltMaxDeg(tiltMaxDeg)
        .swivelRangeDeg(swivelRangeDeg)
        .pivotRangeDeg(pivotRangeDeg)
        .isVesaPlateDetachable(isVesaPlateDetachable)
        .hasCableManagement(hasCableManagement)
        .allowedLoadG(allowedLoadG)
        .build();
  }

	/**
	 * 규격을 갈아끼운다(REQ-ADM-02). 영속 엔티티라 dirty checking이 UPDATE를 낸다 — 빌더로 재조립하지
	 * 않는다(규칙 13). 부분 수정의 병합은 호출부가 끝낸 뒤 전 필드를 넘긴다.
	 */
	public void updateSpec(ArmKind armKind, ArmType armType, int deviceCapacity,
			Integer segmentCount, Integer poleHeightMm, Integer reachMinMm, Integer reachMaxMm,
			Integer heightMinMm, Integer heightMaxMm, ArmMounting mounting, Integer clampMinMm,
			Integer clampMaxMm, Integer tiltMinDeg, Integer tiltMaxDeg, Integer swivelRangeDeg,
			Integer pivotRangeDeg, boolean isVesaPlateDetachable, boolean hasCableManagement,
			int allowedLoadG) {
		this.armKind = armKind;
		this.armType = armType;
		this.deviceCapacity = deviceCapacity;
		this.segmentCount = segmentCount;
		this.poleHeightMm = poleHeightMm;
		this.reachMinMm = reachMinMm;
		this.reachMaxMm = reachMaxMm;
		this.heightMinMm = heightMinMm;
		this.heightMaxMm = heightMaxMm;
		this.mounting = mounting;
		this.clampMinMm = clampMinMm;
		this.clampMaxMm = clampMaxMm;
		this.tiltMinDeg = tiltMinDeg;
		this.tiltMaxDeg = tiltMaxDeg;
		this.swivelRangeDeg = swivelRangeDeg;
		this.pivotRangeDeg = pivotRangeDeg;
		this.isVesaPlateDetachable = isVesaPlateDetachable;
		this.hasCableManagement = hasCableManagement;
		this.allowedLoadG = allowedLoadG;
		validateSpec();
	}

	/**
	 * {@code CHECK}를 쓰지 않으므로 조합 규칙은 WAS가 강제한다(erd.md {@code arm} 절 "WAS 검증 규칙").
	 *
	 * <ul>
	 *   <li>{@link ArmKind#MIC} — {@code pivotRangeDeg}는 NULL이고 {@code isVesaPlateDetachable}는
	 *       {@code false}다. 마이크암엔 화면 세로 회전도 VESA 플레이트도 개념 자체가 없다
	 *   <li>{@link ArmType#STAND} — 마운트 3종이 전부 {@code false}다. 자립형은 책상에 물리지 않는데
	 *       {@code clamp = true}로 기록되면 판정 ①이 틀린 답을 낸다
	 * </ul>
	 *
	 * <p>{@code product_vesa}에 행이 없어야 한다는 세 번째 규칙은 여기서 검사할 수 없다 — 엔티티는
	 * 리포지토리를 모르고(ADR-0001), 그 정션은 아직 매핑돼 있지도 않다. VESA 배선이 붙는 티켓 소관이다.
	 *
	 * <p>생성과 수정 <b>양쪽</b>에서 부른다 — 검증이 두 곳으로 갈리면 어느 쪽이 도는지 알 수 없어진다.
	 */
	private void validateSpec() {
		if (armKind == ArmKind.MIC && (pivotRangeDeg != null || isVesaPlateDetachable)) {
			throw new BusinessException(ProductErrorCode.PRODUCT_SPEC_MIC_ARM_INVALID);
		}
		if (armType == ArmType.STAND && mounting != null
				&& (mounting.clamp() || mounting.grommet() || mounting.wall())) {
			throw new BusinessException(ProductErrorCode.PRODUCT_SPEC_STAND_ARM_INVALID);
		}
	}
}
