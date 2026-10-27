package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.localstack.LocalStackContainer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;

/**
 * {@link S3StoragePort}의 store→load 왕복을 <b>진짜 S3 API</b>로 확인한다(DERO-357).
 * AWS를 부르지 않는다 — LocalStack 컨테이너가 같은 프로토콜로 답한다.
 *
 * <p>컨테이너를 {@code @Testcontainers}/{@code @Container} 없이 static으로 한 번 띄운다 —
 * 그 확장은 클래스가 끝날 때 컨테이너를 멈춰서, 같은 컨테이너를 쓰는 클래스가 늘면 뒤쪽이 전부
 * {@code Connection refused}가 된다({@code AbstractPostgresIntegrationTest}가 같은 이유로 그렇다).
 *
 * <p>{@code forcePathStyle}이 필요하다 — 기본값인 가상 호스트 스타일은
 * {@code bucket.localhost}를 DNS로 풀어야 해서 컨테이너 엔드포인트에서 죽는다.
 */
class S3StoragePortTest {

	private static final String BUCKET = "dero-test-bucket";

	private static final LocalStackContainer LOCALSTACK =
			new LocalStackContainer("localstack/localstack:4.0").withServices("s3");

	static {
		LOCALSTACK.start();
	}

	private S3Client client;
	private StoragePort storage;

	@BeforeEach
	void setUp() {
		client = S3Client.builder()
				.endpointOverride(LOCALSTACK.getEndpoint())
				.region(Region.of(LOCALSTACK.getRegion()))
				.credentialsProvider(StaticCredentialsProvider.create(
						AwsBasicCredentials.create(LOCALSTACK.getAccessKey(), LOCALSTACK.getSecretKey())))
				.forcePathStyle(true)
				.build();
		if (client.listBuckets().buckets().stream().noneMatch(bucket -> BUCKET.equals(bucket.name()))) {
			client.createBucket(CreateBucketRequest.builder().bucket(BUCKET).build());
		}
		storage = new S3StoragePort(client, properties());
	}

	@Test
	@DisplayName("넣은 바이트를 같은 key로 그대로 꺼낸다")
	void 왕복한다() {
		String key = key();
		byte[] bytes = "fake-png-bytes".getBytes(StandardCharsets.UTF_8);

		storage.store(key, bytes);

		assertThat(storage.load(key)).contains(bytes);
	}

	@Test
	@DisplayName("없는 key는 예외가 아니라 빈 Optional이다 — 포트 계약이 로컬 구현과 같다")
	void 없는_key는_비어_있다() {
		assertThat(storage.load(key())).isEmpty();
	}

	@Test
	@DisplayName("지운 뒤에는 꺼낼 수 없다")
	void 지우면_사라진다() {
		String key = key();
		storage.store(key, "bytes".getBytes(StandardCharsets.UTF_8));

		storage.delete(key);

		assertThat(storage.load(key)).isEmpty();
	}

	@Test
	@DisplayName("key 확장자로 Content-Type을 붙여 저장한다 — 안 붙이면 presigned GET이 PNG를 다운로드로 내린다")
	void png는_이미지_타입으로_저장된다() {
		String key = "generated-images/" + UUID.randomUUID() + ".png";

		storage.store(key, "fake-png-bytes".getBytes(StandardCharsets.UTF_8));

		String contentType = client.headObject(
				HeadObjectRequest.builder().bucket(BUCKET).key(key).build()).contentType();
		assertThat(contentType).isEqualTo("image/png");
	}

	private static String key() {
		return "generated-images/" + UUID.randomUUID() + ".bin";
	}

	private static StorageProperties properties() {
		return new StorageProperties("s3", null, null, null, null,
				new StorageProperties.S3(BUCKET, LOCALSTACK.getRegion(), LOCALSTACK.getAccessKey(),
						LOCALSTACK.getSecretKey()));
	}
}
