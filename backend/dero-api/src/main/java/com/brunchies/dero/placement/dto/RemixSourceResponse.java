package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.user.User;

/**
 * 리믹스 출처 표시용 — {@link PlacementDetailResponse#sourcePlacement()}에만 실린다.
 *
 * <p><b>"리믹스가 아니다"와 "원본이 사라졌다"는 다른 상태다.</b> 전자는 이 객체 자체가 {@code null}
 * 이고(원본 배치), 후자는 객체는 있고 {@code available}이 {@code false}다 — 프론트가 "원본 없음"을
 * 그려야 하는 자리다. 하나로 접으면 화면이 둘을 구분할 수 없다.
 *
 * <p>원본이 소프트 삭제됐어도 <b>리믹스는 함께 사라지지 않는다</b> —
 * {@code fk_placement_source_placement_id}가 물리 삭제 때만 도는 FK이고 배치 삭제는 소프트 삭제라
 * 출처 행은 그대로 남는다. 그래서 id는 계속 답할 수 있고 제목·작성자만 가린다.
 */
public record RemixSourceResponse(
		Long id, String title, Long ownerId, String ownerNickname, boolean available) {

	/** 소프트 삭제된 원본은 id만 남기고 나머지를 가린다. */
	public static RemixSourceResponse from(Placement source) {
		if (source.isDeleted()) {
			return new RemixSourceResponse(source.getId(), null, null, null, false);
		}
		User owner = source.getUser();
		return new RemixSourceResponse(source.getId(), source.getTitle(),
				owner == null ? null : owner.getId(), owner == null ? null : owner.getNickname(),
				true);
	}
}
