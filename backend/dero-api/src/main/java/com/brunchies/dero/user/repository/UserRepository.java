package com.brunchies.dero.user.repository;

import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code User} 애그리거트 루트 리포지토리(ADR-0007). */
public interface UserRepository extends JpaRepository<User, Long> {

	/** 로그인 조회 키(ADR-0005 결정 7) — 신원은 이메일이 아니라 (provider, provider_id)다. */
	Optional<User> findByProviderAndProviderIdAndDeletedAtIsNull(Provider provider, String providerId);

	/** 다른 provider와의 이메일 충돌 검사(ADR-0005 결정 7) — 겹치면 자동 연결하지 않고 로그인을 거절한다. */
	Optional<User> findByEmailAndDeletedAtIsNull(String email);

	/** 부분 유니크 인덱스(uq_user_nickname)와 짝 — 소셜 프로필 닉네임 자동 유니크화에 쓴다. */
	boolean existsByNicknameAndDeletedAtIsNull(String nickname);

	/** 남의 프로필 조회·팔로우 대상 확인(규칙 2 — 소프트 삭제 필터는 쿼리 안에 있다). */
	Optional<User> findByIdAndDeletedAtIsNull(Long id);

	/** 닉네임 전량 재색인({@code UserSearchService.reindexAll}) — 탈퇴자는 색인하지 않는다. */
	List<User> findAllByDeletedAtIsNull();

	/**
	 * 멘션 토큰 해석({@code MentionService})과 닉네임 자동완성이 id 목록을 한 번에 읽는다.
	 * 탈퇴자가 빠지는 것이 곧 "@알 수 없음" 폴백이다(ADR-0038 결정 4).
	 */
	List<User> findAllByIdInAndDeletedAtIsNull(Collection<Long> ids);
}
