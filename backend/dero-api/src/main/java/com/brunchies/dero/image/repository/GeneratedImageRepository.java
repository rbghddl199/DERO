package com.brunchies.dero.image.repository;

import com.brunchies.dero.image.GeneratedImage;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * AI 상상도 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p><b>삭제 경로를 열지 마라</b> — 행 수가 일일 생성 한도(REQ-IMG-03)의 근거다.
 * {@code JpaRepository}가 물려주는 {@code delete*}를 서비스에서 부르지 않는다.
 */
public interface GeneratedImageRepository extends JpaRepository<GeneratedImage, Long> {

	/**
	 * 일일 한도 카운트 — {@code idx_generated_image_user_id_created_at}(user_id, created_at) 축을
	 * 그대로 탄다. 이 축을 벗어나면 풀스캔이다.
	 *
	 * <p>단위는 <b>장</b>이지 회차가 아니다(ADR-0015 결정 8) — 회차를 묶는 컬럼이 없다.
	 */
	long countByUserIdAndCreatedAtGreaterThanEqual(Long userId, OffsetDateTime from);

	/**
	 * 배치의 상상도 전부. 각도를 구분하는 컬럼이 없으므로 <b>순서는 생성 순서가 답한다</b>
	 * (ADR-0015 결정 6). {@code id} 오름차순이 곧 그 순서다.
	 */
	List<GeneratedImage> findByPlacementIdOrderByIdAsc(Long placementId);

	/**
	 * 재게시 이력을 제외한 현재 생성 묶음. 최신 행부터 읽은 뒤 서비스에서 생성 순서로 되돌린다.
	 *
	 * <p><b>장수를 메서드 이름에 박지 않는다</b> — {@code findTop3By...}였을 때 업로드 장수를 바꾸자
	 * 이름과 실제가 어긋났다. 몇 장인지는 호출부가 {@code IMAGES_PER_UPLOAD}로 넘긴다.
	 */
	List<GeneratedImage> findByPlacementIdOrderByIdDesc(Long placementId, Limit limit);

	/**
	 * 재업로드 전에 옛 대표를 내린다. 부분 유니크 {@code uq_generated_image_placement_id ... WHERE
	 * is_primary}가 배치당 대표 1행만 허용하므로, 내리지 않고 새 대표를 INSERT하면 그 자리에서
	 * 제약 위반이다.
	 *
	 * <p><b>{@code clearAutomatically}가 영속성 컨텍스트를 비운다</b> — 호출 뒤에 배치를 다시
	 * 읽어야 이어지는 상태 전이가 dirty checking을 탄다(규칙 18).
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
			update GeneratedImage g
			set g.isPrimary = false
			where g.placement.id = :placementId and g.isPrimary = true
			""")
	int demotePrimaries(@Param("placementId") Long placementId);
}
