package com.brunchies.dero.image.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
import com.brunchies.dero.infra.ImageGenerationPort;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.Provider;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link GeneratedImageService#publish}의 <b>트랜잭션 경계</b>(DERO-476).
 *
 * <p>지키려는 것은 성능 수치가 아니라 구조다 — <b>외부 이미지 생성 호출이 트랜잭션 안에 있으면 안
 * 된다.</b> GMS는 {@code read-timeout}이 300초라, 안에 두면 그 내내 커넥션 하나와
 * {@code demotePrimaries}의 행 락을 붙잡는다. 그런데 이 회귀는 <b>기능 테스트로는 안 잡힌다</b>:
 * 트랜잭션을 다시 하나로 합쳐도 상태 전이도 행 수도 전부 그대로 통과한다. 그래서 이 테스트는
 * 포트를 가로채 호출 순간의 {@code isActualTransactionActive()}를 직접 본다.
 *
 * <p><b>쓰기가 그대로 커밋되는지도 같이 본다.</b> {@code publish}에 붙은
 * {@code @Transactional(NEVER)}를 지우면 클래스의 {@code readOnly = true}가 살아나 Hibernate가
 * {@code FlushMode.MANUAL}로 돌고 <b>INSERT가 조용히 사라진다</b> — 위 단언만으로는 그쪽이 안 잡혀서
 * 둘을 한 테스트에 묶었다.
 *
 * <p><b>전파가 {@code NEVER}인 것도 못박는다.</b> {@code NOT_SUPPORTED}로 되돌려도 위 두 단언은
 * 그대로 통과한다 — 호출부에 트랜잭션이 없으니 차이가 안 드러난다. 차이는 바깥 트랜잭션이 생긴
 * 날에만 나타나고, 그때 {@code NOT_SUPPORTED}는 그것을 조용히 중단시킨 채 <b>커넥션은 계속 쥐고</b>
 * 300초를 간다. 두 번째 테스트가 그 자리를 예외로 고정한다.
 *
 * <p>포트를 {@link MockitoBean}으로 갈아 끼우므로 컨텍스트가 하나 는다. Redis는 안 붙인다 —
 * {@code publish}는 큐를 만지지 않는다.
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class GeneratedImagePublishTransactionTest extends AbstractPostgresIntegrationTest {

	private static final String GENERATED_KEY = "generated-images/fake.png";

	@MockitoBean
	private ImageGenerationPort imageGeneration;

	@Autowired
	private GeneratedImageService generatedImageService;

	@Autowired
	private GeneratedImageRepository generatedImages;

	@Autowired
	private PlacementRepository placements;

	@Autowired
	private UserRepository users;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TransactionTemplate transactions;

	@AfterEach
	void tearDown() {
		jdbc.execute("""
				TRUNCATE TABLE generated_image, placed_item, placement_desk, placement, "user"
					RESTART IDENTITY CASCADE
				""");
	}

	@Test
	@DisplayName("상상도 생성 호출은 트랜잭션 밖에서 일어나고, 그래도 행과 상태 전이는 커밋된다")
	void 생성_호출은_트랜잭션_밖이다() {
		// 초기값을 true로 둔다 — 포트가 아예 안 불렸는데 통과하는 일이 없게.
		AtomicBoolean activeAtCall = new AtomicBoolean(true);
		given(imageGeneration.generate(any())).willAnswer(invocation -> {
			activeAtCall.set(TransactionSynchronizationManager.isActualTransactionActive());
			return List.of(GENERATED_KEY);
		});
		Long placementId = pendingPlacement();

		generatedImageService.publish(placementId);

		assertThat(activeAtCall).isFalse();
		assertThat(placements.findByIdAndDeletedAtIsNull(placementId).orElseThrow()
				.getPublishStatus()).isEqualTo(PublishStatus.PUBLIC);
		assertThat(generatedImages.findByPlacementIdOrderByIdAsc(placementId))
				.singleElement()
				.satisfies(image -> {
					assertThat(image.getImageKey()).isEqualTo(GENERATED_KEY);
					assertThat(image.isPrimary()).isTrue();
				});
	}

	@Test
	@DisplayName("바깥에 트랜잭션이 있으면 상상도 생성을 시작하지 않고 예외로 멈춘다")
	void 트랜잭션_안에서_부르면_터진다() {
		// 프록시가 메서드 본문에 들어가기 전에 막으므로 배치 존재 여부는 상관없다.
		assertThatThrownBy(() -> transactions.executeWithoutResult(status ->
				generatedImageService.publish(1L)))
				.isInstanceOf(IllegalTransactionStateException.class);
	}

	private Long pendingPlacement() {
		User owner = users.save(User.create("owner@example.com", Provider.KAKAO, "p-owner", "주인"));
		Placement placement = Placement.create(owner, "업로드 대상", null, null);
		placement.registerThumbnail("placement-thumbnails/stub.png");
		placement.requestFeedEntry();
		return placements.save(placement).getId();
	}
}
