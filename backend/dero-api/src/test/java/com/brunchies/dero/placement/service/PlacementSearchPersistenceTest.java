package com.brunchies.dero.placement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.then;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import com.brunchies.dero.AbstractElasticsearchIntegrationTest;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.search.SearchEventLogger;
import com.brunchies.dero.global.search.SearchIndex;
import com.brunchies.dero.image.queue.ImagePublishQueue;
import com.brunchies.dero.image.service.FeedEntryService;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.PlacementSort;
import com.brunchies.dero.placement.dto.PlacementSummaryResponse;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import com.brunchies.dero.user.service.UserSearchService;
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
 * 배치(데스크 피드) 검색(ADR-0027)을 진짜 ES + Nori로 검증한다.
 *
 * <p>여기가 확인하는 것은 슬라이스로는 판정할 수 없는 것들이다 — <b>받아 온 페이지 너머의 배치를
 * 정말 찾는가</b>(이 티켓이 고치려는 결함), 닉네임이 그 사람의 배치를 끌어오는가, <b>색인에 있는
 * {@code PRIVATE} 배치가 남의 결과에 안 뜨는가</b>(ADR-0027 결정 4의 요점), 공개 전환에서 받은
 * 태그가 색인에 실리는가, ES가 답하지 못할 때 폴백 없이 503이 되는가.
 *
 * <p><b>테스트 트랜잭션을 끈다</b> — {@code @TransactionalEventListener(AFTER_COMMIT)}는 커밋이 없으면
 * 아예 실행되지 않으므로 롤백되는 테스트 트랜잭션 안에서는 색인 경로를 검증할 수 없다
 * ({@code PostSearchPersistenceTest}와 같은 판단). 대신 매 테스트 후 직접 지운다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlacementSearchPersistenceTest extends AbstractElasticsearchIntegrationTest {

	/** 목록 한 페이지 기본 크기({@code PlacementController.DEFAULT_SIZE})보다 많아야 "페이징 너머"가 성립한다. */
	private static final int FILLER_PLACEMENTS = 25;

	@Autowired
	private PlacementSearchService placementSearchService;

	@Autowired
	private UserSearchService userSearchService;

	@Autowired
	private PlacementService placementService;

	@Autowired
	private FeedEntryService feedEntryService;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

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

	/** 검색어 이벤트는 <b>부르는가</b>가 계약이라 목으로 잡는다({@code PostSearchPersistenceTest}와 같은 형태). */
	@MockitoBean
	private SearchEventLogger searchEventLogger;

	/** 큐 투입은 이 테스트의 관심사가 아니고, Redis를 붙이지 않기 위해 목으로 막는다. */
	@MockitoBean
	private ImagePublishQueue queue;

	private Long 책상장인;

	private Long 비밀배치;

	@BeforeEach
	void setUp() {
		// 픽스처는 한 트랜잭션 안에서 넣는다 — 테스트 트랜잭션을 껐으므로(NOT_SUPPORTED) 밖에서
		// 만들면 해시태그 정션의 cascade가 붙을 영속성 컨텍스트가 없다.
		책상장인 = new TransactionTemplate(transactionManager).execute(status -> {
			User deskMaster = saveUser("desk@example.com", "kakao-placement-1", "책상장인");
			User monitorFan = saveUser("monitor@example.com", "kakao-placement-2", "모니터덕후");

			공개배치("원목 책상 셋업", "따뜻한 느낌으로 꾸몄어요", deskMaster, "우드톤");
			공개배치("듀얼 모니터 세팅", "화면이 훨씬 넓어졌습니다", monitorFan, "모니터암");
			공개배치("내 첫 데스크테리어", "이렇게 꾸몄어요", deskMaster, null);
			비밀배치 = 비공개배치("비밀 원목 작업실", "아직 아무에게도 안 보여요", monitorFan).getId();

			// 위 셋을 첫 페이지 밖으로 밀어낸다 — 이 티켓이 고치려는 결함(받아 온 페이지 안에서만
			// 검색)이 재현되려면 목록 첫 페이지에 대상 배치가 없어야 한다.
			for (int i = 0; i < FILLER_PLACEMENTS; i++) {
				공개배치("소소한 기록", "특별할 것 없는 하루", monitorFan, null);
			}
			return deskMaster.getId();
		});

		userSearchService.reindexAll();
		placementSearchService.reindexAll();
	}

	/**
	 * <b>{@code RESTART IDENTITY}를 쓰지 않는다</b> — 사유는 {@code PostSearchPersistenceTest}와 같다.
	 * 시퀀스를 1로 되돌리면 pooled optimizer가 아직 들고 있던 블록 때문에 나중에 만든 행이 더 작은
	 * id를 갖고, "첫 페이지 밖"이라는 전제가 조용히 깨진다.
	 */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE placement_hashtag, placed_item, placement_desk, placement_like,
					placement_bookmark, comment, generated_image, placement, hashtag, "user" CASCADE
				""");
	}

	@Test
	@DisplayName("제목으로 페이징 너머의 배치를 찾는다 — 목록 첫 페이지에는 없는 배치가 검색에는 나온다")
	void 제목으로_찾는다() {
		assertThat(titles(list(null))).doesNotContain("원목 책상 셋업");

		assertThat(titles(list("원목"))).contains("원목 책상 셋업");
	}

	@Test
	@DisplayName("설명으로도 찾는다 — 제목에 없는 낱말이 설명에 있으면 걸린다")
	void 설명으로_찾는다() {
		assertThat(titles(list("넓어졌습니다"))).containsExactly("듀얼 모니터 세팅");
	}

	@Test
	@DisplayName("태그로도 찾는다 — 제목·설명에 없는 태그 낱말이 걸린다")
	void 태그로_찾는다() {
		assertThat(titles(list("우드톤"))).contains("원목 책상 셋업");
	}

	@Test
	@DisplayName("닉네임으로 검색하면 그 사람의 배치가 나온다 — 결과를 사람/배치로 나누지 않는다")
	void 작성자로_찾는다() {
		List<String> found = titles(list("책상장인"));

		assertThat(found).contains("원목 책상 셋업", "내 첫 데스크테리어");
		// 남의 배치가 통째로 딸려 오면 필터가 아니라 무조건 매치가 된 것이다.
		assertThat(found).doesNotContain("듀얼 모니터 세팅");
	}

	/** ADR-0027 결정 4 — 전량 색인이고 노출 판정은 Postgres다. 그 둘이 갈리면 비공개 배치가 샌다. */
	@Test
	@DisplayName("PRIVATE 배치는 색인에는 있어도 남의 검색 결과에는 안 나온다")
	void 비공개_배치는_결과에_없다() {
		assertThat(placementSearchService.searchIds("원목")).contains(비밀배치);

		assertThat(titles(list("원목"))).doesNotContain("비밀 원목 작업실");
	}

	@Test
	@DisplayName("공개 전환에 실린 태그가 재색인 없이 검색된다 — AFTER_COMMIT 색인")
	void 공개_전환_태그가_색인된다() {
		Long id = new TransactionTemplate(transactionManager).execute(status ->
				공개배치("허리가 편한 자리", "의자를 바꿨어요", users.getReferenceById(책상장인), null).getId());

		feedEntryService.requestFeedEntry(책상장인, id, List.of("인체공학"));

		assertThat(placementSearchService.searchIds("인체공학")).contains(id);
	}

	@Test
	@DisplayName("삭제하면 색인에서도 빠진다")
	void 삭제하면_색인에서_빠진다() {
		Long id = new TransactionTemplate(transactionManager).execute(status ->
				공개배치("잠깐 올렸던 배치", "곧 지웁니다", users.getReferenceById(책상장인), null).getId());
		placementSearchService.reindexAll();
		assertThat(placementSearchService.searchIds("잠깐")).contains(id);

		placementService.delete(책상장인, id);

		assertThat(placementSearchService.searchIds("잠깐")).doesNotContain(id);
	}

	@Test
	@DisplayName("ES가 답하지 못하면 503이다 — 클라이언트 필터로 폴백하지 않는다")
	void 인덱스가_없으면_503() throws IOException {
		// 별칭 이름으로는 못 지운다 — 실체 인덱스를 찾아 지운다. ES가 죽은 것과 같은 상태를 만든다.
		deleteIndicesBehind(PlacementSearchService.ALIAS);

		assertThatThrownBy(() -> placementSearchService.searchIds("원목"))
				.isInstanceOf(BusinessException.class)
				.satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
						.isEqualTo(PlacementErrorCode.PLACEMENT_SEARCH_UNAVAILABLE));
	}

	@Test
	@DisplayName("닉네임 인덱스가 죽어도 폴백하지 않는다 — 작성자 검색만 조용히 빠지지 않는다")
	void 닉네임_인덱스가_없으면_503() throws IOException {
		deleteIndicesBehind(UserSearchService.ALIAS);

		assertThatThrownBy(() -> placementSearchService.searchIds("원목"))
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

		assertThatThrownBy(() -> transaction.execute(status -> placementSearchService.searchIds("원목")))
				.isInstanceOf(IllegalTransactionStateException.class);
	}

	@Test
	@DisplayName("q가 실리면 search.index=placements로 검색어 이벤트를 남긴다")
	void 검색어_이벤트() throws Exception {
		mockMvc.perform(get("/api/v1/placements").param("q", "원목")).andExpect(status().isOk());

		// 건수는 노출 규칙까지 적용된 뒤의 값이다 — 비공개 '비밀 원목 작업실'은 세지 않는다.
		then(searchEventLogger).should().searched(SearchIndex.PLACEMENTS, "원목", 1L, null);
	}

	@Test
	@DisplayName("q가 없으면 검색어 이벤트를 남기지 않는다 — 피드 스크롤이 인기 검색어에 섞이지 않는다")
	void 검색어_이벤트_없음() throws Exception {
		mockMvc.perform(get("/api/v1/placements")).andExpect(status().isOk());

		then(searchEventLogger).shouldHaveNoInteractions();
	}

	private CursorPage<PlacementSummaryResponse> list(String q) {
		return placementService.list(null, null, null, null, null, null, null,
				PlacementSort.LATEST, q, null, 20);
	}

	private static List<String> titles(CursorPage<PlacementSummaryResponse> page) {
		return page.content().stream().map(PlacementSummaryResponse::title).toList();
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

	/**
	 * 색인 경로가 아니라 픽스처라 리포지토리로 직접 넣는다 — 스냅샷 병합·판정 게이트를 태우지 않기
	 * 위해서다. 스크린샷 key는 공개 전환 게이트 ②를 넘기려고 미리 박아 둔다.
	 */
	private Placement 공개배치(String title, String description, User owner, String tag) {
		Placement placement = 비공개배치(title, description, owner);
		placement.markPublished();
		if (tag != null) {
			Hashtag hashtag = hashtags.findByNameAndDeletedAtIsNull(tag)
					.orElseGet(() -> hashtags.save(Hashtag.create(tag, null)));
			placement.replaceHashtags(List.of(hashtag));
		}
		placements.flush();
		return placement;
	}

	private Placement 비공개배치(String title, String description, User owner) {
		Placement placement =
				placements.save(Placement.create(owner, title, description, null));
		placement.registerThumbnail("placement-thumbnails/" + placement.getId() + ".png");
		placements.flush();
		return placement;
	}
}
