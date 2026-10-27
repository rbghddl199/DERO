package com.brunchies.dero.placement.service;

import com.brunchies.dero.placement.PlacementChangedEvent;
import com.brunchies.dero.placement.repository.PlacementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 색인 트리거 — 배치 변경이 <b>커밋된 뒤에만</b> ES를 만진다(ADR-0019 결정 3).
 *
 * <p><b>{@code AFTER_COMMIT}이 핵심이다.</b> 트랜잭션 안에서 색인하면 롤백돼도 ES에는 문서가 남아
 * 유령 배치가 검색에 걸린다.
 *
 * <p>커밋 후는 트랜잭션 밖이라 {@code REQUIRES_NEW}로 읽기 트랜잭션을 새로 연다 — 없으면 해시태그
 * 지연 로딩이 터진다.
 *
 * <p>여기서 예외를 던지지 않는 것은 {@link PlacementSearchService#index}가 삼키기 때문이다. 색인이
 * 실패해도 사용자의 저장은 이미 성공했고, 유실은 전량 재색인이 걷어낸다.
 */
@Component
@RequiredArgsConstructor
public class PlacementSearchIndexListener {

	private final PlacementRepository placements;
	private final PlacementSearchService placementSearchService;

	/** 커밋된 상태를 다시 읽어 색인을 맞춘다 — 살아 있으면 덮어쓰고, 없으면(소프트 삭제) 뗀다. */
	@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onPlacementChanged(PlacementChangedEvent event) {
		placements.findByIdAndDeletedAtIsNull(event.placementId())
				.ifPresentOrElse(
						placementSearchService::index,
						() -> placementSearchService.remove(event.placementId()));
	}
}
