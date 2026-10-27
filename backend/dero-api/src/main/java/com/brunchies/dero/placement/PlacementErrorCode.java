package com.brunchies.dero.placement;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/** 배치 도메인 에러 코드(ADR-0009 결정 7). 상태 코드 배정은 ADR-0008 결정 3의 규칙표를 따른다. */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum PlacementErrorCode implements ErrorCode {

	PLACEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "배치를 찾을 수 없습니다."),
	PLACEMENT_DUPLICATE_ITEM_REF(HttpStatus.BAD_REQUEST, "아이템 참조(ref)가 중복되었습니다."),
	PLACEMENT_UNKNOWN_ITEM_REF(HttpStatus.BAD_REQUEST, "결합 대상 참조(mountedToRef)를 찾을 수 없습니다."),
	PLACEMENT_INVALID_MOUNT(HttpStatus.BAD_REQUEST, "자기 자신 참조 또는 순환 결합은 허용되지 않습니다."),
	PLACEMENT_ITEM_NOT_OWNED(HttpStatus.FORBIDDEN, "이 배치에 속하지 않은 아이템입니다."),
	PLACEMENT_STALE(HttpStatus.CONFLICT, "다른 곳에서 이미 수정된 배치입니다. 새로고침 후 다시 시도해 주세요."),
	PLACEMENT_JUDGMENT_FAILED(HttpStatus.UNPROCESSABLE_CONTENT, "호환성 판정을 통과하지 못해 공개할 수 없습니다."),
	PLACEMENT_THUMBNAIL_REQUIRED(HttpStatus.UNPROCESSABLE_CONTENT,
			"스크린샷이 없어 업로드할 수 없습니다. 배치를 저장해 화면을 남긴 뒤 다시 시도해 주세요."),
	PLACEMENT_OWNER_REQUIRED(HttpStatus.UNPROCESSABLE_CONTENT, "작성자가 없는 배치는 공개할 수 없습니다."),
	PLACEMENT_UNKNOWN_PRODUCT(HttpStatus.BAD_REQUEST, "존재하지 않는 제품을 참조했습니다."),
	PLACEMENT_UNKNOWN_DESK_TEXTURE(HttpStatus.BAD_REQUEST, "존재하지 않는 책상 재질을 참조했습니다."),
	PLACEMENT_DESK_PRODUCT_ID_REQUIRED(HttpStatus.BAD_REQUEST, "제품 모드에서는 productId가 필요합니다."),
	PLACEMENT_DESK_SPEC_REQUIRED(HttpStatus.BAD_REQUEST, "직접 입력 모드에서는 책상 규격을 모두 입력해야 합니다."),
	PLACEMENT_INVALID_DESK_PRODUCT(HttpStatus.BAD_REQUEST, "선택한 제품은 책상이 아닙니다."),
	PLACEMENT_INVALID_THUMBNAIL_KEY(HttpStatus.BAD_REQUEST, "이 배치의 썸네일 key가 아닙니다."),
	PLACEMENT_DUPLICATE_WALL_SIDE(HttpStatus.BAD_REQUEST, "같은 벽면(wallSide)이 두 번 실려 왔습니다."),
	// 일부 면만 온 walls를 통과시키면 안 온 면이 조용히 기본 마감으로 초기화된다 — 시끄럽게 막는다.
	PLACEMENT_WALLS_INCOMPLETE(HttpStatus.BAD_REQUEST,
			"walls에는 좌·전면·우 세 면이 모두 있어야 합니다."),
	// 계열마다 유효한 변형 집합이 달라 한쪽만 온 마감은 서버가 채울 수 없다 — 쌍으로 강제한다.
	PLACEMENT_WALL_FINISH_PAIR_REQUIRED(HttpStatus.BAD_REQUEST,
			"벽면의 재질 계열(material)과 변형(variant)은 함께 보내야 합니다."),
	PLACEMENT_FLOOR_FINISH_PAIR_REQUIRED(HttpStatus.BAD_REQUEST,
			"바닥의 재질 계열(material)과 변형(variant)은 함께 보내야 합니다."),
	// 넷 다 있거나 넷 다 없다 — 반만 있는 창문은 씬이 크기 없는 구멍을 뚫게 만든다.
	PLACEMENT_INVALID_WINDOW(HttpStatus.BAD_REQUEST,
			"창문 정보가 불완전합니다. hasWindow와 창문 좌표·크기 4값은 함께 와야 합니다."),
	// 목록의 ?owner=me는 신원이 있어야 성립한다. 빈 결과로 돌려주면 "내 배치가 하나도 없다"와
	// 구분이 안 돼 프론트가 로그인 유도 대신 빈 상태를 그린다.
	PLACEMENT_OWNER_ME_REQUIRES_LOGIN(HttpStatus.UNAUTHORIZED, "로그인해야 내 배치를 조회할 수 있습니다."),
	// ?bookmarked=me도 같은 사유다 — 신원이 없으면 "내가 담은 것"이라는 조건 자체가 성립하지 않는다.
	PLACEMENT_BOOKMARKED_ME_REQUIRES_LOGIN(HttpStatus.UNAUTHORIZED,
			"로그인해야 북마크한 배치를 조회할 수 있습니다."),
	// ES가 죽으면 검색은 503이고 폴백이 없다(ADR-0019 결정 6 · ADR-0027) — 클라이언트 필터로
	// 되돌리면 페이징 너머를 못 찾는 결함이 조용히 부활한다.
	PLACEMENT_SEARCH_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE,
			"배치 검색을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
