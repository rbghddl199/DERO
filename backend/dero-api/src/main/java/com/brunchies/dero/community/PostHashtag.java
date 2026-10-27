package com.brunchies.dero.community;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.global.entity.BaseEntity;
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
 * {@code post} N:M {@code hashtag} 정션 (ADR-0013 결정 6). 감사 2종({@code updated_at}은 영원히
 * NULL).
 *
 * <p><b>{@code hashtag} 마스터를 {@code product_hashtag}와 공유한다</b> — 태그 값 자체는 제품이든
 * 게시글이든 같은 어휘라 마스터를 둘로 나눌 이유가 없다. 붙는 대상만 정션으로 가른다. 구조는
 * {@code ProductHashtag}와 완전히 같다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다.</b> soft delete와 {@code UNIQUE}는
 * 충돌한다 — 태그를 뗀 행을 남겨두면 같은 태그 재부착이
 * {@code uq_post_hashtag_post_id_hashtag_id}에 막힌다.
 *
 * <p><b>FK 2개가 전부 DDL 쪽 {@code ON DELETE CASCADE}다</b> — 참조 컬럼이 {@code NOT NULL}이라
 * {@code SET NULL}을 쓸 수 없고, {@code NO ACTION}이면 부모의 물리 삭제 자체가 거부되어 hard
 * delete 정의와 어긋난다. DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다.
 *
 * <p>PK는 대리키 {@code id}다. 두 FK 조합은 복합 PK가 아니라 별도 {@code UNIQUE} 제약이다.
 */
@Entity
@Table(name = "post_hashtag")
@SequenceGenerator(name = "post_hashtag_seq", sequenceName = "post_hashtag_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PostHashtag extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_hashtag_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "post_id", nullable = false)
	private Post post;

	/** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "hashtag_id", nullable = false)
	private Hashtag hashtag;

	public static PostHashtag create(Post post, Hashtag hashtag) {
		return PostHashtag.builder()
				.post(post)
				.hashtag(hashtag)
				.build();
	}
}
