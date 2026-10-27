package com.brunchies.dero.placement.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 템플릿 시딩·해제의 <b>HTTP 왕복과 권한</b>을 검증한다(DERO-347, REQ-ADM-03).
 *
 * <p><b>권한 거부를 여기서만 볼 수 있다</b> — {@code /api/v1/admin/**}의 {@code hasRole("ADMIN")}은
 * {@code SecurityConfig}에 있어서 {@code @WebMvcTest(addFilters = false)} 슬라이스로는 지나가지
 * 않는다. 그래서 필터를 살린 통합 테스트다({@code AdminProductVesaIntegrationTest}와 같은 판단).
 *
 * <p>토글 상태는 <b>목록 응답을 다시 읽어</b> 확인한다 — 엔티티만 보면 "재조회 후에도 상태가
 * 유지된다"는 프론트 계약이 안 덮이고, 실제로 응답에 {@code isTemplate}이 실리는지도 안 보인다.
 */
@AutoConfigureMockMvc
class AdminPlacementTemplateIntegrationTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JwtIssuer jwtIssuer;

	private String adminBearer;
	private String userBearer;
	private Long ownerId;
	private Long placementId;

	@BeforeEach
	void setUp() {
		User owner = users.save(
				User.create("seeder@example.com", Provider.KAKAO, "provider-seeder", "운영진"));
		ownerId = owner.getId();
		adminBearer = "Bearer " + jwtIssuer.issueAccessToken(ownerId, UserRole.ADMIN);
		userBearer = "Bearer " + jwtIssuer.issueAccessToken(ownerId, UserRole.USER);
		placementId = placements.save(Placement.create(owner, "운영진 시드 책상", null, null)).getId();
	}

	@Test
	@DisplayName("관리자가 PUT하면 204이고 목록의 isTemplate이 true로 바뀐다")
	void 템플릿_지정() throws Exception {
		mockMvc.perform(put("/api/v1/admin/placements/{id}/template", placementId)
						.header(HttpHeaders.AUTHORIZATION, adminBearer))
				.andExpect(status().isNoContent());

		entityManager.flush();
		entityManager.clear();

		목록의_isTemplate(true);
	}

	@Test
	@DisplayName("관리자가 DELETE하면 204이고 목록의 isTemplate이 false로 돌아온다")
	void 템플릿_해제() throws Exception {
		mockMvc.perform(put("/api/v1/admin/placements/{id}/template", placementId)
						.header(HttpHeaders.AUTHORIZATION, adminBearer))
				.andExpect(status().isNoContent());

		entityManager.flush();
		entityManager.clear();

		mockMvc.perform(delete("/api/v1/admin/placements/{id}/template", placementId)
						.header(HttpHeaders.AUTHORIZATION, adminBearer))
				.andExpect(status().isNoContent());

		entityManager.flush();
		entityManager.clear();

		목록의_isTemplate(false);
	}

	@Test
	@DisplayName("없는 배치를 템플릿으로 지정하면 404 PLACEMENT_NOT_FOUND다")
	void 없는_배치() throws Exception {
		mockMvc.perform(put("/api/v1/admin/placements/{id}/template", placementId + 9_999L)
						.header(HttpHeaders.AUTHORIZATION, adminBearer))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PLACEMENT_NOT_FOUND"));
	}

	@Test
	@DisplayName("일반 사용자는 배치 소유자여도 두 경로 모두 403이고 상태가 안 바뀐다")
	void 일반_사용자_거부() throws Exception {
		mockMvc.perform(put("/api/v1/admin/placements/{id}/template", placementId)
						.header(HttpHeaders.AUTHORIZATION, userBearer))
				.andExpect(status().isForbidden());

		mockMvc.perform(delete("/api/v1/admin/placements/{id}/template", placementId)
						.header(HttpHeaders.AUTHORIZATION, userBearer))
				.andExpect(status().isForbidden());

		entityManager.flush();
		entityManager.clear();

		assertThat(placements.findByIdAndDeletedAtIsNull(placementId))
				.get()
				.extracting(Placement::isTemplate)
				.isEqualTo(false);
	}

	@Test
	@DisplayName("비로그인은 두 경로 모두 401이다")
	void 비로그인_거부() throws Exception {
		mockMvc.perform(put("/api/v1/admin/placements/{id}/template", placementId))
				.andExpect(status().isUnauthorized());

		mockMvc.perform(delete("/api/v1/admin/placements/{id}/template", placementId))
				.andExpect(status().isUnauthorized());
	}

	/** {@code ?owner=me}는 운영진이 자기 배치를 훑는 경로 그대로다 — 관리자 전용 목록을 새로 파지 않았다. */
	private void 목록의_isTemplate(boolean expected) throws Exception {
		mockMvc.perform(get("/api/v1/placements")
						.param("owner", "me")
						.header(HttpHeaders.AUTHORIZATION, adminBearer))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.content[0].id").value(placementId))
				.andExpect(jsonPath("$.content[0].isTemplate").value(expected));
	}
}
