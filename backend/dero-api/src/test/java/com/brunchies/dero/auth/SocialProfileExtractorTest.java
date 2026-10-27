package com.brunchies.dero.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.user.Provider;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 카카오(중첩)·구글(평면) 두 응답 구조를 {@link SocialProfile}로 정규화하는지 검증한다. */
class SocialProfileExtractorTest {

	@Test
	@DisplayName("구글은 평면 구조(sub·email·name)에서 바로 뽑는다 — picture는 오더라도 버린다")
	void 구글_추출() {
		Map<String, Object> attributes = Map.of(
				"sub", "1234567890",
				"email", "dero@example.com",
				"name", "박동규",
				"picture", "https://example.com/pic.png"); // 응답엔 오지만 SocialProfile로 넘기지 않는다

		SocialProfile profile = SocialProfileExtractor.extract("google", attributes);

		assertThat(profile.provider()).isEqualTo(Provider.GOOGLE);
		assertThat(profile.providerId()).isEqualTo("1234567890");
		assertThat(profile.email()).isEqualTo("dero@example.com");
		assertThat(profile.nickname()).isEqualTo("박동규");
	}

	@Test
	@DisplayName("카카오는 id + kakao_account.{email,profile.nickname} 중첩에서 뽑는다")
	void 카카오_추출() {
		Map<String, Object> profileMap =
				Map.of("nickname", "동규");
		Map<String, Object> kakaoAccount = Map.of("email", "dero@kakao.com", "profile", profileMap);
		Map<String, Object> attributes = Map.of("id", 987654321L, "kakao_account", kakaoAccount);

		SocialProfile profile = SocialProfileExtractor.extract("kakao", attributes);

		assertThat(profile.provider()).isEqualTo(Provider.KAKAO);
		assertThat(profile.providerId()).isEqualTo("987654321");
		assertThat(profile.email()).isEqualTo("dero@kakao.com");
		assertThat(profile.nickname()).isEqualTo("동규");
	}

	@Test
	@DisplayName("카카오가 이메일 동의를 안 주면 dero.invalid 합성 이메일을 만든다(ADR-0005 결정 7)")
	void 카카오_이메일_미동의() {
		Map<String, Object> profileMap = Map.of("nickname", "동규");
		Map<String, Object> kakaoAccount = Map.of("profile", profileMap); // email 없음
		Map<String, Object> attributes = Map.of("id", 111L, "kakao_account", kakaoAccount);

		SocialProfile profile = SocialProfileExtractor.extract("kakao", attributes);

		assertThat(profile.email()).isEqualTo("kakao_111@dero.invalid");
	}

	@Test
	@DisplayName("kakao_account 자체가 없어도(동의 항목 자체가 없는 극단 케이스) 예외 없이 합성 이메일로 채운다")
	void 카카오_계정정보_전체없음() {
		Map<String, Object> attributes = Map.of("id", 222L);

		SocialProfile profile = SocialProfileExtractor.extract("kakao", attributes);

		assertThat(profile.email()).isEqualTo("kakao_222@dero.invalid");
		assertThat(profile.nickname()).isNull();
	}

	@Test
	@DisplayName("지원하지 않는 registrationId는 예외를 던진다")
	void 미지원_제공자() {
		org.assertj.core.api.Assertions.assertThatThrownBy(
						() -> SocialProfileExtractor.extract("naver", Map.of()))
				.isInstanceOf(IllegalArgumentException.class);
	}
}
