package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/**
 * {@code app.storage.mode}가 {@link StoragePort} 구현체도 가르는가(DERO-357).
 *
 * <p>이 파일의 존재 이유는 <b>모드당 구현체가 정확히 하나</b>라는 것이다. 조건 없는 구현이 하나라도
 * 늘면 두 빈이 같이 떠서 주입이 {@code NoUniqueBeanDefinitionException}으로 죽는데, 그게 기동
 * 시점이라 "운영 배포에서만" 드러난다. 반대로 {@code s3} 조건만 있고 {@code local} 조건이 없으면
 * 운영에서 GMS가 만든 PNG가 컨테이너 디스크에 쓰이고 presign은 S3를 가리켜 <b>3행은 들어가고
 * 이미지만 전부 404</b>가 된다({@code infra/CLAUDE.md}).
 *
 * <p><b>{@code mode=s3}인데 자격증명이 비면 기동에서 죽는 것이 계약이다</b>(2026-08-02 개정, 승인
 * 박동규). 그전엔 반대였다 — {@link S3Config}의 빈과 주입점 양쪽에 붙은 {@code @Lazy}가 생성을 미뤄
 * 컨텍스트를 살렸고, 실패는 첫 요청까지 미뤄졌다. 그 {@code @Lazy}는 "S3를 안 쓰는 환경에선 이 빈을
 * 만들지 마라"를 지연으로 흉내 낸 것이라 {@code S3Config}에 {@code mode=s3} 조건을 붙여 대체했다.
 * 이제 실패가 부팅에서 나므로 운영 설정 누락이 배포 후가 아니라 배포 중에 드러난다
 * ({@code dero-api/CLAUDE.md} — 운영 전용 설정 누락으로 3연속 죽은 적이 있다).
 */
class StorageModeTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(SupportConfig.class, LocalFileStoragePort.class, S3StoragePort.class,
					S3Config.class)
			.withPropertyValues(
					"app.storage.local-dir=./build/tmp/storage-mode-test",
					"app.storage.s3.bucket=dero-test-bucket");

	@Test
	@DisplayName("mode를 지정하지 않으면 로컬 디스크 구현이 뜬다")
	void 기본값은_로컬() {
		runner.run(this::assertLocalOnly);
	}

	@Test
	@DisplayName("mode=local이면 로컬 디스크 구현만 뜬다")
	void 로컬_모드() {
		runner.withPropertyValues("app.storage.mode=local").run(this::assertLocalOnly);
	}

	@Test
	@DisplayName("mode=s3면 S3 구현만 뜬다")
	void s3_모드() {
		runner.withPropertyValues("app.storage.mode=s3",
						"app.storage.s3.region=ap-northeast-2",
						"app.storage.s3.access-key=test-access-key",
						"app.storage.s3.secret-key=test-secret-key")
				.run(context -> {
					assertThat(context).hasSingleBean(StoragePort.class);
					assertThat(context).hasSingleBean(S3StoragePort.class);
					assertThat(context).doesNotHaveBean(LocalFileStoragePort.class);
				});
	}

	@Test
	@DisplayName("mode=s3인데 region이 비면 기동에서 죽는다 — 첫 요청까지 미루지 않는다")
	void s3_모드_설정_누락() {
		runner.withPropertyValues("app.storage.mode=s3")
				.run(context -> assertThat(context).hasFailed());
	}

	private void assertLocalOnly(AssertableApplicationContext context) {
		assertThat(context).hasSingleBean(StoragePort.class);
		assertThat(context).hasSingleBean(LocalFileStoragePort.class);
		assertThat(context).doesNotHaveBean(S3StoragePort.class);
	}

	@Configuration(proxyBeanMethods = false)
	@EnableConfigurationProperties(StorageProperties.class)
	static class SupportConfig {}
}
