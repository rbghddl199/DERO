package com.brunchies.dero.image.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.brunchies.dero.AbstractRedisIntegrationTest;
import com.brunchies.dero.image.queue.ImagePublishJob;
import com.brunchies.dero.image.queue.ImagePublishQueue;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 플래그를 켜면 소비 루프가 실제로 돌아 {@code PENDING → PUBLIC}까지 간다(DERO-341).
 *
 * <p>{@code ImagePublishWorkerTest}(꺼짐)와 짝이다 — 둘이 같이 있어야 "플래그가 실제로 스위치다"가
 * 증명된다. 한쪽만 있으면 플래그를 무시하는 구현도 통과한다.
 */
@SpringBootTest(properties = "app.image.worker.enabled=true")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ImagePublishWorkerEnabledTest extends AbstractRedisIntegrationTest {

	@Autowired
	private ImagePublishQueue queue;

	@Autowired
	private GeneratedImageRepository generatedImages;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private StringRedisTemplate redis;

	@Autowired
	private JdbcTemplate jdbc;

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, "user"
					RESTART IDENTITY CASCADE
				""");
		redis.delete(List.of(
				"image:publish:pending", "image:publish:processing", "image:publish:claimed-at"));
	}

	@Test
	@DisplayName("루프가 켜져 있으면 큐에 넣은 작업이 저절로 소비돼 PUBLIC + 상상도 1행이 된다")
	void 루프가_큐를_소비한다() {
		User owner = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인"));
		Placement placement = Placement.create(owner, "업로드 대상", null, null);
		placement.registerThumbnail("placement-thumbnails/stub.png");
		placement.requestFeedEntry();
		Long placementId = placements.save(placement).getId();

		queue.enqueue(new ImagePublishJob(placementId, OffsetDateTime.now()));

		await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofMillis(200)).untilAsserted(
				() -> {
					assertThat(placements.findByIdAndDeletedAtIsNull(placementId).orElseThrow()
							.getPublishStatus()).isEqualTo(PublishStatus.PUBLIC);
					assertThat(generatedImages.findByPlacementIdOrderByIdAsc(placementId)).hasSize(1);
				});
	}
}
