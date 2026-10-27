package com.brunchies.dero.user.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserChangedEvent;
import com.brunchies.dero.user.UserErrorCode;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.dto.ProfileImageRegisterRequest;
import com.brunchies.dero.user.dto.ProfileImageUploadUrlRequest;
import com.brunchies.dero.user.dto.ProfileImageUploadUrlResponse;
import com.brunchies.dero.user.dto.UserMePatchRequest;
import com.brunchies.dero.user.dto.UserMeResponse;
import com.brunchies.dero.user.dto.UserProfileResponse;
import com.brunchies.dero.user.dto.UserSearchResultResponse;
import com.brunchies.dero.user.repository.FollowRepository;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 로그인한 사용자 본인 조회·수정(REQ-USR-01) — 프론트가 액세스 토큰 발급 후 세션 정보를 채우는 자리. */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class UserService {

	/** 프로필 사진 object key 접두. 뒤에 {@code {userId}/{uuid}.{확장자}}가 붙는다(ADR-0035 결정 3). */
	private static final String PROFILE_IMAGE_KEY_PREFIX = "profile-images/";

	/**
	 * 허용 {@code contentType} → 확장자. <b>서버가 확장자를 정하는 근거</b>다 — 파일명을 받아 뽑으면
	 * 사용자 입력이 object key에 섞여 결정성이 깨지고 경로 조작 입력이 key에 실린다.
	 */
	private static final Map<String, String> PROFILE_IMAGE_EXTENSIONS = Map.of(
			// 저장 포맷은 webp로 통일한다(ADR-0035 결정 4) — 변환은 프론트가 업로드 전에 한다.
			"image/webp", ".webp");

	/** 자동완성 후보 상한(ADR-0038 결정 3) — 드롭다운이 한 화면에 담는 수다. */
	private static final int SEARCH_MAX_RESULTS = 10;

	private final UserRepository users;
	private final FollowRepository follows;
	private final UserSearchService userSearchService;
	private final PresignPort presignPort;
	private final PublicImageUrlResolver publicImageUrl;
	private final ConsentService consentService;
	private final ApplicationEventPublisher events;

	public UserMeResponse getMe(Long userId) {
		return toResponse(requireActiveUser(userId));
	}

	/**
	 * 남의 프로필 → 200, <b>비로그인에게도</b>(api-spec.md §3 🔓). {@code viewerId}가 {@code null}이면
	 * {@code following}은 항상 {@code false}다.
	 *
	 * <p>자기 자신을 여기로 조회하는 것을 막지는 않는다 — 프론트 규약이 "자기 자신은 {@code /users/me}"
	 * 인 것이고(같은 문서), 서버가 401·403으로 되받으면 남의 프로필 화면이 자기 id로 열렸을 때
	 * 빈 화면이 된다.
	 */
	public UserProfileResponse getProfile(Long viewerId, Long userId) {
		User user = requireExistingUser(userId);
		boolean following = viewerId != null
				&& follows.existsByFollower_IdAndFollowing_Id(viewerId, userId);
		return new UserProfileResponse(user.getId(), user.getNickname(), presignedProfileImage(user),
				follows.countFollowers(userId), follows.countFollowing(userId), following);
	}

	/**
	 * 닉네임 자동완성 후보 → 최대 {@value #SEARCH_MAX_RESULTS}명(D35·ADR-0038 결정 3).
	 *
	 * <p><b>ES {@code users} 인덱스를 재활용한다</b> — 색인을 새로 만들지 않는다. 후보는 관련도
	 * 순서 그대로이며, Postgres는 그 id들의 <b>현재</b> 닉네임·프로필 사진을 읽는 자리일 뿐이다
	 * (그래서 인덱스에 닉네임 말고 아무것도 안 실어도 된다 — ADR-0027 결정 3).
	 *
	 * <p><b>{@code findAllById...}는 순서를 보장하지 않는다</b> — ES가 매긴 관련도 순서로 다시
	 * 세운다. 그러지 않으면 화면의 첫 후보가 매번 달라진다.
	 *
	 * <p><b>{@code NEVER}는 {@code UserSearchService.searchIds}의 요구다</b> — 그 메서드가 ES 왕복
	 * 내내 커넥션을 붙들지 않으려고 트랜잭션 밖을 강제한다. 여기서 클래스 기본
	 * {@code readOnly = true}를 그대로 두면 {@code IllegalTransactionStateException}이다. 뒤의
	 * Postgres 조회는 리포지토리가 자기 트랜잭션을 연다.
	 *
	 * <p>한 글자 질의는 {@code nickname.autocomplete}(edge n-gram {@code min_gram: 2}, ADR-0028)에
	 * 걸리지 않아 형태소 절만 남는다 — 알려진 한계이고, 두 글자부터 접두 일치가 산다.
	 *
	 * @throws BusinessException 질의가 공백뿐이면 400, ES가 죽었으면 503이다(폴백 없음).
	 */
	@Transactional(propagation = Propagation.NEVER)
	public List<UserSearchResultResponse> search(String query) {
		String text = query == null ? "" : query.trim();
		if (text.isEmpty()) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}

		List<Long> ranked = userSearchService.searchIds(text);
		if (ranked.isEmpty()) {
			return List.of();
		}

		Map<Long, User> found = users.findAllByIdInAndDeletedAtIsNull(ranked).stream()
				.collect(Collectors.toMap(User::getId, user -> user));
		// **거른 뒤에 자른다.** 색인 제거는 실패해도 삼키므로(UserSearchService.remove) 탈퇴자
		// 문서가 상위 순위에 남아 있을 수 있고, 먼저 자르면 그 자리만큼 목록이 조용히 줄어든다.
		return ranked.stream()
				.map(found::get)
				.filter(Objects::nonNull)
				.limit(SEARCH_MAX_RESULTS)
				.map(user -> new UserSearchResultResponse(
						user.getId(), user.getNickname(), presignedProfileImage(user)))
				.toList();
	}

	/**
	 * 프로필 이미지 1단계 — presigned PUT URL 발급 → 200. 저장하는 게 없어 201이 아니다
	 * (api-spec.md §1 규칙 1).
	 *
	 * <p>key는 업로드마다 uuid로 새로 발급한다({@code profile-images/{userId}/{uuid}.{확장자}},
	 * ADR-0035 결정 3) — 안정 공개 URL이 {@code immutable} 캐시를 걸어서 같은 자리 덮어쓰기와
	 * 양립하지 않는다. 옛 오브젝트는 고아로 남는다(오브젝트 정리 부재는 전 프리픽스 공통).
	 * 2단계의 "이 사용자의 key인가"는 {@code profile-images/{userId}/} 접두 비교로 성립한다.
	 */
	public ProfileImageUploadUrlResponse presignProfileImageUpload(
			Long userId, ProfileImageUploadUrlRequest request) {
		requireActiveUser(userId);
		String extension = PROFILE_IMAGE_EXTENSIONS.get(request.contentType());
		if (extension == null) {
			throw new BusinessException(UserErrorCode.USER_INVALID_IMAGE_CONTENT_TYPE);
		}
		String imageKey = PROFILE_IMAGE_KEY_PREFIX + userId + "/" + UUID.randomUUID() + extension;
		return new ProfileImageUploadUrlResponse(
				imageKey, presignPort.presignUpload(imageKey, request.contentType()));
	}

	/**
	 * 프로필 이미지 2단계 — 업로드가 끝난 key 등록 → 200. <b>항상 덮어쓴다.</b> 갱신된
	 * {@code profileImageUrl}을 그대로 실어 돌려주므로 프론트가 다시 {@code GET /users/me}를 부르지
	 * 않아도 화면에 즉시 반영된다.
	 *
	 * <p>이 사용자의 key가 아니면 400이다 — key가 그대로 presigned GET URL의 입력이라, 아무 문자열이나
	 * 받으면 남의 파일 주소를 자기 프로필 사진 자리에 실을 수 있다.
	 */
	@Transactional
	public UserMeResponse registerProfileImage(Long userId, ProfileImageRegisterRequest request) {
		User user = requireActiveUser(userId);
		String ownedPrefix = PROFILE_IMAGE_KEY_PREFIX + userId + "/";
		boolean mine = request.imageKey().startsWith(ownedPrefix)
				&& PROFILE_IMAGE_EXTENSIONS.values().stream()
						.anyMatch(request.imageKey()::endsWith);
		if (!mine) {
			throw new BusinessException(UserErrorCode.USER_INVALID_PROFILE_IMAGE_KEY);
		}
		user.changeProfileImageKey(request.imageKey());
		return toResponse(user);
	}

	/**
	 * 프로필 부분 수정 → 200. 온보딩의 닉네임 입력도 이 경로를 재사용한다 — 전용 경로를 만들지
	 * 않는다(`docs/context/api-spec.md` §3).
	 *
	 * <p>영속 엔티티라 {@code save()}를 부르지 않는다 — 커밋 시 dirty checking이 UPDATE를 낸다.
	 * 중복 닉네임은 {@code uq_user_nickname}에 닿기 전에 409로 막는다.
	 */
	@Transactional
	public UserMeResponse updateMe(Long userId, UserMePatchRequest request) {
		User user = requireActiveUser(userId);
		if (request.nickname() != null) {
			user.changeNickname(requireAvailableNickname(request.nickname(), user.getNickname()));
			// 닉네임만 색인 대상이다(ADR-0027 결정 3) — 프로필 사진이 바뀐 요청은 발행하지 않는다.
			events.publishEvent(new UserChangedEvent(userId));
		}
		return toResponse(user);
	}

	/**
	 * 회원 탈퇴 → 소프트 삭제({@code User.withdraw()}). 세션(리프레시 토큰·쿠키) 정리는 여기서 하지
	 * 않는다 — user는 auth를 모른다(ADR-0007, {@code LayerDependencyTest}가 강제). 컨트롤러가 아니라
	 * 프론트가 이 호출 성공 뒤 기존 {@code POST /auth/logout}을 이어 불러 세션을 마저 정리한다.
	 */
	@Transactional
	public void withdraw(Long userId) {
		requireActiveUser(userId).withdraw();
		// 탈퇴자의 닉네임으로 그 사람 글이 계속 검색되지 않게 색인에서 뗀다(ADR-0027 결정 2).
		events.publishEvent(new UserChangedEvent(userId));
	}

	/** 액세스 토큰 재발급용 — 탈퇴하지 않은 사용자의 권한만 돌려준다(리프레시 회전 경로). */
	public UserRole getActiveUserRole(Long userId) {
		return users.findById(userId)
				.filter(found -> !found.isDeleted())
				.orElseThrow(() -> new BusinessException(SecurityErrorCode.AUTH_REFRESH_INVALID))
				.getRole();
	}

	private UserMeResponse toResponse(User user) {
		return UserMeResponse.from(user, presignedProfileImage(user),
				consentService.isOnboardingRequired(user.getId()));
	}

	/** key를 그대로 노출하지 않는다 — 완성 URL은 WAS가 발급 시점에 조립한다(user/CLAUDE.md). */
	private String presignedProfileImage(User user) {
		return user.getProfileImageKey() == null
				? null
				: publicImageUrl.url(user.getProfileImageKey());
	}

	/**
	 * 공백만 남는 닉네임은 {@code @Size}로 못 거른다(길이 검사는 통과한다) — 여기서 막는다.
	 * 자기 닉네임을 그대로 다시 보내는 것은 중복이 아니다.
	 */
	private String requireAvailableNickname(String requested, String current) {
		String nickname = requested.trim();
		if (nickname.isEmpty()) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
		if (!nickname.equals(current) && users.existsByNicknameAndDeletedAtIsNull(nickname)) {
			throw new BusinessException(UserErrorCode.USER_NICKNAME_DUPLICATED);
		}
		return nickname;
	}

	private User requireActiveUser(Long userId) {
		return users.findById(userId)
				.filter(found -> !found.isDeleted())
				.orElseThrow(() -> new BusinessException(SecurityErrorCode.AUTH_UNAUTHORIZED));
	}

	/**
	 * <b>{@link #requireActiveUser}와 다른 코드를 던진다.</b> 저쪽은 "내 토큰의 주인이 없다"라 401이고
	 * 여기는 "URL의 그 사람이 없다"라 404다 — 남의 프로필을 볼 때 401을 주면 로그인한 사용자가
	 * 로그아웃당한 것처럼 보인다.
	 */
	private User requireExistingUser(Long userId) {
		return users.findByIdAndDeletedAtIsNull(userId)
				.orElseThrow(() -> new BusinessException(UserErrorCode.USER_NOT_FOUND));
	}
}
