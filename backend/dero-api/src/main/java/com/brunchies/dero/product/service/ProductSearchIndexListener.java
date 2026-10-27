package com.brunchies.dero.product.service;

import com.brunchies.dero.product.ProductChangedEvent;
import com.brunchies.dero.product.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 색인 트리거 — 제품 변경이 <b>커밋된 뒤에만</b> ES를 만진다(ADR-0019 결정 3).
 *
 * <p><b>{@code AFTER_COMMIT}이 핵심이다.</b> 트랜잭션 안에서 색인하면 롤백돼도 ES에는 문서가 남아
 * 유령 제품이 검색에 걸린다(이중 쓰기를 부결한 이유).
 *
 * <p>커밋 후는 트랜잭션 밖이라 {@code REQUIRES_NEW}로 읽기 트랜잭션을 새로 연다 — 없으면 조회가
 * 매번 자동 커밋으로 흩어진다.
 *
 * <p>여기서 예외를 던지지 않는 것은 {@link ProductSearchService#index}가 삼키기 때문이다. 색인이
 * 실패해도 관리자 요청은 이미 성공했고, 유실은 전량 재색인이 걷어낸다.
 */
@Component
@RequiredArgsConstructor
public class ProductSearchIndexListener {

	private final ProductRepository products;
	private final ProductSearchService productSearchService;

	/**
	 * 커밋된 상태를 다시 읽어 색인을 맞춘다 — 살아 있으면 문서를 덮어쓰고, 없으면(소프트 삭제) 뗀다.
	 * 이벤트가 종류를 싣지 않는 이유는 {@link ProductChangedEvent}에 있다.
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onProductChanged(ProductChangedEvent event) {
		products.findByIdAndDeletedAtIsNull(event.productId())
				.ifPresentOrElse(
						productSearchService::index,
						() -> productSearchService.remove(event.productId()));
	}
}
