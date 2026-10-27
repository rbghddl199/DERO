package com.brunchies.dero.community.service;

import com.brunchies.dero.community.UserMentionTokens;
import com.brunchies.dero.community.dto.DeskFeedMentionResponse;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 멘션 토큰({@code [[user:ID]]})을 현재 닉네임으로 푼다(D35·ADR-0038 결정 2).
 *
 * <p>데스크피드 본문과 데스크피드 댓글 두 곳이 같은 규칙으로 푼다 — 서비스마다 복사하면 "탈퇴한
 * 사람을 어떻게 답하는가"가 두 곳에서 갈린다. 스키마에는 멘션 컬럼도 정션도 없다(ADR-0038 부결 2)
 * — 정본은 텍스트에 든 토큰이고, 이 클래스가 그것을 읽는 유일한 자리다.
 *
 * <p><b>{@code community → user} 방향이다</b>(ADR-0007 결정 2: 읽기는 애그리거트 경계를 넘어도
 * 된다) — {@code DeskFeedService}가 이미 같은 방향으로 {@code UserRepository}를 읽는다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class MentionService {

	/**
	 * 한 번에 푸는 멘션 id 상한.
	 *
	 * <p><b>장식이 아니다.</b> 본문 길이에 상한이 없어서(`content`는 {@code @NotBlank}뿐) 토큰
	 * 수만 개짜리 글 하나를 저장할 수 있고, 그러면 이 목록이 그대로 {@code IN} 절이 된다 —
	 * PgJDBC 바인드 파라미터 한계(65,535)를 넘기는 순간 <b>목록·상세가 모두에게 500</b>이 되고
	 * 그 글을 지울 때까지 안 풀린다. 넘치는 토큰은 화면에서 "@알 수 없음"이 될 뿐이다(글 하나가
	 * 이상한 것과 피드 전체가 죽는 것을 맞바꾼다).
	 */
	private static final int MAX_RESOLVED_IDS = 200;

	private final UserRepository users;

	/**
	 * 여러 본문에 걸린 멘션을 <b>한 번의 질의로</b> 푼다 — 목록 카드 20장에 카드마다 조회하면 N+1이다.
	 *
	 * <p>탈퇴한 사용자는 {@code deleted_at} 필터에 걸려 빠진다 — 그 결과 화면이 "@알 수 없음"을
	 * 그린다({@link DeskFeedMentionResponse} 참조).
	 */
	public Map<Long, String> nicknamesIn(Collection<String> contents) {
		Set<Long> ids = new LinkedHashSet<>();
		for (String content : contents) {
			ids.addAll(UserMentionTokens.extract(content));
			if (ids.size() >= MAX_RESOLVED_IDS) {
				break;
			}
		}
		if (ids.isEmpty()) {
			return Map.of();
		}
		List<Long> bounded = ids.stream().limit(MAX_RESOLVED_IDS).toList();
		return users.findAllByIdInAndDeletedAtIsNull(bounded).stream()
				.collect(Collectors.toMap(User::getId, User::getNickname));
	}

	/** 본문 하나짜리 — 상세·댓글 작성처럼 한 건만 답하는 자리. */
	public List<DeskFeedMentionResponse> resolve(String content) {
		return mentionsOf(content, nicknamesIn(List.of(content)));
	}

	/**
	 * 본문에 등장한 순서대로, 중복 없이. <b>해석하지 못한 id는 뺀다</b> — 없는 사용자를 가리키는
	 * 토큰(데이터 이상)도 여기서 조용히 사라지므로 화면이 깨질 자리가 없다.
	 */
	public List<DeskFeedMentionResponse> mentionsOf(String content, Map<Long, String> nicknames) {
		return UserMentionTokens.extract(content).stream()
				.filter(nicknames::containsKey)
				.map(userId -> new DeskFeedMentionResponse(userId, nicknames.get(userId)))
				.toList();
	}
}
