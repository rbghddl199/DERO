package com.brunchies.dero.product.repository;

import static com.brunchies.dero.catalog.QBrand.brand;
import static com.brunchies.dero.catalog.QCategory.category;
import static com.brunchies.dero.product.QProduct.product;

import com.brunchies.dero.catalog.QCategory;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductSource;
import com.brunchies.dero.product.ProductStatus;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AdminProductSummaryResponse;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.Collection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

/**
 * {@link ProductRepositoryCustom} 구현 — QueryDSL(ADR-0018 결정 2). {@code left join fetch} 4종
 * (brand·category·asset·emitter)은 원래 JPQL과 동일하게 유지한다 — 전부 to-one이라 {@code Limit}과
 * 같이 써도 안전하다(product/CLAUDE.md).
 *
 * <p>두 메서드가 {@code BooleanExpression} 헬퍼를 공유해 술어 복붙 드리프트를 구조적으로 막는다(M2 —
 * 리팩터 전엔 {@code categoryId} 조인 표현이 {@code c.id}/{@code p.category.id}로 갈라져 있었다).
 */
@RequiredArgsConstructor
public class ProductRepositoryImpl implements ProductRepositoryCustom {

	/** {@code category.parent}용 별도 별칭 — 부모 롤업 조인(M6)에만 쓴다. */
	private static final QCategory parentCategory = new QCategory("parentCategory");

	private final JPAQueryFactory queryFactory;

	@Override
	public Page<AdminProductSummaryResponse> findAdminProducts(
			ReviewStatus reviewStatus, Long brandId, Long categoryId, String keyword,
			Pageable pageable) {
		List<AdminProductSummaryResponse> content = queryFactory
				.select(Projections.constructor(AdminProductSummaryResponse.class,
						product.id, product.specType,
						product.name, product.source, product.status, product.priceKrw,
						brand.name, category.name,
						product.asset.reviewStatus, product.asset.reviewNote,
						product.asset.verifiedAt, product.createdAt))
				.from(product)
				.leftJoin(product.brand, brand)
				.leftJoin(product.category, category)
				.leftJoin(category.parent, parentCategory)
				.leftJoin(product.asset)
				.where(
						product.deletedAt.isNull(),
						reviewStatusEq(reviewStatus),
						brandEq(brandId),
						categoryEq(categoryId),
						nameContains(keyword))
				.orderBy(product.id.desc())
				.offset(pageable.getOffset())
				.limit(pageable.getPageSize())
				.fetch();

		Long count = queryFactory.select(product.count())
				.from(product)
				.leftJoin(product.brand, brand)
				.leftJoin(product.category, category)
				.leftJoin(category.parent, parentCategory)
				.leftJoin(product.asset)
				.where(
						product.deletedAt.isNull(),
						reviewStatusEq(reviewStatus),
						brandEq(brandId),
						categoryEq(categoryId),
						nameContains(keyword))
				.fetchOne();

		return new PageImpl<>(content, pageable, count == null ? 0 : count);
	}

	@Override
	public List<Product> findCatalogPage(
			SpecType specType, Collection<Long> categoryIds, Long cursorId, Limit limit) {
		return queryFactory.selectFrom(product)
				.leftJoin(product.brand).fetchJoin()
				.join(product.category, category).fetchJoin()
				.leftJoin(product.asset).fetchJoin()
				.leftJoin(product.emitter).fetchJoin()
				.where(
						product.deletedAt.isNull(),
						product.status.eq(ProductStatus.ACTIVE),
						specTypeEq(specType),
						categoryIn(categoryIds),
						reviewApprovedOrProceduralCatalog(),
						cursorAfter(cursorId))
				.orderBy(product.id.asc())
				.limit(limit.max())
				.fetch();
	}

	@Override
	public long countCatalogListPage(SpecType specType, Collection<Long> categoryIds) {
		Long count = queryFactory.select(product.count())
				.from(product)
				.join(product.category, category)
				.leftJoin(product.asset)
				.where(
						product.deletedAt.isNull(),
						product.status.eq(ProductStatus.ACTIVE),
						specTypeEq(specType),
						categoryIn(categoryIds),
						reviewApprovedOrProceduralCatalog())
				.fetchOne();
		return count == null ? 0 : count;
	}

	@Override
	public List<Product> findCatalogByIds(
			List<Long> productIds, SpecType specType, Collection<Long> categoryIds) {
		return queryFactory.selectFrom(product)
				.leftJoin(product.brand).fetchJoin()
				.join(product.category, category).fetchJoin()
				.leftJoin(product.asset).fetchJoin()
				.leftJoin(product.emitter).fetchJoin()
				.where(
						product.id.in(productIds),
						product.deletedAt.isNull(),
						product.status.eq(ProductStatus.ACTIVE),
						specTypeEq(specType),
						categoryIn(categoryIds),
						reviewApprovedOrProceduralCatalog())
				.fetch();
	}

