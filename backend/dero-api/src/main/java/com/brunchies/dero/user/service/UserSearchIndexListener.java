package com.brunchies.dero.user.service;

import com.brunchies.dero.user.UserChangedEvent;
import com.brunchies.dero.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 색인 트리거 — 사용자 변경이 <b>커밋된 뒤에만</b> ES를 만진다(ADR-0019 결정 3).
 *
 * <p><b>{@code fallbackExecution = true}가 제품 쪽과 갈리는 유일한 점이고, 이유는 가입 경로다.</b>
 * 닉네임 변경·탈퇴는 {@code UserService}의 트랜잭션 안에서 발행되지만, 최초 가입은
 * {@code OAuth2LoginSuccessHandler}가 트랜잭션 없이 {@code users.save(...)}를 부르는 자리다
 * (저장 자체는 Spring Data의 자기 트랜잭션으로 이미 커밋된다). 기본값이면 그 이벤트가 <b>조용히
 * 버려져</b> 새로 가입한 사람은 다음 전량 재색인까지 닉네임으로 검색되지 않는다 — 에러도 로그도
 * 없이 "저 사람 글이 작성자로 안 잡힌다"로만 드러난다. 켜 두면 트랜잭션이 없을 때 즉시 실행되고,
 * 그 시점의 상태는 이미 커밋된 상태다.
 *
 * <p>커밋 후는 트랜잭션 밖이라 {@code REQUIRES_NEW}로 읽기 트랜잭션을 새로 연다.
 *
 * <p>여기서 예외를 던지지 않는 것은 {@link UserSearchService#index}가 삼키기 때문이다.
 */
@Component
@RequiredArgsConstructor
public class UserSearchIndexListener {

	private final UserRepository users;
	private final UserSearchService userSearchService;

	/** 커밋된 상태를 다시 읽어 색인을 맞춘다 — 살아 있으면 덮어쓰고, 탈퇴했으면 뗀다. */
	@Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
	public void onUserChanged(UserChangedEvent event) {
		users.findByIdAndDeletedAtIsNull(event.userId())
				.ifPresentOrElse(
						userSearchService::index,
						() -> userSearchService.remove(event.userId()));
	}
}
