package com.brunchies.dero.community.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.then;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import com.brunchies.dero.AbstractElasticsearchIntegrationTest;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.Post;
import com.brunchies.dero.community.dto.PostSaveRequest;
import com.brunchies.dero.community.dto.PostSummaryResponse;
import com.brunchies.dero.community.repository.PostRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.search.SearchEventLogger;
import com.brunchies.dero.global.search.SearchIndex;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.dto.UserMePatchRequest;
import com.brunchies.dero.user.repository.UserRepository;
import com.brunchies.dero.user.service.UserSearchService;
import com.brunchies.dero.user.service.UserService;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 게시글·작성자 검색(ADR-0027)을 진짜 ES + Nori로 검증한다.
 *
 * <p>여기가 확인하는 것은 슬라이스로는 판정할 수 없는 것들이다 — <b>받아 온 페이지 너머의 글을 정말
 * 찾는가</b>(이 티켓이 고치려는 결함), 닉네임이 그 사람의 글을 끌어오는가, 본문의
 * {@code [[placement:ID]]} 토큰이 색인에서 걷혔는가, ES가 답하지 못할 때 폴백 없이 503이 되는가.
 *
 * <p><b>테스트 트랜잭션을 끈다</b> — {@code @TransactionalEventListener(AFTER_COMMIT)}는 커밋이 없으면
 * 아예 실행되지 않으므로 롤백되는 테스트 트랜잭션 안에서는 색인 경로를 검증할 수 없다
 * ({@code ProductSearchPersistenceTest}와 같은 판단). 대신 매 테스트 후 직접 지운다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PostSearchPersistenceTest extends AbstractElasticsearchIntegrationTest {

	/** 목록 한 페이지 기본 크기({@code PostController.DEFAULT_SIZE})보다 많아야 "페이징 너머"가 성립한다. */
	private static final int FILLER_POSTS = 25;

	@Autowired
	private PostSearchService postSearchService;

	@Autowired
	private UserSearchService userSearchService;

	@Autowired
	private PostService postService;

	@Autowired
	private PostRepository posts;

	@Autowired
	private UserRepository users;

	@Autowired
	private UserService userService;

	@Autowired
	private HashtagRepository hashtags;

	@Autowired
	private ElasticsearchClient elasticsearch;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager transactionManager;

	/** 검색어 이벤트는 <b>부르는가</b>가 계약이라 목으로 잡는다({@code ProductControllerTest}와 같은 형태). */
	@MockitoBean
	private SearchEventLogger searchEventLogger;

	private Long 책상장인;

	@BeforeEach
	void setUp() {
		// 픽스처는 한 트랜잭션 안에서 넣는다 — 테스트 트랜잭션을 껐으므로(NOT_SUPPORTED) 밖에서
		// 만들면 해시태그 정션의 cascade가 붙을 영속성 컨텍스트가 없다.
		책상장인 = new TransactionTemplate(transactionManager).execute(status -> {
			User deskMaster = saveUser("desk@example.com", "kakao-search-1", "책상장인");
			User monitorFan = saveUser("monitor@example.com", "kakao-search-2", "모니터덕후");

			글("원목 책상 셋업", "따뜻한 느낌으로 꾸몄어요", deskMaster, "원목");
			글("듀얼 모니터 암 후기", "화면이 훨씬 넓어졌습니다", monitorFan, "모니터암");
			글("내 첫 데스크테리어", "이렇게 꾸몄어요 [[placement:1]] 어때요", deskMaster, null);

			// 위 셋을 첫 페이지 밖으로 밀어낸다 — 이 티켓이 고치려는 결함(받아 온 페이지 안에서만
			// 검색)이 재현되려면 목록 첫 페이지에 대상 글이 없어야 한다.
			for (int i = 0; i < FILLER_POSTS; i++) {
				글("소소한 기록", "특별할 것 없는 하루", monitorFan, null);
			}
			return deskMaster.getId();
		});

		userSearchService.reindexAll();
		postSearchService.reindexAll();
	}

	/**
	 * <b>{@code RESTART IDENTITY}를 쓰지 않는다.</b> 시퀀스를 1로 되돌리면 Hibernate pooled
	 * optimizer({@code allocationSize = 50})가 아직 들고 있던 블록을 다 쓴 뒤 되돌아간 시퀀스에서 새
	 * 블록을 받아, <b>같은 픽스처 안에서 나중에 만든 글이 더 작은 id를 갖는다</b>(2026-08-07 실측:
	 * 채움 글 19건이 대상 글보다 뒤 id, 나머지가 앞 id). 그러면 id 내림차순인 목록 순서가 작성 순서와
	 * 갈려 "첫 페이지 밖"이라는 이 클래스의 전제가 조용히 깨진다. 시퀀스를 그냥 두면 단조 증가라
	 * 순서가 항상 작성 순서다 — id 값 자체를 보는 단언이 없으므로 되돌릴 이유도 없다.
	 */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE post_hashtag, post_image, post_like, post_comment, post, hashtag,
					"user" CASCADE
				""");
	}

	@Test
	@DisplayName("제목으로 페이징 너머의 글을 찾는다 — 목록 첫 페이지에는 없는 글이 검색에는 나온다")
	void 제목으로_찾는다() {
		assertThat(titles(list(null))).doesNotContain("원목 책상 셋업");

		assertThat(titles(list("원목"))).contains("원목 책상 셋업");
	}

	@Test
	@DisplayName("본문으로도 찾는다 — 제목에 없는 낱말이 본문에 있으면 걸린다")
	void 본문으로_찾는다() {
		assertThat(titles(list("넓어졌습니다"))).containsExactly("듀얼 모니터 암 후기");
	}

	@Test
	@DisplayName("태그로도 찾는다 — 제목·본문에 없는 태그 낱말이 걸린다")
	void 태그로_찾는다() {
		assertThat(titles(list("모니터암"))).contains("듀얼 모니터 암 후기");
	}

	@Test
	@DisplayName("닉네임으로 검색하면 그 사람의 글이 나온다 — 결과를 사람/글로 나누지 않는다")
	void 작성자로_찾는다() {
		List<String> found = titles(list("책상장인"));

		assertThat(found).contains("원목 책상 셋업", "내 첫 데스크테리어");
		// 남의 글이 통째로 딸려 오면 필터가 아니라 무조건 매치가 된 것이다.
		assertThat(found).doesNotContain("듀얼 모니터 암 후기");
	}

	@Test
	@DisplayName("[[placement:1]]을 검색해도 그 토큰이 든 글이 안 걸린다 — 토큰은 색인에서 걷힌다")
	void 배치_토큰은_색인에서_걷힌다() {
		assertThat(titles(list("[[placement:1]]"))).isEmpty();
		assertThat(titles(list("placement"))).isEmpty();

		// 같은 글이 본문의 다른 낱말로는 그대로 잡힌다 — 색인이 통째로 비어서 통과하는 것이 아니다.
		assertThat(titles(list("꾸몄어요"))).contains("내 첫 데스크테리어");
	}

	@Test
	@DisplayName("무의미한 질의는 0건이다 — 1글자 형태소가 그 글자로 시작하는 글을 끌어오지 않는다")
	void 무의미한_질의() {
		assertThat(titles(list("존재하지않는글제목asdf"))).isEmpty();
	}

	@Test
	@DisplayName("태그 필터가 검색에도 그대로 걸린다")
	void 검색에도_필터가_걸린다() {
		assertThat(titles(listTagged("책상", "원목"))).containsExactly("원목 책상 셋업");
		// 태그가 '모니터암'인 글은 '원목' 태그 필터에 걸리지 않는다.
		assertThat(titles(listTagged("모니터암", "원목"))).isEmpty();
	}

	@Test
	@DisplayName("작성하면 재색인 없이도 검색된다 — AFTER_COMMIT 색인")
	void 작성_직후_검색된다() {
		Long id = postService.create(책상장인,
				new PostSaveRequest("인체공학 의자 교체기", "허리가 편해졌어요", List.of())).id();

		assertThat(postSearchService.searchIds("인체공학")).contains(id);
	}

	@Test
	@DisplayName("삭제하면 색인에서도 빠진다")
	void 삭제하면_색인에서_빠진다() {
		Long id = postService.create(책상장인,
				new PostSaveRequest("인체공학 의자 교체기", "허리가 편해졌어요", List.of())).id();

		postService.delete(책상장인, id);

		assertThat(postSearchService.searchIds("인체공학")).doesNotContain(id);
	}

	@Test
	@DisplayName("닉네임을 바꾸면 그 닉네임으로 그 사람 글이 나온다 — 글은 재색인하지 않는다")
	void 닉네임_변경이_반영된다() {
		userService.updateMe(책상장인, new UserMePatchRequest("책상요정"));

		assertThat(titles(list("책상요정"))).contains("내 첫 데스크테리어");
	}

	@Test
	@DisplayName("ES가 답하지 못하면 503이다 — 클라이언트 필터로 폴백하지 않는다")
	void 인덱스가_없으면_503() throws IOException {
		// 별칭 이름으로는 못 지운다 — 실체 인덱스를 찾아 지운다. ES가 죽은 것과 같은 상태를 만든다.
		deleteIndicesBehind(PostSearchService.ALIAS);

		assertThatThrownBy(() -> postSearchService.searchIds("원목"))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(CommunityErrorCode.POST_SEARCH_UNAVAILABLE));
	}

	@Test
	@DisplayName("닉네임 인덱스가 죽어도 폴백하지 않는다 — 작성자 검색만 조용히 빠지지 않는다")
	void 닉네임_인덱스가_없으면_503() throws IOException {
		deleteIndicesBehind(UserSearchService.ALIAS);

		assertThatThrownBy(() -> postSearchService.searchIds("원목"))
				.isInstanceOf(BusinessException.class);
	}

	/**
	 * ES 왕복이 트랜잭션 밖이라는 <b>불변식</b>을 못 박는다. 커넥션 점유는 눈에 안 보여서, 누가
	 * {@code searchIds}를 트랜잭션 안으로 도로 넣어도 기능 테스트는 전부 초록이고 <b>부하가 올 때
	 * 관계없는 API가 같이 죽는 것</b>으로만 드러난다.
	 */
	@Test
	@DisplayName("검색 질의를 트랜잭션 안에서 부르면 터진다 — ES 왕복 동안 커넥션을 물지 않는다")
	void 트랜잭션_안에서는_검색을_못_부른다() {
		TransactionTemplate transaction = new TransactionTemplate(transactionManager);

		assertThatThrownBy(() -> transaction.execute(status -> postSearchService.searchIds("원목")))
				.isInstanceOf(IllegalTransactionStateException.class);
	}

	@Test
	@DisplayName("q가 실리면 search.index=posts로 검색어 이벤트를 남긴다")
	void 검색어_이벤트() throws Exception {
		mockMvc.perform(get("/api/v1/posts").param("q", "원목")).andExpect(status().isOk());

		// 건수는 노출 규칙까지 적용된 뒤의 값이다 — 지금 픽스처에서 '원목'은 한 글이다.
		then(searchEventLogger).should().searched(SearchIndex.POSTS, "원목", 1L, null);
	}

	@Test
	@DisplayName("q가 없으면 검색어 이벤트를 남기지 않는다 — 목록 스크롤이 인기 검색어에 섞이지 않는다")
	void 검색어_이벤트_없음() throws Exception {
		mockMvc.perform(get("/api/v1/posts")).andExpect(status().isOk());

		then(searchEventLogger).shouldHaveNoInteractions();
	}

	private CursorPage<PostSummaryResponse> list(String q) {
		return postService.list(null, null, null, q, null, 20);
	}

	private CursorPage<PostSummaryResponse> listTagged(String q, String hashtag) {
		return postService.list(null, hashtag, null, q, null, 20);
	}

	private static List<String> titles(CursorPage<PostSummaryResponse> page) {
		return page.content().stream().map(PostSummaryResponse::title).toList();
	}

	private void deleteIndicesBehind(String alias) throws IOException {
		for (String index : elasticsearch.indices()
				.getAlias(request -> request.name(alias)).aliases().keySet()) {
			elasticsearch.indices().delete(delete -> delete.index(index));
		}
	}

	private User saveUser(String email, String providerId, String nickname) {
		return users.save(User.create(email, Provider.KAKAO, providerId, nickname));
	}

	/** 색인 경로가 아니라 픽스처라 리포지토리로 직접 넣는다 — 배치 토큰 검증을 태우지 않기 위해서다. */
	private void 글(String title, String content, User author, String tag) {
		Post post = posts.save(Post.create(author, title, content));
		if (tag != null) {
			Hashtag hashtag = hashtags.findByNameAndDeletedAtIsNull(tag)
					.orElseGet(() -> hashtags.save(Hashtag.create(tag, null)));
			post.replaceHashtags(List.of(hashtag));
		}
		posts.flush();
	}
}
