package com.brunchies.dero.community.service;

import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.dto.LikedProductRow;
import com.brunchies.dero.community.repository.ProductLikeRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.product.service.ProductCatalogService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 제품 찜(REQ-COM-05, {@code api-spec.md} §5).
 *
 * <p><b>카운터 갱신이 없다</b> — {@code product}에 {@code like_count} 컬럼이 없다. 상태 조회는 매번
 * {@code product_like}를 센다.
 *
 * <p>배치·게시글과 달리 가시성 규칙이 없다 — 카탈로그 제품은 열람 자체가 공개다(D14). 지워진
 * 제품만 막는다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ProductLikeService {

	private final ProductLikeRepository productLikes;
	private final ProductRepository products;
	private final ProductCatalogService productCatalogService;

	public LikeStateResponse get(Long userId, Long productId) {
		existing(productId);
		return new LikeStateResponse(
				productLikes.existsByUser_IdAndProduct_Id(userId, productId),
				productLikes.countByProduct_Id(productId));
	}

	/**
	 * {@code GET /products?liked=me} — 내가 찜한 제품 목록(DERO-356). 마이페이지 찜 목록과
	 * 시뮬레이터 좋아요 패널이 "내가 찜한 제품 <b>전체</b>"를 요구하는데 단건 {@code GET}뿐이라
	 * 성립하지 않던 자리다(DERO-342 미완 2).
	 *
	 * <p><b>원소는 {@code GET /products}와 같은 {@link ProductDetailResponse}다</b> — 찜 목록 전용
	 * 요약 DTO를 만들지 않는다(api-spec §5 "목록 원소 = 상세 원소"). 제품 본문 조립은
	 * {@link ProductCatalogService}가 하고 여기서는 <b>어떤 제품인지·어떤 순서인지</b>만 정한다 —
	 * 반대 방향(제품이 찜을 아는 것)은 의존 방향 위반이다(ADR-0007 결정 7).
	 *
	 * <p><b>목록에서 빠지는 제품이 있다</b>: 찜한 뒤 숨겨졌거나(HIDDEN) 삭제된 제품은 카탈로그
	 * 가시성 규칙에 걸려 응답에서 사라진다. 그래서 페이지 크기가 {@code size}보다 작아질 수 있다 —
	 * {@code hasNext}·커서는 찜 행 기준이라 다음 페이지는 정상적으로 이어진다.
	 */
	public CursorPage<ProductDetailResponse> listLiked(Long userId, String cursor, int size) {
		Long cursorId = CursorCodec.decode(cursor);
		Limit limit = Limit.of(size + 1);
		List<LikedProductRow> rows = cursorId == null
				? productLikes.findLikedRows(userId, limit)
				: productLikes.findLikedRowsBefore(userId, cursorId, limit);

		boolean hasNext = rows.size() > size;
		List<LikedProductRow> content = hasNext ? rows.subList(0, size) : rows;
		List<Long> productIds = content.stream().map(LikedProductRow::productId).toList();

		// 이후 페이지는 첫 페이지가 이미 돌려준 값을 프론트가 들고 있다(ProductCatalogService.list와 같은 규약).
		long totalCount = cursorId == null ? productLikes.countByUser_Id(userId) : 0;
		String nextCursor =
				hasNext ? CursorCodec.encode(content.get(content.size() - 1).likeId()) : null;

		return new CursorPage<>(
				productCatalogService.listByIds(productIds), nextCursor, hasNext, totalCount);
	}

	/**
	 * <b>멱등 판정은 DB의 유니크 제약이 한다</b>(DERO-356) — {@code exists} 검사 뒤 INSERT하는
	 * 구조는 진짜 경합에서 500({@code UnexpectedRollbackException})을 냈다. 사유는
	 * {@link ProductLikeRepository#insertIgnoringDuplicate}.
	 */
	@Transactional
	public void like(Long userId, Long productId) {
		existing(productId);
		productLikes.insertIgnoringDuplicate(userId, productId);
	}

	@Transactional
	public void unlike(Long userId, Long productId) {
		existing(productId);
		productLikes.deleteByUser_IdAndProduct_Id(userId, productId);
	}

	private Product existing(Long productId) {
		return products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));
	}
}
