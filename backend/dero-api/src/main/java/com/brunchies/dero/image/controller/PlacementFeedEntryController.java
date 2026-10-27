package com.brunchies.dero.image.controller;

import com.brunchies.dero.global.security.AuthenticatedUserId;
import com.brunchies.dero.image.dto.FeedEntryRequest;
import com.brunchies.dero.image.dto.FeedEntryTagsRequest;
import com.brunchies.dero.image.service.FeedEntryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배치 업로드 = 데스크 피드 공개 토글(api-spec.md §4, ADR-0015 결정 10).
 *
 * <p>경로는 {@code /placements} 아래인데 패키지가 {@code image}인 이유는 {@link FeedEntryService}
 * Javadoc에 있다(의존 방향이 {@code image → placement} 단방향이다).
 *
 * <p><b>본문으로 {@code {status}}를 받지 않는다</b> — {@code PUBLIC}·{@code FAILED}는 서버 전용이라,
 * 받는 값의 부분집합만 유효한 {@code PUT}이 되어 계약이 스스로 모순된다. 진행 상태는
 * {@code GET /placements/{id}}의 {@code publishStatus}로만 본다(별도 진행 조회 엔드포인트 없음).
 */
@RestController
@RequestMapping("/api/v1/placements")
@RequiredArgsConstructor
public class PlacementFeedEntryController {

	private final FeedEntryService feedEntryService;

	/**
	 * 업로드 → <b>202 Accepted</b>. 이 호출이 끝난 시점에 배치는 아직 피드에 없다 — 200·204는
	 * "다 됐다"는 뜻이라 거짓말이 된다.
	 *
	 * <p>{@code PUT}이 곧 재시도 버튼이다. 별도 재시도 엔드포인트를 만들지 않는다.
	 *
	 * <p><b>본문은 선택이고 실리는 것은 태그 배열뿐이다</b>({@link FeedEntryRequest}, ADR-0027 결정 5)
	 * — 태그를 다는 시점이 공개 전환이다. 본문을 안 실은 재시도는 태그를 건드리지 않는다.
	 */
	@PutMapping("/{placementId}/feed-entry")
	public ResponseEntity<Void> requestFeedEntry(
			Authentication authentication,
			@PathVariable Long placementId,
			@Valid @RequestBody(required = false) FeedEntryRequest request) {
		feedEntryService.requestFeedEntry(AuthenticatedUserId.orNull(authentication), placementId,
				request == null ? null : request.tags());
		return ResponseEntity.accepted().build();
	}

	/**
	 * 태그 교체 → 204(DERO-493). <b>공개 전환을 다시 태우지 않는다</b> — 위 {@code PUT}을 태그
	 * 수정에 쓰면 {@code PUBLIC} 배치가 {@code PENDING}으로 되돌아가 상상도를 다시 만들고 한도를 깎는다.
	 * 태그 하나만 갈아 끼우는 전체 교체라 {@code PUT}이고, 돌려줄 본문이 없어 204다.
	 */
	@PutMapping("/{placementId}/feed-entry/tags")
	public ResponseEntity<Void> replaceFeedEntryTags(
			Authentication authentication,
			@PathVariable Long placementId,
			@Valid @RequestBody FeedEntryTagsRequest request) {
		feedEntryService.replaceTags(AuthenticatedUserId.orNull(authentication), placementId,
				request.tags());
		return ResponseEntity.noContent().build();
	}

	/** 공개 취소 → 204. 남의 배치면 404다(403이 아니다 — 존재 여부를 흘리지 않는다). */
	@DeleteMapping("/{placementId}/feed-entry")
	public ResponseEntity<Void> withdrawFeedEntry(
			Authentication authentication, @PathVariable Long placementId) {
		feedEntryService.withdrawFeedEntry(AuthenticatedUserId.orNull(authentication), placementId);
		return ResponseEntity.noContent().build();
	}
}
