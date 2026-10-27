package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.user.User;
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
 * 게시글 좋아요.
 *
 * <p><b>{@code post.like_count}의 집계 원천이다.</b> 카운터만 있고 원천 테이블이 없으면 좋아요
 * 취소·중복 방지·"내가 좋아요한 글" 조회가 전부 불가능하다. 카운터는 파생값이고 정본은 이 표다.
 *
 * <p><b>{@link PlacementLike}와 별도 테이블이다</b>(ADR-0011 결정 3) — {@code comment}·
 * {@code placement_like}에 {@code post_id}를 덧붙이는 다형성을 쓰지 않는다. erd.md가
 * {@code CHECK}를 쓰지 않으므로 두 FK의 "정확히 하나만 채워짐"을 DB가 지킬 수 없고, 지금
 * {@code NOT NULL}로 공짜로 얻고 있는 무결성을 버리는 방향이다.
 *
 * <p><b>{@link Post} 밖의 각자 루트다</b>(ADR-0011 결정 8) — 남이 누르는 것이라 글 본문과 잠깐
 * 어긋나도 무해하고, {@link Post} 안에 넣으면 좋아요 하나 누르자고 글+사진 컬렉션을 통째로
 * 로드하게 된다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다.</b> soft delete와 {@code UNIQUE}는
 * 충돌한다 — 취소한 행을 남겨두면 재좋아요가 {@code uq_post_like_user_id_post_id}에 막힌다.
 * FK 2개는 전부 DDL 쪽 {@code ON DELETE CASCADE}이고, DB 제약이므로
 * {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다.
 *
 * <p>PK는 대리키 {@code id}다. 두 FK 조합은 복합 PK가 아니라 별도 {@code UNIQUE} 제약이다.
 */
@Entity
@Table(name = "post_like")
@SequenceGenerator(name = "post_like_seq", sequenceName = "post_like_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PostLike extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_like_seq")
	private Long id;

	/** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private User user;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "post_id", nullable = false)
	private Post post;

	public static PostLike create(User user, Post post) {
		return PostLike.builder()
				.user(user)
				.post(post)
				.build();
	}
}
