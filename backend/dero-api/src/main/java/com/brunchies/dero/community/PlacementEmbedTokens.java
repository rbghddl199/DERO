package com.brunchies.dero.community;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 게시글 본문의 배치 참조 토큰 {@code [[placement:ID]]} 파서(ADR-0013 결정 1·2).
 *
 * <p><b>본문이 유일한 정본이다</b> — 배치 FK 컬럼도 {@code post_placement} 정션도 없다. 그래서
 * "이 글이 참조하는 배치"를 아는 방법은 본문을 파싱하는 것뿐이고, 그 규칙이 두 군데로 갈리면
 * 저장 시 검증한 집합과 조회 시 렌더하는 집합이 어긋난다. 프론트의
 * {@code communityContent.ts}가 같은 정규식을 들고 있으므로 <b>패턴을 바꾸면 둘 다 바꾼다</b>.
 *
 * <p>id는 숫자만 받는다({@code \d{1,18}}) — {@code Long}으로 못 담는 길이는 애초에 토큰으로 보지
 * 않는다. 그래야 파싱이 예외를 던질 자리가 없다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class PlacementEmbedTokens {

	private static final Pattern TOKEN = Pattern.compile("\\[\\[placement:(\\d{1,18})]]");

	/**
	 * 토큰을 걷어낸 본문 — <b>검색 색인용이지 정본이 아니다</b>(ADR-0027 파급 절, DERO-491).
	 *
	 * <p>안 걷으면 {@code placement}라는 낱말과 배치 id 숫자가 그대로 검색어로 걸려, 아무 글이나
	 * 배치를 인용한 글 전부가 한 덩어리로 잡힌다. <b>걷는 자리는 ES 문서를 만들 때이고 Postgres는
	 * 건드리지 않는다</b> — 본문의 정본은 토큰이 든 그 문자열이다(그것으로 프론트가 배치 카드를
	 * 렌더한다).
	 *
	 * <p>빈 문자열이 아니라 <b>공백</b>으로 바꾼다 — 지우면 토큰 앞뒤 낱말이 붙어 없던 합성어가
	 * 생기고 그 합성어가 형태소 분석 결과를 바꾼다.
	 */
	public static String strip(String content) {
		if (content == null || content.isEmpty()) {
			return "";
		}
		return TOKEN.matcher(content).replaceAll(" ");
	}

	/** 본문에 등장한 순서대로, 중복 없이 배치 id를 뽑는다. 토큰이 없으면 빈 목록. */
	public static List<Long> extract(String content) {
		if (content == null || content.isEmpty()) {
			return List.of();
		}
		Set<Long> ids = new LinkedHashSet<>();
		Matcher matcher = TOKEN.matcher(content);
		while (matcher.find()) {
			ids.add(Long.valueOf(matcher.group(1)));
		}
		return new ArrayList<>(ids);
	}
}
