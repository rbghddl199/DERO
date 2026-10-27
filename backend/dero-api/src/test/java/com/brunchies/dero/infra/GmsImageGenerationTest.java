package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withUnauthorizedRequest;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.infra.ImageGenerationProperties.RequestType;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * GMS 호출의 요청 형태·응답 해석·실패 경로(DERO-354, edits 전환은 DERO-358).
 *
 * <p><b>실제 GMS를 부르지 않는다</b> — 키가 없고, 있어도 테스트가 유료 GPU를 태울 이유가 없다.
 * {@code MockRestServiceServer}가 {@code RestClient} 아래의 request factory를 대신한다.
 */
class GmsImageGenerationTest {

	private static final String BASE_URL = "https://gms.example.test";
	private static final String SCREENSHOT_KEY = "placement-thumbnails/1.png";
	private static final String BROKEN_SCREENSHOT_KEY = "placement-thumbnails/broken.png";

	@TempDir
	Path storageDir;

	private StoragePort storage;
	private RestClient.Builder builder;
	private MockRestServiceServer server;

	@BeforeEach
	void setUp() throws IOException {
		storage = new LocalFileStoragePort(
				new StorageProperties(
						"local", storageDir.toString(), "s", "http://localhost", "http://localhost", null));
		// 진짜 PNG여야 한다 — size=auto가 ImageIO로 실제 픽셀 크기를 읽는다.
		storage.store(SCREENSHOT_KEY, pngBytes(1600, 900));
		storage.store(BROKEN_SCREENSHOT_KEY, "not-a-png".getBytes(StandardCharsets.UTF_8));
		builder = RestClient.builder()
				.baseUrl(BASE_URL)
				.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer test-gms-api-key");
		server = MockRestServiceServer.bindTo(builder).build();
	}

	@Test
	@DisplayName("edits로 스크린샷 PNG를 multipart에 실어 세 가지 뷰를 각각 생성한다")
	void 요청_형태() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andExpect(method(HttpMethod.POST))
				.andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer test-gms-api-key"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
				// 파일 파트는 파일명이 있어야 상류가 이미지로 읽는다.
				.andExpect(content().string(org.hamcrest.Matchers.containsString("screenshot.png")))
				.andExpect(content().string(org.hamcrest.Matchers.containsString("gpt-image-2")))
				// size=auto → 1600x900 스크린샷의 종횡비를 따른다.
				.andExpect(content().string(org.hamcrest.Matchers.containsString("1536x864")))
				.andExpect(content().string(
						org.hamcrest.Matchers.containsString("The desk top is walnut.")))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
		expectSuccessfulEdit();
		expectSuccessfulEdit();

		port(RequestType.EDITS).generate(request(3));

