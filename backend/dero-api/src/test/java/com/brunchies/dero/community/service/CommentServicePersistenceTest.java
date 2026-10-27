package com.brunchies.dero.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.community.Comment;
import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.dto.CommentCreateRequest;
import com.brunchies.dero.community.dto.CommentResponse;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
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
 * 댓글의 소유권 규칙과 소프트 삭제를 못 박는다.
 *
 * <p><b>남의 댓글 삭제는 403이고 댓글은 살아 있어야 한다</b> — "403으로 답했다"만 확인하면 예외를
 * 던지기 전에 이미 지운 구현도 통과한다. 삭제 여부를 DB에서 같이 본다.
 */
class CommentServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private CommentService commentService;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private Long ownerId;
	private Long strangerId;
	private Long placementId;

	@BeforeEach
	void setUp() {
		User owner = users.save(User.create("c-owner@example.com", Provider.KAKAO, "p-co", "주인"));
		ownerId = owner.getId();
		strangerId =
				users.save(User.create("c-other@example.com", Provider.GOOGLE, "p-cx", "남")).getId();
		placementId = placements.save(Placement.create(owner, "공개 책상", null, null)).getId();
		publish(placementId);
	}

	@Test
	@DisplayName("남의 댓글은 지울 수 없고(403) 댓글은 그대로 살아 있다")
	void 남의_댓글_삭제_거부() {
		CommentResponse mine =
				commentService.create(ownerId, placementId, new CommentCreateRequest("내 댓글"));
		flushAndClear();

		assertThatThrownBy(() -> commentService.delete(strangerId, placementId, mine.id()))
				.isInstanceOf(BusinessException.class)
				.hasMessage(CommunityErrorCode.COMMENT_NOT_OWNED.code());
		flushAndClear();

		assertThat(entityManager.find(Comment.class, mine.id()).getDeletedAt()).isNull();
	}

	@Test
	@DisplayName("내 댓글은 소프트 삭제되고 목록에서 빠진다")
	void 내_댓글_삭제() {
		CommentResponse mine =
				commentService.create(ownerId, placementId, new CommentCreateRequest("지울 댓글"));
		flushAndClear();

		commentService.delete(ownerId, placementId, mine.id());
		flushAndClear();

		assertThat(entityManager.find(Comment.class, mine.id()).getDeletedAt()).isNotNull();
		CursorPage<CommentResponse> page = commentService.list(ownerId, placementId, null, 20);
		assertThat(page.content()).isEmpty();
		assertThat(page.totalCount()).isZero();
	}

	@Test
	@DisplayName("댓글 목록은 최신순이고 비로그인도 공개 배치의 댓글을 읽는다")
	void 댓글_목록() {
		commentService.create(ownerId, placementId, new CommentCreateRequest("첫 번째"));
		commentService.create(strangerId, placementId, new CommentCreateRequest("두 번째"));
		flushAndClear();

		CursorPage<CommentResponse> page = commentService.list(null, placementId, null, 20);

		assertThat(page.content()).extracting(CommentResponse::content)
				.containsExactly("두 번째", "첫 번째");
		assertThat(page.content()).extracting(CommentResponse::nickname).containsExactly("남", "주인");
		assertThat(page.totalCount()).isEqualTo(2);
		assertThat(page.hasNext()).isFalse();
	}

	/**
	 * {@code publishStatus}를 바꾸는 도메인 메서드가 아직 없다(공개 전이는 {@code feed-entry} 몫이고
	 * 그 경로가 미구현이다). 픽스처를 위해 프로덕션 코드에 공개 통로를 뚫지 않고 벌크 UPDATE로
	 * 상태만 세운다 — 영속성 컨텍스트를 우회하므로 뒤에 반드시 {@code clear}한다.
	 */
	private void publish(Long id) {
		entityManager
				.createQuery("update Placement p set p.publishStatus = :status where p.id = :id")
				.setParameter("status", PublishStatus.PUBLIC)
				.setParameter("id", id)
				.executeUpdate();
		flushAndClear();
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
