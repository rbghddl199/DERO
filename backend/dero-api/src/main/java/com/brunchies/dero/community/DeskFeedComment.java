package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.user.User;
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
 * 데스크피드 댓글. 구조는 {@link PostComment}와 같고 대상만 다르다. <b>대댓글 없음(플랫)</b> —
 * {@code comment}·{@code post_comment}와 같은 결정(ADR-0033 결정 5). 감사 3종(soft delete).
 *
 * <p>{@link PostComment}는 엔티티만 있고 API가 미구현이지만 <b>이쪽은 처음부터 실영속이다</b>
 * (REQ-COM-16 — 종전 마커 구조의 "가짜 댓글"(세션 메모리, 새로고침 증발)이 ADR-0033 결함 4였다).
 *
 * <p><b>{@link DeskFeed} 밖의 각자 루트다</b> — 남이 쓰는 것이라 어느 쪽에도 {@code cascade}를 걸지
 * 않는다. DDL 쪽 {@code ON DELETE}는 {@code desk_feed_id}가 {@code CASCADE},
 * {@code user_id}가 {@code SET NULL}이다 — DB 제약이므로 {@code cascade}로 옮겨 적지 않는다.
 */
@Entity
@Table(name = "desk_feed_comment")
@SequenceGenerator(name = "desk_feed_comment_seq", sequenceName = "desk_feed_comment_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskFeedComment extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_comment_seq")
	private Long id;

	/** 댓글이 달린 글. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "desk_feed_id", nullable = false)
	private DeskFeed deskFeed;

	/** 작성자. DDL이 {@code ON DELETE SET NULL}이라 nullable — 탈퇴해도 댓글은 남는다. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id")
	private User user;

	/** 본문. {@code TEXT}라 {@code length}를 주지 않는다 — 주면 {@code validate}가 부팅을 죽인다. */
	@Column(name = "content", nullable = false, columnDefinition = "TEXT")
	private String content;

	public static DeskFeedComment create(DeskFeed deskFeed, User user, String content) {
		return DeskFeedComment.builder()
				.deskFeed(deskFeed)
				.user(user)
				.content(content)
				.build();
	}
}
