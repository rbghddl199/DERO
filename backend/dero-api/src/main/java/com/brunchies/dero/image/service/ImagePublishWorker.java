package com.brunchies.dero.image.service;

import com.brunchies.dero.image.ImageProperties;
import com.brunchies.dero.image.queue.ImagePublishQueue;
import com.brunchies.dero.image.queue.ImagePublishQueue.ClaimedJob;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * 큐 소비 루프 — <b>별도 프로세스가 아니라 WAS 안의 스레드다</b>(D27-보). 배포 단위를 늘리지 않으려는
 * 선택이고, <b>이게 최종형이다</b>: 생성을 로컬 AI 머신(python 프로세스 + SSH 터널)으로 옮기는 기획은
 * 2026-08-06 파기됐고 상상도는 GMS로 간다(D29, ADR-0025 결정 4). 그래서 "진짜 워커가 오면 이
 * 루프를 내린다"는 전제는 더 이상 없다 — 갈아탈 대상이 생기면 {@code ImageGenerationPort} 구현이
 * 바뀌지, 이 루프가 사라지지 않는다.
 *
 * <p><b>플래그가 꺼져 있으면 빈 자체가 안 만들어진다</b>({@code @ConditionalOnProperty}) — 테스트와
 * 로컬이 기본으로 Redis 큐에 묶이지 않는다. "스레드는 뜨는데 아무것도 안 한다"가 아니라 "루프가
 * 없다"여야 그 보장이 눈에 보인다.
 *
 * <p>한 스레드다. 여러 대로 늘릴 거면 그때는 Redis 리스트가 아니라 컨슈머 그룹이 있는 것으로
 * 옮기는 시점이다(ADR-0015 결정 2).
 */
@Component
@ConditionalOnProperty(prefix = "app.image.worker", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class ImagePublishWorker implements SmartLifecycle {

	private final ImagePublishQueue queue;
	private final GeneratedImageService generatedImages;
	private final ImageProperties properties;

	private final AtomicBoolean running = new AtomicBoolean(false);
	private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
		Thread thread = new Thread(runnable, "image-publish-worker");
		thread.setDaemon(true);
		return thread;
	});

	@Override
	public void start() {
		if (running.compareAndSet(false, true)) {
			executor.execute(this::loop);
		}
	}

	@Override
	public void stop() {
		running.set(false);
		// 블로킹 중인 BLMOVE를 깨운다. 인터럽트를 받은 쪽은 루프 조건을 다시 보고 빠져나간다.
		executor.shutdownNow();
	}

	@Override
	public boolean isRunning() {
		return running.get();
	}

	private void loop() {
		while (running.get()) {
			try {
				// 스위퍼를 소비와 같은 루프에 둔다 — 워커가 없으면 소비도 없으니 따로 돌 이유가 없고,
				// 스케줄러 인프라(@EnableScheduling)를 새로 들이지 않는다.
				queue.requeueStale(properties.worker().processingTimeout());
				ClaimedJob claimed = queue.claim(properties.worker().pollTimeout());
				if (claimed != null) {
					consume(claimed);
				}
			} catch (RuntimeException e) {
				// Redis 단절·종료 인터럽트 등 외부 사정을 BusinessException으로 번역할 자리가 없다 —
				// 여기서 죽으면 큐가 영원히 안 비므로 잡고 계속 돈다. 집어 놓은 작업은 처리중
				// 리스트에 남아 있고 스위퍼가 되돌린다(ADR-0015 결정 4).
				pause();
			}
		}
	}

	private void consume(ClaimedJob claimed) {
		try {
			generatedImages.publish(claimed.job().placementId());
		} catch (RuntimeException e) {
			// 한 건의 실패로 루프를 죽이지 않는다. 실패는 배치 상태(FAILED)로 남고, 사용자가 같은
			// PUT을 다시 눌러 재투입한다(ADR-0015 결정 10).
			generatedImages.markFailed(claimed.job().placementId());
		}
		queue.complete(claimed);
	}

	/** Redis가 잠시 끊겼을 때 뜨겁게 도는 것을 막는다. 인터럽트가 오면 종료 신호로 읽는다. */
	private void pause() {
		try {
			Thread.sleep(properties.worker().pollTimeout());
		} catch (InterruptedException interrupted) {
			Thread.currentThread().interrupt();
			running.set(false);
		}
	}
}
