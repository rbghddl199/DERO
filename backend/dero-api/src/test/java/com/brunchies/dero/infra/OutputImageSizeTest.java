package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 스크린샷 픽셀 크기 → 요청 {@code size} 계산(DERO-358 후속).
 *
 * <p>지키는 것은 셋이다: <b>종횡비 보존</b>(그래야 배치가 안 깨진다), <b>16의 배수</b>,
 * <b>1:3~3:1 범위</b> — 뒤 둘은 {@code gpt-image-2}가 거부하는 값을 만들지 않기 위해서다.
 */
class OutputImageSizeTest {

	@Test
	@DisplayName("16:9 스크린샷은 긴 변 1536에 맞춰 1536x864가 된다")
	void 가로형() {
		assertThat(OutputImageSize.of(1600, 900)).isEqualTo("1536x864");
	}

	@Test
	@DisplayName("정사각 스크린샷은 1536x1536이 된다")
	void 정사각() {
		assertThat(OutputImageSize.of(1000, 1000)).isEqualTo("1536x1536");
	}

	@Test
	@DisplayName("세로가 긴 스크린샷은 방향을 보존해 864x1536이 된다")
	void 세로형() {
		assertThat(OutputImageSize.of(900, 1600)).isEqualTo("864x1536");
	}

	@Test
	@DisplayName("3:1을 넘는 극단 비율은 짧은 변을 긴변/3까지 올려 범위 안으로 클램프한다")
	void 극단_비율() {
		String size = OutputImageSize.of(4000, 500);

		assertThat(size).isEqualTo("1536x512");
		String[] edges = size.split("x");
		assertThat(Integer.parseInt(edges[0]) % 16).isZero();
		assertThat(Integer.parseInt(edges[1]) % 16).isZero();
	}

	@Test
	@DisplayName("PNG로 못 읽는 바이트면 실패시키지 않고 auto를 돌려준다")
	void 못_읽으면_auto() {
		assertThat(OutputImageSize.of("not-a-png".getBytes(StandardCharsets.UTF_8)))
				.isEqualTo("auto");
	}
}
