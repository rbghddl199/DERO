package com.brunchies.dero.user.controller;

import com.brunchies.dero.global.search.ReindexResponse;
import com.brunchies.dero.user.service.UserSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 닉네임 인덱스 운영(ADR-0019 결정 3의 짝) — 전량 재색인 하나뿐이다.
 *
 * <p>경로가 {@code /admin/search} 트리에 붙는 것은 대상이 사용자 한 명이 아니라 <b>인덱스</b>이기
 * 때문이다({@code AdminProductSearchController}가 세운 규약 — 인덱스가 늘면 그 트리에 형제가 붙는다).
 * 제품이 먼저 {@code /reindex}를 차지했으므로 뒤에 붙는 인덱스는 이름을 붙여 가른다.
 *
 * <p>권한은 {@code SecurityConfig}의 {@code /api/v1/admin/**} → {@code hasRole("ADMIN")} 한 줄이
 * 덮는다.
 */
@RestController
@RequestMapping("/api/v1/admin/search/users")
@RequiredArgsConstructor
public class AdminUserSearchController {

	private final UserSearchService userSearchService;

	/** 전량 재색인 → 200. 도는 동안에도 별칭이 옛 인덱스를 가리켜 검색은 산다. */
	@PostMapping("/reindex")
	public ResponseEntity<ReindexResponse> reindex() {
		return ResponseEntity.ok(userSearchService.reindexAll());
	}
}
