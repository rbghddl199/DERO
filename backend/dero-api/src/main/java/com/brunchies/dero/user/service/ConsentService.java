package com.brunchies.dero.user.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.security.SecurityErrorCode;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.user.Terms;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserConsent;
import com.brunchies.dero.user.UserErrorCode;
import com.brunchies.dero.user.dto.TermsResponse;
import com.brunchies.dero.user.repository.TermsRepository;
import com.brunchies.dero.user.repository.UserConsentRepository;
import com.brunchies.dero.user.repository.UserRepository;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 약관 조회와 동의 기록, 그리고 <b>온보딩 완료 파생값</b>(`docs/context/api-spec.md` §3 온보딩 절).
 *
 * <p>온보딩 완료를 컬럼으로 들고 있지 않기 때문에 이 세 가지가 한 서비스에 산다 —
 * "필수 약관의 현행 회차"라는 같은 목록을 셋이 함께 쓴다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ConsentService {

	private final TermsRepository terms;
	private final UserConsentRepository consents;
	private final UserRepository users;
	private final PresignPort presignPort;

	/** {@code GET /terms} — 항목별 현행 회차 하나씩. 비로그인도 부를 수 있다. */
	public List<TermsResponse> listCurrentTerms() {
		return currentTerms().stream()
				.map(item -> TermsResponse.from(item, contentUrlOf(item)))
				.toList();
	}

	/**
	 * {@code POST /users/me/consents} — 동의 항목 배열을 <b>한 번에</b> 받는다.
	 *
	 * <p>검사를 전부 통과한 뒤에만 저장한다. 필수 항목이 빠져 있으면 예외로 빠져나가므로
	 * {@code user_consent}에 <b>아무 행도 남지 않는다</b> — 부분 동의 상태를 만들지 않는 것이 요건이다.
	 */
	@Transactional
	public void agree(Long userId, List<Long> termsIds) {
		User user = requireActiveUser(userId);
		Map<Long, Terms> currentById = currentTerms().stream()
				.collect(Collectors.toMap(Terms::getId, Function.identity()));

		Set<Long> requested = new LinkedHashSet<>(termsIds);
		if (!currentById.keySet().containsAll(requested)) {
			throw new BusinessException(UserErrorCode.USER_TERMS_NOT_CURRENT);
		}
		if (!requested.containsAll(requiredTermsIds(currentById.values()))) {
			throw new BusinessException(UserErrorCode.USER_REQUIRED_TERMS_NOT_AGREED);
		}

		consents.saveAll(requested.stream()
				.map(termsId -> UserConsent.create(user, currentById.get(termsId), true))
				.toList());
	}

	/**
	 * 온보딩이 아직 필요한가 — 필수 약관의 <b>현행 회차</b> 동의가 하나라도 비면 {@code true}.
	 *
	 * <p>필수 항목이 하나도 등록돼 있지 않으면 받을 동의가 없으므로 {@code false}다.
	 */
	public boolean isOnboardingRequired(Long userId) {
		Set<Long> required = requiredTermsIds(currentTerms());
		if (required.isEmpty()) {
			return false;
		}
		return !consents.findAgreedTermsIds(userId).containsAll(required);
	}

	private List<Terms> currentTerms() {
		return terms.findCurrentRevisions(OffsetDateTime.now());
	}

	private static Set<Long> requiredTermsIds(Iterable<Terms> currentTerms) {
		Set<Long> ids = new LinkedHashSet<>();
		for (Terms item : currentTerms) {
			if (item.isRequired()) {
				ids.add(item.getId());
			}
		}
		return ids;
	}

	/** 약관 본문 key는 그대로 내보내지 않는다 — 완성 URL을 발급 시점에 조립한다(user/CLAUDE.md). */
	private String contentUrlOf(Terms item) {
		return item.getContentKey() == null ? null : presignPort.presignGet(item.getContentKey());
	}

	private User requireActiveUser(Long userId) {
		return users.findById(userId)
				.filter(found -> !found.isDeleted())
				.orElseThrow(() -> new BusinessException(SecurityErrorCode.AUTH_UNAUTHORIZED));
	}
}
