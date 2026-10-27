package com.brunchies.dero.user;

import com.brunchies.dero.global.exception.ErrorCode;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.experimental.Accessors;
import org.springframework.http.HttpStatus;

/**
 * 온보딩(닉네임·약관 동의)과 프로필 수정의 에러 코드(`docs/context/api-spec.md` §3 온보딩 절).
 *
 * <p>도메인 접두는 상수명 자체에 넣는다(ADR-0012 결정 6) — {@code code()}는 {@code name()}이다.
 */
@Getter
@Accessors(fluent = true)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum UserErrorCode implements ErrorCode {

	/**
	 * 닉네임 중복 — {@code uq_user_nickname} 부분 유니크 인덱스와 짝이다. DB에 맡기면
	 * {@code DataIntegrityViolationException}이 500으로 나가므로 저장 전에 {@code exists}로 막는다
	 * ({@code CatalogErrorCode.CATALOG_BRAND_NAME_DUPLICATED}와 같은 자리).
	 */
	USER_NICKNAME_DUPLICATED(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다."),

	/**
	 * 동의 요청에 실린 {@code termsId}가 현행 회차 목록에 없다. 값 자체는 멀쩡한 id라 400이 아니라
	 * 422다({@code CATALOG_CATEGORY_PARENT_INVALID}와 같은 판단). 약관이 개정된 뒤 옛 화면이
	 * 들고 있던 회차를 그대로 보내는 경우가 여기 걸린다 — 프론트는 {@code GET /terms}를 다시 받아야 한다.
	 */
	USER_TERMS_NOT_CURRENT(HttpStatus.UNPROCESSABLE_ENTITY, "현행 약관 회차가 아닙니다."),

	/** 필수 약관이 빠진 배열 — 이때 {@code user_consent}에 아무 행도 남기지 않는다(부분 동의 방지). */
	USER_REQUIRED_TERMS_NOT_AGREED(
			HttpStatus.UNPROCESSABLE_ENTITY, "필수 약관에 모두 동의해야 합니다."),

	USER_TERMS_CODE_INVALID(HttpStatus.BAD_REQUEST, "약관 코드는 영문 대문자, 숫자, 밑줄만 사용할 수 있습니다."),

	USER_TERMS_NOT_FOUND(HttpStatus.NOT_FOUND, "약관을 찾을 수 없습니다."),

	USER_TERMS_CONTENT_TYPE_INVALID(HttpStatus.BAD_REQUEST, "약관 본문은 Markdown 텍스트만 업로드할 수 있습니다."),

	USER_TERMS_CONTENT_KEY_INVALID(HttpStatus.BAD_REQUEST, "약관 본문 저장소 key가 올바르지 않습니다."),

	/**
	 * 남의 프로필 조회·팔로우의 대상이 없거나 탈퇴했다. <b>{@code SecurityErrorCode.AUTH_UNAUTHORIZED}
	 * (401)와 다른 자리다</b> — 그쪽은 "내 토큰의 주인이 없다"이고 이건 "URL의 그 사람이 없다"다.
	 */
	USER_NOT_FOUND(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),

	/**
	 * 자기 자신 팔로우. {@code follow} 테이블에 CHECK 제약을 두지 않고 WAS가 막기로 한 자리다
	 * ({@code docs/context/erd.md} {@code follow} 절).
	 *
	 * <p>400이 아니라 422다 — 경로의 id 자체는 멀쩡한 값이고 "그 조합이 성립하지 않는다"라
	 * {@link #USER_TERMS_NOT_CURRENT}와 같은 판단이다.
	 */
	USER_SELF_FOLLOW_NOT_ALLOWED(HttpStatus.UNPROCESSABLE_ENTITY, "자기 자신은 팔로우할 수 없습니다."),

	/**
	 * 프로필 이미지 presign에 허용 목록 밖 {@code contentType}이 왔다. 확장자를 서버가 이 목록에서
	 * 정하므로(key 결정성 — {@code ProfileImageUploadUrlRequest}) 목록 밖이면 key를 만들 수가 없다.
	 */
	USER_INVALID_IMAGE_CONTENT_TYPE(HttpStatus.BAD_REQUEST, "지원하지 않는 이미지 형식입니다."),

	/**
	 * 2단계 등록에 이 사용자의 key가 아닌 값이 왔다. 검증이 필요한 이유는 배치 썸네일과 같다 —
	 * key가 그대로 presigned GET URL의 입력이라, 아무 문자열이나 받으면 남의 파일 주소를 자기
	 * 프로필 사진 자리에 실을 수 있다.
	 */
	USER_INVALID_PROFILE_IMAGE_KEY(HttpStatus.BAD_REQUEST, "이 사용자의 프로필 이미지 key가 아닙니다."),

	/**
	 * 닉네임 인덱스(ES)가 답하지 못했다. <b>폴백하지 않는다</b>(ADR-0019 결정 6 · ADR-0027) —
	 * Postgres {@code ILIKE}로 흉내 내면 부분어·오타 관용이 검색 경로마다 갈린다. 이 코드가 나가는
	 * 자리는 작성자 검색을 조립하는 게시글 검색뿐이고, 프로필 조회·팔로우는 Postgres라 전부 산다.
	 */
	USER_SEARCH_UNAVAILABLE(
			HttpStatus.SERVICE_UNAVAILABLE, "검색을 일시적으로 사용할 수 없습니다.");

	private final HttpStatus status;
	private final String detail;

	@Override
	public String code() {
		return name();
	}
}
