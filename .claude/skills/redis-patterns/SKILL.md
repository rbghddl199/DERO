---
name: redis-patterns
description: Redis 자료구조·키 설계·TTL·캐시 무효화·분산 락·카운터 레이트 리밋·축출 정책·안티패턴 참조(예시는 Spring Data Redis). "캐시 키 어떻게 잡을까", "TTL 얼마", "분산 락", "Redis 큐", "KEYS 써도 되나", "메모리가 찬다" 같은 요청에 쓴다.
---

# Redis 패턴 (Spring Data Redis)

Vendored from ECC `redis-patterns` (2026-08-13, ADR-0042). 원본 Python 예시는 **Java/Spring으로 치환**했다.

**Dedup (2026-08-13):** Pub/Sub·Streams·Cluster·Sentinel 절은 삭제했다 — 이 리포는 단일 인스턴스이고 큐는 리스트(`BLMOVE`) 기반이다. 이 리포의 실제 배선·큐 규약·테스트 베이스(`AbstractRedisIntegrationTest`)·리프레시 토큰 저장은 `.claude/rules/backend/upload-image-pipeline.md`·`spring-config.md`·`testing-runtime.md`가 정본이고 **충돌하면 그쪽이 이긴다**. 이 파일은 자료구조·키·TTL 선택 축만 남긴다.

## 자료구조 선택

| 용도 | 구조 | 키 예 |
|---|---|---|
| 단순 캐시 | String | `product:123` |
| 세션·토큰 묶음 | Hash | `session:abc` |
| 랭킹 | Sorted Set | `scores:weekly` |
| 유니크 집합 | Set | `visitors:2026-08-13` |
| 작업 큐 | List (`RPUSH`/`BLMOVE`) | `image:publish:pending` |
| 카운터·레이트 리밋 | String (`INCR`) | `ratelimit:user:123` |
| 근사 유니크 카운트 | HyperLogLog | `hll:pageviews` |

## 키 설계

- `namespace:resource:id[:field]` — `dero:session:abc`, `dero:ratelimit:user:123`, `stats:pageviews:2026-08-13`.
- **키에 도메인 의미를 담고 컴포넌트마다 접두어를 고정한다.** 한 인스턴스를 캐시·큐·토큰이 공유하면 접두어가 유일한 격리 수단이다.
- 큐 키처럼 값으로 삭제하는 경우(`LREM`) 페이로드 직렬화가 한 글자만 달라져도 유령이 남는다.

## TTL

| 데이터 | 권장 TTL |
|---|---|
| 세션·리프레시 토큰 | 발급 정책과 동일 |
| API 응답 캐시 | 5~15분 |
| 레이트 리밋 창 | 창 크기와 동일 |
| 단기 토큰 | 5~10분 |
| 참조 데이터 | 1시간~1주 |

**항상 TTL을 건다.** TTL 없는 키는 무한히 쌓여 메모리 압박이 된다. 작업 큐처럼 TTL을 못 거는 키는 대신 **소비/정리 경로**가 존재해야 한다.

## 캐시 어사이드

```java
@RequiredArgsConstructor
@Service
public class ProductCacheService {
	private final StringRedisTemplate redis;
	private final ObjectMapper objectMapper;
	private final ProductRepository products;

	public ProductResponse get(Long id) throws JsonProcessingException {
		String key = "dero:product:" + id;
		String cached = redis.opsForValue().get(key);
		if (cached != null) {
			return objectMapper.readValue(cached, ProductResponse.class);
		}
		ProductResponse fresh = ProductResponse.from(products.findById(id)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND)));
		redis.opsForValue().set(key, objectMapper.writeValueAsString(fresh), Duration.ofMinutes(10));
		return fresh;
	}
}
```

- 애노테이션으로 충분하면 `@Cacheable`/`@CacheEvict` + `RedisCacheManager`가 더 짧다(`springboot-patterns`).
- 쓰기 후 무효화는 **커밋 후에** 한다 — 롤백된 트랜잭션이 캐시를 지워 놓으면 다음 읽기가 잘못된 값을 다시 채운다.
- 캐시 미스 폭주(thundering herd)가 문제면 짧은 분산 락 또는 확률적 조기 만료를 붙인다.

## 분산 락 (SET NX PX)

```java
String token = UUID.randomUUID().toString();
boolean acquired = Boolean.TRUE.equals(
		redis.opsForValue().setIfAbsent("dero:lock:" + resource, token, Duration.ofSeconds(5)));
```

해제는 **내 토큰일 때만** 지워야 하므로 Lua로 원자화한다.

```java
private static final RedisScript<Long> RELEASE = RedisScript.of(
		"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
		Long.class);

redis.execute(RELEASE, List.of("dero:lock:" + resource), token);
```

- 해제는 `finally`에서. TTL은 작업 예상 시간보다 길게 잡되, 그 시간을 넘기면 **다른 워커가 같은 작업을 잡는다**는 사실을 전제로 작업을 멱등하게 만든다.
- 단일 인스턴스 전제다. 다중 마스터라면 락으로 정확성을 보장하지 못한다.

## 레이트 리밋 (고정 창)

```java
String key = "dero:ratelimit:%d:%d".formatted(userId, Instant.now().getEpochSecond() / windowSeconds);
Long count = redis.opsForValue().increment(key);
if (count != null && count == 1L) {
	redis.expire(key, Duration.ofSeconds(windowSeconds));
}
boolean limited = count != null && count > limit;
```

정확한 창이 필요하면 Sorted Set + Lua(슬라이딩 윈도우). 인메모리 버킷과 달리 인스턴스가 늘어도 한 벌로 센다.

## 축출 정책

| 정책 | 동작 | 적합 |
|---|---|---|
| `noeviction` | 가득 차면 쓰기 오류 | 큐·유실 불가 데이터 |
| `allkeys-lru` | 최근 미사용부터 축출 | 순수 캐시 |
| `volatile-lru` | TTL 있는 키 중에서만 | 캐시+영속 혼용 |
| `allkeys-lfu` | 빈도 낮은 것부터 | 접근 편향 큼 |

**캐시와 큐가 한 인스턴스에 있으면 `allkeys-*`는 큐를 날린다** — 혼용이면 `volatile-*` + 큐 키에 TTL 없음이 안전한 조합이다.

## 안티패턴

| 안티패턴 | 문제 | 조치 |
|---|---|---|
| TTL 없는 캐시 키 | 메모리 무한 증가 | 항상 TTL |
| 운영에서 `KEYS *` | O(N) 블로킹 | `SCAN` 커서 |
| 100KB 넘는 블롭 저장 | 직렬화·메모리 압박 | 참조만 저장, 본문은 오브젝트 스토리지 |
| `FLUSHDB`/`FLUSHALL` | 토큰·큐까지 전멸 | 접두어 범위로 `SCAN`+삭제 |
| 블로킹 명령을 공유 커넥션에서 | 다른 조회가 같이 멈춘다 | 전용 커넥션(Lettuce dedicated) |
| 커넥션 풀 한계 무시 | 부하 시 고갈 | 워크로드에 맞춰 풀 크기 |
