package com.brunchies.dero.infra;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 이미지 안정 공개 URL(ADR-0035)의 수신부 {@link PublicImageController}를 본다 — 서명·만료가
 * 없는 대신 <b>프리픽스 화이트리스트와 {@code ..} 차단이 전부</b>이므로 그 경계를 고정한다.
 *
 * <p>{@link LocalFileStoragePort}가 진짜로 파일을 쓰므로 {@code app.storage.local-dir}을
 * {@code @TempDir}로 덮는다({@link LocalFileControllerTest}와 같은 판단).
 */
@WebMvcTest(controllers = PublicImageController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import({LocalFileStoragePort.class, PublicImageUrlResolver.class})
@EnableConfigurationProperties(StorageProperties.class)
class PublicImageControllerTest {

	private static final String KEY = "product-images/7/a1b2c3.webp";
	private static final byte[] BYTES = {1, 2, 3, 4};

	@TempDir
	static Path 임시_업로드_루트;

	@DynamicPropertySource
	static void 스토리지_설정(DynamicPropertyRegistry registry) {
		registry.add("app.storage.mode", () -> "local");
		registry.add("app.storage.local-dir", () -> 임시_업로드_루트.toString());
		registry.add("app.storage.local-sign-secret", () -> "test-only-local-sign-secret");
		registry.add("app.storage.local-base-url", () -> "http://localhost:8080");
		registry.add("app.storage.public-base-url", () -> "http://localhost:8080");
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private LocalFileStoragePort storage;

	@Autowired
	private PublicImageUrlResolver resolver;

	@Test
	@DisplayName("저장된 이미지를 서명 없이 200으로 돌려주고 immutable 캐시 헤더가 붙는다")
	void 공개_조회() throws Exception {
		storage.store(KEY, BYTES);

		mockMvc.perform(get(PublicImageController.BASE_PATH + "/" + KEY))
				.andExpect(status().isOk())
				.andExpect(header().string(
						HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable"))
				.andExpect(content().contentType(MediaType.parseMediaType("image/webp")))
				.andExpect(content().bytes(BYTES));
	}

	@Test
	@DisplayName("리졸버가 조립한 URL 경로가 이 컨트롤러의 매핑과 일치한다")
	void 리졸버_왕복() throws Exception {
		storage.store(KEY, BYTES);
		String url = resolver.url(KEY);

		mockMvc.perform(get(url.replace("http://localhost:8080", "")))
				.andExpect(status().isOk())
				.andExpect(content().bytes(BYTES));
	}

	@Test
	@DisplayName("화이트리스트 밖 프리픽스(assets 등)는 403 STORAGE_INVALID_KEY다")
	void 비공개_프리픽스() throws Exception {
		storage.store("assets/7/model.glb", BYTES);

		mockMvc.perform(get(PublicImageController.BASE_PATH + "/assets/7/model.glb"))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("STORAGE_INVALID_KEY"));
	}

	@Test
	@DisplayName("key에 ..가 들어오면 403 STORAGE_INVALID_KEY다")
	void 경로_조작() throws Exception {
		mockMvc.perform(get(PublicImageController.BASE_PATH + "/product-images/../../secret.png"))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("STORAGE_INVALID_KEY"));
	}

	@Test
	@DisplayName("없는 key는 404 STORAGE_FILE_NOT_FOUND다")
	void 없는_파일() throws Exception {
		mockMvc.perform(get(PublicImageController.BASE_PATH + "/product-images/7/nope.webp"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("STORAGE_FILE_NOT_FOUND"));
	}
}
