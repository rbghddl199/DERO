package com.brunchies.dero.image.queue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.connection.RedisListCommands.Direction;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * 상상도 생성 큐 — Redis 리스트 + {@code BLMOVE} + 처리중 리스트(ADR-0015 결정 2·4).
 *
 * <pre>
 *   image:publish:pending      대기열.   LPUSH 로 넣고 RIGHT 에서 꺼낸다(FIFO)
 *   image:publish:processing   처리중.   BLMOVE 가 원자적으로 옮겨 놓는다
 *   image:publish:claimed-at   처리중에 들어간 시각(payload → epoch millis). 스위퍼의 기준이다
 * </pre>
 *
 * <p><b>{@code BRPOP}을 쓰지 않는 이유</b>: 꺼내는 순간 큐에서 사라져서, 워커가 생성 도중에 죽으면
 * 작업이 증발하고 배치는 {@code PENDING}에 영원히 남는다. {@code BLMOVE}는 대기열 → 처리중을
 * 원자적으로 옮기므로 죽어도 처리중에 남아 있고, 스위퍼가 되돌린다.
 *
 * <p><b>완료·되돌리기는 원본 payload 문자열이 있어야 한다</b>({@code LREM}이 값으로 지운다). 그래서
 * {@link #claim}이 역직렬화 결과만 주지 않고 {@link ClaimedJob}으로 원문을 함께 돌려준다 — 다시
 * 직렬화해서 지우려 들면 필드 순서·시각 포맷이 한 글자만 달라도 처리중에 유령이 남는다.
 *
 * <p>Redis에는 <b>리프레시 토큰이 같이 산다</b>(ADR-0005). 그래서 이 클래스는 자기 키 3개 밖을
 * 건드리지 않는다 — {@code FLUSHDB} 같은 전역 명령을 여기에 두지 마라.
 */
@Component
@RequiredArgsConstructor
public class ImagePublishQueue {

	private static final String PENDING_KEY = "image:publish:pending";
	private static final String PROCESSING_KEY = "image:publish:processing";
	private static final String CLAIMED_AT_KEY = "image:publish:claimed-at";

	private final StringRedisTemplate redis;
	private final ObjectMapper objectMapper;

	/** 대기열 머리에 넣는다. 꺼내는 쪽이 꼬리라 먼저 넣은 것이 먼저 나간다. */
	public void enqueue(ImagePublishJob job) {
		redis.opsForList().leftPush(PENDING_KEY, objectMapper.writeValueAsString(job));
	}

	/**
	 * {@code BLMOVE} — 대기열 꼬리에서 처리중 머리로 <b>원자적으로</b> 옮겨 가져온다.
	 * {@code blockTimeout} 안에 아무것도 없으면 {@code null}.
	 *
	 * <p>블로킹 명령이라 Lettuce가 전용 커넥션을 쓴다({@code LettuceListCommands.bLMove} →
	 * {@code getAsyncDedicatedConnection}) — 공유 커넥션을 붙들어 리프레시 토큰 조회를 멈추지 않는다.
	 */
	public ClaimedJob claim(Duration blockTimeout) {
		String payload = redis.opsForList()
				.move(PENDING_KEY, Direction.RIGHT, PROCESSING_KEY, Direction.LEFT, blockTimeout);
		if (payload == null) {
			return null;
		}
		claimedAt().put(CLAIMED_AT_KEY, payload, Long.toString(System.currentTimeMillis()));
		return new ClaimedJob(payload, objectMapper.readValue(payload, ImagePublishJob.class));
	}

	/**
	 * 처리 끝 — 처리중 리스트에서 뺀다. 실패로 끝났어도 부른다(재시도는 사용자의 같은 {@code PUT}이다).
	 *
	 * <p><b>claim 시각을 먼저 지운다.</b> 반대로 하면 그 사이에 죽었을 때 아무도 안 보는 해시 필드가
	 * 남는다 — 스위퍼는 처리중 <b>리스트</b>만 훑고 이 해시엔 TTL이 없어서 리프레시 토큰이 사는 Redis
	 * 인스턴스의 메모리를 영구히 갉는다. 이 순서면 최악이 "재소비 1회"인데 그건 소비 쪽 가드가 no-op으로
	 * 흡수한다.
	 */
	public void complete(ClaimedJob claimed) {
		claimedAt().delete(CLAIMED_AT_KEY, claimed.payload());
		redis.opsForList().remove(PROCESSING_KEY, 1, claimed.payload());
	}

	/**
	 * 스위퍼 — 처리중에 {@code timeout}보다 오래 남은 작업을 대기열로 되돌린다(ADR-0015 결정 4).
	 * 워커가 죽거나 터널이 끊긴 사이의 작업이 여기서 살아 돌아온다.
	 *
	 * <p>되돌릴 때 <b>대기열 꼬리</b>로 넣는다 — 꺼내는 쪽이 꼬리라 다음 차례에 바로 다시 잡힌다.
	 *
	 * <p><b>대기열에 먼저 넣고 처리중에서 나중에 뺀다.</b> 두 명령 사이에서 죽으면 반대 순서는 작업이
	 * 양쪽 어디에도 없는 <b>진짜 유실</b>이 되고 배치는 {@code PENDING}에 영원히 남는다. 이 순서면
	 * 최악이 "대기열과 처리중에 같은 작업이 하나씩"인 중복인데, 중복은 소비 쪽 가드가 no-op으로
	 * 흡수한다({@code GeneratedImageService.publish}). <b>유실과 중복 중에 중복으로 넘어진다.</b>
	 *
	 * @return 되돌린 작업 수.
	 */
	public int requeueStale(Duration timeout) {
		List<String> payloads = redis.opsForList().range(PROCESSING_KEY, 0, -1);
		if (payloads == null || payloads.isEmpty()) {
			return 0;
		}

		HashOperations<String, String, String> claimedAt = claimedAt();
		long deadline = System.currentTimeMillis() - timeout.toMillis();
		List<String> stale = new ArrayList<>();
		for (String payload : payloads) {
			// 값이 없다 = BLMOVE 직후 죽어 claim 시각조차 못 남겼다. 그것도 유실이라 같이 되돌린다.
			String since = claimedAt.get(CLAIMED_AT_KEY, payload);
			if (since == null || Long.parseLong(since) <= deadline) {
				stale.add(payload);
			}
		}

		for (String payload : stale) {
			redis.opsForList().rightPush(PENDING_KEY, payload);
			redis.opsForList().remove(PROCESSING_KEY, 1, payload);
			claimedAt.delete(CLAIMED_AT_KEY, payload);
		}
		return stale.size();
	}

	/** 대기열 길이. "위반 배치는 큐에 안 들어간다"를 밖에서 확인할 수 있는 유일한 창이다. */
	public long pendingSize() {
		Long size = redis.opsForList().size(PENDING_KEY);
		return size == null ? 0 : size;
	}

	/** 처리중 길이. */
	public long processingSize() {
		Long size = redis.opsForList().size(PROCESSING_KEY);
		return size == null ? 0 : size;
	}

	private HashOperations<String, String, String> claimedAt() {
		return redis.opsForHash();
	}

	/**
	 * 꺼내 온 작업 — 원본 payload를 같이 들고 다닌다.
	 *
	 * @param payload 처리중 리스트에 들어 있는 <b>그 문자열 그대로</b>. {@code LREM}의 인자다.
	 * @param job 역직렬화된 본문.
	 */
	public record ClaimedJob(String payload, ImagePublishJob job) {}
}
