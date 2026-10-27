package com.brunchies.dero.community.controller;

import com.brunchies.dero.community.service.ProductLikeService;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.security.AuthenticatedUserId;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /products?liked=me} 🔒 — 내가 찜한 제품 목록(DERO-356, {@code api-spec.md} §5).
 *
 * <p><b>경로를 새로 파지 않았다</b> — 부분집합은 전부 쿼리 파라미터다(같은 문서 §1 규칙 3).
 * {@code GET /products/liked} 같은 경로를 만들면 "내 찜"만 다른 URL을 갖게 되어
 * {@code ?specType}·{@code ?categoryId}와 표현이 갈린다.
 *
 * <p><b>왜 {@code ProductController}가 아니라 여기 있나</b>: 찜은 {@code community}이고 제품은
 * 그 아래 층이라 {@code product}가 {@code product_like}를 알면 의존 방향이 뒤집힌다(ADR-0007 결정 7,
 * {@code LayerDependencyTest}가 기계로 막는다). 그래서 <b>같은 경로를 파라미터 조건으로 나눠</b>
 * 이 핸들러가 {@code liked}가 붙은 요청만 가져간다 — Spring은 {@code params} 조건이 더 구체적인
 * 매핑을 먼저 고른다. {@code liked} 없는 요청은 그대로 {@code ProductController.list}로 간다.
 *
 * <p><b>401은 여기서 던진다</b>: {@code SecurityConfig}는 경로만 보고 쿼리 파라미터를 못 본다.
 * {@code GET /api/v1/products/**}가 카탈로그 열람용 {@code permitAll}(D14)이라 이 요청도 익명으로
 * 통과하므로, 신원이 곧 답인 이 목록만 핸들러에서 막는다. <b>{@code SecurityConfig}는 안 건드렸다.</b>
 */
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class LikedProductController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	/** 지금 지원하는 유일한 값. 남의 찜 목록은 열지 않는다(신원이 곧 답인 목록이다). */
	private static final String ME = "me";

	private final ProductLikeService productLikeService;

	/**
	 * {@code size} 클램프는 {@code ProductController.list}와 같은 규약이다([1, 100]).
	 *
	 * <p>{@code liked}가 {@code me}가 아니면 <b>400이다</b> — 조용히 전체 목록으로 흘려보내면 필터가
	 * 안 먹은 채 200이 나가 프론트가 남의 찜까지 그린 줄 모른다.
	 */
	@GetMapping(params = "liked")
	public ResponseEntity<CursorPage<ProductDetailResponse>> listLiked(
			Authentication authentication,
			@RequestParam String liked,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size) {
		if (!ME.equals(liked)) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
		Long userId = AuthenticatedUserId.orNull(authentication);
		if (userId == null) {
			throw new BusinessException(SecurityErrorCode.AUTH_UNAUTHORIZED);
		}
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		return ResponseEntity.ok(productLikeService.listLiked(userId, cursor, effectiveSize));
	}
}
