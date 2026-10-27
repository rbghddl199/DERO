package com.brunchies.dero.product;

import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.User;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorColumn;
import jakarta.persistence.DiscriminatorType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Inheritance;
import jakarta.persistence.InheritanceType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.ConcreteProxy;

/**
 * 카탈로그 제품 마스터이자 규격 서브타입 5종의 JOINED 상속 루트. 감사 3종.
 *
 * <p><b>추상 클래스다</b> — {@code spec_type}이 {@code NOT NULL}이고 값이 5종뿐이라 서브타입 아닌
 * 순수 {@code Product} 행은 존재할 수 없다. {@code spec_type}은 {@link DiscriminatorColumn}이 이미
 * 쓰므로 <b>필드로 또 선언하지 않는다</b>(같은 컬럼을 두 번 매핑하면 부팅에서 죽는다).
 *
 * <p><b>{@code spec_type}은 변경할 수 없다</b> — JPA가 엔티티 타입 변경을 지원하지 않아 규격 종류를
 * 바꾸려면 행을 지우고 새로 만들어야 하고, 그 순간 {@code placed_item}·{@code cart_item}·
 * {@code product_like}·{@code product_vibe}가 전부 끊어진다(ADR-0006 결정 4).
 *
 * <p><b>사용자 업로드도 {@code product} 행이다</b>(D20) — 별도 테이블을 만들지 않는다. 그래서
 * 카탈로그 전용 3컬럼({@code brand}·{@code priceKrw}·{@code productUrl})이 nullable이고,
 * {@link ProductSource}별 필수 여부는 <b>WAS가 강제한다</b>. 자작 제품은 {@code priceKrw}가
 * NULL이라 견적 합산에서 빠진다.
 *
 * <p><b>대표 이미지 컬럼을 두지 않는다</b>(ADR-0011 결정 6) — 옛 {@code image_key} 1컬럼은
 * {@link ProductImage} 테이블이 흡수했고 대표 1장은 {@code product_image.is_primary}가 정본이다.
 * 컬럼과 테이블 양쪽에 두면 "대표가 뭐냐"를 조회마다 다투게 된다. <b>{@link ProductImage} 행이
 * 하나도 없으면 프론트가 폴백 아이콘을 쓴다</b> — GLB 썸네일을 서버에서 렌더하지 않는다.
 *
 * <p><b>{@link ConcreteProxy}를 붙인 이유</b>: 다형 루트에 대한 LAZY 프록시는 구체 타입을 몰라서
 * {@code product instanceof Desk}가 전부 거짓이 되고, 그러면 {@link SpecType#of}가
 * {@code PRODUCT_UNKNOWN_SPEC_SUBTYPE}을 던지거나 규격 조립·호환성 판정이 조용히 스킵된다(실제로
 * 그 경로로 500이 났다). 이 어노테이션이 붙으면 프록시가 항상 구체 타입으로 해석돼
 * {@code instanceof}·캐스트가 안전해진다 — 다만 N+1 대책은 아니므로 판정 경로는 여전히
 * {@code join fetch}로 서브타입까지 끌어온다.
 *
 * <p>생성은 서브타입 5종의 정적 팩터리를 통한다. 부모 필드는 아래 {@code protected} 생성자를
 * {@code super(...)}로 받는다 — Lombok {@code @SuperBuilder}를 쓰지 않는 이유는 그 생성자 주석에 적었다.
 */
