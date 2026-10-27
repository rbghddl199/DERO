package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 로컬 서명 URL의 HMAC 규칙 — 스프링 컨텍스트 없이 순수 단위로 본다. */
class LocalFileSignerTest {

	private static final String KEY = "product-images/7/shot.png";

	private final LocalFileSigner signer = signerWithSecret("secret-a");

	private static LocalFileSigner signerWithSecret(String secret) {
		return new LocalFileSigner(new StorageProperties(
				"local", "./data/uploads", secret, "http://localhost:8080", "http://localhost:8080",
				new StorageProperties.S3(null, null, null, null)));
	}

	private static long 미래() {
		return Instant.now().getEpochSecond() + 300;
	}

	@Test
	@DisplayName("자기가 발급한 서명은 유효하다")
	void 서명_왕복() {
		long exp = 미래();

		assertThat(signer.isValid("PUT", KEY, exp, signer.sign("PUT", KEY, exp))).isTrue();
	}

	@Test
	@DisplayName("서명이 한 글자라도 다르면 무효다")
	void 서명_변조() {
		long exp = 미래();
		String 변조 = signer.sign("PUT", KEY, exp).substring(1) + "0";

		assertThat(signer.isValid("PUT", KEY, exp, 변조)).isFalse();
	}

	@Test
	@DisplayName("exp가 지난 서명은 무효다 (서명 자체는 맞아도)")
	void 서명_만료() {
		long 과거 = Instant.now().getEpochSecond() - 1;

		assertThat(signer.isValid("GET", KEY, 과거, signer.sign("GET", KEY, 과거))).isFalse();
	}

	@Test
	@DisplayName("GET용 서명으로 PUT을 할 수 없다 (method가 서명에 들어간다)")
	void 서명_메서드_교차() {
		long exp = 미래();

		assertThat(signer.isValid("PUT", KEY, exp, signer.sign("GET", KEY, exp))).isFalse();
	}

	@Test
	@DisplayName("시크릿이 다르면 서명이 달라진다")
	void 서명_시크릿_분리() {
		long exp = 미래();

		assertThat(signer.isValid("GET", KEY, exp, signerWithSecret("secret-b").sign("GET", KEY, exp)))
				.isFalse();
	}

	/**
	 * 구분자 없이 이어붙이면 {@code "PUT" + "a1" + 234}와 {@code "PUT" + "a12" + 34}가 같은 문자열이라
	 * 만료 시각을 바꿔치기할 수 있다. 구분자가 그걸 막는지 못 박는다.
	 */
	@Test
	@DisplayName("key와 exp의 경계가 서명에 반영된다 (구분자 없이 이어붙이면 뚫린다)")
	void 서명_경계_모호성() {
		assertThat(signer.sign("PUT", "a1", 234L)).isNotEqualTo(signer.sign("PUT", "a12", 34L));
	}
}
