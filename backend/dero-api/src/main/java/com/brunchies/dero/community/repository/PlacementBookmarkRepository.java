package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.PlacementBookmark;
import com.brunchies.dero.community.dto.BookmarkGroupCountRow;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 배치 북마크 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p><b>목록 조회는 여기 없다.</b> 342가 임시로 팠던 {@code GET /bookmarks}와 그 QueryDSL 프래그먼트는
 * 2026-08-02(DERO-343)에 지웠다 — 부분집합은 쿼리 파라미터라는 규칙대로
 * {@code GET /placements?bookmarked=me}가 그 자리를 흡수했다(api-spec.md §1 규칙 3·§4).
 * 배치 목록이 북마크 여부를 읽는 방법은 {@code PlacementRepository.findBookmarkRows}에 있다.
 */
public interface PlacementBookmarkRepository extends JpaRepository<PlacementBookmark, Long> {

	/**
	 * 유니크가 {@code (user_id, placement_id)}라 최대 1건이다 — 그룹을 바꾸는 요청은 이 행을 찾아
	 * {@code moveTo}로 갱신한다(새로 만들면 유니크에 막힌다).
	 */
	Optional<PlacementBookmark> findByUser_IdAndPlacement_Id(Long userId, Long placementId);

	long deleteByUser_IdAndPlacement_Id(Long userId, Long placementId);

	/**
	 * 그룹 삭제 시 딸려 나오는 북마크들. <b>DDL의 {@code ON DELETE SET NULL}은 물리 삭제 때만 도는데
	 * 그룹은 soft delete라 돌지 않는다</b> — 그래서 서비스가 이 목록을 받아 {@code moveTo(null)}을
	 * 명시적으로 부른다. 안 하면 죽은 그룹을 가리키는 북마크가 남는다.
	 */
	List<PlacementBookmark> findByUser_IdAndPlacementBookmarkGroup_Id(Long userId, Long groupId);

	/**
	 * 그룹별 북마크 수 — 목록 응답의 {@code bookmarkCount}를 한 방에 채운다(프로젝션 허용 예외 ①
	 * 집계). <b>그룹마다 count를 날리지 마라</b>(N+1). 소프트 삭제된 배치는 세지 않는다.
	 *
	 * <p>{@code groupIds}가 비면 부르지 않는다 — 빈 {@code in} 목록은 도구에 따라 다르게 풀리므로
	 * 호출부가 먼저 막는다.
	 */
	@Query("""
			select new com.brunchies.dero.community.dto.BookmarkGroupCountRow(
					b.placementBookmarkGroup.id, count(b))
			from PlacementBookmark b
			where b.placementBookmarkGroup.id in :groupIds
				and b.placement.deletedAt is null
			group by b.placementBookmarkGroup.id
			""")
	List<BookmarkGroupCountRow> countByGroupIdIn(@Param("groupIds") List<Long> groupIds);
}
