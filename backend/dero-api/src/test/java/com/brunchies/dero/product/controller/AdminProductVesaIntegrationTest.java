package com.brunchies.dero.product.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.auth.service.JwtIssuer;
import com.brunchies.dero.catalog.Brand;
import com.brunchies.dero.catalog.Category;
import com.brunchies.dero.catalog.VesaSpec;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.VesaSpecRepository;
import com.brunchies.dero.product.PanelShape;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AdminProductCreateRequest;
import com.brunchies.dero.product.dto.AdminProductPatchRequest;
import com.brunchies.dero.product.dto.AdminProductResponse;
import com.brunchies.dero.product.dto.MonitorSpecRequest;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.UserRole;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/**
 * VESA 태깅의 <b>HTTP 왕복</b>을 검증한다(DERO-336).
 *
 * <p>태깅 동작 자체는 이미 서비스 계층에서 덮여 있다 —
 * {@code AdminProductServicePersistenceTest}가 diff 교체·겹치는 집합·중복 id·삭제된 규격까지 본다.
 * <b>그 파일이 볼 수 없는 것</b>이 여기 있다: {@code vesaSpecIds}가 요청 JSON에서 실제로
 * 역직렬화되는가, {@code ProductDetailResponse.vesaSpecs}가 프론트가 읽는 응답 본문으로 실제로
 * <b>직렬화</b>되는가, 없는 VESA id가 500이 아니라 {@code code}를 가진 4xx {@code ProblemDetail}로
 * 나가는가. 서비스를 직접 부르는 테스트는 셋 중 어느 것도 지나가지 않는다.
 *
 * <p><b>회귀 테스트를 여기로 옮기지 않는다</b> — diff 교체·겹침 회귀는 서비스 테스트에 남는다.
 * 같은 것을 두 계층에서 보면 한쪽만 고쳐도 초록이 유지된다.
 *
 * <p><b>{@code @Transactional} 롤백과 MockMvc</b>: 베이스가 {@code @Transactional}이라 MockMvc
 * 요청 핸들러가 테스트 트랜잭션에 그대로 참여한다 — {@code setUp}의 마스터 데이터가 요청 안에서
 * 보이고 끝나면 전부 롤백된다({@code AuthSessionIntegrationTest}가 같은 판단을 이미 했다).
 * 그래서 단계 사이에 {@code flush()} + {@code clear()}를 넣는다 — 한 영속성 컨텍스트로 등록·수정·
 * 조회를 이어 붙이면 {@code orphanRemoval}·{@code @MapsId}가 로드 스냅샷을 보고 다르게 동작한다
 * ({@code product/CLAUDE.md}).
 */
@AutoConfigureMockMvc
class AdminProductVesaIntegrationTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private ProductRepository productRepository;

	@Autowired
	private BrandRepository brandRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private VesaSpecRepository vesaSpecRepository;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JwtIssuer jwtIssuer;

	private String adminBearer;
	private Long brandId;
	private Long categoryId;
	private Long vesa75Id;
	private Long vesa100Id;

	@BeforeEach
	void setUp() {
		// /admin/** 는 hasRole("ADMIN")이라 진짜 토큰이 필요하다 — user 행은 필요 없다(리소스 서버는
		// 클레임만 본다, SecurityProblemDetailTest와 같은 방식).
		adminBearer = "Bearer " + jwtIssuer.issueAccessToken(1L, UserRole.ADMIN);
		brandId = brandRepository.save(Brand.create("델", null, null, null)).getId();
		categoryId = categoryRepository.save(Category.createRoot("모니터", null, 1)).getId();
		vesa75Id = vesaSpecRepository.save(VesaSpec.create(75, 75)).getId();
		vesa100Id = vesaSpecRepository.save(VesaSpec.create(100, 100)).getId();
	}

	@Test
	@DisplayName("VESA 2건으로 등록하면 상세에 2건, PATCH로 1건 교체하면 상세에 1건이다")
	void 등록_상세_교체_상세() throws Exception {
		Long productId = 등록(모니터_등록(List.of(vesa75Id, vesa100Id)));

		entityManager.flush();
		entityManager.clear();

		// 응답이 실어야 하는 것은 id가 아니라 값이다 — 판정 엔진이 읽는 게 width×height다.
		mockMvc.perform(get("/api/v1/products/{productId}", productId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.vesaSpecs", hasSize(2)))
				.andExpect(jsonPath("$.vesaSpecs[0].widthMm").value(75))
				.andExpect(jsonPath("$.vesaSpecs[0].heightMm").value(75))
				.andExpect(jsonPath("$.vesaSpecs[1].widthMm").value(100))
				.andExpect(jsonPath("$.vesaSpecs[1].heightMm").value(100));

		mockMvc.perform(patch("/api/v1/admin/products/{productId}", productId)
						.header(HttpHeaders.AUTHORIZATION, adminBearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(VESA_수정(List.of(vesa100Id)))))
				.andExpect(status().isOk());

		entityManager.flush();
		entityManager.clear();

		mockMvc.perform(get("/api/v1/products/{productId}", productId))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.vesaSpecs", hasSize(1)))
				.andExpect(jsonPath("$.vesaSpecs[0].widthMm").value(100))
				.andExpect(jsonPath("$.vesaSpecs[0].heightMm").value(100));
	}

	@Test
	@DisplayName("존재하지 않는 VESA 규격 id로 등록하면 404이고 제품은 만들어지지 않는다")
	void 등록_없는_VESA_규격() throws Exception {
		AdminProductCreateRequest 본문 = 모니터_등록(List.of(vesa100Id + 9_999L));

		mockMvc.perform(post("/api/v1/admin/products")
						.header(HttpHeaders.AUTHORIZATION, adminBearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(본문)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("PRODUCT_VESA_SPEC_NOT_FOUND"));

		entityManager.flush();
		entityManager.clear();

		assertThat(productRepository.count()).isZero();
	}

	/** 201 + {@code Location}을 확인하고 본문에서 생성된 id를 꺼낸다. */
	private Long 등록(AdminProductCreateRequest 본문) throws Exception {
		String body = mockMvc.perform(post("/api/v1/admin/products")
						.header(HttpHeaders.AUTHORIZATION, adminBearer)
						.contentType(MediaType.APPLICATION_JSON)
						.content(objectMapper.writeValueAsString(본문)))
				.andExpect(status().isCreated())
				.andExpect(header().exists("Location"))
				.andReturn()
				.getResponse()
				.getContentAsString();
		return objectMapper.readValue(body, AdminProductResponse.class).id();
	}

	private AdminProductCreateRequest 모니터_등록(List<Long> vesaSpecIds) {
		return new AdminProductCreateRequest(SpecType.MONITOR, brandId, categoryId, "U2723QE", null,
				700_000, "https://example.com/u2723qe", vesaSpecIds, null,
				new MonitorSpecRequest(new BigDecimal("27.0"), 16, 9, 8, null, PanelShape.FLAT, null,
						130, true, true, null, null, null, null, 5_000, List.of("HDMI 2.0", "DP 1.4")),
				null, null, null);
	}

	private AdminProductPatchRequest VESA_수정(List<Long> vesaSpecIds) {
		return new AdminProductPatchRequest(null, null, null, null, null, null, null, null,
				vesaSpecIds, null, null, null, null, null);
	}
}
