package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import java.time.Instant;
import java.util.function.Function;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.util.UriComponents;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 로컬 서명 URL의 발급({@link LocalPresignService})과 수신({@link LocalFileController})이 실제로
 * 맞물리는지 본다 — 목으로 서명을 만들면 양쪽이 갈려도 초록이라 <b>발급기가 낸 URL을 그대로</b> 친다.
 *
 * <p>{@link LocalFileStoragePort}가 진짜로 파일을 쓰므로 {@code app.storage.local-dir}을
 * {@code @TempDir}로 덮는다. 안 덮으면 공통 yaml의 {@code ./data/uploads}가 오염된다.
 */
@WebMvcTest(controllers = LocalFileController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import({LocalFileSigner.class, LocalPresignService.class, LocalFileStoragePort.class})
@EnableConfigurationProperties(StorageProperties.class)
class LocalFileControllerTest {

	private static final String KEY = "product-images/7/shot.png";
	private static final byte[] BYTES = {1, 2, 3, 4};

	@TempDir
	static Path 임시_업로드_루트;

	@DynamicPropertySource
	static void 스토리지_설정(DynamicPropertyRegistry registry) {
		registry.add("app.storage.mode", () -> "local");
		registry.add("app.storage.local-dir", () -> 임시_업로드_루트.toString());
		registry.add("app.storage.local-sign-secret", () -> "test-only-local-sign-secret");
		registry.add("app.storage.local-base-url", () -> "http://localhost:8080");
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private LocalPresignService localPresignService;

	@Autowired
	private LocalFileSigner localFileSigner;

	@Test
	@DisplayName("발급받은 PUT URL로 올린 바이트를 발급받은 GET URL로 그대로 돌려받는다")
	void 왕복() throws Exception {
		mockMvc.perform(서명된(path -> put(path), localPresignService.presignUpload(KEY, "image/png"))
						.contentType(MediaType.IMAGE_PNG)
						.content(BYTES))
				.andExpect(status().isOk());

		mockMvc.perform(서명된(path -> get(path), localPresignService.presignGet(KEY)))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.IMAGE_PNG))
				.andExpect(content().bytes(BYTES));

		assertThat(임시_업로드_루트.resolve(KEY)).exists();
	}

	@Test
	@DisplayName("서명이 틀리면 403 STORAGE_SIGNATURE_INVALID다")
	void 서명_불일치() throws Exception {
		mockMvc.perform(get(LocalFileController.BASE_PATH + "/" + KEY)
						.param("exp", String.valueOf(Instant.now().getEpochSecond() + 300))
						.param("sig", "deadbeef"))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("STORAGE_SIGNATURE_INVALID"));
	}

	@Test
	@DisplayName("exp가 지난 URL은 서명이 맞아도 403이다")
	void 만료() throws Exception {
		long 과거 = Instant.now().getEpochSecond() - 1;

		mockMvc.perform(get(LocalFileController.BASE_PATH + "/" + KEY)
						.param("exp", String.valueOf(과거))
						.param("sig", localFileSigner.sign("GET", KEY, 과거)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("STORAGE_SIGNATURE_INVALID"));
	}

	@Test
	@DisplayName("key에 ..가 들어오면 서명이 맞아도 403 STORAGE_INVALID_KEY다")
	void 경로_조작() throws Exception {
		String 조작된_key = "product-images/../../secret.png";
		long exp = Instant.now().getEpochSecond() + 300;

		mockMvc.perform(get(LocalFileController.BASE_PATH + "/" + 조작된_key)
						.param("exp", String.valueOf(exp))
						.param("sig", localFileSigner.sign("GET", 조작된_key, exp)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("STORAGE_INVALID_KEY"));
	}

	@Test
	@DisplayName("올린 적 없는 key를 GET하면 404 STORAGE_FILE_NOT_FOUND다")
	void 없는_파일() throws Exception {
		mockMvc.perform(서명된(path -> get(path), localPresignService.presignGet("product-images/7/nope.png")))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("STORAGE_FILE_NOT_FOUND"));
	}

	@Test
	@DisplayName("GET용으로 발급된 URL로는 PUT할 수 없다 (403)")
	void 메서드_교차() throws Exception {
		mockMvc.perform(서명된(path -> put(path), localPresignService.presignGet(KEY))
						.contentType(MediaType.IMAGE_PNG)
						.content(BYTES))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("STORAGE_SIGNATURE_INVALID"));
	}

	/** 발급기가 낸 절대 URL을 MockMvc가 칠 수 있는 경로 + 쿼리로 푼다. */
	private static MockHttpServletRequestBuilder 서명된(
			Function<String, MockHttpServletRequestBuilder> 메서드, String 발급된_url) {
		UriComponents uri = UriComponentsBuilder.fromUriString(발급된_url).build();
		return 메서드.apply(uri.getPath())
				.param("exp", uri.getQueryParams().getFirst("exp"))
				.param("sig", uri.getQueryParams().getFirst("sig"));
	}
}
