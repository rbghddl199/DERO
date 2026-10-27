package com.brunchies.dero.user;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 소셜 로그인 사용자. 감사 3종.
 *
 * <p>테이블명 {@code user}는 SQL 예약어라 {@code "user"}로 인용한다.
 */
@Entity
@Table(name = "\"user\"")
@SequenceGenerator(name = "user_seq", sequenceName = "user_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class User extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "user_seq")
	private Long id;

	@Column(name = "email", nullable = false, length = 320)
	private String email;

	@Enumerated(EnumType.STRING)
	@Column(name = "provider", nullable = false, length = 10)
	private Provider provider;

	@Column(name = "provider_id", nullable = false, length = 255)
	private String providerId;

	/** 실명이 아니라 표시용 닉네임이다 — {@code name}으로 되돌리지 말 것(실명으로 오해된다). */
	@Column(name = "nickname", nullable = false, length = 50)
	private String nickname;

	/**
	 * 사용자가 올린 프로필 사진의 object key. 소셜 제공자가 주는 사진은 받지 않으므로(D24) 가입 시엔
	 * 항상 NULL이고, 업로드해야 값이 생긴다. 완성 URL은 WAS가 발급 시점에 조립한다 — 여기 담지 말 것.
	 */
	@Column(name = "profile_image_key", length = 1024)
	private String profileImageKey;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 10)
	private UserStatus status;

	@Enumerated(EnumType.STRING)
	@Column(name = "role", nullable = false, length = 10)
	private UserRole role;

	/**
	 * 소셜 가입. 상태·역할은 DDL 기본값과 같은 {@code ACTIVE}·{@code USER}로 시작한다.
	 * 프로필 사진은 받지 않으므로 {@code profileImageKey}는 NULL로 시작한다(D24).
	 */
	public static User create(String email, Provider provider, String providerId, String nickname) {
		return User.builder()
				.email(email)
				.provider(provider)
				.providerId(providerId)
				.nickname(nickname)
				.status(UserStatus.ACTIVE)
				.role(UserRole.USER)
				.build();
	}

	/**
	 * 닉네임 변경. 가입 시 소셜 표시명으로 채워진 초깃값을 온보딩 화면에서 바꾸는 자리이기도 하다(D23).
	 *
	 * <p>중복 검사는 여기서 하지 않는다 — 엔티티는 리포지토리를 모른다(ADR-0001). 유일성은
	 * {@code uq_user_nickname}과 짝인 서비스의 {@code exists} 검사가 본다.
	 */
	public void changeNickname(String nickname) {
		this.nickname = nickname;
	}

	/**
	 * 프로필 사진 교체 — <b>항상 덮어쓴다</b>({@code docs/context/api-spec.md} §3). key가 사용자마다
	 * 결정론적이라 옛 값을 지우는 절차가 따로 없다.
	 *
	 * <p>완성 URL을 여기 담지 마라 — 엔티티는 스토리지 포트를 모른다(user/CLAUDE.md).
	 */
	public void changeProfileImageKey(String profileImageKey) {
		this.profileImageKey = profileImageKey;
	}

	/**
	 * 회원 탈퇴 — 상태를 {@link UserStatus#INACTIVE}로 바꾸고 소프트 삭제 시각을 남긴다
	 * ({@code UserStatus.INACTIVE}의 주석대로 "탈퇴는 deleted_at이 따로 표현한다"). 세션(리프레시
	 * 토큰·쿠키) 정리는 이 엔티티의 몫이 아니다 — 호출부(auth 쪽)가 이어서 처리한다(user는 auth를
	 * 모른다, ADR-0007). {@link #softDelete()}가 이미 멱등이라 이 메서드도 멱등하다.
	 */
	public void withdraw() {
		this.status = UserStatus.INACTIVE;
		softDelete();
	}
}
