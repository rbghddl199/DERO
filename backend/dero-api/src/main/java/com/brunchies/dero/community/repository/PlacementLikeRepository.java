package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.PlacementLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 배치 좋아요 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p>hard delete 표라 소프트 삭제 필터가 없다 — 취소는 행을 지우는 것이고, 그래야
 * {@code uq_placement_like_user_id_placement_id}에 막히지 않고 다시 누를 수 있다.
 */
public interface PlacementLikeRepository extends JpaRepository<PlacementLike, Long> {

	/** 상태 조회용. 좋아요 등록은 {@link #insertIgnoringDuplicate}가 DB 제약으로 판정한다. */
	boolean existsByUser_IdAndPlacement_Id(Long userId, Long placementId);

	/**
	 * 멱등 좋아요 등록 — <b>이미 눌렀으면 0행, 새로 넣었으면 1행</b>. 호출부는 이 반환값이 1일 때만
	 * {@code like_count}를 올린다. 판정을 애플리케이션이 아니라
	 * {@code uq_placement_like_user_id_placement_id}에 맡긴다(DERO-356).
	 *
	 * <p>왜 바꿨는지·왜 네이티브인지·왜 {@code clearAutomatically}가 없는지는
	 * {@link ProductLikeRepository#insertIgnoringDuplicate}에 적어 뒀다.
	 */
	@Modifying(flushAutomatically = true)
	@Query(value = """
			insert into placement_like (user_id, placement_id, created_by)
			values (:userId, :placementId, :userId)
			on conflict on constraint uq_placement_like_user_id_placement_id do nothing
			""", nativeQuery = true)
	int insertIgnoringDuplicate(@Param("userId") Long userId, @Param("placementId") Long placementId);

	/**
	 * 좋아요 취소. <b>반환값이 0이면 카운터를 건드리지 않는다</b> — 안 눌린 상태의 DELETE도 204인데
	 * (멱등) 그때 카운터를 내리면 남이 누른 좋아요가 하나 사라진다.
	 */
	long deleteByUser_IdAndPlacement_Id(Long userId, Long placementId);
}
