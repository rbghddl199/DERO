package com.brunchies.dero.product;

import com.brunchies.dero.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 제품 실사 이미지. {@code product} 1:N이고 <b>대표 이미지의 정본</b>이다 — 옛
 * {@code product.image_key} 1컬럼을 흡수했다(ADR-0011 결정 6). 감사 2종.
 *
 * <p><b>{@link Product} 애그리거트 <u>안</u>이다</b>(ADR-0011 결정 8) — 제품 없이 존재할 수 없고
 * "대표 하나"가 제품 단위 불변식이라 루트가 지켜야 한다. 그래서
 * {@code ProductImageRepository}를 만들지 않는다: 저장·삭제는 {@link Product}를 통과한다.
 *
 * <p><b>hard delete다</b> — {@code product.deleted_at}이 정본이라 자체 플래그가 없다(규격 서브타입
 * 5종·{@code asset}·{@code product_emitter}와 같은 자리). DDL 쪽 FK가
 * {@code ON DELETE CASCADE}지만 이건 DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨
 * 적지 않는다.
 *
 * <p><b>"제품당 대표 1장"은 부분 유니크 인덱스 {@code uq_product_image_product_id}
 * ({@code WHERE is_primary})가 DB에서 강제한다.</b> 둘이면 목록 카드가 어느 것을 쓸지 갈린다.
 * {@code source = CATALOG}의 "최소 1장"과 제품당 상한 8장은 행 개수 조건이라 WAS가 강제한다.
 */
@Entity
@Table(name = "product_image")
@SequenceGenerator(name = "product_image_seq", sequenceName = "product_image_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class ProductImage extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "product_image_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	/** 실사 이미지 object key. presigned 업로드가 돌려준 값을 그대로 담는다. */
	@Column(name = "image_key", nullable = false, length = 1024)
	private String imageKey;

	/** 노출 순서. */
	@Column(name = "display_order", nullable = false)
	private int displayOrder;

	/** 목록·카드에 쓰이는 한 장. 부분 유니크 인덱스가 제품당 하나만 허용한다. */
	@Column(name = "is_primary", nullable = false)
	private boolean isPrimary;

	public static ProductImage create(Product product, String imageKey, int displayOrder,
			boolean isPrimary) {
		return ProductImage.builder()
				.product(product)
				.imageKey(imageKey)
				.displayOrder(displayOrder)
				.isPrimary(isPrimary)
				.build();
	}

	/**
	 * 대표 지정을 바꾼다. <b>같은 제품의 다른 이미지에서 먼저 내려야 한다</b> — 부분 유니크 인덱스가
	 * 두 번째 {@code true}를 거부한다.
	 */
	public void changePrimary(boolean isPrimary) {
		this.isPrimary = isPrimary;
	}
}
