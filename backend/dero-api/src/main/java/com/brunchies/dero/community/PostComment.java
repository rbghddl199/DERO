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
 * 게시글 댓글. 구조는 {@link Comment}(배치 댓글)와 같고 대상만 다르다. 감사 3종(soft delete).
 *
 * <p><b>{@link Post} 밖의 각자 루트다</b>(ADR-0011 결정 8) — {@link Comment}가 {@code Placement}
 * 밖 루트인 것과 같다. {@code post}·{@code user}는 전부 다른 루트라 어느 쪽에도 {@code cascade}를
 * 걸지 않는다.
 *
 * <p><b>{@link Comment}에 {@code post_id}를 덧붙이는 다형성을 쓰지 않는다</b>(ADR-0011 결정 3) —
 * erd.md가 {@code CHECK}를 쓰지 않아 "정확히 하나만 채워짐"을 DB가 지킬 수 없다.
 *
 * <p><b>DDL 쪽 {@code ON DELETE} 정책이 FK마다 다르다</b> — {@code post_id}는 {@code CASCADE},
 * {@code user_id}는 {@code SET NULL}이다. DB 제약이므로 {@code cascade = CascadeType.REMOVE}로
 * 옮겨 적지 않는다.
 */
@Entity
@Table(name = "post_comment")
@SequenceGenerator(name = "post_comment_seq", sequenceName = "post_comment_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PostComment extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_comment_seq")
	private Long id;

	/** 댓글이 달린 게시글. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "post_id", nullable = false)
	private Post post;

	/**
	 * 작성자. <b>DDL이 {@code ON DELETE SET NULL}이라 nullable이다</b> — 작성자가 탈퇴해도 댓글은
	 * 남고 작성자만 비워진다(대화 맥락이 통째로 사라지지 않게).
	 */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id")
	private User user;

	/**
	 * 본문. <b>{@code TEXT}라 {@code length}를 주지 않는다</b> — 길이를 주면 {@code VARCHAR(255)}로
	 * 매핑돼 {@code ddl-auto: validate}가 타입 불일치로 부팅을 죽인다.
	 */
	@Column(name = "content", nullable = false, columnDefinition = "TEXT")
	private String content;

	public static PostComment create(Post post, User user, String content) {
		return PostComment.builder()
				.post(post)
				.user(user)
				.content(content)
				.build();
	}

	/** 본문 수정. 감사 3종이라 {@code updated_at}이 있고 이 경로로 갱신된다. */
	public void updateContent(String content) {
		this.content = content;
	}
}
