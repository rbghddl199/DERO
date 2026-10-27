package com.brunchies.dero.product.repository;

import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductImage;
import com.brunchies.dero.product.ProductVesa;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 제품 애그리거트 루트 리포지토리(ADR-0007) — {@code asset}·{@code product_image}·규격 서브타입
 * 5종이 이 안에 산다. {@code AssetRepository}·{@code ProductImageRepository}를 만들지 않는다.
 *
 * <p>{@code GET /products} 목록 조회 2종(동적 조건)은 {@link ProductRepositoryCustom}/
 * {@link ProductRepositoryImpl}의 QueryDSL로 옮겼다(ADR-0018 결정 2) — 이 인터페이스엔 정적 파생
 * 쿼리·{@code @Query}만 남는다.
 */
public interface ProductRepository extends JpaRepository<Product, Long>, ProductRepositoryCustom {

	/** 실사 이미지 등록 경로 — 소프트 삭제 필터는 쿼리에 박는다(규칙 2). */
	Optional<Product> findByIdAndDeletedAtIsNull(Long id);

	/** presigned URL 발급 경로 — 엔티티가 필요 없어 존재 여부만 묻는다. */
	boolean existsByIdAndDeletedAtIsNull(Long id);

	/**
	 * 데스크피드 "사용된 제품" 태그 검증·조립 경로(ADR-0034 결정 5) — 살아 있는 제품만 돌려주므로
	 * 돌려받은 개수가 요청한 id 개수보다 적으면 그 자체가 거부 신호다. 조건 2개라 파생 쿼리다.
	 */
	List<Product> findAllByIdInAndDeletedAtIsNull(List<Long> ids);

	/**
	 * 마스터 삭제 게이트({@code catalog.CatalogMasterUsage} 구현이 쓴다) — 이 브랜드를 참조하는 살아
	 * 있는 제품이 있는가. 소프트 삭제라 FK는 안 깨지지만, 막지 않으면 제품 목록·필터가 지워진 브랜드를
	 * 계속 가리킨다.
	 */
	boolean existsByBrandIdAndDeletedAtIsNull(Long brandId);

	/** 마스터 삭제 게이트 — 카테고리 쪽. {@code product.category_id}는 {@code NOT NULL}이다. */
	boolean existsByCategoryIdAndDeletedAtIsNull(Long categoryId);

	/**
	 * 검색 전량 재색인이 읽는다(ADR-0019 결정 3) — 소프트 삭제만 걸러낸다. 숨김·검수 미통과 제품도
	 * 색인하는 이유는 노출 판정이 색인이 아니라 조회 쪽 술어에 있기 때문이다
	 * ({@link ProductRepositoryCustom#findCatalogByIds}).
	 *
	 * <p>페이지를 나누지 않는 근거는 카탈로그 규모다 — 수십~수백 제품이라 전량이 한 번에 들어온다.
	 */
	List<Product> findAllByDeletedAtIsNull();

	/** 목록 카드 썸네일 — 대표 이미지만(제품당 최대 1장). */
	@Query("select i from ProductImage i where i.product.id in :ids and i.isPrimary = true")
	List<ProductImage> findPrimaryImagesByProductIdIn(@Param("ids") List<Long> ids);

	/** VESA 태깅 배치 조회 — {@code join fetch}로 {@code vesaSpec}까지 한 번에 끌어온다(제품당 여러 건). */
	@Query("select pv from ProductVesa pv join fetch pv.vesaSpec where pv.product.id in :ids")
	List<ProductVesa> findVesasByProductIdIn(@Param("ids") List<Long> ids);

}
