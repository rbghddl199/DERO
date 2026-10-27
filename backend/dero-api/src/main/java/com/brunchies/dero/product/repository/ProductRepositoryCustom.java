package com.brunchies.dero.product.repository;

import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AdminProductSummaryResponse;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * {@link ProductRepository}의 QueryDSL 커스텀 프래그먼트(ADR-0018 결정 2 첫 프로덕션 사용 —
 * DERO-319). 동적 조건(검수 상태·규격·카테고리 롤업·커서)이 섞인 목록 조회 2종만 여기 산다 —
 * 나머지 파생 쿼리·정적 {@code @Query}는 {@link ProductRepository}에 그대로 둔다.
 *
 * <p>레포지토리 배치는 {@code querydsl-rubric.md} §5가 "첫 프로덕션 사용이 결정한다"고 명시한 그
 * 결정이다 — 이 커스텀 프래그먼트 형태(`XxxRepositoryCustom`/`XxxRepositoryImpl`)로 확정됐다.
 */
public interface ProductRepositoryCustom {

	/** 관리자 offset 목록 — 검수 상태·브랜드·카테고리·제품명 조건을 조합하고 id 내림차순으로 반환한다. */
	Page<AdminProductSummaryResponse> findAdminProducts(
			ReviewStatus reviewStatus, Long brandId, Long categoryId, String keyword,
			Pageable pageable);

	/**
	 * {@code GET /products} 목록. 필터·검수·카테고리 롤업·커서 조건은 전부 동적이라
	 * {@link ProductRepositoryImpl}이 {@code BooleanExpression} 헬퍼로 조립한다.
	 *
	 * <p>{@code specType}은 <b>enum 그대로</b> 받고 구현도 enum 값으로 비교한다 —
	 * {@code Product.specType}이 {@code spec_type} 판별자 컬럼의 읽기 전용 매핑이다.
	 * {@code null}이면 규격 필터 없음이다.
	 *
	 * <p>{@code categoryIds}는 <b>이미 하위 트리까지 펼쳐진 id 집합</b>이다 — 롤업 계산은
	 * {@code CategoryService.selfAndDescendantIds}가 하고 여기선 {@code in} 비교만 한다.
	 * {@code null}이거나 비면 카테고리 필터 없음이다.
	 */
	List<Product> findCatalogPage(
			SpecType specType, Collection<Long> categoryIds, Long cursorId, Limit limit);

	/** {@code CursorPage.totalCount()}용 — {@link #findCatalogPage}와 같은 필터(커서 제외). */
	long countCatalogListPage(SpecType specType, Collection<Long> categoryIds);

	/**
	 * id 목록으로 목록 원소를 읽는다 — 정렬·페이지 경계가 제품 밖에 있는 목록(내가 찜한 제품)이 쓴다.
	 * <b>노출 규칙은 {@link #findCatalogPage}와 같은 술어를 공유하므로</b> 숨겨졌거나 검수 미통과인
	 * 제품은 여기서도 빠진다. 순서는 보장하지 않는다(호출부가 id 순서대로 다시 세운다).
	 */
	default List<Product> findCatalogByIds(List<Long> productIds) {
		return findCatalogByIds(productIds, null, null);
	}

	/**
	 * 위와 같되 규격·카테고리 필터를 같이 건다 — <b>검색({@code ?q=})이 쓴다.</b> ES는 제품 id만
	 * 돌려주므로(ADR-0019 결정 4) 필터 판정도 여기 Postgres에 남는다. ES 문서에 규격·카테고리를
	 * 실어 필터를 저쪽으로 옮기면 같은 사실의 정본이 두 곳이 된다.
	 *
	 * <p>{@code specType}·{@code categoryIds}가 {@code null}이거나 비면 그 필터는 없는 것이다 —
	 * {@link #findCatalogPage}와 같은 헬퍼를 공유하므로 술어가 갈리지 않는다.
	 */
	List<Product> findCatalogByIds(
			List<Long> productIds, SpecType specType, Collection<Long> categoryIds);
}
