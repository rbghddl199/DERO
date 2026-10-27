package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.TimeOfDay;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 단건 조회 응답(REQ-SIM-06 "불러오기") — 저장한 스냅샷을 그대로 복원한다. 아이템 좌표·회전·표면·
 * 관절 값, 배치 책상, 벽 3면, 방 조명, 예산이 전부 실린다(D4 — 안 실으면 꺼진 벽에 타공판이 떠 있는
 * 상태가 재현된다).
 *
 * <p><b>방 표면의 정본은 {@code walls[]}(항상 3개, 좌·전면·우 순)·{@code floor}·
 * {@code timeOfDay}다</b>(ADR-0030, D31). 벽 표시 여부도 {@code walls[].isOn}이다 — 옛
 * {@code themeKey}·{@code isWall*On}은 축소에서 사라졌다(DERO-514 — 컬럼 DROP은 그
 * 다음 배포의 V10이다).
 *
 * <p><b>{@code thumbnailUrl}은 presigned GET URL이다</b> — 파일 서빙 엔드포인트를 만들지 않는다
 * ({@code docs/context/api-spec.md} §11). 아직 캡처 전이면 NULL이다.
 *
 * <p><b>{@code sourcePlacement}는 리믹스 출처다</b>(REQ-COM-02·03). 원본 배치면 {@code null}이고,
 * 리믹스면 객체가 실린다 — 원본이 삭제됐으면 그 객체의 {@code available}이 {@code false}다
 * ({@link RemixSourceResponse}).
 *
 * <p>정적 팩터리를 두지 않는다 — 엔티티 하나로 안 끝나고 presign 발급이 섞여 소스가 둘이라
 * 서비스가 조립한다(규칙 11).
 */
public record PlacementDetailResponse(
		Long id,
		String title,
		String description,
		PublishStatus publishStatus,
		Long version,
		boolean isRoomLightOn,
		List<WallDetailResponse> walls,
		FloorResponse floor,
		TimeOfDay timeOfDay,
		Integer budgetKrw,
		String thumbnailUrl,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt,
		RemixSourceResponse sourcePlacement,
		DeskDetailResponse desk,
		List<ItemDetailResponse> items) {
}
