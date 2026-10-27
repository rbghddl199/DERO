package com.brunchies.dero.infra;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 배치 스크린샷 PNG의 실제 픽셀 크기에서 상상도 요청의 {@code size} 문자열을 계산한다.
 *
 * <p><b>왜 고정 해상도가 아닌가</b>: 스크린샷은 프론트가 3D 캔버스 전체를 그대로 뽑은 것이라
 * 종횡비가 뷰포트·dpr에 따라 매번 다르다. 정사각({@code 1024x1024}) 같은 고정값을 보내면 상류가
 * 정사각으로 리프레임해 "내가 배치한 그대로"가 깨진다 — {@code edits} 경로의 존재 이유가 무너진다.
 *
 * <p>호출부에서 분리한 이유는 <b>테스트 가능성</b>이다({@link DeskScenePrompt}와 같은 관용구) —
 * 계산이 HTTP 호출과 섞여 있으면 목 서버를 세워야 반올림 규칙 하나를 확인할 수 있다.
 *
 * <p>{@code gpt-image-2}의 제약을 그대로 옮긴 계산이다: 가로·세로가 각각 16의 배수, 종횡비는
 * 1:3~3:1.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
final class OutputImageSize {

	/** 크기를 정하지 못했을 때 상류에 넘기는 값 — {@code gpt-image-2}가 받는 유효한 값이다. */
	static final String AUTO = "auto";

	/** 긴 변을 여기에 맞춘다. 원본이 더 작아도 올린다 — 상류가 어차피 새로 그린다. */
	private static final int TARGET_LONG_EDGE = 1536;
	private static final int MULTIPLE = 16;
	private static final int MAX_ASPECT_RATIO = 3;

	/** PNG로 읽히지 않으면 {@link #AUTO} — 크기를 못 구한 것이 상상도를 버릴 이유는 아니다. */
	static String of(byte[] screenshotPng) {
		BufferedImage image;
		try {
			image = ImageIO.read(new ByteArrayInputStream(screenshotPng));
		} catch (IOException e) {
			// 규칙 8의 "번역"이 아니라 폴백이다 — 예외로 바꾸면 배치가 통째로 FAILED가 된다.
			// 크기를 못 구했을 뿐이므로 상류가 알아서 정하게 두고 생성은 그대로 진행한다.
			return AUTO;
		}
		if (image == null) {
			// ImageIO는 아는 디코더가 없으면 예외 대신 null을 준다.
			return AUTO;
		}
		return of(image.getWidth(), image.getHeight());
	}

	/** 스크린샷 픽셀 크기 → {@code WIDTHxHEIGHT}. 방향(가로/세로)은 보존한다. */
	static String of(int width, int height) {
		int longEdge = Math.max(width, height);
		int shortEdge = roundToMultiple(Math.min(width, height) * (double) TARGET_LONG_EDGE / longEdge);
		int minShortEdge = ceilToMultiple((double) TARGET_LONG_EDGE / MAX_ASPECT_RATIO);
		if (shortEdge < minShortEdge) {
			shortEdge = minShortEdge;
		}
		return width >= height
				? TARGET_LONG_EDGE + "x" + shortEdge
				: shortEdge + "x" + TARGET_LONG_EDGE;
	}

	private static int roundToMultiple(double value) {
		return Math.max(MULTIPLE, (int) Math.round(value / MULTIPLE) * MULTIPLE);
	}

	private static int ceilToMultiple(double value) {
		return Math.max(MULTIPLE, (int) Math.ceil(value / MULTIPLE) * MULTIPLE);
	}
}
