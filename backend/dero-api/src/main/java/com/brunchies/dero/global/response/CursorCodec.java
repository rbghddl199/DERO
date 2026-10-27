package com.brunchies.dero.global.response;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * {@link CursorPage#nextCursor()}용 불투명 커서 인코딩(ADR-0008 결정 5). 프론트는 이 문자열을
 * 열어보지 않고 그대로 되돌려주므로 안에 무엇을 담든 상관없다 — 지금은 정렬키가 곧 {@code id}인
 * 목록(등록순)만 있어 {@code Long} 단일값으로 충분하다.
 *
 * <p><b>정렬 키가 {@code id}가 아닌 목록이 생겨 넓혔다</b>(2026-08-01, DERO-339 — 배치 목록의
 * 최신순·인기순). 그 목록은 {@link #encode(String, Long)}/{@link #decodeComposite(String)}로
 * {@code (정렬키값, id)} 복합을 담는다(ADR-0008 "담는 내용은 (정렬키값, id) 복합"). 등록순 목록
 * (제품 카탈로그)은 정렬키가 곧 {@code id}라 단일값 쪽을 그대로 쓴다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class CursorCodec {

	/**
	 * 복합 커서를 나누는 구분자. 정렬키값으로 실리는 것은 {@code OffsetDateTime.toString()}이나
	 * 정수 문자열뿐이라 이 문자가 값 안에 나타나지 않는다.
	 */
	private static final String DELIMITER = "|";

	/**
	 * 복합 커서 — {@code (정렬키값, id)}. <b>정렬키만으로는 부족하다</b>: 최신순은 같은 시각,
	 * 인기순은 같은 좋아요 수가 흔해서 동점 구간에서 커서가 제자리를 못 찾고 항목을 건너뛰거나
	 * 중복해서 보여준다. 마지막 키를 항상 {@code id}로 고정해 전순서를 만든다(ADR-0008 결정 5).
	 */
	public record Composite(String sortValue, Long id) {
	}

	public static String encode(Long id) {
		return Base64.getUrlEncoder().withoutPadding()
				.encodeToString(String.valueOf(id).getBytes(StandardCharsets.UTF_8));
	}

	/** {@code cursor}가 {@code null}이면(첫 페이지) {@code null}을 그대로 돌려준다. */
	public static Long decode(String cursor) {
		if (cursor == null) {
			return null;
		}
		try {
			return Long.parseLong(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8));
		} catch (IllegalArgumentException e) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}

	/** 복합 커서 인코딩. {@code sortValue}는 정렬키를 문자열로 옮긴 것이고 비교는 서버가 한다. */
	public static String encode(String sortValue, Long id) {
		return Base64.getUrlEncoder().withoutPadding()
				.encodeToString((sortValue + DELIMITER + id).getBytes(StandardCharsets.UTF_8));
	}

	/** {@code cursor}가 {@code null}이면(첫 페이지) {@code null}을 그대로 돌려준다. */
	public static Composite decodeComposite(String cursor) {
		if (cursor == null) {
			return null;
		}
		try {
			String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
			int separator = decoded.lastIndexOf(DELIMITER);
			if (separator < 0) {
				throw new BusinessException(CommonErrorCode.INVALID_INPUT);
			}
			return new Composite(decoded.substring(0, separator),
					Long.parseLong(decoded.substring(separator + DELIMITER.length())));
		} catch (IllegalArgumentException e) {
			// base64가 아니거나 id가 숫자가 아닌 커서 — 손으로 만든 값이다. 400으로 번역한다(규칙 8).
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}
}
