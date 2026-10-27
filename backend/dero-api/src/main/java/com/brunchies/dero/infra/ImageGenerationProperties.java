package com.brunchies.dero.infra;

import java.time.Duration;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.image.generation.*} 프로퍼티 바인딩.
 *
 * <p><b>왜 {@code image} 패키지의 {@code ImageProperties}가 아니라 여기인가</b>: 이 값을 읽는 쪽이
 * {@link GmsImageGeneration}·{@link GmsImageGenerationConfig}인데 둘 다 {@code infra}에 있고,
 * {@code infra}는 도메인을 import할 수 없다({@code LayerDependencyTest.infra는_도메인을_모른다}).
 * {@code app.storage.*}가 {@link StorageProperties}로 {@code infra}에 사는 것과 같은 이유다.
 * 접두사만 {@code app.image} 아래로 붙여 설정 파일에서 상상도 관련 값이 한 덩어리로 보이게 했다 —
 * {@code ImageProperties}(접두사 {@code app.image})는 모르는 키를 무시하므로 충돌하지 않는다.
 *
 * @param mode {@code stub}(기본) 또는 {@code gms}. {@link ImageGenerationPort} 구현체 선택
 *     스위치다 — 두 구현이 이 값의 {@code @ConditionalOnProperty}로 갈린다.
 * @param apiKey GMS 프록시 인증 키. <b>값은 코드·yaml에 적지 않는다</b> — 공통 yaml이
 *     {@code ${GMS_API_KEY:}}로 환경변수만 참조하고, 비어 있는 채로 {@code mode=gms}면
 *     {@link GmsImageGenerationConfig}가 기동을 세운다(운영에서만 드러나는 설정 누락 사고가
 *     3연속 있었다 — {@code dero-api/CLAUDE.md}).
 * @param baseUrl GMS 프록시 오리진. 경로는 호출부가 {@code requestType}에 따라 붙인다.
 * @param requestType 요청 방식. {@code EDITS}(기본)면 스크린샷을 입력 이미지로 함께 보내고,
 *     {@code GENERATIONS}면 텍스트 프롬프트만 보낸다. <b>강등 스위치다</b> — GMS 프록시가
 *     multipart를 거부할 가능성이 실측되지 않아, 거부되면 재배포 없이 환경변수
 *     {@code IMAGE_GENERATION_REQUEST_TYPE=generations}로 내릴 수 있어야 한다.
 * @param model 이미지 모델 이름.
 * @param size 출력 해상도. {@code auto}(기본)면 {@code EDITS} 경로에서 스크린샷의 실제 픽셀
 *     크기로 계산한다({@link OutputImageSize}) — 스크린샷 종횡비가 가변이라 고정값을 보내면 상류가
 *     리프레임해 배치가 깨진다. 명시값({@code 1536x864} 형식)이면 그대로 보낸다.
 * @param connectTimeout 연결 타임아웃.
 * @param readTimeout 응답 타임아웃. <b>생성은 수십 초가 걸린다</b> — 기본 무제한도, 흔한 5초도
 *     둘 다 틀린 값이라 명시한다.
 */
@ConfigurationProperties(prefix = "app.image.generation")
public record ImageGenerationProperties(
		String mode,
		String apiKey,
		String baseUrl,
		RequestType requestType,
		String model,
		String size,
		Duration connectTimeout,
		Duration readTimeout) {

	/**
	 * 두 갈래 다 응답이 같다({@code data[].b64_json}) — 저장·key 조립은 한 벌만 있으면 된다.
	 * enum으로 둔 이유는 오타를 기동 단계에서 세우기 위해서다(문자열이면 조용히 기본값으로 흐른다).
	 */
	@Getter
	@AllArgsConstructor(access = AccessLevel.PRIVATE)
	public enum RequestType {
		EDITS("POST /v1/images/edits — multipart에 스크린샷 PNG를 실어 보낸다."),
		GENERATIONS("POST /v1/images/generations — 텍스트 프롬프트만. multipart가 막힐 때의 강등 경로.");

		private final String description;
	}
}
