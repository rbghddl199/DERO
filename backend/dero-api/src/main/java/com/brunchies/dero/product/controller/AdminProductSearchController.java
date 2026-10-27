package com.brunchies.dero.product.controller;

import com.brunchies.dero.product.dto.ProductReindexResponse;
import com.brunchies.dero.product.service.ProductSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 검색 인덱스 운영(ADR-0019 결정 3) — 전량 재색인 하나뿐이다.
 *
 * <p><b>이 엔드포인트가 {@code AFTER_COMMIT} 색인의 짝이다.</b> 이벤트 색인이 실패해도(ES 다운·
 * 네트워크) 여기 한 번이면 복구된다 — 수백 건 재색인이 몇 초라서 유실 추적 인프라 없이 유실을
 * 감당한다. 그래서 Outbox도 CDC도 만들지 않았다.
 *
 * <p>경로가 {@code /admin/products}가 아닌 이유는 대상이 제품 한 건이 아니라 <b>인덱스</b>이기
 * 때문이다. 인덱스가 늘면(배치·게시글) 같은 트리에 형제가 붙는다.
 *
 * <p>권한은 {@code SecurityConfig}의 {@code /api/v1/admin/**} → {@code hasRole("ADMIN")} 한 줄이
 * 덮는다 — 컨트롤러에 다시 적지 않는다.
 */
@RestController
@RequestMapping("/api/v1/admin/search")
@RequiredArgsConstructor
public class AdminProductSearchController {

	private final ProductSearchService productSearchService;

	/**
	 * 전량 재색인 → 200. 새 인덱스를 채운 뒤 별칭을 스왑하므로 <b>도는 동안에도 검색은 산다</b>
	 * (ADR-0019 결정 5). 색인한 제품 수를 돌려준다 — 빈 200은 "돌긴 돌았는데 몇 건인지 모른다"라
	 * 운영자가 성공을 확인할 수 없다.
	 */
	@PostMapping("/reindex")
	public ResponseEntity<ProductReindexResponse> reindex() {
		return ResponseEntity.ok(productSearchService.reindexAll());
	}
}
