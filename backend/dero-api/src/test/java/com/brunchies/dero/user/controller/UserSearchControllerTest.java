package com.brunchies.dero.user.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractElasticsearchIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import com.brunchies.dero.user.service.UserSearchService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 닉네임 자동완성 {@code GET /users/search}를 진짜 ES + Nori로 검증한다
 * (DERO-604, D35·ADR-0038 결정 3).
 *
 * <p>못 박는 것 넷이다. ① <b>비로그인은 401이다</b> — 이 엔드포인트를 인증 뒤에 두는 유일한 목적이
 * 닉네임 열거 차단이고, {@code SecurityConfig}에서 {@code /users/*} permitAll보다 <b>앞에</b>
 * 선언되지 않으면 조용히 열린다. ② <b>공백뿐인 질의는 400</b> — 0자를 허용하면 그것이 곧 전체
 * 사용자 목록이다. ③ <b>부분 일치로 걸린다</b>(기존 {@code users} 인덱스 재활용 — 색인 신설 없음).
 * ④ <b>결과는 10명을 넘지 않는다</b>.
 *
 * <p>테스트 트랜잭션을 끄는 이유는 {@code PostSearchPersistenceTest}와 같다 — 색인 경로가 커밋을
 * 요구한다.
 */
@AutoConfigureMockMvc
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class UserSearchControllerTest extends AbstractElasticsearchIntegrationTest {

	/** 상한(10)보다 많아야 "10명을 넘지 않는다"가 성립한다. */
	private static final int CANDIDATES = 12;

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtIssuer jwtIssuer;

	@Autowired
	private UserRepository users;

	@Autowired
	private UserSearchService userSearchService;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private PlatformTransactionManager transactionManager;

	private Long viewerId;

	@BeforeEach
	void setUp() {
		viewerId = new TransactionTemplate(transactionManager).execute(status -> {
			Long id = save("viewer@example.com", "p-viewer", "구경꾼").getId();
			save("desk@example.com", "p-desk", "책상장인");
			for (int i = 0; i < CANDIDATES; i++) {
				save("tester" + i + "@example.com", "p-tester-" + i, "tester" + i);
			}
			return id;
		});
		userSearchService.reindexAll();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("TRUNCATE TABLE \"user\" CASCADE");
	}

	@Test
	@DisplayName("비로그인 자동완성은 401이다 — 닉네임 열거 통로를 막는다")
	void 비로그인은_401() throws Exception {
		mockMvc.perform(get("/api/v1/users/search").param("q", "책상"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("공백뿐인 질의는 400이다 — 0자 질의는 전체 사용자 목록이 된다")
	void 빈_질의는_400() throws Exception {
		mockMvc.perform(get("/api/v1/users/search")
						.param("q", "  ")
						.header("Authorization", bearer(viewerId)))
				.andExpect(status().isBadRequest());
	}

	@Test
	@DisplayName("닉네임 일부만 쳐도 걸린다 — 기존 users 인덱스를 그대로 쓴다")
	void 부분_일치() throws Exception {
		mockMvc.perform(get("/api/v1/users/search")
						.param("q", "책상")
						.header("Authorization", bearer(viewerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.nickname == '책상장인')]").exists())
				.andExpect(jsonPath("$[0].userId").isNumber());
	}

	@Test
	@DisplayName("후보가 많아도 10명까지만 답한다")
	void 상한_10() throws Exception {
		mockMvc.perform(get("/api/v1/users/search")
						.param("q", "tester")
						.header("Authorization", bearer(viewerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(10));
	}

	@Test
	@DisplayName("탈퇴한 사용자는 후보에 없다 — 색인에서도 빠지고 조회에서도 걸러진다")
	void 탈퇴자는_후보가_아니다() throws Exception {
		Long deskMasterId = users.findAllByDeletedAtIsNull().stream()
				.filter(user -> "책상장인".equals(user.getNickname()))
				.findFirst()
				.orElseThrow()
				.getId();
		new TransactionTemplate(transactionManager).executeWithoutResult(
				status -> users.findById(deskMasterId).orElseThrow().withdraw());
		userSearchService.reindexAll();

		mockMvc.perform(get("/api/v1/users/search")
						.param("q", "책상")
						.header("Authorization", bearer(viewerId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}

	private User save(String email, String providerId, String nickname) {
		return users.save(User.create(email, Provider.KAKAO, providerId, nickname));
	}

	private String bearer(Long userId) {
		return "Bearer " + jwtIssuer.issueAccessToken(userId, UserRole.USER);
	}
}
