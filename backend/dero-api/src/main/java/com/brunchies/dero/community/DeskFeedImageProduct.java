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
 * {@code desk_feed_image} N:M {@code product} 정션 — <b>"이 사진에 찍힌 제품"</b>(D37 개정·ADR-0040).
 * 감사 2종({@code updated_at}은 영원히 NULL).
 *
 * <p><b>본문 토큰이 아니라 정션인 이유가 {@link DeskFeedProduct}와 다르다.</b> 같은 요구를 하루 전
 * ADR-0039가 본문 토큰 {@code [[products:…]]}으로 풀었다가 되돌린 자리다: 이 도메인은 콘텐츠 모델이
 * 이틀 새 세 번 뒤집히며 <b>마이그레이션이 본문 문자열을 직접 변환</b>했고(V13·V14), 그런 변환이
 * 다시 오면 토큰을 모르는 SQL이 태그를 날린다. 사진 삭제 시의 정합도 여기서는 FK
 * {@code ON DELETE CASCADE}가 대신한다 — 토큰 시절엔 앱 코드 두 곳이 매번 지켜야 했다.
 *
 * <p><b>글 단위 {@link DeskFeedProduct}(≤10)의 부분집합이다</b> — 글 목록에 없는 제품을 사진에
 * 붙이면 422다. 사진별 상한은 두지 않는다(글 상한이 이미 천장이라 규칙만 늘어난다).
 *
 * <p><b>{@link DeskFeedImage}와 같은 애그리거트 안이 아니다</b> — 사진은 글이 소유한 파일이지만
 * 태그는 사진 단위로 통째 교체되는 목록이라 전용 리포지토리를 둔다.
 *
 * <p>hard delete 테이블이라 {@code deleted_at}이 없다 — soft delete와 {@code UNIQUE}는 충돌한다.
 * 제품이 소프트 삭제되면 행은 남기고 응답에서 뺀다({@code DeskFeedProduct}와 같은 규칙).
 */
@Entity
@Table(name = "desk_feed_image_product")
@SequenceGenerator(name = "desk_feed_image_product_seq",
		sequenceName = "desk_feed_image_product_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskFeedImageProduct extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_image_product_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "desk_feed_image_id", nullable = false)
	private DeskFeedImage deskFeedImage;

	/** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "product_id", nullable = false)
	private Product product;

	public static DeskFeedImageProduct create(DeskFeedImage deskFeedImage, Product product) {
		return DeskFeedImageProduct.builder()
				.deskFeedImage(deskFeedImage)
				.product(product)
				.build();
	}
}
