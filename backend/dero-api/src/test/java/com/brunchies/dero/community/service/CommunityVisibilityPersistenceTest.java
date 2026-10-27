package com.brunchies.dero.community.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.community.dto.CommentCreateRequest;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
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
 * 가시성 게이트가 <b>커뮤니티 쓰기·읽기 전 경로</b>에 걸려 있는지 본다. 한 자리만 빠뜨려도 남의
 * 비공개 배치가 그 경로로만 새고, 새는 방식이 "좋아요가 눌린다"라서 화면상 티가 안 난다.
 *
 * <p><b>404여야 한다(403이 아니다)</b> — 403은 "그런 배치가 있다"를 흘린다.
 */
class CommunityVisibilityPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private PlacementLikeService placementLikeService;

	@Autowired
	private PlacementBookmarkService placementBookmarkService;

	@Autowired
	private CommentService commentService;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private Long strangerId;
	private Long privatePlacementId;

	@BeforeEach
	void setUp() {
		User owner = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인"));
		strangerId =
				users.save(User.create("other@example.com", Provider.GOOGLE, "p-other", "남")).getId();
		privatePlacementId =
				placements.save(Placement.create(owner, "비공개 책상", null, null)).getId();
		entityManager.flush();
		entityManager.clear();
	}

	@Test
	@DisplayName("남의 비공개 배치에는 좋아요를 누를 수 없다")
	void 좋아요_차단() {
		assertNotFound(() -> placementLikeService.like(strangerId, privatePlacementId));
	}

	@Test
	@DisplayName("남의 비공개 배치는 북마크할 수 없다")
	void 북마크_차단() {
		assertNotFound(() -> placementBookmarkService.bookmark(strangerId, privatePlacementId, null));
	}

	@Test
	@DisplayName("남의 비공개 배치에는 댓글을 쓸 수 없다")
	void 댓글_작성_차단() {
		assertNotFound(() -> commentService.create(
				strangerId, privatePlacementId, new CommentCreateRequest("좋네요")));
	}

	@Test
	@DisplayName("비공개 배치의 댓글 목록은 비로그인에게도 남에게도 보이지 않는다")
	void 댓글_조회_차단() {
		assertNotFound(() -> commentService.list(null, privatePlacementId, null, 20));
		assertNotFound(() -> commentService.list(strangerId, privatePlacementId, null, 20));
	}

	private void assertNotFound(Runnable call) {
		assertThatThrownBy(call::run)
				.isInstanceOf(BusinessException.class)
				.hasMessage(PlacementErrorCode.PLACEMENT_NOT_FOUND.code());
	}
}