@Entity
@ConcreteProxy
@Table(name = "product")
@SequenceGenerator(name = "product_seq", sequenceName = "product_id_seq", allocationSize = 50)
@Inheritance(strategy = InheritanceType.JOINED)
@DiscriminatorColumn(name = "spec_type", discriminatorType = DiscriminatorType.STRING, length = 20)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public abstract class Product extends BaseSoftDeleteEntity {

  /** 제품당 실사 이미지 상한(REQ-REC-06 · erd.md {@code product_image} 절). */
  public static final int MAX_IMAGES = 8;

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "product_seq")
  private Long id;

  /**
   * {@link DiscriminatorColumn}이 쓰는 {@code spec_type}을 <b>읽기 전용으로</b> 한 번 더 매핑한 것 —
   * 값을 쓰는 쪽은 여전히 판별자뿐이고({@code insertable = false, updatable = false}) 이 필드는
   * 그 컬럼을 읽기만 한다. 쿼리에서 {@code type(p) = Desk} 대신 {@code p.specType = DESK}로
   * 규격 종류를 <b>enum 값으로</b> 비교하려고 둔다(ADR-0018 결정 3 "이미 매핑된 판별자를 다시
   * 만들지 마라").
   *
   * <p><b>쓰기 매핑이었다면 정말로 죽는다</b> — 같은 컬럼을 두 번 쓰기로 매핑하면 Hibernate가
   * {@code Repeated column in mapping for entity}로 부팅을 막는다. 읽기 전용이 그 금지의 예외라는
   * 것은 2026-08-02에 Hibernate 7.4 + Postgres 18로 실측했다(부팅 {@code ddl-auto: validate} 통과,
   * 5종 값 일치, LAZY 프록시 초기화 후에도 일치 — {@code ProductQuerydslPersistenceTest}).
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "spec_type", nullable = false, length = 20, insertable = false, updatable = false)
  private SpecType specType;

  @Enumerated(EnumType.STRING)
  @Column(name = "source", nullable = false, length = 10)
  private ProductSource source;

  /**
   * {@code source = USER}일 때만 채운다. <b>{@code ON DELETE SET NULL}이라 탈퇴해도 승인된 자작
   * 제품은 남는다</b> — 남의 배치가 {@code placed_item.product_id}로 참조 중이면 지우는 순간 그
   * 배치가 깨진다. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다.
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "owner_user_id")
  private User owner;

  /** {@code source = CATALOG}면 필수(WAS 강제). 다른 애그리거트 루트라 {@code cascade} 없음. */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "brand_id")
  private Brand brand;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "category_id", nullable = false)
  private Category category;

  @Column(name = "name", nullable = false, length = 200)
  private String name;

  @Column(name = "description", columnDefinition = "TEXT")
  private String description;

  /** 원화 정가. 자작 제품은 NULL이고 견적 합산에서 빠진다. */
  @Column(name = "price_krw")
  private Integer priceKrw;

  @Column(name = "product_url", length = 2048)
  private String productUrl;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false, length = 10)
  private ProductStatus status;

  /**
   * 애그리거트 <b>안</b>의 에셋이라 {@code cascade} + {@code orphanRemoval}을 건다 —
   * {@code AssetRepository}가 없으므로(ADR-0007) 저장·삭제가 이 루트를 통과해야 한다.
   *
   * <p><b>관계가 nullable이다</b> — 책상은 규격값으로 절차 생성하므로(D18) {@code asset} 행이 아예
   * 없다. 그래서 이 연관은 LAZY로 적어도 실제로는 지연되지 않는다(NULL일 수 있는 역방향 1:1은
   * 프록시를 만들 수 없어 Hibernate가 {@code Product}를 읽을 때마다 {@code asset}을 한 번 더
   * 조회한다). 목록 조회처럼 에셋이 필요 없는 경로는 프로젝션으로 우회한다.
   */
  @OneToOne(mappedBy = "product", fetch = FetchType.LAZY, cascade = CascadeType.ALL,
      orphanRemoval = true)
  private Asset asset;

  /**
   * 발광 저작값. 애그리거트 <b>안</b>이라 {@link #asset}과 같은 이유로 {@code cascade} +
   * {@code orphanRemoval}을 건다 — {@code ProductEmitterRepository}가 없으므로(ADR-0007) 저장·삭제가
   * 이 루트를 통과해야 한다.
   *
   * <p><b>관계가 nullable이다</b> — 빛을 내지 않는 제품은 {@code product_emitter} 행이 없다. 그래서
   * {@link #asset}과 똑같이 LAZY로 적어도 지연되지 않는다(NULL일 수 있는 역방향 1:1은 프록시를 만들
   * 수 없다). 발광이 필요 없는 경로는 프로젝션으로 우회한다.
   */
  @OneToOne(mappedBy = "product", fetch = FetchType.LAZY, cascade = CascadeType.ALL,
      orphanRemoval = true)
  private ProductEmitter emitter;

  /**
   * 제품 실사 이미지. 애그리거트 <b>안</b>이라 {@code cascade} + {@code orphanRemoval}을 건다 —
   * {@code ProductImageRepository}가 없으므로(ADR-0011 결정 8) 저장·삭제가 이 루트를 통과해야 한다.
   *
   * <p>필드 초기화를 살리려고 자식 5종이 <b>생성자</b>에 {@code @Builder}를 붙였다 — 클래스 레벨
   * {@code @Builder}였다면 이 초기화가 {@code @Builder.Default}로 옮겨 가 JPA가 쓰는 기본 생성자
   * 경로에서 컬렉션이 NULL이 된다.
   */
  @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<ProductImage> images = new ArrayList<>();

	/**
	 * VESA 태깅 정션(REQ-CMP-02 모니터↔암 판정 · REQ-SIM-22 자석 결합의 입력). 애그리거트 <b>안</b>의
	 * "태깅 조인"이라(ADR-0007) {@link #images}와 같은 이유로 {@code cascade} + {@code orphanRemoval}을
	 * 건다 — {@code ProductVesaRepository}를 만들지 않으므로 저장·삭제가 이 루트를 통과해야 한다.
	 *
	 * <p><b>붙는 대상인 {@link VesaSpec}은 다른 애그리거트 루트다</b> — 그래서 cascade가 걸리는 것은
	 * 정션({@link ProductVesa})까지이고, {@code ProductVesa.vesaSpec} 연관에는 cascade가 없다. 태깅을
	 * 떼면 정션 행만 지워지고 마스터는 남는다.
	 */
	@OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<ProductVesa> vesas = new ArrayList<>();

  /**
   * 규격 서브타입 5종이 {@code super(...)}로 부르는 부모 필드 생성자.
   *
   * <p><b>Lombok {@code @Builder}·{@code @SuperBuilder}를 쓰지 않는다.</b> {@code @Builder}는
   * 상속을 다루지 못해 부모 필드가 자식 빌더에서 사라지고, {@code @SuperBuilder}는 상위인
   * {@link BaseSoftDeleteEntity}에도 붙어 있어야 컴파일된다(2026-07-28 실측:
   * {@code cannot find symbol: class BaseSoftDeleteEntityBuilder}). 감사 베이스 3단은 모든 도메인이
   * 공유하므로 빌더를 심을 자리가 아니다.
   *
   * <p>{@code status}는 인자로 받지 않는다 — 새로 만든 제품은 DDL 기본값과 같은 {@code ACTIVE}로
   * 시작하고, 내리는 것은 {@link #hide()}가 맡는다.
   */
  protected Product(ProductSource source, User owner, Brand brand, Category category, String name,
      String description, Integer priceKrw, String productUrl) {
    this.source = source;
    this.owner = owner;
    this.brand = brand;
    this.category = category;
    this.name = name;
    this.description = description;
    this.priceKrw = priceKrw;
    this.productUrl = productUrl;
    this.status = ProductStatus.ACTIVE;
  }

	/**
	 * 공통 메타데이터를 갈아끼운다(REQ-ADM-02 관리자 수정). 영속 상태 엔티티라 dirty checking이
	 * UPDATE를 낸다 — 빌더로 재조립하지 않는다(규칙 13).
	 *
	 * <p><b>부분 수정의 "안 바꾼다"는 여기서 표현하지 않는다.</b> 호출부가 기존 값과 요청 값을 합친
	 * 뒤 전부 넘긴다 — 엔티티가 NULL을 "무시"로 해석하기 시작하면 필드를 진짜 NULL로 되돌리는 길이
	 * 영원히 막히고, 어느 필드가 어느 규칙을 따르는지가 필드마다 갈린다.
	 *
	 * <p><b>{@code source}·{@code status}는 받지 않는다</b> — 전자는 불변이고(출처가 바뀌면 필수 컬럼
	 * 규칙이 통째로 뒤집힌다) 후자는 카탈로그 노출 축이라 {@link #hide()}·{@link #activate()}가 맡는다.
	 */
	public void updateCommon(Brand brand, Category category, String name, String description,
			Integer priceKrw, String productUrl) {
		this.brand = brand;
		this.category = category;
		this.name = name;
		this.description = description;
		this.priceKrw = priceKrw;
		this.productUrl = productUrl;
	}

  /**
   * 카탈로그에서 내린다. <b>{@code deleted_at}을 쓰지 않는 이유</b>: 참조가 살아 있는 제품을 soft
   * delete하면 그 제품을 쓴 기존 배치가 로드되지 않는다(ADR-0006 결정 7).
   */
  public void hide() {
    this.status = ProductStatus.HIDDEN;
  }

  public void activate() {
    this.status = ProductStatus.ACTIVE;
  }

  /** 에셋은 루트를 통해서만 붙인다 — 다른 제품의 에셋을 받으면 {@code product_id}가 어긋난다. */
  public void attachAsset(Asset asset) {
    if (asset.getProduct() != this) {
      throw new IllegalArgumentException("다른 제품의 에셋은 붙일 수 없다");
    }
    this.asset = asset;
  }

  /** 발광체도 루트를 통해서만 붙인다({@link #attachAsset}와 같은 이유). 제품당 1개다. */
  public void attachEmitter(ProductEmitter emitter) {
    if (emitter.getProduct() != this) {
      throw new IllegalArgumentException("다른 제품의 발광체는 붙일 수 없다");
    }
    this.emitter = emitter;
  }

  /**
   * 실사 이미지도 루트를 통과한다 — {@code ProductImageRepository}가 없다(ADR-0011 결정 8).
   *
   * <p><b>대표 1장은 DB가 강제한다</b>({@code uq_product_image_product_id}
   * {@code WHERE is_primary}) — 이미 대표가 있는 제품에 대표를 하나 더 붙이면 저장 시점에 유니크
   * 위반으로 막힌다. 반면 <b>제품당 {@value #MAX_IMAGES}장 상한은 행 개수 조건이라 DB가 못 막고</b>
   * (erd.md {@code product_image} 절) 여기가 정본이다 — 등록 경로가 이 메서드뿐이므로
   * ({@code ProductImageRepository}가 없다) 상한도 여기 한 곳에 있으면 된다.
   */
  public void addImage(ProductImage image) {
    if (image.getProduct() != this) {
      throw new BusinessException(ProductErrorCode.PRODUCT_IMAGE_NOT_OWNED);
    }
    if (images.size() >= MAX_IMAGES) {
      throw new BusinessException(ProductErrorCode.PRODUCT_IMAGE_LIMIT_EXCEEDED);
    }
    images.add(image);
  }

	/**
	 * GLB 에셋 등록·재업로드(REQ-ADM-01). {@code AssetRepository}가 없으므로(ADR-0007) upsert가 이
	 * 루트를 통과한다 — 행이 없으면 만들고, 있으면 같은 행을 갈아끼운다(재업로드 = 같은 PUT).
	 *
	 * <p><b>운영진 등록 에셋은 곧바로 {@code APPROVED}다</b>(erd.md {@code asset} 절 ·
	 * api-spec §9) — 검수 큐는 자작 업로드(D20)용이라 운영진이 자기 등록을 자기가 승인하는 단계를
	 * 만들지 않는다. 그래서 {@link Asset#replace}가 아니라 여기가 {@link Asset#approve()}를 부른다.
	 *
	 * <p>{@code finish}와 {@code glb_export_mode}의 짝 검사는 {@link Asset}이 한다 — 상태 불변식이라
	 * 어느 경로로 들어와도 통과해야 한다.
	 */
	public Asset registerAsset(String assetKey, GlbExportMode glbExportMode, Finish finish,
			Integer polygonCount, RigManifest rigManifest) {
		if (asset == null) {
			asset = Asset.create(this, assetKey, glbExportMode, finish, polygonCount, rigManifest);
		} else {
			asset.replace(assetKey, glbExportMode, finish, polygonCount, rigManifest);
		}
		asset.approve();
		return asset;
	}

	/**
	 * 발광 저작값 등록·교체(REQ-ADM-01). {@link #registerAsset}과 같은 이유로 루트를 통과한다 —
	 * {@code ProductEmitterRepository}가 없다(ADR-0007). 제품당 발광체는 1개라 upsert다.
	 */
	public ProductEmitter registerEmitter(EmitterShape shape, Distribution distribution, int lumens,
			int radiusMm, boolean recolorable, String defaultColor, Integer pointXMm,
			Integer pointYMm, Integer pointZMm) {
		if (emitter == null) {
			emitter = ProductEmitter.create(this, shape, distribution, lumens, radiusMm, recolorable,
					defaultColor, pointXMm, pointYMm, pointZMm);
		} else {
			emitter.replace(shape, distribution, lumens, radiusMm, recolorable, defaultColor,
					pointXMm, pointYMm, pointZMm);
		}
		return emitter;
	}

	/**
	 * 발광 없는 제품으로 되돌린다(REQ-ADM-02). {@code orphanRemoval}이 {@code product_emitter} 행을
	 * 지운다 — 애초에 없었으면 아무 일도 일어나지 않는다(DELETE는 멱등이고, 끝 상태가 요청과 같다).
	 *
	 * <p><b>{@link #asset}에는 같은 메서드가 없다</b> — 에셋 없는 제품이 유효한 건 {@code DESK}뿐이라
	 * "에셋 제거"가 유효 상태가 아니다(api-spec §9: 에셋 DELETE는 없다, 교체는 같은 PUT).
	 */
	public void removeEmitter() {
		this.emitter = null;
	}

	/** 대표 지정 대상. 이 제품의 이미지가 아니면 404다 — 남의 이미지 id로 대표를 바꿀 수 없다. */
	public ProductImage findImage(Long imageId) {
		return images.stream()
				.filter(image -> imageId.equals(image.getId()))
				.findFirst()
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_IMAGE_NOT_FOUND));
	}

	/**
	 * 실사 이미지를 뗀다. 삭제도 루트를 통과한다 — {@code ProductImageRepository}가 없으므로
	 * (ADR-0011 결정 8) 컬렉션에서 빼면 {@code orphanRemoval}이 {@code product_image} 행을 지운다.
	 *
	 * <p><b>대표 이미지도 지울 수 있고, 그 결과 대표가 0장으로 남는다</b> — 여기서 막지 않는다.
	 * {@code source = CATALOG}의 "최소 1장"은 행 개수 조건이라 등록·검수 쪽이 강제할 규칙이고
	 * ({@link ProductImage} 클래스 주석), 이 자리에서 막으면 잘못 올린 마지막 한 장을 지울 방법이
	 * 없어진다. 대표가 없으면 프론트가 폴백 아이콘을 쓴다.
	 *
	 * <p>이 제품의 이미지가 아니면 {@link #findImage}가 404를 던진다.
	 */
	public void removeImage(Long imageId) {
		images.remove(findImage(imageId));
	}

	/**
	 * 대표 지정을 전부 해제한다. <b>새 대표를 세우기 전에 이 UPDATE가 먼저 DB에 나가야 한다</b> —
	 * 부분 유니크 인덱스 {@code uq_product_image_product_id}({@code WHERE is_primary})는 문장 단위로
	 * 검사되므로, 한 flush에 해제와 지정이 섞이면 순서에 따라 유니크 위반으로 죽는다. flush 시점은
	 * 트랜잭션 경계를 아는 서비스가 잡는다.
	 */
	public void clearPrimaryImage() {
		images.stream()
				.filter(ProductImage::isPrimary)
				.forEach(image -> image.changePrimary(false));
	}

	/**
	 * VESA 태깅을 통째로 갈아끼운다(REQ-ADM-02 — 등록·수정 본문에 실린다, api-spec §9). 빈 목록이면
	 * 전부 뗀다. 태깅도 루트를 통과한다 — {@code ProductVesaRepository}가 없다(ADR-0007).
	 *
	 * <p><b>{@code clear()} 후 {@code addAll()}로 쓰지 마라 — 겹치는 교체에서 죽는다.</b> Hibernate는
	 * 한 flush 안에서 INSERT를 DELETE보다 먼저 내므로, {75×75} → {75×75, 100×100}처럼 기존 원소가
	 * 남는 교체를 그렇게 쓰면 옛 행이 아직 살아 있는 채로 같은 쌍을 INSERT해
	 * {@code uq_product_vesa_product_id_vesa_spec_id}에 걸린다. 그래서 <b>뺄 것만 빼고 없는 것만
	 * 더하는 diff</b>다 — 그대로 남는 행은 UPDATE도 DELETE도 나가지 않는다.
	 *
	 * <p>{@code getVesaSpec().getId()}는 LAZY 프록시의 <b>식별자 게터</b>라 초기화를 일으키지 않는다 —
	 * 비교하려고 {@code vesa_spec}을 다시 읽지 않는다({@code ProductCatalogService.isOwnedBy}와 같은
	 * 성질).
	 *
	 * <p>중복 id 제거는 호출부의 몫이다 — 같은 규격이 두 번 들어오면 유니크 제약에 걸린다.
	 */
	public void replaceVesaSpecs(List<VesaSpec> specs) {
		Set<Long> targetIds = specs.stream().map(VesaSpec::getId).collect(Collectors.toSet());
		vesas.removeIf(vesa -> !targetIds.contains(vesa.getVesaSpec().getId()));

		Set<Long> keptIds = vesas.stream()
				.map(vesa -> vesa.getVesaSpec().getId())
				.collect(Collectors.toSet());
		specs.stream()
				.filter(spec -> !keptIds.contains(spec.getId()))
				.forEach(spec -> vesas.add(ProductVesa.create(this, spec)));
	}
}
