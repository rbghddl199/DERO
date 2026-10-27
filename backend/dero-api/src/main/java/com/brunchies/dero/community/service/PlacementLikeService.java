package com.brunchies.dero.community.service;

import com.brunchies.dero.community.dto.LikeStateResponse;
import com.brunchies.dero.community.repository.PlacementLikeRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.repository.PlacementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배치 좋아요(REQ-COM-05, {@code api-spec.md} §4).
 *
 * <p><b>{@code PUT}·{@code DELETE}는 멱등이다.</b> 두 번 눌러도 행은 1개이고 카운트도 1이며, 안 눌린
 * 상태의 {@code DELETE}도 204다. 그래서 "이미 눌렀는가"를 먼저 보고 갈린다.
 *
 * <p><b>제품 찜·게시글 좋아요와 코드가 거의 같아 보여도 합치지 않는다</b>(ADR-0011 결정 3) —
 * 대상별로 표가 따로라 공용 엔티티를 만들 자리가 없고, 각자 30줄이라 추상화 값어치도 없다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PlacementLikeService {

	private final PlacementLikeRepository placementLikes;
	private final PlacementRepository placements;

	/** 현재 상태. 도입 근거는 {@code LikeStateResponse} Javadoc. */
	public LikeStateResponse get(Long userId, Long placementId) {
		Placement placement = visible(placementId, userId);
		return new LikeStateResponse(
				placementLikes.existsByUser_IdAndPlacement_Id(userId, placementId),
				placement.getLikeCount());
	}

	/**
	 * <b>멱등 판정은 DB의 유니크 제약이 한다</b>(DERO-356) — {@code exists} 검사 뒤 INSERT하는
	 * 구조는 진짜 경합에서 500({@code UnexpectedRollbackException})을 냈다. 사유는
	 * {@link PlacementLikeRepository#insertIgnoringDuplicate}.
	 *
	 * <p><b>집계 캐시는 벌크 UPDATE로 올린다</b> — 엔티티를 고쳐 dirty checking에 맡기면 남이 누른
	 * 좋아요가 배치의 {@code @Version}을 올려 편집 중인 소유자의 저장이 409로 튕긴다(사유는
	 * {@link PlacementRepository#incrementLikeCount}). 원자적이라 동시 좋아요의 카운트 유실도 같이
	 * 사라진다.
	 */
	@Transactional
	public void like(Long userId, Long placementId) {
		visible(placementId, userId);
		if (placementLikes.insertIgnoringDuplicate(userId, placementId) > 0) {
			placements.incrementLikeCount(placementId);
		}
	}

	@Transactional
	public void unlike(Long userId, Long placementId) {
		visible(placementId, userId);
		if (placementLikes.deleteByUser_IdAndPlacement_Id(userId, placementId) > 0) {
			placements.decrementLikeCount(placementId);
		}
	}

	/**
	 * 가시성 게이트 — 비로그인은 {@code PUBLIC}만, 로그인은 {@code PUBLIC} + 본인 소유 비공개까지
	 * 본다. 안 보이면 <b>404다(403이 아니다)</b> — 남의 비공개 배치가 "있다"는 사실 자체를 흘리지
	 * 않는다.
	 */
	private Placement visible(Long placementId, Long userId) {
		return placements.findVisibleById(placementId, userId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
	}
}
