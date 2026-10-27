package com.brunchies.dero.community;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 데스크피드 본문의 인라인 이미지 {@code ![alt](key)} 파서(D34·ADR-0037 결정 1).
 *
 * <p><b>본문이 사진 순서의 유일한 정본이다</b> — {@code desk_feed_image}는 소속 레지스트리라
 * 순서·대표 컬럼이 없다. 그래서 "몇 장인가"(1~30 검증)와 "대표가 무엇인가"(목록 카드 표지)를
 * 아는 방법은 본문을 파싱하는 것뿐이고, 그 규칙이 두 군데로 갈리면 저장 때 검증한 장수와 화면이
 * 그리는 장수가 어긋난다({@link PlacementEmbedTokens}와 같은 판단). 프론트의
 * {@code deskFeedContent.ts}가 같은 정규식을 들고 있으므로 <b>패턴을 바꾸면 둘 다 바꾼다</b>.
 *
 * <p><b>중복 key도 각각 센다</b> — 같은 사진을 본문 두 곳에 넣는 것은 성립하는 글이고, 세지 않으면
 * 상한 30장을 우회할 수 있다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class DeskFeedContentImages {

	private static final Pattern IMAGE = Pattern.compile("!\\[[^\\]]*]\\(([^)]*)\\)");

	/** 본문에 등장한 순서대로 이미지 주소를 뽑는다. 없으면 빈 목록. */
	public static List<String> extract(String content) {
		if (content == null || content.isEmpty()) {
			return List.of();
		}
		List<String> keys = new ArrayList<>();
		Matcher matcher = IMAGE.matcher(content);
		while (matcher.find()) {
			keys.add(matcher.group(1));
		}
		return keys;
	}
}
