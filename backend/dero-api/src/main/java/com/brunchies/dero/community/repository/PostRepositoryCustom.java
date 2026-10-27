package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.Post;
import java.util.List;
import org.springframework.data.domain.Limit;

/**
 * 게시글 목록의 동적 조회 조각(ADR-0018 결정 2 · {@code querydsl-rubric} §2). {@code ?hashtag}·
 * {@code ?owner}가 둘 다 선택이라 JPQL 문자열에 {@code (:x is null or ...)}를 쌓을 자리다 —
 * 그게 QueryDSL 하드 트리거다. 배치가
 * {@code PlacementRepositoryCustom}/{@code Impl}로 푼 것과 같은 모양으로 맞춘다.
 */
public interface PostRepositoryCustom {

	/** 최신순(id 내림차순) 커서 페이지. {@code cursorId}가 {@code null}이면 첫 페이지다. */
	List<Post> findPage(String hashtag, Long ownerId, Long cursorId, Limit limit);

	/** 같은 조건의 총 개수 — 목록과 조건을 나눠 들면 "개수만 다른" 상태가 된다. */
	long countPage(String hashtag, Long ownerId);

	/**
	 * 검색 경로 — ES가 준 id들 중 <b>실제로 보여도 되는 글</b>만 돌려준다(ADR-0019 결정 4).
	 * {@code ?hashtag}·{@code ?owner}는 목록과 같은 술어를 그대로 탄다.
	 *
	 * <p><b>순서는 보장하지 않는다</b> — 관련도 순서는 ES가 정하고 호출부가 id 순서대로 다시 세운다.
	 * 개수도 여기서 세지 않는다: 걸러 낸 목록이 이미 손에 있어 추가 쿼리가 필요 없다.
	 */
	List<Post> findAllByIds(List<Long> ids, String hashtag, Long ownerId);
}