		server.verify();
	}

	@Test
	@DisplayName("request-type=generations로 내리면 텍스트 프롬프트만 담아 옛 경로로 간다")
	void 강등_경로() {
		server.expect(requestTo(BASE_URL + "/v1/images/generations"))
				.andExpect(method(HttpMethod.POST))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(jsonPath("$.model").value("gpt-image-2"))
				// generations는 스크린샷이 없다 — auto가 그대로 나간다(상류가 정하는 유효한 값).
				.andExpect(jsonPath("$.size").value("auto"))
				.andExpect(jsonPath("$.n").value(1))
				.andExpect(jsonPath("$.prompt").value(
						org.hamcrest.Matchers.containsString("The desk top is walnut.")))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
		expectSuccessfulGeneration();
		expectSuccessfulGeneration();

		port(RequestType.GENERATIONS).generate(request(3));

		server.verify();
	}

	@Test
	@DisplayName("스크린샷을 PNG로 못 읽으면 size를 auto로 실어 상류가 정하게 둔다")
	void 못_읽는_스크린샷은_auto로_나간다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andExpect(content().string(org.hamcrest.Matchers.containsString("auto")))
				.andExpect(content().string(org.hamcrest.Matchers.not(
						org.hamcrest.Matchers.containsString("1536"))))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
		expectSuccessfulEdit();
		expectSuccessfulEdit();

		port(RequestType.EDITS).generate(new ImageGenerationRequest(BROKEN_SCREENSHOT_KEY, "Walnut",
				"FOUR_LEG", List.of("LG 27UP850"), 3));

		server.verify();
	}

	@Test
	@DisplayName("size에 명시값을 넣으면 스크린샷과 무관하게 그 값을 그대로 보낸다")
	void 명시_size는_그대로_나간다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andExpect(content().string(org.hamcrest.Matchers.containsString("1024x1024")))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
		expectSuccessfulEdit();
		expectSuccessfulEdit();

		new GmsImageGeneration(builder.build(), storage,
				ImageGenerationPortContractTest.properties(RequestType.EDITS, "1024x1024"))
				.generate(request(3));

		server.verify();
	}

	@Test
	@DisplayName("응답의 b64_json을 디코드해 스토리지에 넣고 그 key를 돌려준다")
	void b64를_디코드해_저장한다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
		expectSuccessfulEdit();
		expectSuccessfulEdit();

		List<String> keys = port(RequestType.EDITS).generate(request(3));

		assertThat(keys).hasSize(3).doesNotHaveDuplicates();
		assertThat(keys).allMatch(key -> key.startsWith("generated-images/") && key.endsWith(".png"));
		assertThat(new String(storage.load(keys.get(0)).orElseThrow(), StandardCharsets.UTF_8))
				.isEqualTo("fake-png-0");
	}

	@Test
	@DisplayName("스크린샷을 스토리지에서 못 읽으면 호출 없이 BusinessException으로 번역한다")
	void 스크린샷이_없으면_부르지_않는다() {
		ImageGenerationRequest missing = new ImageGenerationRequest("placement-thumbnails/none.png",
				"Walnut", "FOUR_LEG", List.of("LG 27UP850"), 3);

		assertThatThrownBy(() -> port(RequestType.EDITS).generate(missing))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED.name());
		// 기대를 하나도 걸지 않았으므로 호출이 있었다면 여기서 드러난다.
		server.verify();
	}

	@Test
	@DisplayName("GMS가 5xx로 답하면 BusinessException으로 번역한다 — 워커가 FAILED로 옮길 수 있어야 한다")
	void 서버_오류는_번역된다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits")).andRespond(withServerError());

		assertThatThrownBy(() -> port(RequestType.EDITS).generate(request(3)))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED.name());
	}

	@Test
	@DisplayName("키가 거부되면(401) BusinessException으로 번역한다")
	void 인증_실패는_번역된다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andRespond(withUnauthorizedRequest());

		assertThatThrownBy(() -> port(RequestType.EDITS).generate(request(3)))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	@DisplayName("요청한 장수보다 적게 오면 부분 저장 없이 통째로 실패한다")
	void 장수가_모자라면_실패한다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(2),
						MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> port(RequestType.EDITS).generate(request(3)))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	@DisplayName("b64가 아닌 문자열이 오면 BusinessException으로 번역한다")
	void 깨진_b64는_번역된다() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andRespond(withSuccess("{\"data\":[{\"b64_json\":\"!!not-base64!!\"}]}",
						MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> port(RequestType.EDITS).generate(request(1)))
				.isInstanceOf(BusinessException.class);
	}

	private GmsImageGeneration port(RequestType requestType) {
		return new GmsImageGeneration(builder.build(), storage,
				ImageGenerationPortContractTest.properties(requestType));
	}

	private void expectSuccessfulEdit() {
		server.expect(requestTo(BASE_URL + "/v1/images/edits"))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
	}

	private void expectSuccessfulGeneration() {
		server.expect(requestTo(BASE_URL + "/v1/images/generations"))
				.andRespond(withSuccess(ImageGenerationPortContractTest.responseWith(1),
						MediaType.APPLICATION_JSON));
	}

	private ImageGenerationRequest request(int count) {
		return new ImageGenerationRequest(SCREENSHOT_KEY, "Walnut", "FOUR_LEG",
				List.of("LG 27UP850"), count);
	}

	private static byte[] pngBytes(int width, int height) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}
}
