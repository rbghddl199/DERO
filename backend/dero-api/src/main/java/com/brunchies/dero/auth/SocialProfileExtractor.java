package com.brunchies.dero.auth;

import com.brunchies.dero.user.Provider;
import java.util.Map;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 제공자별 원시 attributes → {@link SocialProfile} 순수 변환. 구글은 OIDC라 평면 구조(`sub`·`email`·
 * `name`), 카카오는 비-OIDC라 중첩 구조(`id` + `kakao_account.{email,profile.nickname}`)다 — 이 차이를
 * 흡수하는 게 이 클래스의 유일한 책임이다.
 *
 * <p>프로필 사진은 뽑지 않는다 — 제공자 사진을 받지 않기로 확정했다(D24). 구글 `picture`는
 * `scope: profile`에서 뺄 수 없어 응답에 딸려 오지만 여기서 버린다. 카카오는 `scope: profile_nickname`만
 * 요청하므로 애초에 오지 않는다.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class SocialProfileExtractor {

	public static SocialProfile extract(String registrationId, Map<String, Object> attributes) {
		return switch (registrationId) {
			case "google" -> extractGoogle(attributes);
			case "kakao" -> extractKakao(attributes);
			default -> throw new IllegalArgumentException("지원하지 않는 로그인 제공자입니다: " + registrationId);
		};
	}

	private static SocialProfile extractGoogle(Map<String, Object> attributes) {
		String providerId = String.valueOf(attributes.get("sub"));
		String email = (String) attributes.get("email");
		String nickname = (String) attributes.get("name");
		return new SocialProfile(Provider.GOOGLE, providerId, email, nickname);
	}

	@SuppressWarnings("unchecked")
	private static SocialProfile extractKakao(Map<String, Object> attributes) {
		String providerId = String.valueOf(attributes.get("id"));
		Map<String, Object> kakaoAccount =
				(Map<String, Object>) attributes.getOrDefault("kakao_account", Map.of());
		Map<String, Object> profile =
				(Map<String, Object>) kakaoAccount.getOrDefault("profile", Map.of());

		String email = (String) kakaoAccount.get("email");
		if (email == null) {
			// 이메일 동의를 안 준 경우다. RFC 2606 예약 TLD라 실제로 발송될 일이 없다(ADR-0005 결정 7).
			email = "kakao_" + providerId + "@dero.invalid";
		}
		String nickname = (String) profile.get("nickname");
		return new SocialProfile(Provider.KAKAO, providerId, email, nickname);
	}
}
