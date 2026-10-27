package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.infra.ImageGenerationProperties.RequestType;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * {@link ImageGenerationPort}의 GMS(OpenAI 프록시) 구현 — {@code gpt-image-2}를 부르고, 응답의
 * base64를 디코드해 스토리지에 PNG로 넣은 뒤 key를 돌려준다.
 * {@code app.image.generation.mode=gms}일 때만 만들어진다.
 *
 * <p><b>기본 경로는 {@code POST {baseUrl}/v1/images/edits}다</b>(DERO-358) — 사용자의 배치
 * 스크린샷을 multipart의 {@code image} 파트로 함께 보내야 "내가 배치한 그대로가 실사로"가 성립한다.
 * 텍스트 프롬프트만으로는 배치·비율이 모델 마음대로다. {@code app.image.generation.request-type}을
 * {@code generations}로 내리면 옛 경로(텍스트만)로 돌아간다 — GMS 프록시가 multipart를 거부할
 * 가능성이 실측되지 않아 재배포 없이 내릴 수 있게 남겨 둔 강등 스위치이고, <b>응답 해석·저장은
 * 두 경로가 공유한다</b>.
 *
 * <p><b>Spring AI를 들이지 않았다</b> — 엔드포인트 하나에 자동설정·추상화 한 겹을 얹을 이유가 없다.
 *
 * <p><b>응답은 URL이 아니라 base64다.</b> {@code gpt-image} 계열은 {@code data[].url}을 주지 않고
 * {@code data[].b64_json}만 준다 — URL을 기대하고 짜면 필드가 통째로 비어 NPE로 죽는다.
 *
 * <p><b>한 번에 한 장씩 요청한다({@code n=1}).</b> 2026-08-06 업로드 장수가 1장이 되어 이 루프는
 * 사실상 한 바퀴만 돈다. {@code n} 자체를 늘리지 않는 이유는 그대로다 — 한 응답에 여러 장을 받으면
 * 각 결과에 서로 다른 역할(각도)을 지정할 수 없어 같은 구도가 반복된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "app.image.generation", name = "mode", havingValue = "gms")
public class GmsImageGeneration implements ImageGenerationPort {

	private static final String EDITS_PATH = "/v1/images/edits";
	private static final String GENERATIONS_PATH = "/v1/images/generations";
	private static final String SCREENSHOT_PART_FILENAME = "screenshot.png";
	private static final String KEY_PREFIX = "generated-images/";
	private static final String KEY_SUFFIX = ".png";
	/** 상류 실패 본문은 얼마든지 길 수 있다 — 원인 판별에 필요한 앞부분만 남긴다. */
	private static final int MAX_LOGGED_BODY_CHARS = 500;

	private final RestClient gms;
	private final StoragePort storage;
	private final ImageGenerationProperties properties;

	@Override
	public List<String> generate(ImageGenerationRequest request) {
		List<String> keys = new ArrayList<>(request.count());
		for (int index = 0; index < request.count(); index++) {
			GenerationResponse response = call(request);
			List<GeneratedImageData> images = response == null ? null : response.data();
			if (images == null || images.size() != 1) {
				throw new BusinessException(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED);
			}
			keys.add(store(images.getFirst().b64Json()));
		}
		return keys;
	}

	private GenerationResponse call(ImageGenerationRequest request) {
		String prompt = DeskScenePrompt.of(request);
		boolean textOnly = properties.requestType() == RequestType.GENERATIONS;
		// 스크린샷 읽기는 try 밖이다 — 여기서 나가는 것은 이미 번역된 BusinessException이라
		// 아래 catch가 다시 손댈 것이 없다(스토리지 실패도 같은 코드로 배치가 FAILED로 간다).
		MultiValueMap<String, Object> editsBody = textOnly ? null : editsBody(request, prompt);
		try {
			if (textOnly) {
				return gms.post()
						.uri(GENERATIONS_PATH)
						.contentType(MediaType.APPLICATION_JSON)
						.body(new GenerationRequest(properties.model(), prompt, properties.size(),
								1))
						.retrieve()
						.body(GenerationResponse.class);
			}
			return gms.post()
					.uri(EDITS_PATH)
					.contentType(MediaType.MULTIPART_FORM_DATA)
					.body(editsBody)
					.retrieve()
					.body(GenerationResponse.class);
		} catch (RestClientException e) {
			logUpstreamFailure(e);
			// 외부 호출 실패(비-2xx·타임아웃·역직렬화)를 ErrorCode로 번역한다 — 규칙 8이 허용하는
			// 유일한 catch 용도다. 번역된 예외는 워커가 받아 배치를 FAILED로 옮긴다.
			throw new BusinessException(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED);
		}
	}

