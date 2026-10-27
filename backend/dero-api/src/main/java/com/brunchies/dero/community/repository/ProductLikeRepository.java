package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.ProductLike;
import com.brunchies.dero.community.dto.LikedProductRow;
import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 제품 찜 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p><b>{@code product}에는 {@code like_count} 컬럼이 없다</b> — 배치·게시글과 달리 집계 캐시가
 * 없으므로 개수가 필요하면 매번 {@link #countByProduct_Id}로 센다. 없는 컬럼을 흉내 내려고 카운터를
 * 새로 만들지 마라(스키마 동결).
 */
public interface ProductLikeRepository extends JpaRepository<ProductLike, Long> {

	/** 상태 조회용. 찜 등록은 {@link #insertIgnoringDuplicate}가 DB 제약으로 판정한다. */
	boolean existsByUser_IdAndProduct_Id(Long userId, Long productId);

	long deleteByUser_IdAndProduct_Id(Long userId, Long productId);

	/** 집계 캐시가 없어 상태 조회가 매번 세는 자리다(프로젝션 허용 예외 ① 집계). */
	long countByProduct_Id(Long productId);

	/**
	 * 멱등 찜 등록 — <b>이미 찜했으면 0행, 새로 넣었으면 1행</b>. 판정을 애플리케이션이 아니라
	 * {@code uq_product_like_user_id_product_id}에 맡긴다(DERO-356).
	 *
	 * <p><b>{@code exists} → {@code saveAndFlush} → {@code DataIntegrityViolationException} 흡수
	 * 구조를 대체한다</b>: 그 구조는 진짜 경합에서 flush가 깨지는 순간 Hibernate가 트랜잭션을
	 * rollback-only로 표시해, 예외를 삼켜도 커밋에서 {@code UnexpectedRollbackException}(500)이
	 * 나갔다. 계약은 204인데 500이 나가는 유일한 증상이라 응답 테스트로는 안 잡힌다(DERO-342
	 * 보고). {@code on conflict do nothing}은 그 경로 자체를 없앤다 — 예외가 아예 안 난다.
	 *
	 * <p>네이티브인 이유: JPQL·QueryDSL에 {@code on conflict}가 없다(쿼리 계단의 side exit).
	 * {@code id}·{@code created_at}은 DDL 기본값({@code nextval}·{@code now()})이 채우고
	 * {@code created_by}만 감사 규약대로 명시한다 — 이 경로는 영속성 컨텍스트를 안 거쳐
	 * {@code AuditingEntityListener}가 돌지 않는다.
	 *
	 * <p><b>{@code clearAutomatically}를 일부러 뺐다</b>(규칙 18의 예외 — 이유를 여기 남긴다):
	 * 이 문장은 <b>INSERT</b>라 1차 캐시에 낡은 값이 생기지 않는다. 반대로 컨텍스트를 비우면 호출부가
	 * 들고 있던 엔티티가 detach되어 그 뒤의 변경이 조용히 사라진다({@code PlacementLikeService}의
	 * {@code like_count} 증가가 정확히 그 경로다).
	 */
	@Modifying(flushAutomatically = true)
	@Query(value = """
			insert into product_like (user_id, product_id, created_by)
			values (:userId, :productId, :userId)
			on conflict on constraint uq_product_like_user_id_product_id do nothing
			""", nativeQuery = true)
	int insertIgnoringDuplicate(@Param("userId") Long userId, @Param("productId") Long productId);

	/**
	 * 내가 찜한 제품 목록 첫 페이지 — <b>최근 찜한 순</b>({@code id} 내림차순. 이 표는 hard delete라
	 * {@code id}가 곧 찜한 순서다). 제품 본문은 {@code product} 도메인이 자기 규칙(검수·노출)대로
	 * 다시 읽는다.
	 *
	 * <p>엔티티가 아니라 id 둘만 읽는 이유는 {@link LikedProductRow} Javadoc에 있다 — 엔티티로 읽으면
	 * 다형 루트 프록시가 등록돼 뒤이은 제품 조회의 규격이 통째로 빠진다.
	 */
	@Query("""
			select new com.brunchies.dero.community.dto.LikedProductRow(l.id, l.product.id)
			from ProductLike l
			where l.user.id = :userId
			order by l.id desc
			""")
	List<LikedProductRow> findLikedRows(@Param("userId") Long userId, Limit limit);

	/** 다음 페이지 — 커서는 {@code product_like.id}다. */
	@Query("""
			select new com.brunchies.dero.community.dto.LikedProductRow(l.id, l.product.id)
			from ProductLike l
			where l.user.id = :userId and l.id < :cursorId
			order by l.id desc
			""")
	List<LikedProductRow> findLikedRowsBefore(
			@Param("userId") Long userId, @Param("cursorId") Long cursorId, Limit limit);

	/** {@code CursorPage.totalCount()}용 — 첫 페이지에서만 센다. */
	long countByUser_Id(Long userId);
}
