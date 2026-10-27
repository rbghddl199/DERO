package com.brunchies.dero.global.response;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

class OffsetPageTest {

	@Test
	@DisplayName("Spring Page를 우리 record로 옮겨 담는다 — number·size·totalElements·totalPages")
	void fromPage() {
		PageImpl<String> page =
				new PageImpl<>(List.of("a", "b"), PageRequest.of(1, 20), 137);

		OffsetPage<String> result = OffsetPage.from(page);

		assertThat(result.content()).containsExactly("a", "b");
		assertThat(result.page().number()).isEqualTo(1);
		assertThat(result.page().size()).isEqualTo(20);
		assertThat(result.page().totalElements()).isEqualTo(137);
		assertThat(result.page().totalPages()).isEqualTo(7);
	}
}
