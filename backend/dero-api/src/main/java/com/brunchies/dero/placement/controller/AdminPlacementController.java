package com.brunchies.dero.placement.controller;

import com.brunchies.dero.placement.service.AdminPlacementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 운영진 템플릿 시딩·해제({@code docs/context/api-spec.md} §9 — {@code PUT}/{@code DELETE
 * /admin/placements/{id}/template}).
 *
 * <p><b>토글은 단수 하위 리소스 + {@code PUT}/{@code DELETE} → 204다</b>(api-spec.md §1 규칙 2).
 * 멱등이라 더블클릭·재시도가 안전하다. 본문이 없으므로 {@code isTemplate: true} 같은 플래그를 받는
 * 경로를 만들지 않는다 — 그러면 같은 상태를 두 방식으로 쓰게 된다.
 *
 * <p><b>권한 검사는 {@code SecurityConfig}가 한다</b> — {@code /api/v1/admin/**}가
 * {@code hasRole("ADMIN")}이고 그 규칙이 다른 permitAll보다 앞에 선언돼 있다. 컨트롤러에
 * {@code @PreAuthorize}를 덧붙이지 않는다: 두 곳에서 같은 판정을 하면 한쪽만 고쳤을 때 갈린다.
 *
 * <p><b>admin 톱레벨 패키지를 만들지 않는다</b>(ADR-0007 — 톱레벨 10개 고정). 관리자 화면이라는 것은
 * <b>사용자</b>의 성격이지 도메인이 아니다({@code AdminBrandController}·{@code AdminProductController}와
 * 같은 판단).
 */
@RestController
@RequestMapping("/api/v1/admin/placements")
@RequiredArgsConstructor
public class AdminPlacementController {

	private final AdminPlacementService adminPlacementService;

	/** 템플릿 지정 → 204. */
	@PutMapping("/{placementId}/template")
	public ResponseEntity<Void> markAsTemplate(@PathVariable Long placementId) {
		adminPlacementService.markAsTemplate(placementId);
		return ResponseEntity.noContent().build();
	}

	/** 템플릿 해제 → 204. */
	@DeleteMapping("/{placementId}/template")
	public ResponseEntity<Void> unmarkAsTemplate(@PathVariable Long placementId) {
		adminPlacementService.unmarkAsTemplate(placementId);
		return ResponseEntity.noContent().build();
	}
}
