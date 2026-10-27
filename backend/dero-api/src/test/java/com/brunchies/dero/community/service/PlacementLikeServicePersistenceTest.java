package com.brunchies.dero.community.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 좋아요의 <b>멱등성</b>을 SQL 수준에서 못 박는다 — 응답만 봐서는 "204가 두 번 나왔다"까지밖에
 * 알 수 없고, 행이 하나인지와 카운터가 1인지는 보이지 않는다.
 *
 * <p>{@code placement.like_count}는 {@code placement_like}의 파생값이라 <b>둘을 같이 봐야</b>
 * 어긋남이 잡힌다. 카운터만 보면 행이 둘인 상태를, 행만 보면 카운터가 2인 상태를 놓친다.
 */
class PlacementLikeServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private PlacementLikeService placementLikeService;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private Long ownerId;
	private Long placementId;

	@BeforeEach
	void setUp() {
		User owner = users.save(User.create("like@example.com", Provider.KAKAO, "p-like", "좋아요"));
		ownerId = owner.getId();
		placementId = placements.save(Placement.create(owner, "내 책상", null, null)).getId();
		flushAndClear();
	}

	@Test
	@DisplayName("같은 배치에 좋아요를 두 번 눌러도 행은 1개, like_count도 1이다")
	void 좋아요_멱등() {
		placementLikeService.like(ownerId, placementId);
		placementLikeService.like(ownerId, placementId);
		flushAndClear();

		assertThat(likeRowCount()).isEqualTo(1);
		assertThat(reload().getLikeCount()).isEqualTo(1);
	}

	@Test
	@DisplayName("좋아요 취소를 두 번 해도 에러가 아니고 like_count는 0에서 멈춘다")
	void 취소_멱등() {
		placementLikeService.like(ownerId, placementId);
		flushAndClear();

		placementLikeService.unlike(ownerId, placementId);
		placementLikeService.unlike(ownerId, placementId);
		flushAndClear();

		assertThat(likeRowCount()).isZero();
		assertThat(reload().getLikeCount()).isZero();
	}

	@Test
	@DisplayName("안 누른 상태의 좋아요 조회는 (false, 0)이고 누른 뒤엔 (true, 1)이다")
	void 좋아요_상태_조회() {
		LikeStateResponse before = placementLikeService.get(ownerId, placementId);
		assertThat(before).isEqualTo(new LikeStateResponse(false, 0));

		placementLikeService.like(ownerId, placementId);
		flushAndClear();

		assertThat(placementLikeService.get(ownerId, placementId))
				.isEqualTo(new LikeStateResponse(true, 1));
	}

	@Test
	@DisplayName("좋아요는 배치의 version을 올리지 않는다 — 남의 좋아요가 소유자의 저장을 409로 만들면 안 된다")
	void 좋아요는_version_불변() {
		Long before = reload().getVersion();
		flushAndClear();

		placementLikeService.like(ownerId, placementId);
		flushAndClear();

		assertThat(reload().getLikeCount()).isEqualTo(1);
		assertThat(reload().getVersion()).isEqualTo(before);
	}

	private long likeRowCount() {
		return entityManager
				.createQuery(
						"select count(l) from PlacementLike l where l.placement.id = :id", Long.class)
				.setParameter("id", placementId)
				.getSingleResult();
	}

	private Placement reload() {
		return placements.findByIdAndDeletedAtIsNull(placementId).orElseThrow();
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
