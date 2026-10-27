package com.brunchies.dero.placement;

import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.product.FrameType;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 배치의 책상 설정(D18 {@code desk_config}). <b>배치당 정확히 1행</b>이고
 * {@code uq_placement_desk_placement_id}가 그걸 강제한다.
 *
 * <p><b>다중 책상은 채택하지 않았다</b>(2026-07-24 확정, 승인 박동규, DERO-123). 기획은 여전히
 * 책상 1개라 지금은 1:1이고, 그럼에도 컬럼 블록이 아니라 테이블로 뺀 이유는 <b>확장 옵션 하나</b>다
 * — 다중 책상으로 여는 날 유니크만 {@code DROP}하면 스키마가 N개를 받는다. 컬럼 블록이면 그날
 * 엔티티·DTO·쿼리를 전부 다시 써야 한다. 대가는 조인 1개다.
 *
 * <p><b>위치·회전과 방 치수는 넣지 않는다</b> — 책상이 1개인 한 전부 파생이다(씬 원점이 책상이고
 * 벽을 책상 뒷변으로 당긴다). 다중 책상을 실제로 열 때 {@code ALTER TABLE ADD COLUMN}으로 붙인다.
 *
 * <p><b>{@code desk_} 접두사를 컬럼에서 뗐다</b> — 테이블명이 이미 책상이라 중복이고,
 * {@code desk} 규격 서브타입과 같은 이름을 쓰면 제품 모드에서 규격을 복사하는 코드가 컬럼 매핑
 * 없이 1:1이 된다. {@code deskTexture}만 남는 건 FK 명명 규칙 때문이다.
 *
 * <p>배치와 함께 사라지므로 hard delete다 — {@code deleted_at}이 없어 {@link BaseEntity}를
 * 상속한다.
 */
