package com.brunchies.dero.auth.service;

import com.brunchies.dero.auth.dto.RefreshResponse;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 토큰 재발급·로그아웃의 흐름을 정한다(ADR-0005 결정 2·4) — 회전 순서, 재사용 탐지, 쿠키 갱신,
 * 응답 DTO 조립까지 전부 여기 있고 {@code AuthController}는 위임과 상태 코드만 맡는다.
 *
 * <p><b>{@code HttpServletResponse}를 인자로 받는 이유.</b> 리프레시 쿠키는 성공 경로에서는 새 값으로
 * 갈아끼우고 재사용 탐지 경로에서는 <b>지운 뒤 401을 던져야</b> 한다 — 쿠키 조작이 예외 경로와 한
 * 덩어리라, 결과값으로 돌려주고 컨트롤러가 쓰게 하면 예외 경로를 컨트롤러가 {@code catch}해야 하고
 * 그건 번역 목적 외 try-catch 금지(architecture.md 규칙 8)에 걸린다. 서블릿 타입이 서비스로 들어오지만
 * 같은 {@code auth/service}의 {@link RefreshCookieWriter}·{@link OAuth2LoginSuccessHandler}가 이미
 * 같은 모양이다.
 *
 * <p>{@code @Transactional}이 없는 것은 누락이 아니다 — 리포지토리를 직접 물지 않아 트랜잭션 경계가
 * 없다({@code SpringBeanConventionTest} 참조. DB 접근은 {@link UserService} 안에서 끝난다).
 */
@Service
@RequiredArgsConstructor
public class AuthService {

	private final UserService userService;
	private final JwtIssuer jwtIssuer;
	private final RefreshTokenService refreshTokens;
	private final RefreshCookieWriter cookieWriter;

	/**
	 * 로그인 직후 액세스 토큰을 처음 받는 자리이자, 만료 때마다 회전하는 자리이기도 하다(ADR-0005
	 * 결정 2·8). 리프레시는 쿠키로만 오간다 — 요청 바디가 없다.
	 */
	public RefreshResponse refresh(String refreshCookie, HttpServletResponse response) {
		if (refreshCookie == null) {
			throw new BusinessException(SecurityErrorCode.AUTH_REFRESH_INVALID);
		}
		JwtIssuer.DecodedRefreshToken decoded = jwtIssuer.decodeRefreshToken(refreshCookie);
		JwtIssuer.IssuedRefreshToken newRefresh = jwtIssuer.issueRefreshToken(decoded.userId());

		if (!refreshTokens.rotate(decoded.userId(), decoded.jti(), newRefresh.jti())) {
			cookieWriter.clear(response);
			throw new BusinessException(SecurityErrorCode.AUTH_SESSION_REVOKED);
		}

		UserRole role = userService.getActiveUserRole(decoded.userId());
		String accessToken = jwtIssuer.issueAccessToken(decoded.userId(), role);

		cookieWriter.write(response, newRefresh.token());
		return new RefreshResponse(accessToken, JwtIssuer.ACCESS_TTL_SECONDS);
	}

	/** 멱등 — 이미 지워졌거나 무효한 리프레시로 불러도 조용히 성공한다(로그아웃 목적은 이미 달성). */
	public void logout(String refreshCookie, HttpServletResponse response) {
		if (refreshCookie != null) {
			jwtIssuer.tryDecodeRefreshToken(refreshCookie)
					.ifPresent(decoded -> refreshTokens.revokeAll(decoded.userId()));
		}
		cookieWriter.clear(response);
	}
}
