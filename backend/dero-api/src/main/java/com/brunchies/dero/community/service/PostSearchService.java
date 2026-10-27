package com.brunchies.dero.community.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.Refresh;
import co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery;
import co.elastic.clients.elasticsearch._types.query_dsl.Operator;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.PlacementEmbedTokens;
import com.brunchies.dero.community.Post;
import com.brunchies.dero.community.PostHashtag;
import com.brunchies.dero.community.repository.PostRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.search.ReindexResponse;
import com.brunchies.dero.global.search.SearchIndexLifecycle;
import com.brunchies.dero.user.service.UserSearchService;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게시글 검색 인덱스 — 질의(읽기)와 색인(쓰기)을 한 클래스가 소유한다(ADR-0019 · ADR-0027).
 *
 * <p><b>ES가 돌려주는 것은 게시글 id 목록뿐이다.</b> 제목·본문·작성자 닉네임은 Postgres가 정본이라
 * {@link PostService}가 그 id로 목록을 다시 읽는다 — ES 문서에 표시값을 실어 두면 색인이 한 번 밀린
 * 순간 화면이 조용히 옛 값을 보여준다(ADR-0019 결정 4).
 *
 * <p><b>작성자 검색은 별도 결과 섹션이 아니라 필터다</b>(ADR-0027 결정 2). {@link UserSearchService}가
 * 닉네임으로 userId를 찾아 주면 그 id들을 이 질의의 {@code should}에 얹는다 — 지금 클라이언트 필터의
 * 동작(작성자 이름이 맞으면 그 사람의 글이 뜬다)과 같고 화면 변경이 0이다. <b>닉네임을 글 문서에
 * 싣는 안은 부결이다</b> — 닉네임을 바꾼 순간 그 사람 글 전량을 재색인해야 한다.
 *
 * <p><b>본문의 {@code [[placement:ID]]} 토큰은 문서를 만들 때 걷어낸다</b>
 * ({@link PlacementEmbedTokens#strip}). 안 걷으면 {@code placement}와 배치 id 숫자가 검색어로 걸린다.
 * Postgres 정본은 건드리지 않는다 — 프론트가 그 토큰으로 배치 카드를 렌더한다.
 *
 * <p><b>매핑이 제품과 다른 이유는 문서 성격이다</b>(ADR-0027 결정 1). 짧은 {@code title}과 자유로운
 * {@code content}는 부스트 배분이 달라서, 한 인덱스에 합치면 한쪽을 튜닝할 때마다 다른 쪽이 같이
 * 재색인된다. 그래서 인덱스를 셋으로 나눴다.
 *
 * <p>인덱스 수명 주기(별칭 뒤 실체 인덱스·매핑 비교)는 {@link SearchIndexLifecycle}이 맡는다.
 */
@Slf4j
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PostSearchService {

	/** 애플리케이션이 아는 유일한 이름. 실체 인덱스는 이 별칭 뒤에 숨는다(ADR-0019 결정 5). */
	public static final String ALIAS = "posts";

	private static final String INDEX_DEFINITION = "elasticsearch/post-index.json";

	/**
	 * 한 질의가 ES에서 받아 오는 id 상한. 게시글은 실측 19행이라(ADR-0027 결정 7) 사실상 전량이
	 * 들어오고, 그래서 태그·작성자 필터와 페이지 자르기를 Postgres와 애플리케이션이 맡을 수 있다.
	 *
	 * <p>ponytail: 게시글이 수천이 되면 이 방식이 깨진다 — 그때는 필터 필드를 ES 문서에 넣고
	 * 페이징까지 ES에서 한다. 지금 그 필드를 넣으면 정본이 두 곳이 된다.
	 */
	private static final int MAX_HITS = 200;

	/** 제목이 가장 세다 — 짧은 필드라 한 낱말이 맞았을 때의 관련도가 본문보다 높다. */
	private static final float TITLE_BOOST = 3.0f;

	/** 태그는 사람이 직접 고른 낱말이라 본문보다 세지만 제목보다는 약하다. */
	private static final float TAGS_BOOST = 2.0f;

	private final ElasticsearchClient elasticsearch;
	private final SearchIndexLifecycle lifecycle;
	private final UserSearchService userSearchService;
	private final PostRepository posts;

	/**
	 * 부팅 시 인덱스를 쓸 수 있는 상태로 만든다 — 별칭이 없으면 새로 만들고, 매핑이 낡았으면 전량
	 * 재색인한다. <b>실패해도 부팅은 계속된다</b>(ADR-0019 결정 6) — ES가 안 뜬 EC2에서 백엔드까지
	 * 못 뜨는 것이 더 나쁘다. 관측은 로그가 맡는다.
	 */
	@EventListener(ApplicationReadyEvent.class)
	public void prepareIndex() {
		try {
			if (!lifecycle.aliasExists(ALIAS)) {
				String index = lifecycle.createIndex(ALIAS, INDEX_DEFINITION);
				lifecycle.swapAlias(ALIAS, index);
				log.info("게시글 검색 인덱스를 새로 만들었습니다: index={} alias={}", index, ALIAS);
				return;
			}
			Set<String> missing = lifecycle.missingMappedFields(ALIAS, INDEX_DEFINITION);
			if (!missing.isEmpty()) {
				log.info("게시글 검색 인덱스 매핑이 낡아 전량 재색인합니다: missingFields={}", missing);
				reindexAll();
			}
		} catch (IOException | ElasticsearchException e) {
			log.error("게시글 검색 인덱스를 준비하지 못했습니다 — 검색 API가 503입니다. "
					+ "ES 기동 후 POST /api/v1/admin/search/posts/reindex로 복구합니다.", e);
		}
	}

	/**
	 * 질의어에 걸린 게시글 id를 <b>관련도 순서 그대로</b> 돌려준다. 호출부가 이 순서대로 Postgres에서
	 * 목록을 읽고 노출 규칙(소프트 삭제)과 태그·작성자 필터를 적용한다.
	 *
	 * <p><b>ES 왕복이 둘이다</b>(ADR-0027 결정 2) — 먼저 닉네임으로 userId를 찾고, 그것을 이 질의의
	 * {@code should}에 얹는다. 첫 왕복은 대개 0히트라 싸다.
	 *
	 * <p>필드마다 {@code operator}가 갈리는 근거는 {@code ProductSearchService.searchIds}와 같다 —
	 * 본검색은 {@code AND}라 여러 단어를 친 질의가 헐겁게 걸리지 않고, {@code title.autocomplete}
	 * (edge n-gram) 절만 기본값 {@code OR}이라 한국어 오타를 잡는다(형태소 분해 결과가 통째로 바뀌어
	 * {@code fuzziness}가 성립하지 않는다). <b>{@code content}에는 접두 절도 {@code fuzziness}도
	 * 없다</b> — 전문이라 오매칭 비용이 제목과 자릿수로 다르다.
	 *
	 * <p><b>{@code NEVER}는 장식이 아니다.</b> 이 메서드는 DB를 한 줄도 안 읽고 네트워크 왕복만 한다 —
	 * 트랜잭션 안에서 불리면 그 왕복 내내 커넥션 하나가 아무 일도 안 하면서 풀에서 사라지고, 폴백이
	 * 없어(ADR-0019 결정 6) ES가 느려지는 날 마르는 것은 검색이 아니라 <b>관계없는 API 전부</b>다.
	 *
	 * @throws BusinessException ES가 죽었거나 인덱스가 없으면 503이다. <b>폴백하지 않는다</b> —
	 *         클라이언트 필터로 되돌리면 이 기능이 고치려던 결함이 조용히 부활한다.
	 */
	@Transactional(propagation = Propagation.NEVER)
	public List<Long> searchIds(String query) {
		String text = query.trim();
		List<Long> authorIds = userSearchService.searchIds(text);
		try {
			SearchResponse<Void> response = elasticsearch.search(search -> search
					.index(ALIAS)
					.size(MAX_HITS)
					.source(source -> source.fetch(false))
					.query(q -> q.bool(bool -> matching(bool, text, authorIds))),
					Void.class);

			return response.hits().hits().stream().map(Hit::id).map(Long::valueOf).toList();
		} catch (IOException | ElasticsearchException e) {
			log.error("게시글 검색에 실패했습니다: query={}", text, e);
			throw new BusinessException(CommunityErrorCode.POST_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 제목·본문·태그·작성자 중 <b>하나라도</b> 맞으면 걸린다({@code minimumShouldMatch("1")}) —
	 * 지금 클라이언트 필터가 네 값을 OR로 보는 것과 같다.
	 */
	private BoolQuery.Builder matching(BoolQuery.Builder bool, String text, List<Long> authorIds) {
		bool.should(should -> should.match(match -> match
						.field("title")
						.query(text)
						.fuzziness("AUTO")
						.operator(Operator.And)
						.boost(TITLE_BOOST)))
				.should(should -> should.match(match -> match
						.field("title.autocomplete")
						.query(text)))
				.should(should -> should.match(match -> match
						.field("tags.text")
						.query(text)
						.fuzziness("AUTO")
						.operator(Operator.And)
						.boost(TAGS_BOOST)))
				.should(should -> should.match(match -> match
						.field("content")
						.query(text)
						.operator(Operator.And)))
				.minimumShouldMatch("1");

		if (!authorIds.isEmpty()) {
			bool.should(should -> should.terms(terms -> terms
					.field("userId")
					.terms(values -> values.value(authorIds.stream().map(FieldValue::of).toList()))));
		}
		return bool;
	}

	/**
	 * 전량 재색인 — 새 인덱스를 만들어 채운 뒤 별칭을 스왑하고 옛 인덱스를 지운다(ADR-0019 결정 3·5).
	 *
	 * <p>이벤트 색인이 실패해도(ES 다운·네트워크) 이 한 번으로 복구된다. 실측 19행이라 몇 초다
	 * (ADR-0027 결정 7) — <b>규모가 바뀌면 판단도 바뀐다</b>. 신호는 쓰기 빈도가 아니라 이 로그의
	 * 소요 시간이다.
	 */
	public ReindexResponse reindexAll() {
		List<Post> rows = posts.findAllForIndexing();
		String created = null;
		try {
			String index = lifecycle.createIndex(ALIAS, INDEX_DEFINITION);
			created = index;
			if (!rows.isEmpty()) {
				bulkIndex(index, rows);
			}
			lifecycle.refresh(index);
			lifecycle.swapAlias(ALIAS, index);
			log.info("게시글 전량 재색인 완료: index={} count={}", index, rows.size());
			return new ReindexResponse(rows.size());
		} catch (IOException | ElasticsearchException e) {
			// 별칭이 아직 옛 인덱스를 가리키므로 검색은 멀쩡하다. 대신 반쯤 채워진 새 인덱스가
			// 아무에게도 안 붙은 채 디스크만 먹으므로 걷어낸다.
			lifecycle.deleteQuietly(created);
			log.error("게시글 전량 재색인에 실패했습니다.", e);
			throw new BusinessException(CommunityErrorCode.POST_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 게시글 1건 색인 — 작성·수정 커밋 후에 불린다({@link PostSearchIndexListener}).
	 *
	 * <p><b>여기서 던지지 않는다.</b> 커밋은 이미 끝났고 색인 실패로 사용자의 글쓰기를 실패시킬 수
	 * 없다. 유실은 전량 재색인이 걷어낸다(ADR-0019 결정 3) — <b>이 로그가 유일한 증거다</b>.
	 *
	 * <p>{@code refresh=wait_for}는 글을 쓰자마자 검색이 그 글을 찾게 하려는 것이다. 없으면 기본
	 * 새로고침 주기 1초 동안 "방금 쓴 글이 검색에 없다"가 된다.
	 */
	public void index(Post post) {
		try {
			elasticsearch.index(request -> request
					.index(ALIAS)
					.id(String.valueOf(post.getId()))
					.refresh(Refresh.WaitFor)
					.document(PostDocument.of(post)));
		} catch (IOException | ElasticsearchException e) {
			log.error("게시글 색인에 실패했습니다 — 재색인으로 복구합니다: postId={}", post.getId(), e);
		}
	}

	/** 색인에서 제거 — 소프트 삭제된 글이 검색 상한 자리를 차지하지 않게 한다. {@link #index}와 같은 이유로 던지지 않는다. */
	public void remove(Long postId) {
		try {
			elasticsearch.delete(request -> request
					.index(ALIAS)
					.id(String.valueOf(postId))
					.refresh(Refresh.WaitFor));
		} catch (IOException | ElasticsearchException e) {
			log.error("게시글 색인 제거에 실패했습니다 — 재색인으로 복구합니다: postId={}", postId, e);
		}
	}

	private void bulkIndex(String index, List<Post> rows) throws IOException {
		BulkRequest.Builder bulk = new BulkRequest.Builder();
		for (Post post : rows) {
			bulk.operations(operation -> operation.index(document -> document
					.index(index)
					.id(String.valueOf(post.getId()))
					.document(PostDocument.of(post))));
		}

		BulkResponse response = elasticsearch.bulk(bulk.build());
		if (response.errors()) {
			// 부분 실패를 성공으로 넘기면 "재색인했는데 안 나온다"가 된다 — 통째로 실패시킨다.
			// 옛 별칭은 아직 그대로라 이 시점에 검색은 멀쩡하다.
			throw new IOException("벌크 색인에 실패한 문서가 있습니다: index=" + index);
		}
	}

	/**
	 * ES 문서. <b>표시값이 아니라 검색 대상만 담는다</b>(ADR-0019 결정 4) — 좋아요 수·사진·작성 시각은
	 * Postgres가 정본이라 여기 실을 이유가 없다.
	 *
	 * @param userId 작성자 id. <b>닉네임이 아니다</b>(ADR-0027 결정 2) — 작성자 검색은
	 *        {@link UserSearchService}가 찾아 준 id로 거는 필터다. 탈퇴한 작성자는 {@code null}이라
	 *        어떤 {@code terms} 필터에도 안 걸린다.
	 */
	public record PostDocument(String title, String content, List<String> tags, Long userId) {

		static PostDocument of(Post post) {
			return new PostDocument(
					post.getTitle(),
					PlacementEmbedTokens.strip(post.getContent()),
					post.getHashtags().stream()
							.map(PostHashtag::getHashtag)
							.map(Hashtag::getName)
							.toList(),
					post.getUser() == null ? null : post.getUser().getId());
		}
	}
}