@Entity
@Table(name = "placement_desk")
@SequenceGenerator(name = "placement_desk_seq", sequenceName = "placement_desk_id_seq",
    allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PlacementDesk extends BaseEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "placement_desk_seq")
  private Long id;

  /**
   * 소유 배치. 애그리거트 <b>안</b>이라 저장·삭제는 {@link Placement}를 통과한다 —
   * {@code cascade}는 루트 쪽에만 걸려 있고 여기엔 걸지 않는다(같은 방향으로 두 번 걸면 저장이
   * 왕복한다). DDL은 {@code ON DELETE CASCADE}다.
   */
  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "placement_id", nullable = false, unique = true)
  private Placement placement;

  @Enumerated(EnumType.STRING)
  @Column(name = "spec_source", nullable = false, length = 10)
  private SpecSource specSource;

  /**
   * <b>{@link SpecSource#PRODUCT} 모드일 때만 채운다.</b> 직접 입력 책상은 {@code product} 행이
   * 아예 없어 NULL이다 — 그래서 책상을 {@code placed_item}에 합치지 않았다
   * ({@code placed_item.product_id}가 {@code NOT NULL}이다).
   *
   * <p>다른 애그리거트 루트라 {@code cascade}를 걸지 않는다.
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "product_id")
  private Product product;

  @Column(name = "width_mm", nullable = false)
  private int widthMm;

  @Column(name = "depth_mm", nullable = false)
  private int depthMm;

  /** 바닥~상판 윗면. */
  @Column(name = "height_mm", nullable = false)
  private int heightMm;

  @Column(name = "top_thickness_mm", nullable = false)
  private int topThicknessMm;

  /**
   * 엣지 마감 두께. <b>NULL은 0이 아니라 "상판 두께와 동일"이다</b> — 읽는 쪽은 반드시
   * {@link #effectiveEdgeThicknessMm()}을 쓴다. 0으로 읽으면 판정 ①의 입력이
   * {@code max(상판, 엣지)}라 결과가 틀린다.
   *
   * <p><b>{@code desk} 규격 서브타입의 같은 컬럼은 {@code NOT NULL}이다</b>(D21). 갈리는 이유는
   * 사람이 다르기 때문이다 — 관리자는 제품 사진으로 판단할 수 있지만 사용자는 자기 책상 앞에서
   * 줄자를 들어야 한다. REQ-ENV-05 폼에서 선택 입력이다.
   */
  @Column(name = "edge_thickness_mm")
  private Integer edgeThicknessMm;

  /** 사용자가 고른 상판 재질. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "desk_texture_id", nullable = false)
  private DeskTexture deskTexture;

  /**
   * {@code product} 패키지의 {@link FrameType}을 그대로 쓴다 — 제품 모드에서 규격을 복사할 때 같은
   * 열거여야 변환 없이 옮겨진다. {@code placement} → {@code product} 의존은 허용 방향이다
   * (ADR-0007).
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "frame_type", nullable = false, length = 20)
  private FrameType frameType;

  /** 카탈로그 제품에서 규격을 복사해 온 책상. */
  public static PlacementDesk fromProduct(Placement placement, Product product, int widthMm,
      int depthMm, int heightMm, int topThicknessMm, Integer edgeThicknessMm,
      DeskTexture deskTexture, FrameType frameType) {
    return PlacementDesk.builder()
        .placement(placement)
        .specSource(SpecSource.PRODUCT)
        .product(product)
        .widthMm(widthMm)
        .depthMm(depthMm)
        .heightMm(heightMm)
        .topThicknessMm(topThicknessMm)
        .edgeThicknessMm(edgeThicknessMm)
        .deskTexture(deskTexture)
        .frameType(frameType)
        .build();
  }

  /** 사용자가 줄자로 재서 직접 입력한 책상. {@code product}는 NULL이다. */
  public static PlacementDesk fromCustom(Placement placement, int widthMm, int depthMm,
      int heightMm, int topThicknessMm, Integer edgeThicknessMm, DeskTexture deskTexture,
      FrameType frameType) {
    return PlacementDesk.builder()
        .placement(placement)
        .specSource(SpecSource.CUSTOM)
        .widthMm(widthMm)
        .depthMm(depthMm)
        .heightMm(heightMm)
        .topThicknessMm(topThicknessMm)
        .edgeThicknessMm(edgeThicknessMm)
        .deskTexture(deskTexture)
        .frameType(frameType)
        .build();
  }

	/**
	 * 스냅샷 저장의 UPDATE 갈래 — 배치당 1행이라 새 행으로 갈아끼우지 않고 제자리에서 고친다
	 * (영속 엔티티는 dirty checking이 UPDATE를 낸다, 규칙 13).
	 *
	 * <p>{@code specSource}가 바뀌면 {@code product}도 같이 바뀐다 — {@link SpecSource#CUSTOM}으로
	 * 전환할 때 {@code product}를 안 지우면 "직접 입력인데 제품을 가리키는" 행이 남는다. 그래서 두
	 * 값을 한 메서드가 같이 받는다.
	 */
	public void apply(SpecSource specSource, Product product, int widthMm, int depthMm, int heightMm,
			int topThicknessMm, Integer edgeThicknessMm, DeskTexture deskTexture,
			FrameType frameType) {
		this.specSource = specSource;
		this.product = product;
		this.widthMm = widthMm;
		this.depthMm = depthMm;
		this.heightMm = heightMm;
		this.topThicknessMm = topThicknessMm;
		this.edgeThicknessMm = edgeThicknessMm;
		this.deskTexture = deskTexture;
		this.frameType = frameType;
	}

  /**
   * 판정이 실제로 쓰는 엣지 두께. <b>NULL이면 상판 두께다</b> — 이 한 줄을 호출자마다 다시 쓰면
   * 어딘가는 0으로 읽는다.
   */
  public int effectiveEdgeThicknessMm() {
    return edgeThicknessMm != null ? edgeThicknessMm : topThicknessMm;
  }

	/**
	 * 리믹스 복사본을 만든다({@link Placement#copyOf}). {@code specSource}·{@code product}를 함께
	 * 옮기는 이유는 {@link #apply}와 같다 — 둘이 갈리면 "직접 입력인데 제품을 가리키는" 행이 된다.
	 */
	PlacementDesk copyInto(Placement target) {
		return PlacementDesk.builder()
				.placement(target)
				.specSource(specSource)
				.product(product)
				.widthMm(widthMm)
				.depthMm(depthMm)
				.heightMm(heightMm)
				.topThicknessMm(topThicknessMm)
				.edgeThicknessMm(edgeThicknessMm)
				.deskTexture(deskTexture)
				.frameType(frameType)
				.build();
	}

}
