package com.brunchies.dero.infra;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3를 직접 부르는 AWS SDK 클라이언트 빈 둘 — presigned URL 발급용 {@link S3Presigner}와
 * 바이트를 넣고 빼는 {@link S3Client}.
 *
 * <p>자격증명을 AWS SDK 기본 체인(환경변수를 직접 읽음)에 맡기지 않고 {@link StorageProperties}로 명시
 * 바인딩한다 — 이 프로젝트의 로컬 시크릿은 실제 OS 환경변수가 아니라 {@code .env.local}(Spring
 * 프로퍼티 파일) → {@code spring.config.import}로 들어온다(ADR-0010). 기본 체인에 맡기면
 * {@code AWS_ACCESS_KEY_ID}를 {@code .env.local}에 적어도 {@code System.getenv()}엔 보이지 않아
 * 로컬에서만 조용히 인증이 깨진다.
 *
 * <p><b>{@code mode=s3}일 때만 등록된다</b>(2026-08-02, 승인 박동규). 그전까지는 조건 없이 등록하고
 * {@code @Lazy}로 생성을 미뤘는데 — {@code app.storage.s3.region}이 비는 테스트·로컬에서
 * {@code Region.of("")}가 기동을 세우기 때문이다 — 그건 조건의 대용품이었다. 소비자 둘
 * ({@link S3PresignService}·{@link S3StoragePort})이 이미 같은 조건을 들고 있어 이쪽에 조건을 붙이는
 * 것이 원래 하려던 말이고, {@code @Lazy}는 주입점에도 같이 붙여야 작동하는 함정이었다(한쪽만 붙여
 * 테스트 47개가 죽은 적이 있다 — {@code infra/CLAUDE.md}).
 *
 * <p>대가는 <b>실패가 기동으로 앞당겨지는 것</b>이고 그게 이 변경의 목적이다 — {@code mode=s3}인데
 * region·자격증명이 비면 첫 요청이 아니라 부팅에서 죽는다. 운영 전용 설정 누락이 배포에서만 드러난
 * 사고가 세 번 있었다({@code dero-api/CLAUDE.md}).
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "s3")
public class S3Config {

	@Bean
	public S3Presigner s3Presigner(StorageProperties properties) {
		StorageProperties.S3 s3 = properties.s3();
		return S3Presigner.builder()
				.region(Region.of(s3.region()))
				.credentialsProvider(
						StaticCredentialsProvider.create(
								AwsBasicCredentials.create(s3.accessKey(), s3.secretKey())))
				.build();
	}

	@Bean
	public S3Client s3Client(StorageProperties properties) {
		StorageProperties.S3 s3 = properties.s3();
		return S3Client.builder()
				.region(Region.of(s3.region()))
				.credentialsProvider(
						StaticCredentialsProvider.create(
								AwsBasicCredentials.create(s3.accessKey(), s3.secretKey())))
				.build();
	}
}
