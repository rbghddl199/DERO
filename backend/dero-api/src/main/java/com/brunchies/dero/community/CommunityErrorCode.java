package com.brunchies.dero.community;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/** 커뮤니티 도메인 에러 코드. 상태 코드 배정은 ADR-0008 결정 3의 규칙표를 따른다. */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum CommunityErrorCode implements ErrorCode {

	/**
	 * 호출부 버그다 — 다른 게시글의 사진을 루트에 붙이려 한 것이라 사용자 입력으로는 도달할 수 없다.
	 * ADR-0012 결정 4가 "호출부 버그는 {@code IllegalStateException}"을 버리고 <b>500짜리
	 * {@code ErrorCode} 상수</b>로 표현하기로 했다 — 그래야 응답 형식이라도 일관된다.
	 */
	POST_IMAGE_NOT_OWNED(HttpStatus.INTERNAL_SERVER_ERROR, "게시글에 속하지 않은 사진입니다."),

	POST_NOT_FOUND(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."),

	/**
	 * <b>404가 아니라 403이다</b> — 게시글은 비로그인에게도 본문까지 보이므로(🔓) 존재 여부를 숨길
	 * 것이 없다. 남의 댓글 삭제와 같은 판단이고, 배치의 "남의 것" 404와 갈리는 자리다.
	 */
	POST_NOT_OWNED(HttpStatus.FORBIDDEN, "내가 쓴 글만 수정하거나 삭제할 수 있습니다."),

	/**
	 * 본문의 {@code [[placement:ID]]}가 <b>본인 소유 + PUBLIC</b> 배치가 아니다(ADR-0013 결정 3).
	 * 세 경우(없는 배치·남의 배치·내 비공개 배치)를 한 코드로 답한다 — 갈라 놓으면 "그 id의 배치가
	 * 존재한다"를 흘린다. <b>자동 공개도 공개 전환 유도도 하지 않는다</b>: 글 쓰는 도중에 되돌릴 수
	 * 없는 노출이 일어나는 것을 막는 것이 이 거부의 목적이다.
	 */
	POST_PLACEMENT_NOT_EMBEDDABLE(
			HttpStatus.BAD_REQUEST, "본인의 공개된 배치만 글에 넣을 수 있습니다."),

	/** 상한 20장은 행 개수 조건이라 인덱스로 표현할 수 없다 — WAS가 강제한다(ADR-0013 결정 8). */
	POST_IMAGE_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "게시글 사진은 20장까지 올릴 수 있습니다."),

	POST_IMAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "게시글 사진을 찾을 수 없습니다."),

	/**
	 * 이 글의 key가 아니다. key가 그대로 presigned GET URL의 입력이라, 아무 문자열이나 받으면 남의
	 * 파일 주소를 자기 글에 실을 수 있다({@code PlacementService.registerThumbnail}과 같은 자리).
	 */
	POST_INVALID_IMAGE_KEY(HttpStatus.BAD_REQUEST, "이 게시글의 사진 주소가 아닙니다."),

	/** presign이 지원하는 이미지 타입 밖이다 — 확장자를 정할 수 없으면 key를 만들 수 없다. */
	POST_UNSUPPORTED_IMAGE_TYPE(HttpStatus.BAD_REQUEST, "지원하지 않는 이미지 형식입니다."),

	DESK_FEED_NOT_FOUND(HttpStatus.NOT_FOUND, "데스크피드 글을 찾을 수 없습니다."),

	/** {@link #POST_NOT_OWNED}와 같은 판단 — 글이 이미 🔓로 보이므로 404로 숨길 것이 없다. */
	DESK_FEED_NOT_OWNED(HttpStatus.FORBIDDEN, "내가 쓴 글만 수정하거나 삭제할 수 있습니다."),

	/**
	 * {@code placementId}가 <b>본인 소유 + PUBLIC</b> 배치가 아니다(ADR-0033 결정 3·D25). 세 경우
	 * (없는 배치·남의 배치·내 비공개 배치)를 한 코드로 답한다 — 갈라 놓으면 "그 id의 배치가
	 * 존재한다"를 흘린다. <b>{@code POST_PLACEMENT_NOT_EMBEDDABLE}의 400과 달리 422다</b> —
	 * api-spec.md §6-보가 명시한 상태 코드라 따른다(형식은 멀쩡한데 의미 규칙에 걸린 요청).
	 */
	DESK_FEED_PLACEMENT_NOT_ATTACHABLE(
			HttpStatus.UNPROCESSABLE_ENTITY, "본인의 공개된 배치만 첨부할 수 있습니다."),

	/**
	 * {@code productIds}에 없는 제품이나 소프트 삭제된 제품이 실렸다(ADR-0034 결정 5). 배치 첨부와
	 * <b>같은 패턴의 422</b>이고, 두 경우를 한 코드로 답한다 — 갈라 놓으면 "그 id의 제품이
	 * 존재한다"를 흘린다.
	 */
	DESK_FEED_PRODUCT_NOT_TAGGABLE(
			HttpStatus.UNPROCESSABLE_ENTITY, "등록된 제품만 사용 제품으로 붙일 수 있습니다."),

	/** 상한 30장은 행 개수 조건이라 인덱스로 표현할 수 없다 — WAS가 강제한다(erd.md desk_feed_image 절). */
	DESK_FEED_IMAGE_LIMIT_EXCEEDED(
			HttpStatus.BAD_REQUEST, "데스크피드 사진은 30장까지 올릴 수 있습니다."),

	/** 이 글의 key가 아니다 — 사유는 {@link #POST_INVALID_IMAGE_KEY}와 같다. */
	DESK_FEED_INVALID_IMAGE_KEY(HttpStatus.BAD_REQUEST, "이 데스크피드 글의 사진 주소가 아닙니다."),

	/** presign이 지원하는 이미지 타입 밖이다 — 확장자를 정할 수 없으면 key를 만들 수 없다. */
	DESK_FEED_UNSUPPORTED_IMAGE_TYPE(HttpStatus.BAD_REQUEST, "지원하지 않는 이미지 형식입니다."),

	/**
	 * 본문 마크다운의 인라인 이미지가 1~30장 범위 밖이다(D34·ADR-0037 결정 1, 상한은 2026-08-11 30장으로 상향). <b>422다</b> —
	 * 문자열 형태는 멀쩡하고 의미 규칙에 걸린 것이라 배치 첨부·제품 태그와 같은 판단이다.
	 * 0장과 31장을 한 코드로 답한다 — 화면이 문구로 갈라야 할 이유가 없다.
	 */
	DESK_FEED_CONTENT_IMAGE_COUNT_INVALID(
			HttpStatus.UNPROCESSABLE_ENTITY, "본문에는 사진을 1~30장 넣어야 합니다."),

	DESK_FEED_IMAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "데스크피드 사진을 찾을 수 없습니다."),

	/** 호출부 버그 — 다른 글의 사진을 루트에 붙이려 했다. {@link #POST_IMAGE_NOT_OWNED}와 같은 판단. */
	DESK_FEED_IMAGE_NOT_OWNED(HttpStatus.INTERNAL_SERVER_ERROR, "글에 속하지 않은 사진입니다."),

	COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."),

	/**
	 * <b>404가 아니라 403이다</b> — 남의 댓글은 이미 배치 상세에 본문까지 실려 보이므로 존재 여부를
	 * 숨길 것이 없다. 배치·북마크 그룹의 "남의 것" 404(존재 자체를 안 흘린다)와 갈리는 자리다.
	 */
	COMMENT_NOT_OWNED(HttpStatus.FORBIDDEN, "내가 쓴 댓글만 삭제할 수 있습니다."),

	/** 남의 그룹도 여기로 답한다 — 403이면 "그런 그룹이 있다"를 흘린다. */
	BOOKMARK_GROUP_NOT_FOUND(HttpStatus.NOT_FOUND, "북마크 그룹을 찾을 수 없습니다."),

	/**
	 * 게시글 인덱스(ES)가 죽었거나 없다. <b>폴백하지 않는다</b>(ADR-0019 결정 6 · ADR-0027) —
	 * 받아 온 페이지 위에서 도는 클라이언트 필터로 되돌리면 이 티켓이 고치려던 결함(페이징 너머를
	 * 못 찾는다)이 조용히 부활하고, 조용한 폴백은 ES가 3일째 죽어 있어도 아무도 모르게 만든다.
	 * {@code q} 없는 목록·상세·작성은 Postgres라 전부 산다 — 죽는 것은 검색 입력창 하나다.
	 */
	POST_SEARCH_UNAVAILABLE(
			HttpStatus.SERVICE_UNAVAILABLE, "검색을 일시적으로 사용할 수 없습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
