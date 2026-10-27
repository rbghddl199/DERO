package com.brunchies.dero.community.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.community.dto.BookmarkGroupResponse;
import com.brunchies.dero.community.dto.BookmarkGroupSaveRequest;
import com.brunchies.dero.community.dto.BookmarkStateResponse;
import com.brunchies.dero.community.dto.PlacementBookmarkPutRequest;
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
 * 북마크·그룹의 <b>행 개수와 생존</b>을 못 박는다.
 *
 * <p>둘 다 응답만 봐서는 안 보이는 성질이다 — 그룹 이동은 "새 행 + 옛 행"이어도 API 응답이 같고,
 * 그룹 삭제는 북마크가 딸려 사라져도 그룹 목록 응답이 같다. 유니크 제약과 soft delete 규칙이
 * 실제로 지켜지는지는 표를 세어야 나온다.
 */
class PlacementBookmarkServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private PlacementBookmarkService placementBookmarkService;

	@Autowired
	private PlacementBookmarkGroupService placementBookmarkGroupService;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	private Long ownerId;
	private Long firstPlacementId;
	private Long secondPlacementId;

	@BeforeEach
	void setUp() {
		User owner = users.save(User.create("bm@example.com", Provider.KAKAO, "p-bm", "북마크"));
		ownerId = owner.getId();
		firstPlacementId = placements.save(Placement.create(owner, "책상 A", null, null)).getId();
		secondPlacementId = placements.save(Placement.create(owner, "책상 B", null, null)).getId();
		flushAndClear();
	}

	@Test
	@DisplayName("이미 북마크한 배치에 다른 그룹으로 PUT하면 행은 안 늘고 그룹만 바뀐다")
	void 그룹_이동() {
		Long fromGroupId = createGroup("작업실");
		Long toGroupId = createGroup("영감");

		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(fromGroupId));
		flushAndClear();
		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(toGroupId));
		flushAndClear();

		assertThat(bookmarkRowCount()).isEqualTo(1);
		assertThat(placementBookmarkService.get(ownerId, firstPlacementId))
				.isEqualTo(new BookmarkStateResponse(true, toGroupId));
	}

	@Test
	@DisplayName("그룹을 지워도 북마크는 살아남아 그룹 미지정이 된다")
	void 그룹_삭제_후_북마크_생존() {
		Long groupId = createGroup("지울 그룹");
		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(groupId));
		flushAndClear();

		placementBookmarkGroupService.delete(ownerId, groupId);
		flushAndClear();

		assertThat(bookmarkRowCount()).isEqualTo(1);
		assertThat(placementBookmarkService.get(ownerId, firstPlacementId))
				.isEqualTo(new BookmarkStateResponse(true, null));
		assertThat(placementBookmarkGroupService.list(ownerId)).isEmpty();
	}

	@Test
	@DisplayName("본문 없는 PUT은 이미 담긴 북마크의 그룹을 건드리지 않는다 — 카드 토글이 그룹을 풀지 않는다")
	void 본문_없는_PUT은_그룹을_유지한다() {
		Long groupId = createGroup("작업실");
		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(groupId));
		flushAndClear();

		placementBookmarkService.bookmark(ownerId, firstPlacementId, null);
		flushAndClear();

		assertThat(bookmarkRowCount()).isEqualTo(1);
		assertThat(placementBookmarkService.get(ownerId, firstPlacementId))
				.isEqualTo(new BookmarkStateResponse(true, groupId));
	}

	@Test
	@DisplayName("groupId가 null인 본문은 그룹을 명시적으로 해제한다 — 본문 없음과 다른 뜻이다")
	void groupId_null_본문은_그룹을_해제한다() {
		Long groupId = createGroup("작업실");
		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(groupId));
		flushAndClear();

		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(null));
		flushAndClear();

		assertThat(placementBookmarkService.get(ownerId, firstPlacementId))
				.isEqualTo(new BookmarkStateResponse(true, null));
	}

	@Test
	@DisplayName("소프트 삭제된 배치의 북마크는 그룹 개수에 안 잡힌다")
	void 지워진_배치_제외() {
		Long groupId = createGroup("작업실");
		placementBookmarkService.bookmark(
				ownerId, firstPlacementId, new PlacementBookmarkPutRequest(groupId));
		placementBookmarkService.bookmark(
				ownerId, secondPlacementId, new PlacementBookmarkPutRequest(groupId));
		flushAndClear();

		placements.findByIdAndDeletedAtIsNull(firstPlacementId).orElseThrow().softDelete();
		flushAndClear();

		assertThat(placementBookmarkGroupService.list(ownerId))
				.extracting(BookmarkGroupResponse::bookmarkCount)
				.containsExactly(1L);
	}

	private Long createGroup(String title) {
		Long groupId = placementBookmarkGroupService
				.create(ownerId, new BookmarkGroupSaveRequest(title, null))
				.id();
		flushAndClear();
		return groupId;
	}

	private long bookmarkRowCount() {
		return entityManager
				.createQuery(
						"select count(b) from PlacementBookmark b where b.user.id = :id", Long.class)
				.setParameter("id", ownerId)
				.getSingleResult();
	}

	private void flushAndClear() {
		entityManager.flush();
		entityManager.clear();
	}
}