	/**
	 * 규격 필터를 <b>enum 값 비교</b>로 건다 — {@code Product.specType}이 {@code spec_type} 판별자
	 * 컬럼의 읽기 전용 매핑이라 {@code type(p) = Desk}로 엔티티 타입을 돌려 말할 필요가 없다
	 * (ADR-0018 결정 3, 2026-08-02 팀 결정). 실행 검증은 {@code ProductQuerydslPersistenceTest}.
	 */
	private BooleanExpression specTypeEq(SpecType specType) {
		return specType == null ? null : product.specType.eq(specType);
	}

	private BooleanExpression reviewStatusEq(ReviewStatus reviewStatus) {
		return reviewStatus == null ? null : product.asset.reviewStatus.eq(reviewStatus);
	}

	private BooleanExpression brandEq(Long brandId) {
		return brandId == null ? null : brand.id.eq(brandId);
	}

	private BooleanExpression nameContains(String keyword) {
		if (keyword == null || keyword.isBlank()) {
			return null;
		}
		return product.name.containsIgnoreCase(keyword.trim());
	}

	/**
	 * M6 — 자기 자신 또는 부모(대분류)와 일치하면 잡는다(ADR-0017 "부모 없음=대분류, 자식 필터는
	 * 대분류 탭에 롤업"). 관리자 목록 전용 — 부모 1단까지만 본다.
	 */
	private BooleanExpression categoryEq(Long categoryId) {
		return categoryId == null
				? null
				: category.id.eq(categoryId).or(parentCategory.id.eq(categoryId));
	}

	/**
	 * 공개 카탈로그 목록의 카테고리 필터 — <b>하위 트리 전체</b>의 id 집합을 받아 그중 하나면 잡는다.
	 * 롤업 깊이를 조인 한 단(위 {@code categoryEq})으로 표현하면 3단 트리의 소분류 제품이 대분류
	 * 필터에서 빠진다(근거·실측: {@code CategoryService.selfAndDescendantIds}).
	 */
	private BooleanExpression categoryIn(Collection<Long> categoryIds) {
		return categoryIds == null || categoryIds.isEmpty() ? null : category.id.in(categoryIds);
	}

	/**
	 * M5 — 절차 생성 검수 면제는 카탈로그 소스에만 적용한다. D18이 만든 카탈로그 Desk·Monitor는
	 * 에셋 행이 아예 없어 검수 대상이 아니지만, 그 예외를 "Desk·Monitor이기만 하면"으로 넓혀 두면
	 * D20(자작 책상)이 붙는 순간 검수 없이 자작 Desk가 뜨는 경로가 열린다 — 지금 코드로 막아 둔다.
	 * GLB 필수 3종(암·조명·소품)과 USER 소스 Desk·Monitor는 검수 통과(APPROVED) 에셋이 있어야
	 * 카탈로그에 뜬다.
	 *
	 * <p>모니터가 면제로 옮겨온 근거는 <b>D18 재개정(2026-08-02, {@code docs/CONTEXT.md})</b>이다 —
	 * 모니터도 전량 절차 생성이라 {@code asset} 행이 생기지 않는데 검수를 요구하면 카탈로그 모니터가
	 * 목록에서 통째로 사라진다(어드민 FE에 모니터 GLB 업로드·검수 UI가 아예 없어 승인할 방법도 없다).
	 * 상세 조회 {@code ProductCatalogService.requireVisible}은 이미 같은 이유로 검수 상태를 카탈로그
	 * 제품의 노출 조건으로 쓰지 않는다.
	 *
	 * <p>어느 종류가 절차 생성인지는 {@link SpecType#proceduralTypes()}가 정본이고, 비교는 판별자
	 * 컬럼의 읽기 전용 매핑({@code Product.specType})에 대한 <b>enum {@code in}</b>이다 — 여기서
	 * 엔티티 타입을 세지 않는다(2026-08-02 팀 결정).
	 *
	 * <p><b>{@code (specType in ...) and CATALOG}로 묶는 괄호가 핵심이다</b> — {@code DESK or
	 * (MONITOR and CATALOG)}처럼 갈라지면 USER 소스 Desk가 검수 없이 새어 나간다. {@code in} 하나가
	 * 이미 완성된 OR 묶음이라 {@code and}를 그대로 걸면 된다. 회귀 가드는
	 * {@code ProductCatalogServicePersistenceTest.USER_소스_Desk는_검수_없으면_제외}.
	 */
	private BooleanExpression reviewApprovedOrProceduralCatalog() {
		BooleanExpression proceduralCatalog = product.specType.in(SpecType.proceduralTypes())
				.and(product.source.eq(ProductSource.CATALOG));
		BooleanExpression assetApproved = product.asset.isNotNull()
				.and(product.asset.reviewStatus.eq(ReviewStatus.APPROVED));
		return proceduralCatalog.or(assetApproved);
	}

	private BooleanExpression cursorAfter(Long cursorId) {
		return cursorId == null ? null : product.id.gt(cursorId);
	}
}
