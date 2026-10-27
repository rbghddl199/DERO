---
name: springboot-security
description: Spring Security 배선 참조 — 인증 필터·메서드 인가·CSRF·CORS·보안 헤더·쿠키 플래그·비밀번호 해싱·레이트 리미팅·파일 업로드 검증. "SecurityConfig 손볼게", "CORS 막혔다", "@PreAuthorize 어떻게", "JWT 필터", "레이트 리밋", "릴리스 전 보안 점검" 같은 요청에 쓴다.
---

# Spring Security 배선 패턴

Vendored from ECC `springboot-security` (2026-08-13, ADR-0042). 일반 지식이고, **충돌하면 `.claude/rules/java/architecture.md`(§4·§8·§9·§15 — 에러 응답·로그 마스킹·검증 정본)와 `global/security` 실제 배선이 이긴다.**

**Dedup (2026-08-13, 개정 2026-08-14):** 원본의 시크릿 관리·SQL 인젝션·입력 검증·의존성 스캔·에러 메시지 절은 삭제했다 — 같은 축의 프로젝트 규약은 `architecture.md` §4·§8(BusinessException+ErrorCode, ProblemDetail 수기 금지)·§9(토큰·비번·PII 로그 금지)·§15(Bean Validation)가 정본이다(옛 java 보안 rules 파일은 정본 중복이라 2026-08-14 삭제, rules-diet 10). 이 파일은 **배선(설정) 축**만 남긴다.

## 인증

- 세션 쿠키를 쓰면 `httpOnly` · `Secure` · `SameSite`를 전부 명시한다.
- 토큰 검증은 `OncePerRequestFilter` 또는 리소스 서버 설정에서 한다. 리프레시 토큰 저장 정본은 Redis(ADR-0005).

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    String header = req.getHeader(HttpHeaders.AUTHORIZATION);
    if (header != null && header.startsWith("Bearer ")) {
      SecurityContextHolder.getContext().setAuthentication(jwtService.authenticate(header.substring(7)));
    }
    chain.doFilter(req, res);
  }
}
```

- 필터가 던지는 인증 실패는 `AuthenticationEntryPoint`/`AccessDeniedHandler`로 흘러야 응답 포맷이 유지된다 — `SecurityContextHolder`는 요청 끝에 비워진다(스레드 재사용).

## 인가

- `@EnableMethodSecurity` 후 `@PreAuthorize("hasRole('ADMIN')")` 또는 `@PreAuthorize("@authz.isOwner(#id, authentication)")`.
- **기본은 deny**: `anyRequest().authenticated()`를 마지막에 두고 공개 경로만 위에서 허용한다.
- 소유권 검사는 서비스 경계에서도 한 번 더 — 컨트롤러 애노테이션만으로는 내부 호출 경로가 뚫린다.

## 비밀번호

```java
@Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
```

직접 해싱하지 않는다. 평문 저장·비교 금지.

## CSRF

- 브라우저 세션 앱: CSRF 활성 유지 + 토큰 전달.
- Bearer 토큰 기반 순수 API: `csrf.disable()` + `SessionCreationPolicy.STATELESS`.

## CORS

시큐리티 필터 레벨에서 한 곳으로 설정한다(컨트롤러마다 `@CrossOrigin` 금지). 운영 오리진에 `*` 금지, `allowCredentials(true)`와 `*`는 애초에 함께 못 쓴다.

```java
@Bean
CorsConfigurationSource corsConfigurationSource() {
  CorsConfiguration config = new CorsConfiguration();
  config.setAllowedOrigins(List.of("https://www.dero.life"));
  config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
  config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
  config.setAllowCredentials(true);
  UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
  source.registerCorsConfiguration("/api/**", config);
  return source;
}
// http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
```

- 프리플라이트가 401로 죽으면 CORS가 아니라 **필터 순서** 문제다. nginx가 CORS 헤더를 함께 붙이면 헤더가 2벌로 나가 브라우저가 거부한다 — 한쪽만 붙인다(`docs/context/deployment.md`).

## 보안 헤더

```java
http.headers(h -> h
    .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
    .frameOptions(HeadersConfigurer.FrameOptionsConfig::sameOrigin)
    .referrerPolicy(rp -> rp.policy(ReferrerPolicy.NO_REFERRER)));
```

## 레이트 리미팅

- 비싼 엔드포인트(로그인·AI 생성·업로드)에 Bucket4j 또는 nginx 레벨 제한. 429 + 재시도 힌트를 돌려준다.
- **클라이언트 식별은 `request.getRemoteAddr()`로만.** `X-Forwarded-For`는 위조 가능하다 — 프록시 뒤라면 `server.forward-headers-strategy`를 설정해 `getRemoteAddr()`가 실 IP를 주게 만든다(`springboot-patterns` 필터 절).
- 인메모리 버킷은 인스턴스마다 따로 센다 — 다중 인스턴스라면 Redis 카운터(`redis-patterns`).

## 파일 업로드

크기·MIME·확장자를 전부 검증하고, 원본 파일명을 경로에 쓰지 않는다. 이 리포의 프리사인·키 규칙 정본은 `.claude/rules/backend/upload-image-pipeline.md`·`storage-and-ai-ports.md`.

## 릴리스 전 체크리스트

- [ ] 토큰 만료·폐기 경로 동작
- [ ] 민감 경로마다 인가 가드(서비스 경계 포함)
- [ ] CSRF 포지션이 앱 유형과 맞음
- [ ] CORS 오리진이 운영 도메인으로 한정, 헤더 2벌 아님
- [ ] 보안 헤더 설정
- [ ] 비싼 엔드포인트에 레이트 리밋
- [ ] 로그에 토큰·비밀번호·PII 없음
- [ ] 업로드 크기·타입 검증
