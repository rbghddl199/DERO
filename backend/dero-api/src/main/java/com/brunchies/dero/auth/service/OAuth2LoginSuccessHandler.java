package com.brunchies.dero.auth.service;

import com.brunchies.dero.auth.AuthErrorCode;
import com.brunchies.dero.auth.SocialProfile;
import com.brunchies.dero.auth.SocialProfileExtractor;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserChangedEvent;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * 소셜 로그인 성공 시 하는 일은 딱 둘이다 — 리프레시 쿠키를 굽고, 고정 프론트 경로로 리다이렉트한다
 * (ADR-0005 결정 8). <b>액세스 토큰은 여기서 안 만든다</b> — 프론트가 콜백 페이지에서
 * {@code POST /api/v1/auth/refresh}를 불러 쿠키로 받아 간다. 최초 로그인이면 그 자리에서
 * 회원가입까지 처리한다(이번 범위 결정 — 닉네임은 소셜 프로필 자동, 약관 동의는 프론트가 나중에).
 */
@Component
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

	private final UserRepository users;
	private final JwtIssuer jwtIssuer;
	private final RefreshTokenService refreshTokens;
	private final RefreshCookieWriter cookieWriter;
	private final ApplicationEventPublisher events;
	private final String successRedirectUri;

	public OAuth2LoginSuccessHandler(
			UserRepository users,
			JwtIssuer jwtIssuer,
			RefreshTokenService refreshTokens,
			RefreshCookieWriter cookieWriter,
			ApplicationEventPublisher events,
			@Value("${app.oauth.success-redirect-uri}") String successRedirectUri) {
		this.users = users;
		this.jwtIssuer = jwtIssuer;
		this.refreshTokens = refreshTokens;
		this.cookieWriter = cookieWriter;
		this.events = events;
		this.successRedirectUri = successRedirectUri;
	}

	@Override
	public void onAuthenticationSuccess(
			HttpServletRequest request, HttpServletResponse response, Authentication authentication)
			throws IOException {
		String registrationId =
				((OAuth2AuthenticationToken) authentication).getAuthorizedClientRegistrationId();
		OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
		SocialProfile profile = SocialProfileExtractor.extract(registrationId, oAuth2User.getAttributes());

		Optional<User> existing =
				users.findByProviderAndProviderIdAndDeletedAtIsNull(profile.provider(), profile.providerId());
		User user;
		if (existing.isPresent()) {
			user = existing.get();
		} else {
			// 다른 provider의 살아있는 계정과 이메일이 겹치면 자동 연결하지 않고 거절한다(ADR-0005 결정 7).
			if (users.findByEmailAndDeletedAtIsNull(profile.email()).isPresent()) {
				response.sendRedirect(successRedirectUri + "?error="
						+ AuthErrorCode.AUTH_EMAIL_ALREADY_REGISTERED.code());
				return;
			}
			String baseNickname =
					profile.nickname() != null ? profile.nickname() : profile.provider().name();
			user = users.save(User.create(profile.email(), profile.provider(), profile.providerId(),
					resolveUniqueNickname(baseNickname)));
			// 가입 직후부터 닉네임으로 그 사람 글을 찾을 수 있어야 한다(ADR-0027 결정 2). 이 자리는
			// 트랜잭션 밖이라 UserSearchIndexListener가 fallbackExecution으로 받는다 — save()가
			// 자기 트랜잭션으로 이미 커밋한 뒤다.
			events.publishEvent(new UserChangedEvent(user.getId()));
		}

		JwtIssuer.IssuedRefreshToken refresh = jwtIssuer.issueRefreshToken(user.getId());
		refreshTokens.register(user.getId(), refresh.jti());

		cookieWriter.write(response, refresh.token());
		response.sendRedirect(successRedirectUri);
	}

	/**
	 * 닉네임 직접입력 UI가 없어(D23은 후속 작업) 소셜 표시명이 겹치면 자동으로 유니크하게 만든다 —
	 * {@code uq_user_nickname} 부분 유니크 인덱스와 짝이다.
	 */
	private String resolveUniqueNickname(String base) {
		String candidate = base;
		int suffix = 1;
		while (users.existsByNicknameAndDeletedAtIsNull(candidate)) {
			candidate = base + suffix;
			suffix++;
		}
		return candidate;
	}
}
