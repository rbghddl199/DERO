package com.brunchies.dero.user;

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
 * 팔로우 관계. 언팔로우는 행 삭제라 수정이 일어나지 않으므로 {@code updated_at}은 영원히 NULL이다 —
 * 컬럼은 {@link BaseEntity}가 전 테이블에 통일해서 실재하지만 이 표에서는 채워지지 않는다.
 *
 * <p>자기 자신 팔로우 방지는 WAS 몫이다(CHECK 제약 미사용) — 검사 위치는 후속 티켓에서 정한다.
 */
@Entity
@Table(name = "follow")
@SequenceGenerator(name = "follow_seq", sequenceName = "follow_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Follow extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "follow_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "follower_id", nullable = false)
	private User follower;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "following_id", nullable = false)
	private User following;

	/**
	 * @param follower 팔로우 하는 쪽
	 * @param following 팔로우 받는 쪽
	 */
	public static Follow create(User follower, User following) {
		return Follow.builder()
				.follower(follower)
				.following(following)
				.build();
	}
}
