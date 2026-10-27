package com.brunchies.dero.product.service;

import com.brunchies.dero.catalog.CatalogMasterUsage;
import com.brunchies.dero.product.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link CatalogMasterUsage}의 유일한 구현 — 마스터 삭제 게이트가 묻는 "참조 중인 제품이 있는가"에
 * 답한다.
 *
 * <p><b>구현이 {@code product}에 사는 이유</b>: 답은 {@code product} 테이블만 알지만 물어보는 쪽
 * ({@code catalog})은 ADR-0007 결정 7의 최하층이라 {@code product}를 import할 수 없다. 인터페이스를
 * 아래(catalog)에 두고 구현을 위(product)에 두면 의존 화살표가 위에서 아래로 유지된다 —
 * {@code LayerDependencyTest}가 이 방향을 기계로 지킨다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ProductCatalogMasterUsage implements CatalogMasterUsage {

	private final ProductRepository products;

	@Override
	public boolean isBrandInUse(Long brandId) {
		return products.existsByBrandIdAndDeletedAtIsNull(brandId);
	}

	@Override
	public boolean isCategoryInUse(Long categoryId) {
		return products.existsByCategoryIdAndDeletedAtIsNull(categoryId);
	}
}
