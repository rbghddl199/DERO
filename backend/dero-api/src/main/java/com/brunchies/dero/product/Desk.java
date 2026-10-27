package com.brunchies.dero.product;

import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrimaryKeyJoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 책상 규격. {@link Product}의 JOINED 서브타입이고 PK({@code product_id})가 곧 부모 FK다.
 *
 * <p><b>판정 ①(암↔책상 클램프)이 보는 값은 {@code max(topThicknessMm, edgeThicknessMm)}이고 그 파생값을
 * 저장하지 않는다</b>(D21, 2026-07-23 승인 박동규). 클램프 조가 지나가는 구간의 최대 두께가 물림
 * 조건이라, 두꺼운 엣지 몰딩(상판 18/엣지 40)은 상판만 보면 거짓 "적합"이 되고 베벨 엣지(상판 25/엣지
 * 15)는 엣지만 보면 거짓 "적합"이 된다. 굳혀 두면 원본을 고친 날 조용히 어긋나므로 두 컬럼이 정본이고
 * WAS가 매번 계산한다 — 판정 규칙 정본은 {@code docs/context/compatibility.md}.
 *
 * <p><b>{@code edgeThicknessMm}가 {@code NOT NULL}인 이유</b>(2026-07-23, 종전 nullable에서 승격):
 * 판정 입력이 된 이상 미등록이 상판 값으로 조용히 폴백하면 위 두꺼운 엣지 케이스가 그대로 거짓
 * "적합"이 된다. 엣지 마감이 평범하면 {@code topThicknessMm}과 같은 값을 넣는다.
 *
 * <p><b>{@code isRounded}에 기본값을 두지 않는다</b>(전역 규칙 "제약"의 명시적 예외) — 제품 등록 시
 * 실측해서 반드시 채워야 하는 값이라 {@code false} 기본값을 두면 미입력이 조용히 "아니오"로 둔갑한다.
 * 그래서 정적 팩터리의 필수 인자다.
 *
 * <p><b>감사 컬럼을 매핑하지 않는다</b>(ADR-0006 결정 5) — 이 테이블에 {@code created_at}·
 * {@code updated_at}이 실재하지만 의도적으로 죽여 뒀다. JOINED에서 필드는 선언한 클래스의 테이블로
 * 가므로 감사 필드는 {@link Product}가 선언한 것이 정본이고, 여기서 다시 선언하면 중복 매핑으로
 * 부팅이 죽는다. {@code deleted_at}도 없다 — {@code product.deleted_at}이 정본이다.
 */
@Entity
@Table(name = "desk")
@DiscriminatorValue("DESK")
@PrimaryKeyJoinColumn(name = "product_id")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Desk extends Product {

  /** 상판 가로. */
  @Column(name = "width_mm", nullable = false)
  private int widthMm;

  /** 상판 깊이. */
  @Column(name = "depth_mm", nullable = false)
  private int depthMm;

  /** 바닥~상판 윗면. */
  @Column(name = "height_mm", nullable = false)
  private int heightMm;

  /** 상판 두께. 판정 ① 입력의 한쪽. */
  @Column(name = "top_thickness_mm", nullable = false)
  private int topThicknessMm;

  /** 엣지 마감(밴딩·몰딩 포함) 최대 두께. 판정 ① 입력의 다른 쪽. */
  @Column(name = "edge_thickness_mm", nullable = false)
  private int edgeThicknessMm;

  @Column(name = "is_rounded", nullable = false)
  private boolean isRounded;

  /**
   * 이 제품이 실제로 파는 상판 재질. {@code catalog} 애그리거트의 다른 루트라 {@code cascade}를 걸지
   * 않는다 — 걸면 책상 저장이 재질 마스터까지 번진다.
   */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "desk_texture_id", nullable = false)
  private DeskTexture deskTexture;

  @Enumerated(EnumType.STRING)
  @Column(name = "frame_type", nullable = false, length = 20)
  private FrameType frameType;

  /**
   * 상판 허용 하중. <b>호환성 판정 3종에는 쓰이지 않는다</b> — 모니터↔암 하중은 {@code arm} 쪽이
   * 맡는다. 있으면 참고값이라 nullable이다.
   */
  @Column(name = "allowed_load_g")
  private Integer allowedLoadG;

  /**
   * 부모 필드까지 한 번에 받는 생성자 빌더.
   *
   * <p><b>클래스 레벨 {@code @Builder}·{@code @SuperBuilder}를 쓰지 않는다</b> — 전자는 상속을 다루지
   * 못해 {@link Product}의 필드 9개가 빌더에서 조용히 사라지고, 후자는 lombok 1.18.46에
   * {@code access} 속성이 아예 없어 빌더가 public이 된다(불변식을 건너뛴 인스턴스를 아무 데서나 만들
   * 수 있게 된다). 생성자에 붙인 {@code @Builder}만 {@code super(...)}로 넘기는 파라미터까지 빌더에
   * 포함한다.
   */
  @Builder(access = AccessLevel.PRIVATE)
  private Desk(ProductSource source, User owner, Brand brand, Category category, String name,
      String description, Integer priceKrw, String productUrl, int widthMm,
      int depthMm, int heightMm, int topThicknessMm, int edgeThicknessMm, boolean isRounded,
      DeskTexture deskTexture, FrameType frameType, Integer allowedLoadG) {
    super(source, owner, brand, category, name, description, priceKrw, productUrl);
    this.widthMm = widthMm;
    this.depthMm = depthMm;
    this.heightMm = heightMm;
    this.topThicknessMm = topThicknessMm;
    this.edgeThicknessMm = edgeThicknessMm;
    this.isRounded = isRounded;
    this.deskTexture = deskTexture;
    this.frameType = frameType;
    this.allowedLoadG = allowedLoadG;
  }

  public static Desk create(ProductSource source, User owner, Brand brand, Category category,
      String name, String description, Integer priceKrw, String productUrl,
      int widthMm, int depthMm, int heightMm, int topThicknessMm, int edgeThicknessMm,
      boolean isRounded, DeskTexture deskTexture, FrameType frameType, Integer allowedLoadG) {
    return Desk.builder()
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
        .topThicknessMm(topThicknessMm)
        .edgeThicknessMm(edgeThicknessMm)
        .isRounded(isRounded)
        .deskTexture(deskTexture)
        .frameType(frameType)
        .allowedLoadG(allowedLoadG)
        .build();
  }

	/**
	 * 규격을 갈아끼운다(REQ-ADM-02). 영속 엔티티라 dirty checking이 UPDATE를 낸다 — 빌더로 재조립하지
	 * 않는다(규칙 13). 부분 수정의 병합은 호출부가 끝낸 뒤 전 필드를 넘긴다.
	 *
	 * <p>이 서브타입에는 조합 규칙이 없다 — 판정 ①이 보는 {@code max(top, edge)}는 파생값이라 저장하지
	 * 않고, 두 컬럼 사이에 대소 제약도 없다(베벨 엣지는 엣지가 더 얇고 몰딩은 더 두껍다).
	 */
	public void updateSpec(int widthMm, int depthMm, int heightMm, int topThicknessMm,
			int edgeThicknessMm, boolean isRounded, DeskTexture deskTexture, FrameType frameType,
			Integer allowedLoadG) {
		this.widthMm = widthMm;
		this.depthMm = depthMm;
		this.heightMm = heightMm;
		this.topThicknessMm = topThicknessMm;
		this.edgeThicknessMm = edgeThicknessMm;
		this.isRounded = isRounded;
		this.deskTexture = deskTexture;
		this.frameType = frameType;
		this.allowedLoadG = allowedLoadG;
	}
}
