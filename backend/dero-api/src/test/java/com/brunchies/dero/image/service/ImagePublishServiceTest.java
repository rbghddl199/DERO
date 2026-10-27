package com.brunchies.dero.image.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brunchies.dero.AbstractRedisIntegrationTest;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.image.GeneratedImage;
import com.brunchies.dero.image.queue.ImagePublishJob;
import com.brunchies.dero.image.queue.ImagePublishQueue;
import com.brunchies.dero.image.queue.ImagePublishQueue.ClaimedJob;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 스텁 워커의 <b>상태 전이와 큐 회수</b>(DERO-341, D27-보).
 *
 * <p>워커 루프 자체가 아니라 그 루프가 부르는 조각들(큐 · {@link GeneratedImageService})을 직접
 * 돌린다 — 기본 프로파일에서는 {@link ImagePublishWorker} 빈이 아예 없기 때문이고
 * ({@code app.image.worker.enabled=false}), 루프를 켠 전체 경로는
 * {@code ImagePublishWorkerEnabledTest}가 따로 본다.
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ImagePublishServiceTest extends AbstractRedisIntegrationTest {

	@Autowired
	private ImagePublishQueue queue;

	@Autowired
	private GeneratedImageService generatedImageService;

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

	private User owner;

	@BeforeEach
	void setUp() {
		owner = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인"));
		clearQueue();
	}

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, "user"
					RESTART IDENTITY CASCADE
				""");
		clearQueue();
	}

	@Test
	@DisplayName("큐를 소비하면 PENDING → PUBLIC이고 generated_image 1행이 곧 대표다")
	void 소비하면_PUBLIC이고_대표_1행() {
		Long placementId = pendingPlacement();
		queue.enqueue(new ImagePublishJob(placementId, OffsetDateTime.now()));

		ClaimedJob claimed = queue.claim(Duration.ofSeconds(5));
		assertThat(claimed).isNotNull();
		generatedImageService.publish(claimed.job().placementId());
		queue.complete(claimed);

		assertThat(publishStatusOf(placementId)).isEqualTo(PublishStatus.PUBLIC);
		List<GeneratedImage> images = generatedImages.findByPlacementIdOrderByIdAsc(placementId);
		assertThat(images).hasSize(1);
		assertThat(images.stream().filter(GeneratedImage::isPrimary)).hasSize(1);
		// 스텁이라 스크린샷 key 그대로다(D27-보 — 콘테스트 기간 피드 대표는 스크린샷이다).
		assertThat(images).allMatch(image -> image.getImageKey().equals(thumbnailKeyOf(placementId)));
		assertThat(queue.processingSize()).isZero();
	}

	@Test
	@DisplayName("처리중에 남은 작업은 스위퍼가 대기열로 되돌리고 다시 소비된다")
	void 스위퍼가_처리중_유실을_되돌린다() {
		Long placementId = pendingPlacement();
		queue.enqueue(new ImagePublishJob(placementId, OffsetDateTime.now()));

		// 워커가 집어 가고 죽었다 — complete를 안 부른 상태다.
		ClaimedJob abandoned = queue.claim(Duration.ofSeconds(5));
		assertThat(abandoned).isNotNull();
		assertThat(queue.processingSize()).isEqualTo(1);
		assertThat(queue.pendingSize()).isZero();

		// 타임아웃 0이면 "지금 처리중인 것은 전부 오래됐다"가 된다.
		assertThat(queue.requeueStale(Duration.ZERO)).isEqualTo(1);
		assertThat(queue.processingSize()).isZero();
		assertThat(queue.pendingSize()).isEqualTo(1);

		ClaimedJob reclaimed = queue.claim(Duration.ofSeconds(5));
		assertThat(reclaimed).isNotNull();
		assertThat(reclaimed.job().placementId()).isEqualTo(placementId);
		generatedImageService.publish(reclaimed.job().placementId());
		queue.complete(reclaimed);

		assertThat(publishStatusOf(placementId)).isEqualTo(PublishStatus.PUBLIC);
		assertThat(generatedImages.findByPlacementIdOrderByIdAsc(placementId)).hasSize(1);
	}

	@Test
	@DisplayName("아직 오래되지 않은 처리중 작업은 스위퍼가 건드리지 않는다")
	void 스위퍼는_최근_작업을_건드리지_않는다() {
		Long placementId = pendingPlacement();
		queue.enqueue(new ImagePublishJob(placementId, OffsetDateTime.now()));
		queue.claim(Duration.ofSeconds(5));

		assertThat(queue.requeueStale(Duration.ofMinutes(10))).isZero();
		assertThat(queue.processingSize()).isEqualTo(1);
		assertThat(queue.pendingSize()).isZero();
	}

	@Test
	@DisplayName("생성 중 실패는 FAILED로 남고 사용자가 다시 올리면 재투입된다")
	void 실패는_FAILED로_남는다() {
		Long placementId = pendingPlacement();
		jdbc.update("update placement set thumbnail_key = null where id = ?", placementId);

		assertThatThrownBy(() -> generatedImageService.publish(placementId))
				.isInstanceOf(BusinessException.class);
		generatedImageService.markFailed(placementId);

		assertThat(publishStatusOf(placementId)).isEqualTo(PublishStatus.FAILED);
		assertThat(generatedImages.findByPlacementIdOrderByIdAsc(placementId)).isEmpty();
	}

	@Test
	@DisplayName("재업로드는 옛 대표를 내리고 새 대표를 올린다 — 대표는 여전히 1행이다")
	void 재업로드해도_대표는_1행() {
		Long placementId = pendingPlacement();
		generatedImageService.publish(placementId);
		// 재업로드 = 사용자가 다시 PUT을 눌러 PENDING으로 되돌린 것이다.
		jdbc.update("update placement set publish_status = 'PENDING' where id = ?", placementId);
		generatedImageService.publish(placementId);

		List<GeneratedImage> images = generatedImages.findByPlacementIdOrderByIdAsc(placementId);
		assertThat(images).hasSize(2);
		assertThat(images.stream().filter(GeneratedImage::isPrimary)).hasSize(1);
	}

	@Test
	@DisplayName("사용자가 공개를 취소한 뒤 도착한 작업은 배치를 다시 공개하지 않는다")
	void 취소된_배치의_철지난_작업은_무시된다() {
		Long placementId = pendingPlacement();
		queue.enqueue(new ImagePublishJob(placementId, OffsetDateTime.now()));
		// 워커가 집기 전에 사용자가 DELETE .../feed-entry로 내렸다.
		jdbc.update("update placement set publish_status = 'PRIVATE' where id = ?", placementId);

		ClaimedJob claimed = queue.claim(Duration.ofSeconds(5));
		generatedImageService.publish(claimed.job().placementId());
		queue.complete(claimed);

		assertThat(publishStatusOf(placementId)).isEqualTo(PublishStatus.PRIVATE);
		assertThat(generatedImages.findByPlacementIdOrderByIdAsc(placementId)).isEmpty();
	}

	@Test
	@DisplayName("같은 작업이 두 번 배달돼도 상상도는 1행 그대로다 — 한도가 두 번 깎이지 않는다")
	void 중복_배달은_무해하다() {
		Long placementId = pendingPlacement();
		generatedImageService.publish(placementId);
		generatedImageService.publish(placementId);

		assertThat(publishStatusOf(placementId)).isEqualTo(PublishStatus.PUBLIC);
		assertThat(generatedImages.findByPlacementIdOrderByIdAsc(placementId)).hasSize(1);
	}

	private Long pendingPlacement() {
		Placement placement = Placement.create(owner, "업로드 대상", null, null);
		placement.registerThumbnail("placement-thumbnails/stub.png");
		placement.requestFeedEntry();
		return placements.save(placement).getId();
	}

	private PublishStatus publishStatusOf(Long placementId) {
		return placements.findByIdAndDeletedAtIsNull(placementId).orElseThrow().getPublishStatus();
	}

	private String thumbnailKeyOf(Long placementId) {
		return placements.findByIdAndDeletedAtIsNull(placementId).orElseThrow().getThumbnailKey();
	}

	private void clearQueue() {
		redis.delete(List.of(
				"image:publish:pending", "image:publish:processing", "image:publish:claimed-at"));
	}
}
