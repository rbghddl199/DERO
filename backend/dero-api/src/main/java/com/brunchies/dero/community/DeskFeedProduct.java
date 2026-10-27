package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.product.Product;
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
 * {@code desk_feed} N:M {@code product} 정션 — <b>"이 책상에 쓰인 제품"</b>(ADR-0034 결정 5).
 * 감사 2종({@code updated_at}은 영원히 NULL).
 *
 * <p><b>본문 토큰이 아니라 정션이다</b>({@code post}의 {@code [[placement:ID]]}와 갈리는 자리) —
 * 요구가 "어떤 제품이 쓰였나"라는 구조화된 목록이고, 역방향("이 제품이 쓰인 데스크피드")이
 * {@code idx_desk_feed_product_product_id} 하나로 성립한다(화면은 후속, 인덱스는 지금).
 * 글당 상한 10개는 행 개수 조건이라 WAS가 강제한다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다</b> — soft delete와 {@code UNIQUE}는
 * 충돌한다({@link DeskFeedHashtag}와 같은 사유). 대신 <b>제품이 소프트 삭제되면 행은 남기고 응답에서
 * 뺀다</b> — 첨부 배치 카드와 같은 규칙이다(ADR-0034 결정 5).
 *
 * <p>FK 2개가 전부 DDL 쪽 {@code ON DELETE CASCADE}다 — DB 제약이므로
 * {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다. PK는 대리키 {@code id}다.
 */
@Entity
@Table(name = "desk_feed_product")
@SequenceGenerator(name = "desk_feed_product_seq", sequenceName = "desk_feed_product_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskFeedProduct extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_product_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "desk_feed_id", nullable = false)
	private DeskFeed deskFeed;

	/** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	public static DeskFeedProduct create(DeskFeed deskFeed, Product product) {
		return DeskFeedProduct.builder()
				.deskFeed(deskFeed)
				.product(product)
				.build();
	}
}
