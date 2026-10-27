package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.product.Product;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.hibernate.annotations.BatchSize;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 데스크피드 글의 사진 <b>소속 레지스트리</b>(D34·ADR-0037) — 어떤 key가 이 글의 것인지만 기록한다.
 * 감사 2종({@code updated_at}은 영원히 NULL — 사진 수정은 행 교체다).
 *
 * <p><b>{@link DeskFeed} 애그리거트 <u>안</u>이다</b> — 글이 소유한 파일이라
 * {@code DeskFeedImageRepository}를 만들지 않는다({@code PostImage}와 같은 경계).
 *
 * <p><b>순서 컬럼({@code display_order})도 대표 플래그({@code is_primary})도 없다</b> —
 * 순서 정본은 {@code desk_feed.content} 본문 안 위치이고 목록 대표는 본문 첫 이미지에서
 * 파생한다({@link DeskFeedContentImages}). ADR-0036이 잠시 되살렸던 {@code display_order}는 본문이
 * plain text라 순서 정본이 없던 동안의 것이고, 본문이 마크다운으로 돌아오면서 전제가 사라졌다.
 * 정본은 하나여야 한다는 기준은 네 번의 개정 내내 같다.
 *
 * <p><b>hard delete다</b> — 글과 함께 사라진다. DDL 쪽 FK가 {@code ON DELETE CASCADE}지만 DB
 * 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다.
 */
@Entity
@Table(name = "desk_feed_image")
@SequenceGenerator(name = "desk_feed_image_seq", sequenceName = "desk_feed_image_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskFeedImage extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_image_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "desk_feed_id", nullable = false)
	private DeskFeed deskFeed;

	/** 사진 object key. presigned 업로드가 돌려준 값을 그대로 담는다. */
	@Column(name = "image_key", nullable = false, length = 1024)
	private String imageKey;

	/**
	 * 이 사진에 찍힌 제품(D37 개정·ADR-0040) — 글 단위 {@code desk_feed_product}의 부분집합이고
	 * 사진별 상한은 없다.
	 *
	 * <p>{@code @BatchSize}가 있는 이유: 상세는 사진을 최대 30장 싣는데, 없으면 사진 수만큼
	 * SELECT가 나간다(N+1). 상세 조회에 컬렉션 fetch join을 하나 더 얹는 것은 다른 컬렉션들과
	 * 카테시안이 되므로 배치 로딩으로 푼다.
	 */
	@OneToMany(mappedBy = "deskFeedImage", cascade = CascadeType.ALL, orphanRemoval = true)
	@BatchSize(size = 50)
	@Builder.Default
	private List<DeskFeedImageProduct> products = new ArrayList<>();

	public static DeskFeedImage create(DeskFeed deskFeed, String imageKey) {
		return DeskFeedImage.builder()
				.deskFeed(deskFeed)
				.imageKey(imageKey)
				.build();
	}

	/**
	 * 이 사진의 제품 태그를 통째로 갈아끼운다 — 남길 것은 남기고(감사 필드 보존) 빠진 것만 지운다
	 * ({@link DeskFeed#replaceProducts}와 같은 규칙). 빈 목록이 곧 "태그 없음"이다.
	 */
	public void replaceProducts(List<Product> targets) {
		Set<Long> targetIds = targets.stream().map(Product::getId).collect(Collectors.toSet());
		products.removeIf(junction -> !targetIds.contains(junction.getProduct().getId()));

		Set<Long> keptIds = products.stream()
				.map(junction -> junction.getProduct().getId())
				.collect(Collectors.toSet());
		for (Product product : targets) {
			if (keptIds.add(product.getId())) {
				products.add(DeskFeedImageProduct.create(this, product));
			}
		}
	}
}
