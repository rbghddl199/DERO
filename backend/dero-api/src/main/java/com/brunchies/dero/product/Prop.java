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
 * 소품 규격 — 규격 서브타입 4종에 들어가지 않는 나머지 전부. {@link Product}의 JOINED 서브타입이고
 * PK({@code product_id})가 곧 부모 FK다.
 *
 * <p><b>관절이 있는 거치대(노트북 거치대·휴대폰 거치대)도 여기다</b>({@code spec_type = PROP}).
 * 관절 동작에 필요한 값은 축·피벗점·한계각까지 전부 {@code asset.rig_manifest} 안에 있다.
 *
 * <p><b>각도 컬럼을 두지 않는다</b>(2026-07-23) — {@link Arm}이 각도 컬럼을 갖는 건 카탈로그 표기·필터
 * 때문이지 관절을 움직이기 위해서가 아니다. 거치대의 가동 범위를 표기·필터할 요구사항이 아직 없어
 * 컬럼을 미리 파면 영원히 NULL인 컬럼이 된다.
 *
 * <p><b>{@code isStackable}에 기본값을 두지 않는다</b>(전역 규칙 "제약"의 명시적 예외) — 제품 등록 시
 * 실측해서 반드시 채워야 하는 값이라 미입력이 조용히 "아니오"로 둔갑하면 REQ-SIM-02 스태킹 스냅이 틀린
 * 답을 낸다. 정적 팩터리의 필수 인자다.
 *
 * <p><b>감사 컬럼을 매핑하지 않는다</b>(ADR-0006 결정 5) — 감사 필드는 {@link Product}가 선언한 것이
 * 정본이고 여기서 다시 선언하면 중복 매핑으로 부팅이 죽는다.
 */
@Entity
@Table(name = "prop")
@DiscriminatorValue("PROP")
@PrimaryKeyJoinColumn(name = "product_id")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Prop extends Product {

  @Column(name = "width_mm", nullable = false)
  private int widthMm;

  @Column(name = "depth_mm", nullable = false)
  private int depthMm;

  @Column(name = "height_mm", nullable = false)
  private int heightMm;

  @Column(name = "weight_g")
  private Integer weightG;

  /** 위에 다른 아이템을 얹을 수 있는가(REQ-SIM-02 스태킹 스냅). */
  @Column(name = "is_stackable", nullable = false)
  private boolean isStackable;

  /**
   * 이 제품이 놓일 수 있는 표면. <b>배치 시 검사는
   * {@code placedItem.surfaceType == prop.mountSurface} 한 줄이다</b> — {@link MountSurface}가
   * {@code placed_item.surface_type}과 값 집합을 공유하는 이유다.
   *
   * <p><b>지금은 제품당 표면 1개다.</b> 상판에도 선반 위에도 놓이는 제품이 실제로 등록되면 그때
   * {@code product_mount_surface} 정션으로 넓힌다.
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "mount_surface", nullable = false, length = 20)
  private MountSurface mountSurface;

  /**
   * 부모 필드까지 한 번에 받는 생성자 빌더.
   *
   * <p><b>클래스 레벨 {@code @Builder}·{@code @SuperBuilder}를 쓰지 않는다</b> — 전자는 상속을 다루지
   * 못해 {@link Product}의 필드 9개가 빌더에서 조용히 사라지고, 후자는 lombok 1.18.46에
   * {@code access} 속성이 아예 없어 빌더가 public이 된다. 생성자에 붙인 {@code @Builder}만
   * {@code super(...)}로 넘기는 파라미터까지 빌더에 포함한다.
   */
  @Builder(access = AccessLevel.PRIVATE)
  private Prop(ProductSource source, User owner, Brand brand, Category category, String name,
      String description, Integer priceKrw, String productUrl, int widthMm,
      int depthMm, int heightMm, Integer weightG, boolean isStackable,
      MountSurface mountSurface) {
    super(source, owner, brand, category, name, description, priceKrw, productUrl);
    this.widthMm = widthMm;
    this.depthMm = depthMm;
    this.heightMm = heightMm;
    this.weightG = weightG;
    this.isStackable = isStackable;
    this.mountSurface = mountSurface;
  }

  public static Prop create(ProductSource source, User owner, Brand brand, Category category,
      String name, String description, Integer priceKrw, String productUrl,
      int widthMm, int depthMm, int heightMm, Integer weightG, boolean isStackable,
      MountSurface mountSurface) {
    return Prop.builder()
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
        .weightG(weightG)
        .isStackable(isStackable)
        .mountSurface(mountSurface)
        .build();
  }

	/**
	 * 규격을 갈아끼운다(REQ-ADM-02). 영속 엔티티라 dirty checking이 UPDATE를 낸다 — 빌더로 재조립하지
	 * 않는다(규칙 13). 부분 수정의 병합은 호출부가 끝낸 뒤 전 필드를 넘긴다.
	 */
	public void updateSpec(int widthMm, int depthMm, int heightMm, Integer weightG,
			boolean isStackable, MountSurface mountSurface) {
		this.widthMm = widthMm;
		this.depthMm = depthMm;
		this.heightMm = heightMm;
		this.weightG = weightG;
		this.isStackable = isStackable;
		this.mountSurface = mountSurface;
	}
}
