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
 * 데스크피드 좋아요. <b>{@code desk_feed.like_count}의 집계 원천이다</b> — 구조·근거는
 * {@link PostLike}와 같고 대상만 다르다(D24 대상별 분리, ADR-0011 결정 3: 다형 좋아요를 두지
 * 않는다).
 *
 * <p><b>{@link DeskFeed} 밖의 각자 루트다</b> — 남이 누르는 것이라 글 본문과 잠깐 어긋나도 무해하고,
 * 루트 안에 넣으면 좋아요 하나 누르자고 글+사진 컬렉션을 통째로 로드하게 된다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다</b> — 취소한 행을 남겨두면 재좋아요가
 * {@code uq_desk_feed_like_user_id_desk_feed_id}에 막힌다. FK 2개는 전부 DDL 쪽
 * {@code ON DELETE CASCADE}이고 DB 제약이므로 {@code cascade}로 옮겨 적지 않는다.
 */
@Entity
@Table(name = "desk_feed_like")
@SequenceGenerator(name = "desk_feed_like_seq", sequenceName = "desk_feed_like_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskFeedLike extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_like_seq")
	private Long id;

	/** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private User user;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "desk_feed_id", nullable = false)
	private DeskFeed deskFeed;

	public static DeskFeedLike create(User user, DeskFeed deskFeed) {
		return DeskFeedLike.builder()
				.user(user)
				.deskFeed(deskFeed)
				.build();
	}
}
