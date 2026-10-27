package com.brunchies.dero.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.user.UserRole;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * Spring 컨텍스트 없이 {@link JwtConfig}가 만드는 빈과 같은 방식으로 {@link SecretKey}·{@link
 * org.springframework.security.oauth2.jwt.JwtEncoder}를 직접 구성해 검증한다.
 */
class JwtIssuerTest {

	private final SecretKey secretKey =
			new SecretKeySpec("unit-test-secret-key-at-least-32-bytes-long".getBytes(StandardCharsets.UTF_8),
					"HmacSHA256");

	private final JwtIssuer jwtIssuer =
			new JwtIssuer(NimbusJwtEncoder.withSecretKey(secretKey).build(), secretKey);

	@Test
	@DisplayName("발급한 리프레시 토큰을 디코딩하면 같은 userId·jti가 나온다")
	void 리프레시_왕복() {
		JwtIssuer.IssuedRefreshToken issued = jwtIssuer.issueRefreshToken(42L);

		JwtIssuer.DecodedRefreshToken decoded = jwtIssuer.decodeRefreshToken(issued.token());

		assertThat(decoded.userId()).isEqualTo(42L);
		assertThat(decoded.jti()).isEqualTo(issued.jti());
	}

	@Test
	@DisplayName("액세스 토큰을 리프레시로 들이밀면 401 AUTH_REFRESH_INVALID다 — typ 클레임이 access라서 거절된다")
	void 액세스_토큰을_리프레시로_사용_거절() {
		String accessToken = jwtIssuer.issueAccessToken(1L, UserRole.USER);

		assertThatThrownBy(() -> jwtIssuer.decodeRefreshToken(accessToken))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(SecurityErrorCode.AUTH_REFRESH_INVALID));
	}

	@Test
	@DisplayName("서명이 다른 토큰(변조)은 401 AUTH_REFRESH_INVALID다")
	void 변조된_토큰_거절() {
		SecretKey otherKey = new SecretKeySpec(
				"a-completely-different-secret-key-32bytes!!".getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		JwtIssuer otherIssuer =
				new JwtIssuer(NimbusJwtEncoder.withSecretKey(otherKey).build(), otherKey);
		String tokenSignedByOtherKey = otherIssuer.issueRefreshToken(1L).token();

		assertThatThrownBy(() -> jwtIssuer.decodeRefreshToken(tokenSignedByOtherKey))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(SecurityErrorCode.AUTH_REFRESH_INVALID));
	}
}
