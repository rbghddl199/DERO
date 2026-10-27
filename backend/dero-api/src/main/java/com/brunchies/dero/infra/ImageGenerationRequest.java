package com.brunchies.dero.infra;

import java.util.List;

/**
 * {@link ImageGenerationPort}의 입력 — 상상도 한 벌을 만드는 데 필요한 재료.
 *
 * <p><b>도메인 타입을 담지 않는다.</b> {@code infra}는 도메인을 모르는 계층이라
 * ({@code LayerDependencyTest.infra는_도메인을_모른다}가 기계로 막는다) {@code Placement}·
 * {@code DeskTexture}·{@code FrameType}을 그대로 받을 수 없다. 도메인이 문자열로 풀어서 넘긴다.
 *
 * @param screenshotKey 사용자가 올린 배치 스크린샷의 스토리지 key. 스텁은 이 key를 그대로
 *     되돌려 주고, GMS 모드에서는 지금 쓰이지 않는다(확장 지점 — {@code images/edits}로 이 이미지를
 *     입력으로 주는 경로).
 * @param deskTexture 상판 재질 이름({@code desk_texture.name}). 책상이 없는 배치면 {@code null}.
 * @param deskFrame 프레임 구조({@code FrameType.name()}). 책상이 없는 배치면 {@code null}.
 * @param productNames 책상에 올라간 제품 이름들. 빈 배치면 빈 리스트다.
 * @param count 만들 장수. 도메인의 {@code FeedEntryService.IMAGES_PER_UPLOAD}가 넘어온다 —
 *     상수를 여기서 다시 정의하지 않는다(그 상수는 한도 계산의 단위이기도 해서 정본이 도메인에 있다).
 */
public record ImageGenerationRequest(
		String screenshotKey,
		String deskTexture,
		String deskFrame,
		List<String> productNames,
		int count) {}
