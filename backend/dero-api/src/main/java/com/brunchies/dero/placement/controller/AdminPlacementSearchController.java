package com.brunchies.dero.placement.controller;

import com.brunchies.dero.global.search.ReindexResponse;
import com.brunchies.dero.placement.service.PlacementSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배치 인덱스 운영(ADR-0019 결정 3의 짝) — 전량 재색인 하나뿐이다.
 *
 * <p><b>이 엔드포인트가 {@code AFTER_COMMIT} 색인의 짝이다.</b> 이벤트 색인이 실패해도 여기 한 번이면
 * 복구된다 — 그래서 Outbox도 CDC도 만들지 않았다(ADR-0027 결정 7).
 *
 * <p>경로가 {@code /admin/placements}가 아닌 이유는 대상이 배치 한 건이 아니라 <b>인덱스</b>이기
 * 때문이다({@code AdminProductSearchController}가 세운 규약). 제품이 먼저 {@code /reindex}를
 * 차지했으므로 뒤에 붙는 인덱스는 이름을 붙여 가른다.
 *
 * <p>권한은 {@code SecurityConfig}의 {@code /api/v1/admin/**} → {@code hasRole("ADMIN")} 한 줄이
 * 덮는다.
 */
@RestController
@RequestMapping("/api/v1/admin/search/placements")
@RequiredArgsConstructor
public class AdminPlacementSearchController {

	private final PlacementSearchService placementSearchService;

	/** 전량 재색인 → 200. 도는 동안에도 별칭이 옛 인덱스를 가리켜 검색은 산다(ADR-0019 결정 5). */
	@PostMapping("/reindex")
	public ResponseEntity<ReindexResponse> reindex() {
		return ResponseEntity.ok(placementSearchService.reindexAll());
	}
}
