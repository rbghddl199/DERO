package com.brunchies.dero.auth.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.user.UserRole;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Service;

/**
 * 액세스·리프레시 JWT 발급 + 리프레시 토큰 디코딩(ADR-0005 결정 2·9·10).
 *
 * <p><b>둘 다 {@code typ} 클레임으로 구분한다</b>("access"/"refresh") — 같은 비밀키로 서명하므로
 * {@code typ}이 없으면 유출된 리프레시 토큰(수명 14일)을 액세스 토큰으로 재생하거나, 반대로 액세스
 * 토큰을 {@code /auth/refresh}에 들이밀어 새 리프레시 세션을 얻어낼 수 있다. 리소스 서버가 쓰는
 * {@link com.brunchies.dero.global.security.JwtConfig#jwtDecoder}는 {@code typ=access}만 통과시키고,
 * 여기 내부 디코더는 서명·만료만 보고 {@code typ=refresh}는 이 클래스가 직접 확인한다.
 */
@Service
public class JwtIssuer {

	private static final Duration ACCESS_TTL = Duration.ofMinutes(30);
	private static final Duration REFRESH_TTL = Duration.ofDays(14);
	public static final long ACCESS_TTL_SECONDS = ACCESS_TTL.toSeconds();

	private final JwtEncoder jwtEncoder;
	private final NimbusJwtDecoder refreshJwtDecoder;

	public JwtIssuer(JwtEncoder jwtEncoder, SecretKey jwtSecretKey) {
		this.jwtEncoder = jwtEncoder;
		// 리소스 서버용 JwtDecoder 빈과 별도 인스턴스다 — 그쪽은 typ=access만 통과시키는 검증기가
		// 걸려 있어 리프레시 토큰을 못 읽는다. 여기는 서명·만료만 보고 typ은 직접 확인한다.
		this.refreshJwtDecoder =
				NimbusJwtDecoder.withSecretKey(jwtSecretKey).macAlgorithm(MacAlgorithm.HS256).build();
	}

	public String issueAccessToken(Long userId, UserRole role) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject(String.valueOf(userId))
				.claim("role", role.name())
				.claim("typ", "access")
				.issuedAt(now)
				.expiresAt(now.plus(ACCESS_TTL))
				.build();
		return jwtEncoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
	}

	public IssuedRefreshToken issueRefreshToken(Long userId) {
		String jti = UUID.randomUUID().toString();
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.subject(String.valueOf(userId))
				.claim(JwtClaimNames.JTI, jti)
				.claim("typ", "refresh")
				.issuedAt(now)
				.expiresAt(now.plus(REFRESH_TTL))
				.build();
		String token = jwtEncoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
		return new IssuedRefreshToken(token, jti);
	}

	/** 서명·만료를 검증하고 {@code typ=refresh}인지 확인한다. 무엇이든 안 맞으면 401. */
	public DecodedRefreshToken decodeRefreshToken(String token) {
		return tryDecodeRefreshToken(token)
				.orElseThrow(() -> new BusinessException(SecurityErrorCode.AUTH_REFRESH_INVALID));
	}

	/** 무효한 토큰을 예외가 아니라 빈 값으로 돌려준다 — 로그아웃처럼 "무효해도 정상"인 경로가 쓴다. */
	public Optional<DecodedRefreshToken> tryDecodeRefreshToken(String token) {
		Jwt jwt;
		try {
			jwt = refreshJwtDecoder.decode(token);
		} catch (JwtException e) {
			// 서명·만료·형식 오류를 전부 "무효한 토큰"으로 번역한다.
			return Optional.empty();
		}
		if (!"refresh".equals(jwt.getClaimAsString("typ"))) {
			return Optional.empty();
		}
		return Optional.of(new DecodedRefreshToken(Long.valueOf(jwt.getSubject()), jwt.getId()));
	}

	public record IssuedRefreshToken(String token, String jti) {
	}

	public record DecodedRefreshToken(Long userId, String jti) {
	}
}
