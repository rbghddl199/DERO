package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.brunchies.dero.infra.ImageGenerationProperties.RequestType;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * {@link ImageGenerationPort}의 <b>계약</b> — 구현이 무엇이든 도메인이 기대하는 것은 하나다:
 * <b>요청한 장수만큼의 key가 오고, 그 key로 스토리지에서 실제 바이트를 꺼낼 수 있다.</b>
 *
 * <p>두 구현에 같은 단언을 돌린다. 한쪽만 검사하면 모드를 바꾼 날 "3행은 들어갔는데 이미지가 전부
 * 404"인 상태를 배포에서야 발견한다 — 스텁은 파일을 만들지 않고 입력 key를 되돌려 주는 구현이라
 * 계약을 얼마든지 다르게 만족시킬 수 있기 때문이다.
 */
class ImageGenerationPortContractTest {

	private static final int COUNT = 3;
	private static final String BASE_URL = "https://gms.example.test";
	private static final String SCREENSHOT_KEY = "placement-thumbnails/1.png";

	@TempDir
	Path storageDir;

	private StoragePort storage;

	@BeforeEach
	void setUpStorage() {
		storage = new LocalFileStoragePort(
				new StorageProperties(
						"local", storageDir.toString(), "s", "http://localhost", "http://localhost", null));
	}

	private void assertContract(List<String> keys) {
		assertThat(keys).hasSize(COUNT);
		assertThat(keys).allSatisfy(key -> {
			assertThat(key).isNotBlank();
			assertThat(storage.load(key)).isPresent();
		});
	}

	@Nested
	@DisplayName("스텁 구현")
	class 스텁 {

		@Test
		@DisplayName("요청한 장수만큼 key를 주고 그 key로 스토리지에서 꺼낼 수 있다")
		void 계약을_지킨다() {
			// 스텁은 파일을 만들지 않는다 — 스크린샷은 사용자가 이미 올려 둔 것이다.
			storage.store(SCREENSHOT_KEY, "screenshot".getBytes(StandardCharsets.UTF_8));
			ImageGenerationPort port = new StubImageGeneration();

			assertContract(port.generate(request()));
		}
	}

	@Nested
	@DisplayName("GMS 구현")
	class GMS {

		@Test
		@DisplayName("요청한 장수만큼 key를 주고 그 key로 스토리지에서 꺼낼 수 있다")
		void 계약을_지킨다() {
			// edits 경로는 스크린샷을 입력으로 읽는다 — 사용자가 이미 올려 둔 파일이다.
			storage.store(SCREENSHOT_KEY, "screenshot".getBytes(StandardCharsets.UTF_8));
			RestClient.Builder builder = RestClient.builder()
					.baseUrl(BASE_URL)
					.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer test-gms-api-key");
			MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
			// **한 번에 COUNT장이 아니라, 한 장씩 COUNT번이다.** 뷰마다 프롬프트가 달라야 해서
			// 구현이 n=1 요청을 반복한다(GmsImageGeneration 클래스 주석). 여기를 once()+COUNT장으로
			// 두면 첫 응답이 3장이라 구현의 size() != 1 검사에 걸려 IMAGE_GENERATION_FAILED가 난다.
			server.expect(ExpectedCount.times(COUNT), requestTo(BASE_URL + "/v1/images/edits"))
					.andRespond(withSuccess(responseWith(1), MediaType.APPLICATION_JSON));
			ImageGenerationPort port =
					new GmsImageGeneration(builder.build(), storage, properties());

			assertContract(port.generate(request()));
			server.verify();
		}
	}

	private ImageGenerationRequest request() {
		return new ImageGenerationRequest(SCREENSHOT_KEY, "Walnut", "FOUR_LEG",
				List.of("LG 27UP850"), COUNT);
	}

	static ImageGenerationProperties properties() {
		return properties(RequestType.EDITS);
	}

	static ImageGenerationProperties properties(RequestType requestType) {
		return properties(requestType, "auto");
	}

	static ImageGenerationProperties properties(RequestType requestType, String size) {
		return new ImageGenerationProperties("gms", "test-gms-api-key", BASE_URL, requestType,
				"gpt-image-2", size, Duration.ofSeconds(5), Duration.ofSeconds(300));
	}

	static String responseWith(int imageCount) {
		String entries = java.util.stream.IntStream.range(0, imageCount)
				.mapToObj(index -> "{\"b64_json\":\"" + base64Png(index) + "\"}")
				.reduce((left, right) -> left + "," + right)
				.orElse("");
		return "{\"created\":1,\"data\":[" + entries + "]}";
	}

	static String base64Png(int index) {
		return Base64.getEncoder()
				.encodeToString(("fake-png-" + index).getBytes(StandardCharsets.UTF_8));
	}
}
