package com.brunchies.dero.user.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.Refresh;
import co.elastic.clients.elasticsearch._types.query_dsl.Operator;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.search.ReindexResponse;
import com.brunchies.dero.global.search.SearchIndexLifecycle;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserErrorCode;
import com.brunchies.dero.user.repository.UserRepository;
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
 * 닉네임 인덱스 — <b>작성자 검색을 조립하는 부품이지 그 자체로 화면이 있는 검색이 아니다</b>
 * (ADR-0027 결정 2).
 *
 * <p>결과를 "사람" 섹션으로 세우지 않는다. 여기서 얻은 userId는 게시글(그리고 뒤이어 배치) 질의의
 * <b>필터로 넘어가</b> "닉네임이 맞으면 그 사람의 글이 뜬다"가 된다 — 지금 클라이언트 필터의 동작이
 * 정확히 그것이고, 서버로 옮기면서 화면을 바꾸지 않는다.
 *
 * <p><b>싣는 것은 닉네임 하나뿐이다</b>(결정 3). 이메일 로컬파트는 부결됐다 — 검색 결과로 이메일을
 * 역추적할 수 있게 된다. 자기소개는 그것을 쓰는 화면이 없다.
 *
 * <p><b>작성자 이름을 글 문서에 싣는 안은 부결이다</b>(같은 결정) — 닉네임을 바꾼 순간 그 사람의 글
 * 전부를 재색인해야 하고, 밀리면 화면이 조용히 옛 닉네임을 보여준다. 대가는 ES 왕복 하나인데 첫
 * 왕복은 대개 0히트다(닉네임을 검색어로 치는 일이 드물다).
 *
 * <p>인덱스 수명 주기(별칭 뒤 실체 인덱스·매핑 비교)는 {@link SearchIndexLifecycle}이 맡는다.
 */