	/**
	 * 상류가 준 상태코드·응답 본문을 남긴다. <b>로깅 규칙(규칙 9)의 명시 예외다 — 2026-08-02
	 * 박동규 승인.</b> 401(키)·400(모델·파라미터)·multipart 거부가 전부 같은
	 * {@code IMAGE_GENERATION_FAILED} 한 줄로만 보여, 이게 없으면 {@code mode=gms} 첫 실전에서
	 * 무엇이 틀렸는지 구분할 방법이 없다. <b>응답 본문만 찍는다 — 요청 본문·헤더는 찍지 않는다.</b>
	 */
	private void logUpstreamFailure(RestClientException e) {
		if (e instanceof RestClientResponseException response) {
			log.warn("GMS 이미지 생성 실패: status={}, body={}", response.getStatusCode(),
					truncated(response.getResponseBodyAsString()));
		}
	}

	private String truncated(String body) {
		if (body == null || body.length() <= MAX_LOGGED_BODY_CHARS) {
			return body;
		}
		return body.substring(0, MAX_LOGGED_BODY_CHARS);
	}

	/** OpenAI {@code images/edits} 규격의 multipart 본문. {@code n}까지 문자열로 싣는다. */
	private MultiValueMap<String, Object> editsBody(ImageGenerationRequest request, String prompt) {
		byte[] screenshot = loadScreenshot(request.screenshotKey());
		MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
		parts.add("model", properties.model());
		parts.add("prompt", prompt);
		parts.add("size", editsSize(screenshot));
		parts.add("n", "1");
		parts.add("image", screenshotPart(screenshot));
		return parts;
	}

	/**
	 * {@code auto}(기본)면 스크린샷의 실제 픽셀 크기에서 계산한다 — 고정값을 보내면 상류가 그 비율로
	 * 리프레임해 사용자의 배치가 깨진다. 명시값이면 그대로 보낸다.
	 */
	private String editsSize(byte[] screenshot) {
		if (!OutputImageSize.AUTO.equalsIgnoreCase(properties.size())) {
			return properties.size();
		}
		return OutputImageSize.of(screenshot);
	}

	private byte[] loadScreenshot(String screenshotKey) {
		if (screenshotKey == null || screenshotKey.isBlank()) {
			throw new BusinessException(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED);
		}
		return storage.load(screenshotKey)
				.orElseThrow(() -> new BusinessException(
						ImageGenerationErrorCode.IMAGE_GENERATION_FAILED));
	}

	/**
	 * 스크린샷을 파일 파트로 만든다. <b>파일명이 없으면 파일 파트가 아니라 값 파트로 나가</b> 상류가
	 * 이미지를 못 읽는다 — {@code ByteArrayResource}가 기본으로 파일명을 안 준다.
	 */
	private HttpEntity<ByteArrayResource> screenshotPart(byte[] screenshot) {
		ByteArrayResource resource = new ByteArrayResource(screenshot) {
			@Override
			public String getFilename() {
				return SCREENSHOT_PART_FILENAME;
			}
		};
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.IMAGE_PNG);
		return new HttpEntity<>(resource, headers);
	}

	private String store(String b64Json) {
		if (b64Json == null || b64Json.isBlank()) {
			throw new BusinessException(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED);
		}
		byte[] png;
		try {
			png = Base64.getDecoder().decode(b64Json);
		} catch (IllegalArgumentException e) {
			// 상류가 base64가 아닌 것을 보냈다 — JDK 예외를 ErrorCode로 번역한다(규칙 8).
			throw new BusinessException(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED);
		}
		// key는 배치별로 결정론적이지 않다 — 재업로드가 새 행을 더 쓰고(대표만 갈린다) 옛 행의 key가
		// 살아 있어야 해서, 같은 자리를 덮어쓰면 지난 상상도가 사라진다.
		String key = KEY_PREFIX + UUID.randomUUID() + KEY_SUFFIX;
		storage.store(key, png);
		return key;
	}

	/** {@code {"model":..., "prompt":..., "size":..., "n":...}}. */
	private record GenerationRequest(String model, String prompt, String size, int n) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record GenerationResponse(List<GeneratedImageData> data) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record GeneratedImageData(@JsonProperty("b64_json") String b64Json) {}
}
