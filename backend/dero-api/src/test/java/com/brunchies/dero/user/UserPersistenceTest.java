package com.brunchies.dero.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class UserPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private EntityManager entityManager;

	private User saveUser(String email, String providerId, String nickname) {
		return userRepository.save(User.create(email, Provider.KAKAO, providerId, nickname));
	}

	@Test
	@DisplayName("사용자를 저장하면 created_at만 채워지고(updated_at은 NULL) 상태·역할 기본값이 들어간다")
	void 사용자_저장_왕복() {
		Long id = saveUser("dero@example.com", "kakao-1", "박동규").getId();
		entityManager.flush();
		entityManager.clear();

		User found = userRepository.findById(id).orElseThrow();
		assertThat(found.getEmail()).isEqualTo("dero@example.com");
		assertThat(found.getProvider()).isEqualTo(Provider.KAKAO);
		assertThat(found.getProviderId()).isEqualTo("kakao-1");
		assertThat(found.getNickname()).isEqualTo("박동규");
		assertThat(found.getProfileImageKey()).isNull();
		assertThat(found.getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(found.getRole()).isEqualTo(UserRole.USER);
		assertThat(found.getCreatedAt()).isNotNull();
		// INSERT만 했으면 updated_at은 NULL이다 — erd.md 감사 2종은 created_at에만 DEFAULT now()를 준다.
		assertThat(found.getUpdatedAt()).isNull();
		assertThat(found.getDeletedAt()).isNull();
		assertThat(found.isDeleted()).isFalse();
	}

	@Test
	@DisplayName("softDelete()는 deletedAt을 채우고 행은 남는다")
	void 사용자_소프트_삭제() {
		User user = saveUser("bye@example.com", "kakao-2", "탈퇴자");
		user.softDelete();
		entityManager.flush();
		entityManager.clear();

		User found = userRepository.findById(user.getId()).orElseThrow();
		assertThat(found.isDeleted()).isTrue();
		assertThat(found.getDeletedAt()).isNotNull();
	}

	@Test
	@DisplayName("살아있는 계정끼리 닉네임이 겹치면 저장이 거부된다")
	void 닉네임_중복_거부() {
		saveUser("first@example.com", "kakao-10", "겹치는닉");
		entityManager.flush();

		saveUser("second@example.com", "kakao-11", "겹치는닉");
		assertThatThrownBy(entityManager::flush).isInstanceOf(PersistenceException.class);
	}

	@Test
	@DisplayName("탈퇴자의 닉네임은 다시 쓸 수 있다 — 부분 유니크 인덱스가 살아있는 행만 본다")
	void 탈퇴자_닉네임_재사용() {
		User gone = saveUser("gone@example.com", "kakao-12", "물려줄닉");
		gone.softDelete();
		entityManager.flush();

		Long id = saveUser("new@example.com", "kakao-13", "물려줄닉").getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(userRepository.findById(id).orElseThrow().getNickname()).isEqualTo("물려줄닉");
	}

	@Test
	@DisplayName("findByProviderAndProviderIdAndDeletedAtIsNull은 (provider, provider_id)로만 찾고 탈퇴자는 안 본다")
	void provider_providerId로_조회() {
		User user = saveUser("login@example.com", "kakao-20", "로그인유저");
		entityManager.flush();

		assertThat(userRepository.findByProviderAndProviderIdAndDeletedAtIsNull(Provider.KAKAO, "kakao-20"))
				.contains(user);
		assertThat(userRepository.findByProviderAndProviderIdAndDeletedAtIsNull(Provider.GOOGLE, "kakao-20"))
				.isEmpty();

		user.softDelete();
		entityManager.flush();
		entityManager.clear();

		assertThat(userRepository.findByProviderAndProviderIdAndDeletedAtIsNull(Provider.KAKAO, "kakao-20"))
				.isEmpty();
	}

	@Test
	@DisplayName("findByEmailAndDeletedAtIsNull은 탈퇴자를 걸러 다른 provider와의 이메일 충돌만 잡는다")
	void 이메일로_충돌_조회() {
		User user = saveUser("collide@example.com", "kakao-21", "충돌유저");
		entityManager.flush();

		assertThat(userRepository.findByEmailAndDeletedAtIsNull("collide@example.com")).contains(user);

		user.softDelete();
		entityManager.flush();
		entityManager.clear();

		assertThat(userRepository.findByEmailAndDeletedAtIsNull("collide@example.com")).isEmpty();
	}

	@Test
	@DisplayName("existsByNicknameAndDeletedAtIsNull은 살아있는 닉네임만 true, 탈퇴자 닉네임은 false")
	void 닉네임_존재_조회() {
		saveUser("nick@example.com", "kakao-22", "닉네임체크");
		entityManager.flush();

		assertThat(userRepository.existsByNicknameAndDeletedAtIsNull("닉네임체크")).isTrue();
		assertThat(userRepository.existsByNicknameAndDeletedAtIsNull("없는닉네임")).isFalse();
	}

	@Test
	@DisplayName("follow는 updated_at이 NULL인 채로 저장·조회된다")
	void 팔로우_저장_왕복() {
		User follower = saveUser("follower@example.com", "kakao-3", "팔로워");
		User following = saveUser("following@example.com", "kakao-4", "팔로잉");

		// follow는 애그리거트 루트가 아니라 리포지토리가 없다(ADR-0007) — EntityManager로 직접 저장한다.
		Follow follow = Follow.create(follower, following);
		entityManager.persist(follow);
		entityManager.flush();
		entityManager.clear();

		Follow found = entityManager.find(Follow.class, follow.getId());
		assertThat(found.getCreatedAt()).isNotNull();
		// 정션·토글 테이블이라 updated_at은 영원히 NULL이다(erd.md 전역 규칙, DERO-210).
		assertThat(found.getUpdatedAt()).isNull();
		assertThat(found.getFollower().getId()).isEqualTo(follower.getId());
		assertThat(found.getFollowing().getId()).isEqualTo(following.getId());
	}
}
