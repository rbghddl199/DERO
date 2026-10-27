package com.brunchies.dero.global.security;

import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * 액세스·리프레시 JWT 둘 다 같은 HMAC 대칭키(`app.jwt.secret`)로 서명·검증한다(ADR-0005 결정 9).
 * 커스텀 필터·jjwt 없음 — Spring Security의 {@code NimbusJwtEncoder}/{@code NimbusJwtDecoder}만 쓴다.
 *
 * <p>{@code app.jwt.secret}은 로컬은 {@code application-local.yaml}에 평문 고정, 테스트는
 * {@code application-test.yaml}에 별도 고정값, 운영은 {@code JWT_SECRET} env → {@code APP_JWT_SECRET}
 * 보간(ADR-0010 결정 1) — 어느 프로파일에도 없으면 이 빈들이 기동 시점에 바로 실패한다(의도된 동작).
 */
@Configuration
public class JwtConfig {

	@Bean
	public SecretKey jwtSecretKey(@Value("${app.jwt.secret}") String secret) {
		return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
	}

	/**
	 * {@code new NimbusJwtEncoder(JWKSource)}(범용 생성자)는 기본 서명 헤더가 RS256이라 HMAC
	 * 시크릿 키와 맞지 않아 {@code selectJwk}가 항상 실패한다 — {@code withSecretKey(...)} 빌더가
	 * 그 대신 키에서 HS256을 도출해 기본 헤더를 만든다(단위테스트로 실제로 발급해 봐야 드러나는
	 * 함정이다, {@code JwtIssuerTest} 참고).
	 */
	@Bean
	public JwtEncoder jwtEncoder(SecretKey jwtSecretKey) {
		return NimbusJwtEncoder.withSecretKey(jwtSecretKey).build();
	}

	/**
	 * 리소스 서버(보호 API 전부)가 쓰는 디코더 — {@code typ=access}만 통과시킨다. 리프레시 토큰은
	 * 같은 비밀키로 서명되지만 수명이 14일이라, 이 검증이 없으면 유출된 리프레시 토큰을 액세스
	 * 토큰으로 재생할 수 있다. 리프레시 토큰 자체의 디코딩은 {@code JwtIssuer}가 별도 인스턴스로 한다.
	 */
	@Bean
	public JwtDecoder jwtDecoder(SecretKey jwtSecretKey) {
		NimbusJwtDecoder decoder =
				NimbusJwtDecoder.withSecretKey(jwtSecretKey).macAlgorithm(MacAlgorithm.HS256).build();
		OAuth2TokenValidator<Jwt> withTimestamp = JwtValidators.createDefault();
		OAuth2TokenValidator<Jwt> isAccessToken = new JwtClaimValidator<String>("typ", "access"::equals);
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(withTimestamp, isAccessToken));
		return decoder;
	}
}
