package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.PlacementBookmarkGroup;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 북마크 그룹 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p><b>{@code PlacementBookmark}가 이 그룹을 NULL 허용으로 참조하므로 둘은 별도 루트다</b> —
 * 그룹 없는 북마크가 정상 상태라 북마크 쓰기가 그룹을 통과하지 않는다.
 *
 * <p><b>소유자 조건이 전 메서드의 쿼리 안에 있다</b> — 남의 그룹은 조회 단계에서 빈 결과가 되고
 * 서비스가 404로 바꾼다(403이 아니다 — 존재 여부를 흘리지 않는다).
 */
public interface PlacementBookmarkGroupRepository
		extends JpaRepository<PlacementBookmarkGroup, Long> {

	/** 내 그룹 목록. 만든 순서가 곧 화면 순서다. */
	List<PlacementBookmarkGroup> findByUser_IdAndDeletedAtIsNullOrderByIdAsc(Long userId);

	/** 수정·삭제·북마크 담기 전의 소유 확인. 조건이 셋이라 파생 쿼리 계단에서 한 칸 올라왔다. */
	@Query("""
			select g from PlacementBookmarkGroup g
			where g.id = :groupId
				and g.user.id = :userId
				and g.deletedAt is null
			""")
	Optional<PlacementBookmarkGroup> findOwned(@Param("groupId") Long groupId,
			@Param("userId") Long userId);
}
