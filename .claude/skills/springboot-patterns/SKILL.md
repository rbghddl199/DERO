---
name: springboot-patterns
description: Spring 캐시·비동기·필터·페이징·재시도·관측 패턴 참조. "캐시 붙여줘", "@Async 써도 되나", "필터 추가", "재시도 로직", "페이징 정렬", "메트릭 노출" 같은 요청이나 Spring 캐시·스케줄러·OncePerRequestFilter 코드를 쓸 때 쓴다.
---

# Spring Boot 패턴 — 캐시 · 비동기 · 필터 · 관측

Vendored from ECC `springboot-patterns` (2026-08-13, ADR-0042). 일반 지식이고, **충돌하면 `.claude/rules/java/*.md`와 `backend/CLAUDE.md`가 이긴다.**

**Dedup (2026-08-13):** 원본의 REST 컨트롤러 구조·리포지토리·서비스 트랜잭션·DTO 검증·예외 처리·SLF4J 로깅·생성자 주입·`readOnly` 절은 전부 삭제했다 — `.claude/rules/java/architecture.md` §1·§8~§10·§14~§15가 같은 내용을 프로젝트 규약으로 이미 강제한다(rules 승). 레이트 리미팅은 `springboot-security`에만 둔다.

## 캐시

`@EnableCaching`이 설정 클래스에 있어야 동작한다.

```java
@Cacheable(value = "market", key = "#id")
public Market getById(Long id) { ... }

@CacheEvict(value = "market", key = "#id")
public void evict(Long id) {}
```

- 프록시 기반이라 **같은 빈 안에서 자기 메서드를 호출하면 캐시가 안 걸린다**.
- 캐시 이름마다 TTL·직렬화를 정한다. Redis 캐시 매니저 쪽 키 설계·TTL은 `redis-patterns`.

## 비동기

`@EnableAsync` 필요. 기본 executor(가상 스레드 또는 풀)를 명시하고 예외 처리 경로를 만든다.

```java
@Async
public CompletableFuture<Void> sendAsync(Notification n) { ... }
```

- `@Async`는 트랜잭션을 이어받지 않는다 — 커밋 후 실행이 필요하면 `TransactionSynchronization`(`afterCommit`)을 쓴다.
- 반환값을 안 쓰는 `@Async void`는 예외가 삼켜진다 — `AsyncUncaughtExceptionHandler`를 등록한다.

## 필터

```java
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    long start = System.currentTimeMillis();
    try { chain.doFilter(req, res); }
    finally { log.info("req method={} uri={} status={} durationMs={}",
        req.getMethod(), req.getRequestURI(), res.getStatus(), System.currentTimeMillis() - start); }
  }
}
```

- **클라이언트 IP는 `request.getRemoteAddr()`로만 읽는다.** `X-Forwarded-For`는 클라이언트가 위조할 수 있다. 리버스 프록시(nginx) 뒤라면 `server.forward-headers-strategy=FRAMEWORK`(+`ForwardedHeaderFilter` 빈) 또는 `NATIVE`를 설정해 `getRemoteAddr()`가 올바른 IP를 돌려주게 만든다 — 헤더를 직접 파싱하지 않는다.

## 페이징·정렬

```java
PageRequest page = PageRequest.of(pageNumber, pageSize, Sort.by("createdAt").descending());
```

응답 포맷·페이지 DTO는 프로젝트 규약(`global/response`)이 정본이다.

## 외부 호출 재시도

지수 백오프 + 최대 횟수. 인터럽트를 먹지 말고 되던진다.

```java
public <T> T withRetry(Supplier<T> supplier, int maxRetries) {
  for (int attempt = 1; ; attempt++) {
    try { return supplier.get(); }
    catch (Exception ex) {
      if (attempt >= maxRetries) throw ex;
      try { Thread.sleep((long) Math.pow(2, attempt) * 100L); }
      catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw ex; }
    }
  }
}
```

- 재시도는 **멱등한 호출에만** 붙인다. 결제·발행처럼 부작용이 있는 호출은 멱등 키가 먼저다.

## 백그라운드 작업

`@Scheduled` 또는 큐(Redis 리스트·Kafka·SQS). 핸들러는 멱등하게, 처리 결과는 로그·메트릭으로 관측 가능하게. 이 리포의 이미지 발행 큐 규약은 `.claude/rules/backend/upload-image-pipeline.md`가 정본이다.

## 관측

- 구조화 로그(JSON) + Micrometer 메트릭 + Prometheus 스크레이프. 배선 정본은 `docs/context/observability.md`.
- 커스텀 메트릭은 태그 카디널리티를 조심한다 — 사용자 id 같은 무한 태그는 금지.

## 프로덕션 기본값

- HikariCP 풀 크기·타임아웃을 워크로드에 맞춘다(테스트 프로파일 값은 rules가 정본).
- `Optional`·`@NonNull`로 null 계약을 드러낸다.
