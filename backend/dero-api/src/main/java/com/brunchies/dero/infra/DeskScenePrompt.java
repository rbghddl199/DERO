package com.brunchies.dero.infra;

import java.util.List;
import java.util.Locale;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * {@link ImageGenerationRequest}를 영문 프롬프트로 조립한다 — ①입력 이미지 존중 지시 ②장면 서술
 * ③사진 스타일 순서다(DERO-358).
 *
 * <p>호출부에서 분리한 이유는 <b>테스트 가능성</b>이다 — 프롬프트 문구는 결과 그림을 좌우하는데
 * HTTP 호출과 섞여 있으면 바꿀 때마다 목 서버를 세워야 확인할 수 있다.
 *
 * <p><b>①이 맨 앞인 것은 우연이 아니다.</b> {@code request-type=edits}면 사용자의 배치 스크린샷이
 * 입력 이미지로 함께 가고, 그때 모델이 지켜야 하는 것은 "예쁜 책상"이 아니라 <b>그 사람의 배치</b>다.
 * 이 지시가 없으면 모델이 구도를 다시 잡아 "내가 배치한 그림"이 아니게 된다.
 * {@code request-type=generations}로 강등하면 입력 이미지가 없어 ①은 무해한 문장으로 남는다.
 *
 * <p>제품 이름은 한국어여도 그대로 나열한다 — 번역표를 두면 카탈로그가 늘 때마다 여기가 뒤처진다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
final class DeskScenePrompt {

	/** 프롬프트가 제품 나열로 뒤덮이지 않게 자른다. 배치 하나에 수십 개가 올라갈 수 있다. */
	private static final int MAX_PRODUCT_NAMES = 12;

	private static final String INSTRUCTION =
			"Transform this 3D-rendered desk setup screenshot into a photorealistic photograph. "
					+ "Preserve the exact layout, positions, proportions, and orientation of every item "
					+ "as they appear in the input image. Do not add, remove, or rearrange anything.";

	private static final String STYLE =
			"Style: cozy desk setup interior photography, soft natural window light, "
					+ "shallow depth of field, realistic materials and reflections, high detail. "
					+ "No people, no text, no watermarks.";

	/**
	 * 업로드가 만드는 한 장 — <b>사용자가 캡처한 카메라 구도를 그대로 유지한다.</b>
	 *
	 * <p>2026-08-06 업로드 장수가 3→1이 되면서 좌·우 사선 두 프롬프트는 도달할 수 없게 되어 지웠다
	 * (그 둘은 각 결과에 서로 다른 역할을 주려고 있던 것이다). 다시 여러 장을 만들 일이 생기면
	 * 그때 각도별 문구를 되살린다 — 지금 남겨 두면 아무도 안 부르는 분기다.
	 */
	static String of(ImageGenerationRequest request) {
		StringBuilder prompt = new StringBuilder(INSTRUCTION)
				.append(" Keep the exact camera viewpoint and framing of the input image.");
		String top = humanized(request.deskTexture());
		if (top != null) {
			prompt.append(" The desk top is ").append(top).append('.');
		}
		String frame = frameSentence(request.deskFrame());
		if (frame != null) {
			prompt.append(' ').append(frame);
		}
		String products = productPhrase(request.productNames());
		if (!products.isEmpty()) {
			prompt.append(" On the desk: ").append(products).append('.');
		}
		return prompt.append(' ').append(STYLE).toString();
	}

	/**
	 * {@code product.FrameType} 상수를 영문 서술로 푼다. <b>모르는 값은 깨지지 않고 원문이 그대로
	 * 실린다</b> — 상수가 하나 늘었을 때 표가 뒤처져 정보가 <i>사라지는</i> 것이 더 나쁘기 때문이다.
	 */
	private static String frameSentence(String deskFrame) {
		String frame = humanized(deskFrame);
		if (frame == null) {
			return null;
		}
		return switch (frame) {
			case "t frame" -> "The desk stands on a T-shaped metal frame.";
			case "four leg" -> "The desk stands on four straight legs.";
			case "top only" -> "The desk frame is not visible.";
			default -> "The desk stands on a " + frame + " frame.";
		};
	}

	private static String productPhrase(List<String> productNames) {
		if (productNames == null) {
			return "";
		}
		return String.join(", ", productNames.stream()
				.filter(name -> name != null && !name.isBlank())
				.limit(MAX_PRODUCT_NAMES)
				.toList());
	}

	/** 비어 있으면 {@code null} — 호출부가 구절 자체를 뺀다. */
	private static String humanized(String enumLikeValue) {
		if (enumLikeValue == null || enumLikeValue.isBlank()) {
			return null;
		}
		return enumLikeValue.replace('_', ' ').toLowerCase(Locale.ROOT).trim();
	}
}
