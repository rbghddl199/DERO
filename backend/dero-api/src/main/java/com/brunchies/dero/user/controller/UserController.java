package com.brunchies.dero.user.controller;

import com.brunchies.dero.global.security.AuthenticatedUserId;
import com.brunchies.dero.user.dto.ConsentCreateRequest;
import com.brunchies.dero.user.dto.ProfileImageRegisterRequest;
import com.brunchies.dero.user.dto.ProfileImageUploadUrlRequest;
import com.brunchies.dero.user.dto.ProfileImageUploadUrlResponse;
import com.brunchies.dero.user.dto.UserMePatchRequest;
import com.brunchies.dero.user.dto.UserMeResponse;
import com.brunchies.dero.user.dto.UserProfileResponse;
import com.brunchies.dero.user.dto.UserSearchResultResponse;
import com.brunchies.dero.user.service.ConsentService;
import com.brunchies.dero.user.service.UserService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 내 정보 조회·수정과 약관 동의 기록(REQ-USR-01). 경로 정본은 `docs/context/api-spec.md` §3. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

	private final UserService userService;
	private final ConsentService consentService;

	/** {@code Authentication.getName()}은 {@code JwtAuthenticationToken}의 {@code sub} 클레임 —
	 * {@code JpaAuditingConfig.auditorAware}와 같은 자리에서 같은 값을 읽는다. */
	@GetMapping("/me")
	public ResponseEntity<UserMeResponse> me(Authentication authentication) {
		return ResponseEntity.ok(userService.getMe(userId(authentication)));
	}

	/** 프로필 부분 수정 → 200. 온보딩의 닉네임 입력이 이 경로를 재사용한다. 중복 닉네임이면 409. */
	@PatchMapping("/me")
	public ResponseEntity<UserMeResponse> updateMe(
			Authentication authentication, @Valid @RequestBody UserMePatchRequest request) {
		return ResponseEntity.ok(userService.updateMe(userId(authentication), request));
	}

	/**
	 * 약관 동의 기록 → 201. 필수 항목이 빠져 있으면 422고 {@code user_consent}에 아무 행도 안 남는다.
	 *
	 * <p><b>{@code Location}을 붙이지 않는다</b> — 동의 이력을 되읽는 엔드포인트가 없어 가리킬 URL이
	 * 없다. 만들지 않는 이유는 철회 경로를 안 만드는 것과 같다(api-spec.md §3).
	 */
	@PostMapping("/me/consents")
	public ResponseEntity<Void> agreeToTerms(
			Authentication authentication, @Valid @RequestBody ConsentCreateRequest request) {
		consentService.agree(userId(authentication), request.termsIds());
		return ResponseEntity.status(HttpStatus.CREATED).build();
	}

	/**
	 * 프로필 이미지 1단계 — presigned PUT URL 발급. 저장하는 게 없어 201이 아니라 200이다
	 * (api-spec.md §1 규칙 1).
	 */
	@PostMapping("/me/profile-image/upload-url")
	public ResponseEntity<ProfileImageUploadUrlResponse> presignProfileImageUpload(
			Authentication authentication,
			@Valid @RequestBody ProfileImageUploadUrlRequest request) {
		return ResponseEntity.ok(
				userService.presignProfileImageUpload(userId(authentication), request));
	}

	/**
	 * 프로필 이미지 2단계 — 업로드한 key 등록. <b>항상 덮어쓴다</b>(api-spec.md §3).
	 *
	 * <p>204가 아니라 200 + {@link UserMeResponse}다 — 갱신된 presigned GET URL을 같이 실어야
	 * 프론트가 왕복 한 번 없이 화면에 즉시 반영한다. <b>파일 서빙 엔드포인트는 만들지 않는다</b>
	 * (같은 문서 §11).
	 */
	@PutMapping("/me/profile-image")
	public ResponseEntity<UserMeResponse> registerProfileImage(
			Authentication authentication,
			@Valid @RequestBody ProfileImageRegisterRequest request) {
		return ResponseEntity.ok(userService.registerProfileImage(userId(authentication), request));
	}

	/**
	 * 회원 탈퇴 → 204. 소프트 삭제라 행은 남지만({@code status=INACTIVE} + {@code deleted_at}), 이후
	 * {@code requireActiveUser}를 거치는 모든 인증 필요 API가 이 사용자를 거부한다.
	 *
	 * <p><b>리프레시 쿠키·Redis 세션 정리는 이 응답에 안 실려 있다</b> — user는 auth를 모른다
	 * (ADR-0007, {@code UserService.withdraw()} 주석 참고). 프론트가 이 호출 성공 뒤
	 * {@code POST /auth/logout}을 이어 불러 세션까지 마저 정리하고 로그인 화면으로 보낸다.
	 */
	@DeleteMapping("/me")
	public ResponseEntity<Void> withdraw(Authentication authentication) {
		userService.withdraw(userId(authentication));
		return ResponseEntity.noContent().build();
	}

	/**
	 * 닉네임 자동완성 → 200(D35·ADR-0038 결정 3). <b>로그인 필수다</b> — 비로그인에 열면 닉네임
	 * 열거 통로가 된다. 규칙 순서상 이 경로가 {@code /users/*} permitAll보다 앞에 선언돼 있어야
	 * 하며(SecurityConfig), 매핑도 {@code /{userId}}보다 구체적이라 Spring이 이쪽을 고른다.
	 *
	 * <p>{@code q}가 공백뿐이면 400이다 — 0자 질의는 "전체 사용자 목록"이 되어 열거 통로가 다시
	 * 열린다. ES가 답하지 못하면 503이고 <b>폴백하지 않는다</b>(ADR-0019 결정 6).
	 */
	@GetMapping("/search")
	public ResponseEntity<List<UserSearchResultResponse>> search(@RequestParam String q) {
		return ResponseEntity.ok(userService.search(q));
	}

	/**
	 * 남의 프로필 → 200, <b>비로그인에게도</b>(api-spec.md §3 🔓). 로그인 상태면 {@code following}이
	 * "내가 이 사람을 팔로우 중인가"를 답한다.
	 *
	 * <p>익명 경로의 {@code Authentication}은 {@code null}이 아니라
	 * {@code AnonymousAuthenticationToken}이라 {@link AuthenticatedUserId}를 반드시 통과시킨다 —
	 * {@code Long.valueOf(auth.getName())}은 여기서 500이 된다.
	 */
	@GetMapping("/{userId}")
	public ResponseEntity<UserProfileResponse> profile(
			Authentication authentication, @PathVariable Long userId) {
		return ResponseEntity.ok(
				userService.getProfile(AuthenticatedUserId.orNull(authentication), userId));
	}

	private static Long userId(Authentication authentication) {
		return Long.valueOf(authentication.getName());
	}
}
