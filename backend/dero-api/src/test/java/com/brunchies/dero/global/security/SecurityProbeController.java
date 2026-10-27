package com.brunchies.dero.global.security;

import org.springframework.web.bind.annotation.RestController;

/**
 * {@link SecurityProblemDetailTest}가 컨트롤러 레이어를 안 띄우게 하는 자리표시자. 매핑이 하나도 없는
 * 게 의도다 — 그 테스트는 필터 층만 검증하고 어떤 컨트롤러도 부르지 않는다(전부 컨트롤러가 없는
 * 경로를 호출해 "404지 401이 아니다"로 인증 통과를 확인한다).
 *
 * <p>{@code @WebMvcTest}의 {@code controllers} 범위를 이 클래스 하나로 좁혀 실제 도메인 컨트롤러가
 * 스캔되지 않게 한다. 그래야 새 컨트롤러가 생겨도 그 서비스 빈을 목으로 채울 필요가 없다.
 */
@RestController
class SecurityProbeController {
}