@Slf4j
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class UserSearchService {

	/** 애플리케이션이 아는 유일한 이름. 실체 인덱스는 이 별칭 뒤에 숨는다(ADR-0019 결정 5). */
	public static final String ALIAS = "users";

	private static final String INDEX_DEFINITION = "elasticsearch/user-index.json";

	/**
	 * 한 질의가 받아 오는 userId 상한. 이 값이 그대로 게시글 질의의 {@code terms} 필터가 되므로
	 * 무한정 늘릴 수 없다 — 실측 사용자 91명(ADR-0027 결정 7)이라 사실상 전량이 들어온다.
	 */
	private static final int MAX_HITS = 100;

	/** 본검색 가중치. 형태소 일치가 접두 일치보다 앞선다 — {@code ProductSearchService}와 같은 배분이다. */
	private static final float NICKNAME_BOOST = 3.0f;

	private final ElasticsearchClient elasticsearch;
	private final SearchIndexLifecycle lifecycle;
	private final UserRepository users;

	/**
	 * 부팅 시 인덱스를 쓸 수 있는 상태로 만든다 — 별칭이 없으면 새로 만들고, 매핑이 낡았으면 전량
	 * 재색인한다. <b>실패해도 부팅은 계속된다</b>(ADR-0019 결정 6) — ES가 안 뜬 EC2에서 백엔드까지
	 * 못 뜨는 것이 더 나쁘다.
	 */
	@EventListener(ApplicationReadyEvent.class)
	public void prepareIndex() {
		try {
			if (!lifecycle.aliasExists(ALIAS)) {
				String index = lifecycle.createIndex(ALIAS, INDEX_DEFINITION);
				lifecycle.swapAlias(ALIAS, index);
				log.info("닉네임 인덱스를 새로 만들었습니다: index={} alias={}", index, ALIAS);
				return;
			}
			Set<String> missing = lifecycle.missingMappedFields(ALIAS, INDEX_DEFINITION);
			if (!missing.isEmpty()) {
				log.info("닉네임 인덱스 매핑이 낡아 전량 재색인합니다: missingFields={}", missing);
				reindexAll();
			}
		} catch (IOException | ElasticsearchException e) {
			log.error("닉네임 인덱스를 준비하지 못했습니다 — 게시글 검색이 503입니다. "
					+ "ES 기동 후 POST /api/v1/admin/search/users/reindex로 복구합니다.", e);
		}
	}

	/**
	 * 닉네임이 걸린 사용자 id를 <b>관련도 순서 그대로</b> 돌려준다. 호출부가 이 id를 자기 질의의
	 * 필터로 넘긴다.
	 *
	 * <p>두 절의 {@code operator}가 다른 근거는 {@code ProductSearchService.searchIds}와 같다 —
	 * 본검색은 {@code AND}라 여러 단어를 친 질의가 헐겁게 걸리지 않고, 접두 절은 기본값 {@code OR}이라
	 * 한국어 오타(형태소 분해 결과가 통째로 바뀌어 {@code fuzziness}가 성립하지 않는다)를 잡는다.
	 *
	 * <p><b>{@code NEVER}는 장식이 아니다</b> — 이 메서드는 DB를 한 줄도 안 읽고 네트워크 왕복만 한다.
	 * 트랜잭션 안에서 불리면 그 왕복 내내 커넥션 하나가 놀면서 풀에서 사라지고, 폴백이 없어 ES가
	 * 느려지는 날 마르는 것은 검색이 아니라 관계없는 API 전부다.
	 *
	 * @throws BusinessException ES가 죽었거나 인덱스가 없으면 503이다. <b>폴백하지 않는다</b>
	 */
	@Transactional(propagation = Propagation.NEVER)
	public List<Long> searchIds(String query) {
		String text = query.trim();
		try {
			SearchResponse<Void> response = elasticsearch.search(search -> search
					.index(ALIAS)
					.size(MAX_HITS)
					.source(source -> source.fetch(false))
					.query(q -> q.bool(bool -> bool
							.should(should -> should.match(match -> match
									.field("nickname")
									.query(text)
									.fuzziness("AUTO")
									.operator(Operator.And)
									.boost(NICKNAME_BOOST)))
							.should(should -> should.match(match -> match
									.field("nickname.autocomplete")
									.query(text)))
							.minimumShouldMatch("1"))),
					Void.class);

			return response.hits().hits().stream().map(Hit::id).map(Long::valueOf).toList();
		} catch (IOException | ElasticsearchException e) {
			log.error("닉네임 검색에 실패했습니다: query={}", text, e);
			throw new BusinessException(UserErrorCode.USER_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 전량 재색인 — 새 인덱스를 채운 뒤 별칭을 스왑하고 옛 인덱스를 지운다(ADR-0019 결정 3·5).
	 * 이벤트 색인이 실패해도 이 한 번으로 복구된다.
	 */
	public ReindexResponse reindexAll() {
		List<User> rows = users.findAllByDeletedAtIsNull();
		String created = null;
		try {
			String index = lifecycle.createIndex(ALIAS, INDEX_DEFINITION);
			created = index;
			if (!rows.isEmpty()) {
				bulkIndex(index, rows);
			}
			lifecycle.refresh(index);
			lifecycle.swapAlias(ALIAS, index);
			log.info("닉네임 전량 재색인 완료: index={} count={}", index, rows.size());
			return new ReindexResponse(rows.size());
		} catch (IOException | ElasticsearchException e) {
			// 별칭이 아직 옛 인덱스를 가리키므로 검색은 멀쩡하다. 반쯤 채워진 새 인덱스만 걷어낸다.
			lifecycle.deleteQuietly(created);
			log.error("닉네임 전량 재색인에 실패했습니다.", e);
			throw new BusinessException(UserErrorCode.USER_SEARCH_UNAVAILABLE);
		}
	}

	/**
	 * 사용자 1건 색인 — 가입·닉네임 변경이 커밋된 뒤에 불린다({@code UserSearchIndexListener}).
	 *
	 * <p><b>여기서 던지지 않는다.</b> 커밋은 이미 끝났고 색인 실패로 사용자 요청을 실패시킬 수 없다 —
	 * 유실은 전량 재색인이 걷어낸다(ADR-0019 결정 3).
	 */
	public void index(User user) {
		try {
			elasticsearch.index(request -> request
					.index(ALIAS)
					.id(String.valueOf(user.getId()))
					.refresh(Refresh.WaitFor)
					.document(new UserDocument(user.getNickname())));
		} catch (IOException | ElasticsearchException e) {
			log.error("닉네임 색인에 실패했습니다 — 재색인으로 복구합니다: userId={}", user.getId(), e);
		}
	}

	/** 색인에서 제거 — 탈퇴한 사용자의 닉네임으로 그 사람 글이 검색되지 않게 한다. */
	public void remove(Long userId) {
		try {
			elasticsearch.delete(request -> request
					.index(ALIAS)
					.id(String.valueOf(userId))
					.refresh(Refresh.WaitFor));
		} catch (IOException | ElasticsearchException e) {
			log.error("닉네임 색인 제거에 실패했습니다 — 재색인으로 복구합니다: userId={}", userId, e);
		}
	}

	private void bulkIndex(String index, List<User> rows) throws IOException {
		BulkRequest.Builder bulk = new BulkRequest.Builder();
		for (User user : rows) {
			bulk.operations(operation -> operation.index(document -> document
					.index(index)
					.id(String.valueOf(user.getId()))
					.document(new UserDocument(user.getNickname()))));
		}

		BulkResponse response = elasticsearch.bulk(bulk.build());
		if (response.errors()) {
			// 부분 실패를 성공으로 넘기면 "재색인했는데 안 나온다"가 된다 — 통째로 실패시킨다.
			throw new IOException("벌크 색인에 실패한 문서가 있습니다: index=" + index);
		}
	}

	/**
	 * ES 문서. <b>닉네임 하나뿐이다</b>(ADR-0027 결정 3) — 이메일·자기소개는 싣지 않는다. 화면에
	 * 나가는 값도 여기서 읽지 않는다: 호출부는 {@code _id}(= {@code user.id})만 쓴다.
	 */
	public record UserDocument(String nickname) {
	}
}
