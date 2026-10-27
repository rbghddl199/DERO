package com.brunchies.dero.user.controller;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.UserRole;
import com.brunchies.dero.user.dto.UserMeResponse;
import com.brunchies.dero.user.service.ConsentService;
import com.brunchies.dero.user.service.UserService;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code Authentication.getName()}(=JWT {@code sub}) → {@code UserService} 위임만 검증한다(REQ-USR-01).
 *
 * <p>{@code addFilters = false}라 실제 시큐리티 필터 체인이 안 돈다 — {@code Authentication}은
 * {@code SecurityMockMvcRequestPostProcessors.authentication(...)}가 아니라(그건 필터가 세션의
 * {@code SecurityContext}를 읽어야 동작한다) {@code MockHttpServletRequestBuilder.principal(...)}로
 * 서블릿 요청에 직접 꽂는다 — 필터 없이도 {@code Authentication}을 구현한 {@code Principal}이 그대로
 * {@code request.getUserPrincipal()}로 나온다.
 */
@WebMvcTest(controllers = UserController.class)
@AutoConfigureMockMvc(addFilters = false)
class UserControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private UserService userService;

	// UserController가 동의 기록 핸들러 때문에 같이 주입받는다 — 이 테스트는 부르지 않는다.
	@MockitoBean
	private ConsentService consentService;

	@Test
	@DisplayName("인증된 사용자 id로 UserService에 위임하고 그대로 내려준다")
	void 본인_조회() throws Exception {
		given(userService.getMe(42L)).willReturn(
				new UserMeResponse(42L, "dero@example.com", "박동규", null, Provider.KAKAO, UserRole.USER,
						false, OffsetDateTime.parse("2026-07-01T00:00:00+09:00")));

		mockMvc.perform(get("/api/v1/users/me")
						.principal(new TestingAuthenticationToken("42", null)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(42))
				.andExpect(jsonPath("$.nickname").value("박동규"))
				.andExpect(jsonPath("$.provider").value("KAKAO"));
	}

	@Test
	@DisplayName("회원 탈퇴 — 인증된 사용자 id로 UserService에 위임하고 204")
	void 회원_탈퇴() throws Exception {
		mockMvc.perform(delete("/api/v1/users/me")
						.principal(new TestingAuthenticationToken("42", null)))
				.andExpect(status().isNoContent());

		verify(userService).withdraw(42L);
	}
}
