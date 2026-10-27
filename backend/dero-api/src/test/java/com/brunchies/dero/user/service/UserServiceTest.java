package com.brunchies.dero.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserErrorCode;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.UserStatus;
import com.brunchies.dero.user.dto.UserMePatchRequest;
import com.brunchies.dero.user.repository.FollowRepository;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

/** 스프링 컨텍스트 없는 순수 단위 테스트(ADR-0001) — 리포지토리는 Mockito로 대체한다. */
class UserServiceTest {

	private final UserRepository users = mock(UserRepository.class);
	private final PresignPort presignPort = mock(PresignPort.class);
	private final PublicImageUrlResolver publicImageUrl = mock(PublicImageUrlResolver.class);
	private final ConsentService consentService = mock(ConsentService.class);
	private final FollowRepository follows = mock(FollowRepository.class);
	private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
	private final UserSearchService userSearchService = mock(UserSearchService.class);
	private final UserService userService = new UserService(
			users, follows, userSearchService, presignPort, publicImageUrl, consentService, events);

	private User sampleUser(long id) {
		User user = User.create("dero@example.com", Provider.KAKAO, "kakao-1", "박동규");
		ReflectionTestUtils.setField(user, "id", id);
		return user;
	}

	@Test
	@DisplayName("존재하는 사용자면 프로필을 그대로 옮긴다")
	void 본인_조회_성공() {
		given(users.findById(42L)).willReturn(Optional.of(sampleUser(42L)));

		var response = userService.getMe(42L);

		assertThat(response.id()).isEqualTo(42L);
		assertThat(response.email()).isEqualTo("dero@example.com");
		assertThat(response.nickname()).isEqualTo("박동규");
		assertThat(response.provider()).isEqualTo(Provider.KAKAO);
		assertThat(response.profileImageUrl()).isNull();
	}

	@Test
	@DisplayName("프로필 사진 key가 있으면 안정 공개 URL로 조립해서 내려준다(ADR-0035)")
	void 본인_조회_프로필_사진_있음() {
		User user = sampleUser(42L);
		ReflectionTestUtils.setField(user, "profileImageKey", "user/42/profile.png");
		given(users.findById(42L)).willReturn(Optional.of(user));
		given(publicImageUrl.url("user/42/profile.png"))
				.willReturn("http://localhost:8080/api/v1/images/user/42/profile.png");

		var response = userService.getMe(42L);

		assertThat(response.profileImageUrl())
				.isEqualTo("http://localhost:8080/api/v1/images/user/42/profile.png");
	}

	@Test
	@DisplayName("온보딩 완료 여부는 ConsentService의 파생값을 그대로 싣는다")
	void 본인_조회_온보딩_파생값() {
		given(users.findById(42L)).willReturn(Optional.of(sampleUser(42L)));
		given(consentService.isOnboardingRequired(42L)).willReturn(true);

		assertThat(userService.getMe(42L).onboardingRequired()).isTrue();
	}

	@Test
	@DisplayName("닉네임을 바꾸면 엔티티에 반영되고 응답에도 새 값이 실린다")
	void 닉네임_변경() {
		User user = sampleUser(42L);
		given(users.findById(42L)).willReturn(Optional.of(user));
		given(users.existsByNicknameAndDeletedAtIsNull("데로")).willReturn(false);

		var response = userService.updateMe(42L, new UserMePatchRequest("데로"));

		assertThat(response.nickname()).isEqualTo("데로");
		assertThat(user.getNickname()).isEqualTo("데로");
	}

	@Test
	@DisplayName("이미 쓰이는 닉네임이면 409 USER_NICKNAME_DUPLICATED")
	void 닉네임_중복() {
		given(users.findById(42L)).willReturn(Optional.of(sampleUser(42L)));
		given(users.existsByNicknameAndDeletedAtIsNull("데로")).willReturn(true);

		assertThatThrownBy(() -> userService.updateMe(42L, new UserMePatchRequest("데로")))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(UserErrorCode.USER_NICKNAME_DUPLICATED));
	}

	@Test
	@DisplayName("자기 닉네임을 그대로 다시 보내면 중복이 아니다 — 중복 검사 자체를 하지 않는다")
	void 닉네임_그대로() {
		User user = sampleUser(42L);
		given(users.findById(42L)).willReturn(Optional.of(user));
		given(users.existsByNicknameAndDeletedAtIsNull("박동규")).willReturn(true);

		assertThat(userService.updateMe(42L, new UserMePatchRequest("박동규")).nickname())
				.isEqualTo("박동규");
	}

	@Test
	@DisplayName("nickname이 NULL이면 아무것도 바꾸지 않는다 — PATCH의 NULL은 '안 바꾼다'")
	void 닉네임_미지정() {
		User user = sampleUser(42L);
		given(users.findById(42L)).willReturn(Optional.of(user));

		assertThat(userService.updateMe(42L, new UserMePatchRequest(null)).nickname())
				.isEqualTo("박동규");
	}

	@Test
	@DisplayName("공백만 남는 닉네임은 400 INVALID_INPUT — @Size는 길이만 봐서 통과시킨다")
	void 닉네임_공백() {
		given(users.findById(42L)).willReturn(Optional.of(sampleUser(42L)));

		assertThatThrownBy(() -> userService.updateMe(42L, new UserMePatchRequest("   ")))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(CommonErrorCode.INVALID_INPUT));
	}

	@Test
	@DisplayName("존재하지 않으면 401 AUTH_UNAUTHORIZED")
	void 존재하지_않음() {
		given(users.findById(99L)).willReturn(Optional.empty());

		assertThatThrownBy(() -> userService.getMe(99L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(SecurityErrorCode.AUTH_UNAUTHORIZED));
	}

	@Test
	@DisplayName("탈퇴하면 상태가 INACTIVE로 바뀌고 소프트 삭제된다")
	void 회원_탈퇴() {
		User user = sampleUser(42L);
		given(users.findById(42L)).willReturn(Optional.of(user));

		userService.withdraw(42L);

		assertThat(user.getStatus()).isEqualTo(UserStatus.INACTIVE);
		assertThat(user.isDeleted()).isTrue();
	}

	@Test
	@DisplayName("이미 탈퇴한 사용자를 다시 탈퇴시키면 401 AUTH_UNAUTHORIZED — requireActiveUser가 막는다")
	void 이미_탈퇴한_사용자_재탈퇴() {
		User user = sampleUser(42L);
		user.withdraw();
		given(users.findById(42L)).willReturn(Optional.of(user));

		assertThatThrownBy(() -> userService.withdraw(42L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(SecurityErrorCode.AUTH_UNAUTHORIZED));
	}

	@Test
	@DisplayName("탈퇴하지 않은 사용자면 권한을 돌려준다")
	void 활성_사용자_권한_조회() {
		given(users.findById(42L)).willReturn(Optional.of(sampleUser(42L)));

		assertThat(userService.getActiveUserRole(42L)).isEqualTo(UserRole.USER);
	}

	@Test
	@DisplayName("없거나 탈퇴한 사용자의 권한을 물으면 401 AUTH_REFRESH_INVALID")
	void 비활성_사용자_권한_조회() {
		given(users.findById(99L)).willReturn(Optional.empty());
		User deleted = sampleUser(50L);
		deleted.softDelete();
		given(users.findById(50L)).willReturn(Optional.of(deleted));

		assertThatThrownBy(() -> userService.getActiveUserRole(99L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(SecurityErrorCode.AUTH_REFRESH_INVALID));
		assertThatThrownBy(() -> userService.getActiveUserRole(50L))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(SecurityErrorCode.AUTH_REFRESH_INVALID));
	}
}
