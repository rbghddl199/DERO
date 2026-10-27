package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 프롬프트 조립(DERO-354, 실사 프롬프트는 DERO-358) — 그림을 좌우하는 문구라 HTTP와 떼어 놓고 고정한다. */
class DeskScenePromptTest {

	@Test
	@DisplayName("입력 이미지를 그대로 지키라는 지시가 맨 앞에 온다 — edits가 배치를 다시 잡으면 안 된다")
	void 입력_존중_지시가_먼저다() {
		String prompt = DeskScenePrompt.of(request("Walnut", "FOUR_LEG", List.of()));

		assertThat(prompt).startsWith(
				"Transform this 3D-rendered desk setup screenshot into a photorealistic photograph.");
		assertThat(prompt).contains("Preserve the exact layout, positions, proportions");
	}

	@Test
	@DisplayName("캡처한 카메라 구도를 그대로 유지하라고 요청한다 — 각도를 바꾸라는 지시는 없다")
	void 캡처_구도를_유지한다() {
		// 업로드 장수가 1장이 되면서(2026-08-06) 좌·우 사선 프롬프트는 사라졌다. 그 문구가 다시
		// 들어오면 한 장짜리 결과가 사용자가 잡은 구도와 달라진다.
		String prompt = DeskScenePrompt.of(request("Walnut", "FOUR_LEG", List.of()));

		assertThat(prompt).contains("exact camera viewpoint");
		assertThat(prompt).doesNotContain("at least 60 degrees");
	}

	@Test
	@DisplayName("책상 재질·프레임·제품 이름이 모두 프롬프트에 들어간다")
	void 재료가_모두_들어간다() {
		String prompt = DeskScenePrompt.of(
				request("Walnut", "FOUR_LEG", List.of("LG 27UP850", "Keychron K2")));

		assertThat(prompt)
				.contains("The desk top is walnut.")
				.contains("The desk stands on four straight legs.")
				.contains("On the desk: LG 27UP850, Keychron K2.");
	}

	@Test
	@DisplayName("한국어 제품명도 번역 없이 그대로 나열한다")
	void 한국어_제품명도_그대로_실린다() {
		String prompt = DeskScenePrompt.of(request("Oak", "T_FRAME", List.of("루나 무드등")));

		assertThat(prompt).contains("On the desk: 루나 무드등.");
	}

	@Test
	@DisplayName("사진 스타일 구절은 어떤 배치에도 붙는다")
	void 사진_스타일이_항상_붙는다() {
		String prompt = DeskScenePrompt.of(request(null, null, List.of()));

		assertThat(prompt)
				.contains("cozy desk setup interior photography")
				.contains("soft natural window light")
				.contains("No people, no text, no watermarks.");
	}

	@Test
	@DisplayName("책상이 없는 배치는 재질·프레임 구절을 빼고 조립한다")
	void 책상이_없으면_구절을_뺀다() {
		String prompt = DeskScenePrompt.of(request(null, null, List.of()));

		assertThat(prompt)
				.doesNotContain("The desk top is")
				.doesNotContain("The desk stands on")
				.doesNotContain("On the desk:");
	}

	@Test
	@DisplayName("모르는 프레임 값이 와도 안 깨지고 원문이 그대로 실린다")
	void 모르는_프레임은_원문으로_폴백한다() {
		String prompt = DeskScenePrompt.of(request("Walnut", "HAIRPIN_LEG", List.of()));

		assertThat(prompt).contains("The desk stands on a hairpin leg frame.");
	}

	@Test
	@DisplayName("제품이 아주 많아도 프롬프트가 나열로 뒤덮이지 않는다")
	void 제품_나열은_잘린다() {
		List<String> many = java.util.stream.IntStream.rangeClosed(1, 30)
				.mapToObj(index -> "product-" + index)
				.toList();

		String prompt = DeskScenePrompt.of(request("Oak", "T_FRAME", many));

		assertThat(prompt).contains("product-12").doesNotContain("product-13");
	}

	private static ImageGenerationRequest request(String texture, String frame, List<String> products) {
		return new ImageGenerationRequest("shot.png", texture, frame, products, 3);
	}
}
