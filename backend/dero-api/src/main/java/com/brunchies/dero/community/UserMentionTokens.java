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
 * 본문·댓글의 멘션 토큰 {@code [[user:ID]]} 파서(D35·ADR-0038 결정 1).
 *
 * <p><b>텍스트에 남는 것은 닉네임이 아니라 userId다.</b> 닉네임은 변경 가능하고 unique라, 생 텍스트
 * {@code @닉네임}으로 저장하면 버려진 닉네임을 제3자가 선점한 순간 멘션이 <b>조용히 다른 사람을</b>
 * 가리킨다 — 크레딧 기능에서 치명적이라 부결됐다(ADR-0038 부결 1). 렌더는 항상 <b>현재</b>
 * 닉네임을 표시하므로 닉변에 안전하다.
 *
 * <p>문법을 {@code [[placement:ID]]}와 동형으로 잡은 것은 본문이 마크다운 문자열이기 때문이다
 * ({@link PlacementEmbedTokens}와 같은 판단) — <b>다만 배치 토큰은 블록이고 이쪽은 인라인이다</b>
 * (문장 중간에 박힌다). 프론트의 {@code communityContent.ts}가 같은 정규식을 들고 있으므로
 * <b>패턴을 바꾸면 둘 다 바꾼다</b>.
 *
 * <p>id는 숫자만 받는다({@code \d{1,18}}) — {@code Long}으로 못 담는 길이는 애초에 토큰으로 보지
 * 않는다. 그래야 파싱이 예외를 던질 자리가 없다. 토큰이 아닌 {@code @문자열}(이메일 주소 등)은
 * 여기에 걸리지 않으므로 화면에서도 건드리지 않는다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class UserMentionTokens {

	private static final Pattern TOKEN = Pattern.compile("\\[\\[user:(\\d{1,18})]]");

	/** 본문에 등장한 순서대로, 중복 없이 사용자 id를 뽑는다. 토큰이 없으면 빈 목록. */
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
