package com.brunchies.dero.placement;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.product.MountSurface;
import com.brunchies.dero.product.Product;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 배치에 놓인 인스턴스. <b>인스턴스 1개 = 행 1개</b>이고 수량 컬럼을 두지 않는다 — 같은 모니터
 * 2대를 한 행으로 접으면 개별 좌표를 잃는다.
 *
 * <p>좌표를 JSON이 아니라 정규 컬럼으로 두는 이유: JSON에 넣으면 "이 제품을 쓴 배치 찾기" 같은
 * 조회가 불가능하고 FK 무결성도 못 건다. 배치 아이템은 조회·집계 대상이다.
 *
 * <p>배치와 함께 사라지므로 hard delete다 — {@code deleted_at}이 없어 {@link BaseEntity}를
 * 상속한다.
 */
@Entity
@Table(name = "placed_item")
@SequenceGenerator(name = "placed_item_seq", sequenceName = "placed_item_id_seq",
    allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PlacedItem extends BaseEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "placed_item_seq")
  private Long id;

  /**
   * 소유 배치. 애그리거트 <b>안</b>이라 저장·삭제는 {@link Placement}를 통과한다 —
   * {@code cascade}는 루트 쪽 컬렉션에만 걸려 있다. DDL은 {@code ON DELETE CASCADE}다.
   */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "placement_id", nullable = false)
  private Placement placement;

  /**
   * 놓인 제품. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다.
   *
   * <p><b>이 LAZY 프록시에 {@code instanceof}를 쓰면 조용히 거짓이 된다</b> — 대상이 다형 루트
   * {@link Product}라 {@code join fetch} 없이 로드하면 Hibernate가 구체 타입을 모르는 프록시를
   * 준다. 호환성 판정 경로는 반드시 서브타입까지 {@code join fetch}로 끌어온다
   * ({@code product/CLAUDE.md}).
   */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "product_id", nullable = false)
  private Product product;

  @Column(name = "position_x_mm", nullable = false)
  private int positionXMm;

  @Column(name = "position_y_mm", nullable = false)
  private int positionYMm;

  @Column(name = "position_z_mm", nullable = false)
  private int positionZMm;

  /**
   * 수직축 회전. <b>전역 규칙의 "각도는 {@code INT}"에 대한 명시적 예외다</b> — REQ-SIM-18이 스텝
   * 단위 없는 임의 실수각을 요구한다. 정수로 자르면 경계·스태킹 판정이 회전 footprint 기준이라
   * 저장 전 "적합"이던 경계선상 배치가 재로드 후 "위반"으로 뒤집힌다. {@code double}은 반올림이
   * 조용히 어긋나 {@link BigDecimal}로 받는다.
   */
  @Column(name = "rotation_deg", nullable = false, precision = 6, scale = 2)
  private BigDecimal rotationDeg;

  /**
   * 앞뒤 기울기. <b>사용자가 준 자세이고 로드 시 재계산하지 않는다</b>(ADR-0023 결정 2) — 접촉
   * 솔버가 매 프레임 자세를 다시 계산하던 구조가 사용자에게서 각도 결정 권한을 빼앗았고, 그래서
   * 자세는 파생값이 아니라 원본 입력이 됐다. 저장하지 않으면 리로드마다 기울기가 소실된다.
   *
   * <p>타입 근거는 {@link #rotationDeg}와 같다. <b>±75° 상한은 클라이언트가 강제하고 서버는 값을
   * 저장만 한다</b>(ADR-0023 결정 3) — {@code emitter_brightness_scale}처럼 DB {@code CHECK}도
   * 걸지 않는다.
   */
  @Column(name = "pitch_deg", nullable = false, precision = 6, scale = 2)
  private BigDecimal pitchDeg;

  /**
   * 놓인 표면. <b>{@code product} 패키지의 {@link MountSurface}를 그대로 재사용한다</b> — 배치
   * 가능 검사가 {@code surfaceType == prop.mountSurface} 한 줄이라 두 열거로 나뉘면 그 비교가
   * 성립하지 않는다.
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "surface_type", nullable = false, length = 20)
  private MountSurface surfaceType;

  /**
   * <b>{@link MountSurface#WALL}·{@link MountSurface#PEGBOARD}일 때만 채운다</b>. 나머지 표면은
   * NULL이다 — 없으면 재로드 시 좌표에서 어느 벽인지 역추정해야 한다.
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "wall_side", length = 10)
  private WallSide wallSide;

  /**
   * VESA로 암에 결합된 상태. <b>표시 상태가 아니라 판정 입력이다</b> — 결합하면 스탠드 메쉬가
   * 숨겨져 콜라이더와 제품 깊이가 바뀐다. 저장하지 않으면 저장 시점에 통과한 배치가 재로드 시
   * 스탠드가 되살아나 경계·충돌 위반으로 뒤집힌다(REQ-SIM-13/14 Must).
   */
  @Column(name = "is_vesa_mounted", nullable = false)
  private boolean isVesaMounted;

  /**
   * 어느 암에 물렸는지. 결합 안 했으면 NULL이다. 자기참조지만 같은 애그리거트 안이고 생명주기는
   * 루트가 쥐므로 여기엔 {@code cascade}를 걸지 않는다.
   *
   * <p><b>{@code fk_placed_item_mounted_to_placed_item_id}는 {@code NO ACTION}이다</b> — 암을
   * 지울 때 물린 쪽을 먼저 {@link #unmount()}로 끊지 않으면 FK 위반이다(ADR-0009 결정 8).
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "mounted_to_placed_item_id")
  private PlacedItem mountedToPlacedItem;

  /**
   * 관절 키 → 현재 값. revolute는 도, prismatic은 mm다. 관절 없는 아이템은 NULL.
   *
   * <p><b>레코드가 아니라 {@code Map}이다</b> — 키는 {@code asset.rig_manifest}가 정의하는
   * 문자열({@code base-yaw}·{@code elbow-pitch} 등)이라 <b>제품마다 키 집합이 다르다</b>.
   * ADR-0006의 "JSONB는 도메인 레코드로"는 필드가 고정인 매니페스트 얘기고, 여기엔 고정 필드가
   * 없다({@code monitor.ports}가 {@code List<String>}인 것과 같은 사유).
   *
   * <p><b>driver 관절만 저장한다.</b> 종속 관절 값은 로드 시 {@code driver × ratio + offset}로
   * 재계산한다 — 저장하면 ratio를 고친 날 두 값이 어긋나고 어긋난 쪽이 렌더를 지배한다
   * (ADR-0002 결정 2). 축·피벗·한계각은 {@code asset.rig_manifest}가 정본이라 여기 복사하지 않는다.
   *
   * <p><b>인덱스를 만들지 않는다</b>(GIN 포함) — 이 컬럼으로 조회하지 않으므로 쓰기 비용만 는다.
   */
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "joint_values", columnDefinition = "jsonb")
  private Map<String, Double> jointValues;

  /**
   * 가변 발광의 사용자 선택색. <b>{@code '#RRGGBB'} 문자열이다</b> —
   * {@code product_emitter.default_color}와 같은 표기라야 WAS가 둘을 변환 없이 맞바꾼다.
   * INT({@code 0xRRGGBB})로 두면 제품 쪽과 표기가 갈려 어느 쪽이 정본인지 코드마다 달라진다.
   *
   * <p>아이템당 1색이다(ADR-0003 결정 3). 발광체가 없거나 {@code product_emitter.recolorable}이
   * {@code false}면 NULL이다 — 고정 발광 제품은 색이 제품 정체성의 일부라 사용자가 바꿀 대상이 아니다.
   */
  @Column(name = "emitter_color", length = 7)
  private String emitterColor;

  /**
   * 사용자가 고른 밝기 <b>배율</b>(무단위). 렌더 lm = {@code product_emitter.lumens × 이 값}이고
   * <b>NULL은 "고를 수 있는데 안 골랐다"(1배)</b>다 — "못 고른다"는 {@code recolorable = false}가
   * 따로 말한다. 둘을 한 컬럼으로 접으면 저작자가 기준값을 고친 날 못 고르는 제품만 옛 값에 얼어붙는다.
   *
   * <p><b>절대 lm이 아니라 배율인 이유</b>: lm으로 저장하면 기준 lm이 개정된 날 사용자가 고른 상대
   * 밝기가 조용히 뒤집힌다(400lm 램프를 "절반"으로 켜 뒀는데 기준이 800lm이 되면 저장된 200lm이 이제
   * 1/4이다). {@link BigDecimal}({@code NUMERIC(3,2)})인 이유는 {@link #rotationDeg}와 같다 — 연속
   * 조작 인스턴스 값이라 정수로 자르면 슬라이더가 계단이 된다. <b>상한은 DB가 아니라 WAS가 강제한다</b>.
   *
   * <p><b>실효 lm은 그림자 배정의 랭킹 키이기도 하다</b>(DERO-223) — 이 값이 없으면 사용자가
   * 어둡게 낮춰 둔 램프가 재로드 후에도 계속 그림자 칸을 물고 있는다.
   */
  @Column(name = "emitter_brightness_scale", precision = 3, scale = 2)
  private BigDecimal emitterBrightnessScale;

  /**
   * 사용자가 고른 색온도(켈빈). NULL이면 제품 기본값이다. 켈빈의 소수점은 제품 UI에 존재하지 않는
   * 정밀도라 {@code INT}다({@code light.color_temperature_min_k}와 같은 타입).
   *
   * <p><b>{@code product_emitter.recolorable}이 {@code true}면 무시된다</b> — RGB 모드와 백색(K)
   * 모드를 겸하는 듀얼 LED 스탠드가 실재하지만 "지금 어느 모드인가"는 상태 축을 하나 더 요구해 V1
   * 밖으로 뺐다. 지금 규칙은 "리컬러 가능하면 색이 지배하고 K는 읽지 않는다" 한 줄이다.
   */
  @Column(name = "emitter_color_temperature_k")
  private Integer emitterColorTemperatureK;

  /**
   * 새 인스턴스. {@code isVesaMounted}는 DDL 기본값과 같은 {@code false}로 시작하고 결합은
   * {@link #mountVesaTo(PlacedItem)}가 맡는다 — "아직 아님"이 곧 {@code false}인 값이라 기본값을
   * 둬도 둔갑 문제가 없다(규격 서브타입 boolean과 갈리는 지점).
   */
  public static PlacedItem create(Placement placement, Product product, int positionXMm,
      int positionYMm, int positionZMm, BigDecimal rotationDeg, BigDecimal pitchDeg,
      MountSurface surfaceType, WallSide wallSide, Map<String, Double> jointValues,
      String emitterColor) {
    return PlacedItem.builder()
        .placement(placement)
        .product(product)
        .positionXMm(positionXMm)
        .positionYMm(positionYMm)
        .positionZMm(positionZMm)
        .rotationDeg(rotationDeg)
        .pitchDeg(pitchDeg)
        .surfaceType(surfaceType)
        .wallSide(wallSide)
        .isVesaMounted(false)
        .jointValues(jointValues)
        .emitterColor(emitterColor)
        .build();
  }

  /**
   * 암에 VESA 결합한다. 두 값이 함께 움직이는 이유는 {@code is_vesa_mounted}가 "VESA로 암에
   * 결합된 상태"를 뜻하기 때문이다 — 따로 두면 "결합했는데 대상이 없는" 행이 만들어진다.
   */
  public void mountVesaTo(PlacedItem arm) {
    if (arm == null || arm == this) {
      throw new IllegalArgumentException("결합 대상 암이 필요하다");
    }
    this.mountedToPlacedItem = arm;
    this.isVesaMounted = true;
  }

	/**
	 * 스냅샷 저장의 UPDATE 갈래(ADR-0009 결정 2) — 기존 행을 제자리에서 고친다. 영속 엔티티라 dirty
	 * checking이 UPDATE를 내므로 빌더로 재조립하지 않는다(규칙 13).
	 *
	 * <p><b>결합 상태({@code isVesaMounted}·{@code mountedToPlacedItem})는 여기서 안 건드린다</b> —
	 * 둘은 항상 같이 움직여야 해서 {@link #mountVesaTo}/{@link #unmount} 밖에서 따로 손대면
	 * "결합했는데 대상이 없는" 행이 만들어진다. 병합 루프가 그 둘로만 세운다.
	 */
	public void update(Product product, int positionXMm, int positionYMm, int positionZMm,
			BigDecimal rotationDeg, BigDecimal pitchDeg, MountSurface surfaceType, WallSide wallSide,
			Map<String, Double> jointValues, String emitterColor) {
		this.product = product;
		this.positionXMm = positionXMm;
		this.positionYMm = positionYMm;
		this.positionZMm = positionZMm;
		this.rotationDeg = rotationDeg;
		this.pitchDeg = pitchDeg;
		this.surfaceType = surfaceType;
		this.wallSide = wallSide;
		this.jointValues = jointValues;
		this.emitterColor = emitterColor;
	}

  /** 결합을 끊는다. 암을 삭제하기 전에 먼저 불러야 FK 위반이 나지 않는다. */
  public void unmount() {
    this.mountedToPlacedItem = null;
    this.isVesaMounted = false;
  }

	/**
	 * 리믹스 복사본을 만든다({@link Placement#copyOf}). <b>결합은 여기서 세우지 않는다</b> —
	 * 대상이 복사본 안의 다른 아이템이라 이 인스턴스 혼자서는 알 수 없고, 원본의
	 * {@code mountedToPlacedItem}을 그대로 베끼면 복사본이 원본 아이템을 가리킨다. 재매핑은 루트가
	 * {@link #mountVesaTo}로 한다.
	 *
	 * <p>{@code jointValues}는 새 {@code Map}으로 뜬다 — 같은 인스턴스를 두 행이 공유하면 한쪽
	 * 관절을 돌렸을 때 다른 배치의 JSONB까지 바뀐다.
	 */
	PlacedItem copyInto(Placement target) {
		return PlacedItem.builder()
				.placement(target)
				.product(product)
				.positionXMm(positionXMm)
				.positionYMm(positionYMm)
				.positionZMm(positionZMm)
				.rotationDeg(rotationDeg)
				.pitchDeg(pitchDeg)
				.surfaceType(surfaceType)
				.wallSide(wallSide)
				.isVesaMounted(false)
				.jointValues(jointValues == null ? null : new HashMap<>(jointValues))
				.emitterColor(emitterColor)
				.emitterBrightnessScale(emitterBrightnessScale)
				.emitterColorTemperatureK(emitterColorTemperatureK)
				.build();
	}

}
