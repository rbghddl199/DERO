package com.brunchies.dero.placement.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /placements} — 가시성·필터·정렬·커서를 <b>HTTP 시임</b>으로 검증한다.
 *
 * <p>저장 경로({@code PlacementControllerTest})와 파일을 나눈 이유: 이 목록은 스냅샷 본문을 전혀 쓰지
 * 않고 대신 {@code publish_status}·{@code like_count}·{@code created_at}을 자유롭게 심어야 하는데,
 * 그 셋은 <b>API로 정할 수 없는 값</b>이다({@code PUBLIC}·{@code FAILED}는 서버만 정하고 feed-entry
 * 엔드포인트는 아직 없다). 그래서 배치를 리포지토리로 직접 만들고 JDBC로 상태를 심는다.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PlacementControllerTest}와 같다 — MockMvc 요청이 테스트
 * 트랜잭션에 참여하면 실패 경로가 rollback-only를 만들어 뒤의 검증이 통째로 죽는다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PlacementListControllerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	/** Boot 4는 Jackson 3으로 옮겨 가 {@code com.fasterxml...ObjectMapper} 빈이 없다 — 직접 만든다. */
	private final ObjectMapper objectMapper = new ObjectMapper();

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private JdbcTemplate jdbc;

	private Long ownerId;
	private Long strangerId;

	@BeforeEach
	void setUp() {
		ownerId = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인")).getId();
		strangerId =
				users.save(User.create("other@example.com", Provider.KAKAO, "p-other", "남")).getId();
	}

	/** 테스트 트랜잭션이 없어 각 요청이 커밋된다 — 다음 테스트에 새지 않게 직접 지운다. */
	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, hashtag,
					"user" RESTART IDENTITY CASCADE
				""");
	}

	// --- 가시성 ---

	@Test
	@DisplayName("비로그인 목록은 200이고 PUBLIC만 보인다 — 남의 비공개는 한 건도 안 나온다")
	void 비로그인_목록은_PUBLIC만() throws Exception {
		long publicId = seed(ownerId, "공개", PublishStatus.PUBLIC, 0);
		seed(ownerId, "비공개", PublishStatus.PRIVATE, 0);
		seed(strangerId, "남의 비공개", PublishStatus.PRIVATE, 0);
		seed(strangerId, "남의 대기", PublishStatus.PENDING, 0);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].id").value(publicId))
				.andExpect(jsonPath("$.totalCount").value(1));
	}

	@Test
	@DisplayName("로그인 목록은 PUBLIC + 본인 비공개까지 보이고 남의 비공개는 안 보인다")
	void 로그인_목록은_공개와_내_비공개() throws Exception {
		long othersPublic = seed(strangerId, "남의 공개", PublishStatus.PUBLIC, 0);
		long myPrivate = seed(ownerId, "내 비공개", PublishStatus.PRIVATE, 0);
		long othersPrivate = seed(strangerId, "남의 비공개", PublishStatus.PRIVATE, 0);

		List<Long> visible = idsOf(mockMvc.perform(get("/api/v1/placements")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(visible).containsExactlyInAnyOrder(othersPublic, myPrivate)
				.doesNotContain(othersPrivate);
	}

	@Test
	@DisplayName("필터보다 가시성이 먼저다 — ?owner=<남의 id>&publishStatus=PRIVATE는 빈 결과다")
	void 남의_비공개는_필터로도_안_열린다() throws Exception {
		seed(strangerId, "남의 비공개", PublishStatus.PRIVATE, 0);

		mockMvc.perform(get("/api/v1/placements")
						.param("owner", String.valueOf(strangerId))
						.param("publishStatus", "PRIVATE")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0))
				.andExpect(jsonPath("$.totalCount").value(0));
	}

	@Test
	@DisplayName("소프트 삭제된 배치는 공개여도 목록에 없다")
	void 삭제된_배치는_안_보인다() throws Exception {
		long deletedId = seed(ownerId, "지운 공개", PublishStatus.PUBLIC, 0);
		jdbc.update("update placement set deleted_at = now() where id = ?", deletedId);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0));
	}

	// --- 필터 ---

	@Test
	@DisplayName("?owner=me는 본인 배치만 돌려준다 — 공개·비공개 모두")
	void owner_me() throws Exception {
		long myPublic = seed(ownerId, "내 공개", PublishStatus.PUBLIC, 0);
		long myPrivate = seed(ownerId, "내 비공개", PublishStatus.PRIVATE, 0);
		seed(strangerId, "남의 공개", PublishStatus.PUBLIC, 0);

		List<Long> mine = idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("owner", "me")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(mine).containsExactlyInAnyOrder(myPublic, myPrivate);
	}

	@Test
	@DisplayName("비로그인 ?owner=me는 401이다 — 빈 결과로 뭉개면 '내 배치가 없음'과 구분이 안 된다")
	void 비로그인_owner_me는_401() throws Exception {
		mockMvc.perform(get("/api/v1/placements").param("owner", "me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("PLACEMENT_OWNER_ME_REQUIRES_LOGIN"));
	}

	@Test
	@DisplayName("?ids=로 여러 배치를 요청 한 번에 받는다")
	void ids_다건_조회() throws Exception {
		long first = seed(ownerId, "1", PublishStatus.PUBLIC, 0);
		long second = seed(ownerId, "2", PublishStatus.PUBLIC, 0);
		long third = seed(ownerId, "3", PublishStatus.PUBLIC, 0);

		List<Long> picked = idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("ids", first + "," + third))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(picked).containsExactlyInAnyOrder(first, third).doesNotContain(second);
	}

	@Test
	@DisplayName("?ids=에 남의 비공개 id를 끼워 넣어도 그 배치는 안 나온다")
	void ids로도_남의_비공개는_안_열린다() throws Exception {
		long mine = seed(ownerId, "내 공개", PublishStatus.PUBLIC, 0);
		long othersPrivate = seed(strangerId, "남의 비공개", PublishStatus.PRIVATE, 0);

		List<Long> picked = idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("ids", mine + "," + othersPrivate)
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(picked).containsExactly(mine);
	}

	@Test
	@DisplayName("?publishStatus=PUBLIC은 내 비공개까지 걸러 낸다")
	void publishStatus_필터() throws Exception {
		long myPublic = seed(ownerId, "내 공개", PublishStatus.PUBLIC, 0);
		seed(ownerId, "내 비공개", PublishStatus.PRIVATE, 0);

		List<Long> picked = idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("publishStatus", "PUBLIC")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(picked).containsExactly(myPublic);
	}

	@Test
	@DisplayName("모르는 publishStatus 값은 400이다")
	void 잘못된_publishStatus는_400() throws Exception {
		mockMvc.perform(get("/api/v1/placements").param("publishStatus", "NOPE"))
				.andExpect(status().isBadRequest());
	}

	@Test
	@DisplayName("?hashtag는 그 태그가 붙은 배치만 남긴다 — 총 개수도 같이 줄어든다")
	void hashtag_필터() throws Exception {
		long tagged = seed(ownerId, "원목 작업실", PublishStatus.PUBLIC, 0);
		long other = seed(ownerId, "게이밍 작업실", PublishStatus.PUBLIC, 0);
		tag(tagged, "원목데스크");
		tag(other, "게이밍");

		mockMvc.perform(get("/api/v1/placements").param("hashtag", "원목데스크"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].id").value(tagged))
				// 목록과 총 개수가 같은 술어를 타야 한다 — 갈리면 "20건이라는데 3건만 보인다"가 된다.
				.andExpect(jsonPath("$.totalCount").value(1));
	}

	@Test
	@DisplayName("태그가 여러 개인 배치도 한 번만 실린다 — 정션을 조인하면 행이 곱해진다")
	void hashtag_필터는_행을_곱하지_않는다() throws Exception {
		long tagged = seed(ownerId, "원목 작업실", PublishStatus.PUBLIC, 0);
		tag(tagged, "원목데스크");
		tag(tagged, "미니멀");

		mockMvc.perform(get("/api/v1/placements").param("hashtag", "원목데스크"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.totalCount").value(1));
	}

	@Test
	@DisplayName("태그 필터에도 가시성이 그대로 걸린다 — 같은 태그의 남의 비공개는 안 나온다")
	void hashtag_필터에도_가시성이_걸린다() throws Exception {
		long mine = seed(ownerId, "내 공개", PublishStatus.PUBLIC, 0);
		long others = seed(strangerId, "남의 비공개", PublishStatus.PRIVATE, 0);
		tag(mine, "원목데스크");
		tag(others, "원목데스크");

		List<Long> picked = idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("hashtag", "원목데스크")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn());

		assertThat(picked).containsExactly(mine);
	}

	// --- 북마크 플래그·필터 ---

	@Test
	@DisplayName("목록 카드의 isBookmarked는 호출자별이다 — 내가 담은 것만 true이고 남이 담은 건 false다")
	void 북마크_플래그() throws Exception {
		long mine = seed(ownerId, "내가 담은 것", PublishStatus.PUBLIC, 0);
		long theirs = seed(ownerId, "남이 담은 것", PublishStatus.PUBLIC, 0);
		bookmark(ownerId, mine, null);
		bookmark(strangerId, theirs, null);

		mockMvc.perform(get("/api/v1/placements").param("ids", String.valueOf(mine))
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].isBookmarked").value(true));
		mockMvc.perform(get("/api/v1/placements").param("ids", String.valueOf(theirs))
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].isBookmarked").value(false));
	}

	@Test
	@DisplayName("비로그인 목록의 isBookmarked는 항상 false다")
	void 비로그인_북마크_플래그() throws Exception {
		long id = seed(ownerId, "공개", PublishStatus.PUBLIC, 0);
		bookmark(ownerId, id, null);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].isBookmarked").value(false))
				.andExpect(jsonPath("$.content[0].bookmarkGroupId").doesNotExist());
	}

	@Test
	@DisplayName("?bookmarked=me는 내가 담은 배치만 돌려준다 — 담은 게 없으면 빈 목록이다")
	void bookmarked_me() throws Exception {
		long picked = seed(ownerId, "담은 것", PublishStatus.PUBLIC, 0);
		seed(ownerId, "안 담은 것", PublishStatus.PUBLIC, 0);
		bookmark(ownerId, picked, null);

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements").param("bookmarked", "me")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(picked);

		// 하나도 안 담은 사용자는 피드 전체가 아니라 빈 목록을 받는다.
		mockMvc.perform(get("/api/v1/placements").param("bookmarked", "me")
						.header("Authorization", bearer(strangerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0))
				.andExpect(jsonPath("$.totalCount").value(0));
	}

	@Test
	@DisplayName("?bookmarked=me는 남의 비공개까지 열지 않는다 — 가시성이 함께 걸린다")
	void bookmarked_me도_가시성이_걸린다() throws Exception {
		long othersPrivate = seed(strangerId, "남의 비공개", PublishStatus.PRIVATE, 0);
		// 공개일 때 담아 둔 뒤 주인이 내린 상황을 만든다.
		jdbc.update("update placement set publish_status = 'PUBLIC' where id = ?", othersPrivate);
		bookmark(ownerId, othersPrivate, null);
		jdbc.update("update placement set publish_status = 'PRIVATE' where id = ?", othersPrivate);

		mockMvc.perform(get("/api/v1/placements").param("bookmarked", "me")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0));
	}

	@Test
	@DisplayName("?bookmarkGroup은 그룹별로 가르고 none은 그룹 미지정만이다")
	void bookmarkGroup_필터() throws Exception {
		long grouped = seed(ownerId, "그룹에 담음", PublishStatus.PUBLIC, 0);
		long ungrouped = seed(ownerId, "그룹 없이 담음", PublishStatus.PUBLIC, 0);
		Long groupId = createGroup(ownerId, "작업실");
		bookmark(ownerId, grouped, groupId);
		bookmark(ownerId, ungrouped, null);

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("bookmarked", "me").param("bookmarkGroup", String.valueOf(groupId))
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(grouped);

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements")
						.param("bookmarked", "me").param("bookmarkGroup", "none")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(ungrouped);

		mockMvc.perform(get("/api/v1/placements").param("ids", String.valueOf(grouped))
						.header("Authorization", bearer(ownerId)))
				.andExpect(jsonPath("$.content[0].bookmarkGroupId").value(groupId));
	}

	@Test
	@DisplayName("비로그인 ?bookmarked=me는 401이고 me 아닌 값·단독 bookmarkGroup은 400이다")
	void 잘못된_북마크_파라미터() throws Exception {
		mockMvc.perform(get("/api/v1/placements").param("bookmarked", "me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("PLACEMENT_BOOKMARKED_ME_REQUIRES_LOGIN"));
		mockMvc.perform(get("/api/v1/placements").param("bookmarked", "all")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isBadRequest());
		mockMvc.perform(get("/api/v1/placements").param("bookmarkGroup", "none")
						.header("Authorization", bearer(ownerId)))
				.andExpect(status().isBadRequest());
	}

	// --- 정렬 ---

	@Test
	@DisplayName("기본 정렬은 최신순이다")
	void 기본은_최신순() throws Exception {
		long first = seed(ownerId, "먼저", PublishStatus.PUBLIC, 0);
		long second = seed(ownerId, "나중", PublishStatus.PUBLIC, 0);
		stampCreatedAt(first, "2026-01-01T00:00:00+09:00");
		stampCreatedAt(second, "2026-02-01T00:00:00+09:00");

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(second, first);
	}

	@Test
	@DisplayName("?sort=popular는 좋아요 수 내림차순이다")
	void 인기순() throws Exception {
		long few = seed(ownerId, "적음", PublishStatus.PUBLIC, 1);
		long many = seed(ownerId, "많음", PublishStatus.PUBLIC, 9);
		long middle = seed(ownerId, "중간", PublishStatus.PUBLIC, 5);

		assertThat(idsOf(mockMvc.perform(get("/api/v1/placements").param("sort", "popular"))
				.andExpect(status().isOk())
				.andReturn())).containsExactly(many, middle, few);
	}

	@Test
	@DisplayName("latest·popular 밖의 sort 값은 400이다")
	void 모르는_sort는_400() throws Exception {
		mockMvc.perform(get("/api/v1/placements").param("sort", "following"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_INPUT"));
	}

	// --- 커서 ---

	@Test
	@DisplayName("최신순 커서를 끝까지 순회해도 중복·누락이 없다 — 같은 created_at이 섞여 있어도 그렇다")
	void 최신순_커서_안정성() throws Exception {
		List<Long> seeded = new ArrayList<>();
		for (int i = 0; i < 7; i++) {
			seeded.add(seed(ownerId, "배치 " + i, PublishStatus.PUBLIC, 0));
		}
		// 동점 구간을 일부러 만든다 — 정렬키가 created_at 하나뿐이면 여기서 항목이 밀린다.
		seeded.forEach(id -> stampCreatedAt(id, "2026-03-01T12:00:00+09:00"));

		assertThat(walkAllPages("latest")).containsExactlyInAnyOrderElementsOf(seeded);
	}

	@Test
	@DisplayName("인기순 커서를 끝까지 순회해도 중복·누락이 없다 — 같은 like_count가 섞여 있어도 그렇다")
	void 인기순_커서_안정성() throws Exception {
		List<Long> seeded = new ArrayList<>();
		for (int i = 0; i < 7; i++) {
			// 좋아요 수를 일부러 겹치게 심는다(0,1,0,1,...).
			seeded.add(seed(ownerId, "배치 " + i, PublishStatus.PUBLIC, i % 2));
		}

		assertThat(walkAllPages("popular")).containsExactlyInAnyOrderElementsOf(seeded);
	}

	@Test
	@DisplayName("마지막 페이지는 hasNext=false·nextCursor=null이다")
	void 마지막_페이지() throws Exception {
		seed(ownerId, "하나", PublishStatus.PUBLIC, 0);

		mockMvc.perform(get("/api/v1/placements").param("size", "10"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.hasNext").value(false))
				.andExpect(jsonPath("$.nextCursor").doesNotExist());
	}

	@Test
	@DisplayName("깨진 커서는 400이다")
	void 깨진_커서는_400() throws Exception {
		mockMvc.perform(get("/api/v1/placements").param("cursor", "!!not-base64!!"))
				.andExpect(status().isBadRequest());
	}

	// --- 응답 본문 ---

	@Test
	@DisplayName("목록 한 줄에 작성자·좋아요 수가 실리고 캡처 전 배치의 썸네일 URL은 null이다")
	void 요약_필드() throws Exception {
		long id = seed(ownerId, "제목", PublishStatus.PUBLIC, 3);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(id))
				.andExpect(jsonPath("$.content[0].title").value("제목"))
				.andExpect(jsonPath("$.content[0].publishStatus").value("PUBLIC"))
				.andExpect(jsonPath("$.content[0].likeCount").value(3))
				.andExpect(jsonPath("$.content[0].ownerId").value(ownerId))
				.andExpect(jsonPath("$.content[0].ownerNickname").value("주인"))
				// 상세와 같은 계약이다 — 캡처 전이면 null이고 프론트가 폴백 표지를 그린다.
				.andExpect(jsonPath("$.content[0].thumbnailUrl").doesNotExist())
				// 업로드 전이라 대표 상상도도 없다.
				.andExpect(jsonPath("$.content[0].primaryImageUrl").doesNotExist());
	}

	@Test
	@DisplayName("공개 전환 때 붙인 태그가 목록 한 줄에 실린다 — '#'은 붙지 않고 없으면 빈 배열이다")
	void 요약_태그() throws Exception {
		long tagged = seed(ownerId, "태그 있음", PublishStatus.PUBLIC, 0);
		tag(tagged, "원목데스크");
		long untagged = seed(ownerId, "태그 없음", PublishStatus.PUBLIC, 0);

		mockMvc.perform(get("/api/v1/placements").param("ids", String.valueOf(tagged)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].tags").value(Matchers.contains("원목데스크")));

		mockMvc.perform(get("/api/v1/placements").param("ids", String.valueOf(untagged)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].tags").isEmpty());
	}

	@Test
	@DisplayName("썸네일을 등록한 배치는 목록에 presigned GET URL이 실린다")
	void 썸네일_URL() throws Exception {
		long id = seed(ownerId, "제목", PublishStatus.PUBLIC, 0);
		jdbc.update("update placement set thumbnail_key = ? where id = ?",
				"placement-thumbnails/" + id + ".png", id);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].thumbnailUrl").isNotEmpty());
	}

	@Test
	@DisplayName("발행된 배치의 표지는 대표 상상도다 — primaryImageUrl은 상상도 key로 서명되고 "
			+ "thumbnailUrl은 그대로 스크린샷이다")
	void 대표_상상도_URL() throws Exception {
		long id = seed(ownerId, "발행됨", PublishStatus.PUBLIC, 0);
		jdbc.update("update placement set thumbnail_key = ? where id = ?",
				"placement-thumbnails/" + id + ".png", id);
		primaryImage(ownerId, id, "generated-images/" + id + "/primary.png");

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].primaryImageUrl")
						.value(Matchers.containsString("primary.png")))
				// 스크린샷과 상상도는 다른 것이다(ADR-0015 결정 7) — 한쪽이 다른 쪽을 덮지 않는다.
				.andExpect(jsonPath("$.content[0].thumbnailUrl")
						.value(Matchers.containsString("placement-thumbnails")));
	}

	@Test
	@DisplayName("대표가 아닌 상상도만 있는 배치의 primaryImageUrl은 null이다")
	void 발행_전_대표_상상도_없음() throws Exception {
		long id = seed(ownerId, "발행 전", PublishStatus.PUBLIC, 0);
		generatedImage(ownerId, id, "generated-images/" + id + "/side.png", false);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].primaryImageUrl").doesNotExist());
	}

	@Test
	@DisplayName("작성자가 탈퇴해 user_id가 NULL인 공개 배치도 목록에 남는다")
	void 작성자_없는_공개_배치() throws Exception {
		long id = seed(ownerId, "주인 없음", PublishStatus.PUBLIC, 0);
		jdbc.update("update placement set user_id = null where id = ?", id);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(1))
				.andExpect(jsonPath("$.content[0].ownerId").doesNotExist())
				.andExpect(jsonPath("$.content[0].ownerNickname").doesNotExist());
	}

	@Test
	@DisplayName("주인 없는 비공개 배치는 비로그인에게 안 보인다 — NULL = NULL로 통과하지 않는다")
	void 주인_없는_비공개는_익명에게도_안_보인다() throws Exception {
		long id = seed(ownerId, "주인 없는 비공개", PublishStatus.PRIVATE, 0);
		jdbc.update("update placement set user_id = null where id = ?", id);

		mockMvc.perform(get("/api/v1/placements"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content.length()").value(0));
	}

	// --- 도우미 ---

	/**
	 * 배치 한 건을 심는다. {@code publish_status}·{@code like_count}는 API로 정할 수 없는 값이라
	 * (서버만 정한다) 저장 후 JDBC로 직접 넣는다.
	 */
	private long seed(Long userId, String title, PublishStatus publishStatus, int likeCount) {
		Placement placement =
				placements.save(Placement.create(users.getReferenceById(userId), title, null, null));
		jdbc.update("update placement set publish_status = ?, like_count = ? where id = ?",
				publishStatus.name(), likeCount, placement.getId());
		return placement.getId();
	}

	/**
	 * 태그를 직접 심는다. <b>{@code hashtag} 마스터는 이름으로 재사용한다</b>(정션만 새로 만든다) —
	 * {@code uq_hashtag_name}이 살아 있는 이름의 중복을 막으므로, 두 배치에 같은 태그를 다는 순간
	 * 무조건 INSERT하면 죽는다. 서비스의 {@code resolveHashtags}와 같은 규칙이다.
	 */
	private void tag(long placementId, String name) {
		Long hashtagId = jdbc.query("select id from hashtag where name = ? and deleted_at is null",
						(rs, row) -> rs.getLong("id"), name).stream().findFirst()
				.orElseGet(() -> jdbc.queryForObject("""
						insert into hashtag (id, name, created_at)
						values (nextval('hashtag_id_seq'), ?, now())
						returning id
						""", Long.class, name));
		jdbc.update("""
				insert into placement_hashtag (id, placement_id, hashtag_id, created_at)
				values (nextval('placement_hashtag_id_seq'), ?, ?, now())
				""", placementId, hashtagId);
	}

	/**
	 * 북마크를 직접 심는다. {@code community} 서비스를 부르지 않는 이유는 이 테스트가 검증하려는 게
	 * 배치 목록 쪽 배선이기 때문이다 — 저쪽 서비스가 바뀌어도 여기 단언은 그대로 서야 한다.
	 */
	private void bookmark(Long userId, long placementId, Long groupId) {
		jdbc.update("""
				insert into placement_bookmark
					(id, user_id, placement_id, placement_bookmark_group_id, created_at, updated_at)
				values (nextval('placement_bookmark_id_seq'), ?, ?, ?, now(), now())
				""", userId, placementId, groupId);
	}

	/**
	 * 대표 상상도 1행을 직접 심는다. 업로드 파이프라인({@code PUT /placements/{id}/feed-entry})을
	 * 거치지 않는 이유는 북마크와 같다 — 여기서 검증하는 건 목록 쪽 배선이다.
	 */
	private void primaryImage(Long userId, long placementId, String imageKey) {
		generatedImage(userId, placementId, imageKey, true);
	}

	private void generatedImage(
			Long userId, long placementId, String imageKey, boolean isPrimary) {
		jdbc.update("""
				insert into generated_image
					(id, user_id, placement_id, image_key, time_of_day, is_primary, created_at)
				values (nextval('generated_image_id_seq'), ?, ?, ?, 'DAY', ?, now())
				""", userId, placementId, imageKey, isPrimary);
	}

	private Long createGroup(Long userId, String title) {
		return jdbc.queryForObject("""
				insert into placement_bookmark_group (id, user_id, title, created_at, updated_at)
				values (nextval('placement_bookmark_group_id_seq'), ?, ?, now(), now())
				returning id
				""", Long.class, userId, title);
	}

	private void stampCreatedAt(long placementId, String createdAt) {
		jdbc.update("update placement set created_at = ?::timestamptz where id = ?", createdAt,
				placementId);
	}

	/** 페이지 크기 3으로 끝까지 순회하며 만난 id를 모은다. 중복은 그대로 남아 단언에 걸린다. */
	private List<Long> walkAllPages(String sort) throws Exception {
		List<Long> seen = new ArrayList<>();
		String cursor = null;
		for (int page = 0; page < 10; page++) {
			MvcResult result = mockMvc.perform(cursor == null
							? get("/api/v1/placements").param("sort", sort).param("size", "3")
							: get("/api/v1/placements").param("sort", sort).param("size", "3")
									.param("cursor", cursor))
					.andExpect(status().isOk())
					.andReturn();
			JsonNode body = read(result);
			seen.addAll(idsOf(result));
			if (!body.get("hasNext").asBoolean()) {
				return seen;
			}
			cursor = body.get("nextCursor").asText();
		}
		throw new AssertionError("커서가 10페이지 안에 끝나지 않았다 — 순회가 멈추지 않는다");
	}

	private List<Long> idsOf(MvcResult result) throws Exception {
		List<Long> ids = new ArrayList<>();
		for (JsonNode row : read(result).get("content")) {
			ids.add(row.get("id").asLong());
		}
		return ids;
	}

	private JsonNode read(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
