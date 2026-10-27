package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * {@code app.image.generation.mode}가 실제로 스위치인가(DERO-354).
 *
 * <p>{@code app.storage.mode}가 presign 구현체를 가르는 것과 같은 관용구다 — 세 가지를 못 박는다:
 * <b>기본값은 스텁</b> · <b>gms면 GMS 구현만</b> · <b>gms인데 키가 비면 기동이 죽는다</b>.
 * 마지막 항목이 이 파일의 존재 이유다: 런타임으로 미루면 업로드가 전부 {@code FAILED}로 쌓인 뒤에야
 * 드러난다.
 */
class ImageGenerationModeTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(SupportConfig.class, StubImageGeneration.class,
					GmsImageGeneration.class, GmsImageGenerationConfig.class)
			.withPropertyValues(
					"app.image.generation.base-url=https://gms.example.test",
					"app.image.generation.model=gpt-image-2",
					"app.image.generation.size=1024x1024",
					"app.image.generation.connect-timeout=5s",
					"app.image.generation.read-timeout=120s");

	@Test
	@DisplayName("mode를 지정하지 않으면 스텁이 뜬다 — 외부 키 없이도 파이프라인이 돈다")
	void 기본값은_스텁() {
		runner.run(this::assertStubOnly);
	}

	@Test
	@DisplayName("mode=stub이면 스텁만 뜬다")
	void 스텁_모드() {
		runner.withPropertyValues("app.image.generation.mode=stub").run(this::assertStubOnly);
	}

	@Test
	@DisplayName("mode=gms면 GMS 구현만 뜬다")
	void gms_모드() {
		runner.withPropertyValues("app.image.generation.mode=gms",
						"app.image.generation.api-key=test-gms-api-key")
				.run(context -> {
					assertThat(context).hasSingleBean(ImageGenerationPort.class);
					assertThat(context).hasSingleBean(GmsImageGeneration.class);
					assertThat(context).doesNotHaveBean(StubImageGeneration.class);
				});
	}

	@Test
	@DisplayName("mode=gms인데 키가 비면 기동이 죽는다 — 런타임 401로 미루지 않는다")
	void gms_모드에_키가_없으면_기동이_죽는다() {
		runner.withPropertyValues("app.image.generation.mode=gms",
						"app.image.generation.api-key=")
				.run(context -> assertThat(context).hasFailed()
						.getFailure()
						.hasStackTraceContaining("GMS_API_KEY"));
	}

	private void assertStubOnly(AssertableApplicationContext context) {
		assertThat(context).hasSingleBean(ImageGenerationPort.class);
		assertThat(context).hasSingleBean(StubImageGeneration.class);
		assertThat(context).doesNotHaveBean(GmsImageGeneration.class);
	}

	@Configuration(proxyBeanMethods = false)
	@EnableConfigurationProperties(ImageGenerationProperties.class)
	static class SupportConfig {

		/** {@link GmsImageGeneration}의 의존성만 채운다 — 여기서 스토리지를 검증하지 않는다. */
		@Bean
		StoragePort storagePort() {
			return new StoragePort() {
				@Override
				public void store(String key, byte[] bytes) {}

				@Override
				public Optional<byte[]> load(String key) {
					return Optional.empty();
				}

				@Override
				public void delete(String key) {}
			};
		}
	}
}
