package com.brunchies.dero.community;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 본문 토큰 파서 단위 테스트 — 스프링 컨텍스트가 필요 없다.
 *
 * <p>이 파서가 저장 시 <b>검증 대상 집합</b>을 정하므로, 여기서 놓친 토큰은 검증 없이 통과해
 * 조회 시점에 남의 비공개 배치를 카드로 그리려 든다.
 */
class PlacementEmbedTokensTest {

	@Test
	@DisplayName("본문에 등장한 순서대로 중복 없이 뽑는다")
	void 순서대로_중복없이() {
		List<Long> ids = PlacementEmbedTokens.extract(
				"먼저 [[placement:42]] 다음 [[placement:7]] 또 [[placement:42]]");

		assertThat(ids).containsExactly(42L, 7L);
	}

	@Test
	@DisplayName("토큰이 없거나 본문이 비면 빈 목록이다")
	void 토큰_없음() {
		assertThat(PlacementEmbedTokens.extract("그냥 글")).isEmpty();
		assertThat(PlacementEmbedTokens.extract("")).isEmpty();
		assertThat(PlacementEmbedTokens.extract(null)).isEmpty();
	}

	@Test
	@DisplayName("형태가 어긋난 토큰은 토큰이 아니다 — 숫자가 아니거나 괄호가 안 맞으면 무시한다")
	void 어긋난_토큰() {
		assertThat(PlacementEmbedTokens.extract(
				"[[placement:abc]] [[placement:]] [placement:1] [[product:3]]")).isEmpty();
	}

	@Test
	@DisplayName("Long 범위를 넘는 자릿수는 토큰으로 보지 않는다 — 파싱이 예외를 던질 자리를 없앤다")
	void 너무_긴_id() {
		assertThat(PlacementEmbedTokens.extract("[[placement:1234567890123456789012]]")).isEmpty();
	}
}
