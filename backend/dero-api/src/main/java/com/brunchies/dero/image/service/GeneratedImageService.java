package com.brunchies.dero.image.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.image.GeneratedImage;
import com.brunchies.dero.placement.TimeOfDay;
import com.brunchies.dero.image.dto.GeneratedImageResponse;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
import com.brunchies.dero.infra.ImageGenerationErrorCode;
import com.brunchies.dero.infra.ImageGenerationPort;
import com.brunchies.dero.infra.ImageGenerationRequest;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.placement.PlacedItem;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementDesk;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.user.User;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 상상도의 생성(큐 소비 쪽)과 조회.
 *
 * <p><b>"어떻게 만드는가"는 {@link ImageGenerationPort} 뒤에 있다</b>(DERO-354) — 기본값은
 * 스텁(스크린샷 key를 그대로 꽂는다, D27-보)이고 {@code app.image.generation.mode=gms}로
 * 바꾸면 실제 생성기가 붙는다. 이 서비스가 지키는 것은 그 위의 계약이다: <b>상태 기계 ·
 * {@code generated_image} {@code IMAGES_PER_UPLOAD}행 · 대표 1행 · 큐 · API</b>는 어느 구현에서도
 * 그대로다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class GeneratedImageService {

	private final PlacementRepository placements;
	private final GeneratedImageRepository generatedImages;
	private final PublicImageUrlResolver publicImageUrl;
	private final ImageGenerationPort imageGeneration;
	private final TransactionTemplate transactions;

	/**
	 * 큐 소비 — 상상도를 만들어 행으로 쓰고 {@code PENDING → PUBLIC}으로 전이시킨다.
	 *
	 * <p><b>생성 호출은 트랜잭션 밖이고, DB를 만지는 두 구간만 각각 짧은 트랜잭션이다</b>
	 * (DERO-476). 셋을 하나로 묶으면 외부 호출이 끝날 때까지 커넥션 하나와
	 * {@link #attach}의 {@code demotePrimaries} 행 락을 <b>그 내내</b> 붙잡는다 — GMS는
	 * {@code read-timeout}이 300초라 장당 최악 5분이고, 그 사이 풀의 커넥션 하나가 아무 일도 하지
	 * 않으면서 사라져 있다. 워커가 한 스레드인 지금도 낭비고, 워커를 늘리는 순간 풀 고갈이다.
	 *
	 * <p><b>{@code @Transactional(NEVER)}는 장식이 아니다.</b> 클래스에 붙은
	 * {@code readOnly = true}를 지우지 않으면 이 메서드가 읽기 전용 트랜잭션을 열고, 아래
	 * {@link TransactionTemplate} 호출이 기본 전파(REQUIRED)로 <b>거기에 합류해</b> ①다시 한 덩어리가
	 * 되고 ②Hibernate가 읽기 전용에서 {@code FlushMode.MANUAL}을 쓰므로 <b>INSERT가 조용히
	 * 사라진다</b>.
	 *
	 * <p><b>{@code NOT_SUPPORTED}가 아니라 {@code NEVER}인 이유</b>는 바깥에 트랜잭션이 있을 때다.
	 * {@code NOT_SUPPORTED}는 그것을 조용히 중단(suspend)시키는데, <b>중단된 트랜잭션은 자기 커넥션을
	 * 계속 쥐고 있다</b> — 이 메서드가 막으려는 300초 점거가 그대로 부활하고 아무도 모른다.
	 * {@code NEVER}면 같은 상황이 예외로 터진다. 지금 호출부는 {@link ImagePublishWorker} 하나뿐이라
	 * 트랜잭션이 있을 일이 없고, 그래서 <b>생기면 그건 사고다.</b>
	 *
	 * <p><b>{@code PENDING}이 아니면 아무것도 하지 않는다.</b> 큐는 최소 한 번(at-least-once) 전달이라
	 * 같은 작업이 두 번 올 수 있고 — 스위퍼 회수·중복 {@code PUT}·워커 재시작 — 그때 이 가드가 없으면
	 * 셋 다 틀린 상태로 끝난다:
	 * <ul>
	 *   <li>사용자가 {@code DELETE .../feed-entry}로 내린 배치를 <b>뒤늦게 도착한 작업이 다시
	 *       공개해 버린다</b>. 명시적 취소가 조용히 뒤집히는, 인프라 장애 없이도 나는 사고다.</li>
	 *   <li>중복 발행이 상상도 행을 한 번 더 써서 <b>한도를 두 번 깎는다.</b></li>
	 *   <li>두 발행이 겹치면 대표 1행 부분 유니크가 늦은 쪽을 죽여, 행이 멀쩡히 들어갔는데도
	 *       배치가 {@code FAILED}로 남는다.</li>
	 * </ul>
	 * 트랜잭션을 쪼갠 대가로 <b>가드를 두 번 본다</b> — {@link #prepare}가 통과시킨 뒤 생성이 도는 몇
	 * 분 동안 사용자가 내릴 수 있고, 그 창은 {@link #attach} 쪽 재검사로만 막힌다.
	 *
	 * <p><b>전부 성공했을 때만 한 트랜잭션으로 쓴다</b>(ADR-0015 결정 8) — 부분 실패가 사용자 한도를
	 * 깎으면 우리 잘못으로 사용자가 손해를 본다. 이 테이블은 삭제 금지라 사후 정리로 풀 수도 없다.
	 * 쪼갠 뒤에도 그 보장은 그대로다: 쓰기는 {@link #attach} 하나에 모여 있다.
	 *
	 * <p>실패는 예외로 나간다 — {@link ImagePublishWorker}가 받아 {@link #markFailed}로 옮긴다.
	 */
	@Transactional(propagation = Propagation.NEVER)
	public void publish(Long placementId) {
		ImageGenerationRequest request = transactions.execute(status -> prepare(placementId));
		if (request == null) {
			return;
		}

		// 여기가 이 메서드에서 유일하게 오래 걸리는 구간이고, 그래서 트랜잭션 밖이다.
		// key를 만드는 책임은 포트 뒤에 있다(스텁이면 스크린샷 key, GMS면 실제 생성물).
		List<String> imageKeys = imageGeneration.generate(request);
		if (imageKeys.size() != FeedEntryService.IMAGES_PER_UPLOAD) {
			// 계약 위반은 여기서 멈춘다 — 통과시키면 대표 1행 규칙이나 한도 계산 단위가 조용히 어긋난다.
			throw new BusinessException(ImageGenerationErrorCode.IMAGE_GENERATION_FAILED);
		}

		transactions.executeWithoutResult(status -> attach(placementId, imageKeys));
	}

	/**
	 * 1단계(짧은 트랜잭션) — 생성에 필요한 재료만 읽는다. 이 작업이 이미 철 지났으면 {@code null}을
	 * 돌려 호출부가 <b>외부 호출을 시작하기도 전에</b> 끝내게 한다.
	 *
	 * <p>게이트 두 개가 여기 있는 것도 같은 이유다 — 스크린샷도 주인도 없는 배치에 GMS 호출을 태우면
	 * 돈과 시간을 버리고 나서 실패한다.
	 */
	private ImageGenerationRequest prepare(Long placementId) {
		if (!isStillQueued(placementId)) {
			return null;
		}

		// 프롬프트 재료(책상 재질·프레임·올려진 제품 이름)까지 한 번에 끌어온다 — 아이템마다 제품을
		// 따로 읽으면 N+1이고, 이 쿼리는 이미 그 조합을 fetch join으로 들고 있다.
		Placement placement = placements.findForJudgmentById(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		String screenshotKey = placement.getThumbnailKey();
		if (screenshotKey == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_THUMBNAIL_REQUIRED);
		}
		if (placement.getUser() == null) {
			// generated_image.user_id가 NOT NULL이다 — 한도가 사용자당이라 주체 없는 이력은 뜻이 없다.
			throw new BusinessException(PlacementErrorCode.PLACEMENT_OWNER_REQUIRED);
		}
		return generationRequestFor(placement, screenshotKey);
	}

	/**
	 * 2단계(짧은 트랜잭션) — 만들어진 key를 행으로 앉히고 상태를 전이시킨다. 쓰기는 전부 여기 모여
	 * 있어서 부분 기록이 남지 않는다.
	 *
	 * <p><b>{@code PENDING}인지 다시 본다</b> — {@link #prepare} 이후 생성이 도는 동안 사용자가
	 * {@code DELETE .../feed-entry}로 내렸을 수 있다. 그때는 <b>만든 그림을 버리는 쪽이 맞다</b>:
	 * 명시적 취소를 뒤집는 것보다 낫고, 한도도 이 행들이 안 들어가면 안 깎인다.
	 */
	private void attach(Long placementId, List<String> imageKeys) {
		if (!isStillQueued(placementId)) {
			return;
		}

		// 재업로드 대비 — 옛 대표를 먼저 내린다. 벌크 UPDATE가 영속성 컨텍스트를 비우므로 배치는
		// 반드시 그 뒤에 읽는다(규칙 18). 순서를 바꾸면 아래 상태 전이가 dirty checking을 못 탄다.
		generatedImages.demotePrimaries(placementId);

		Placement placement = placements.findByIdAndDeletedAtIsNull(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		// non-null은 prepare가 이미 확인했다 — user_id는 그 사이 바뀌지 않는다.
		User user = placement.getUser();

		// time_of_day는 전부 같다(ADR-0015 결정 6) — 시간대별 생성은 아직 없어 DAY 고정이다.
		for (int index = 0; index < imageKeys.size(); index++) {
			String imageKey = imageKeys.get(index);
			generatedImages.save(index == 0
					? GeneratedImage.createPrimary(user, placement, imageKey, TimeOfDay.DAY)
					: GeneratedImage.create(user, placement, imageKey, TimeOfDay.DAY));
		}
		placement.markPublished();
	}

	/**
	 * 도메인 값을 포트가 아는 형태(문자열)로 푼다 — {@code infra}는 {@code Placement}·
	 * {@code DeskTexture}·{@code FrameType}을 import할 수 없다(ADR-0007 결정 7).
	 */
	private ImageGenerationRequest generationRequestFor(Placement placement, String screenshotKey) {
		PlacementDesk desk = placement.getDesk();
		return new ImageGenerationRequest(
				screenshotKey,
				desk == null ? null : desk.getDeskTexture().getName(),
				desk == null ? null : desk.getFrameType().name(),
				placement.getItems().stream()
						.map(PlacedItem::getProduct)
						.map(Product::getName)
						.toList(),
				FeedEntryService.IMAGES_PER_UPLOAD);
	}

	/**
	 * 이 작업이 아직 유효한가 — 배치가 여전히 {@code PENDING}인가. 지워졌거나({@code Optional.empty})
	 * 사용자가 내렸거나 이미 발행됐으면 <b>철 지난 작업</b>이라 조용히 버린다.
	 *
	 * <p>예외를 던지지 않는 것이 중요하다 — 던지면 {@link ImagePublishWorker}가 {@link #markFailed}로
	 * 받아 <b>멀쩡히 공개된 배치를 실패로 뒤집는다.</b>
	 */
	private boolean isStillQueued(Long placementId) {
		return placements.findByIdAndDeletedAtIsNull(placementId)
				.map(Placement::isFeedEntryQueued)
				.orElse(false);
	}

	/**
	 * 생성 실패 → {@code FAILED}. 재시도는 사용자가 같은 {@code PUT}을 다시 부르는 것이다
	 * (ADR-0015 결정 10). 배치가 그 사이 지워졌으면 옮길 상태가 없으므로 조용히 넘어간다.
	 */
	@Transactional
	public void markFailed(Long placementId) {
		placements.findByIdAndDeletedAtIsNull(placementId).ifPresent(Placement::markFailed);
	}

	/**
	 * 배치 상세의 상상도. <b>가시성은 배치를 따른다</b> — 비로그인은 {@code PUBLIC}만, 로그인은
	 * {@code PUBLIC} + 본인 소유까지. 규칙에 안 맞으면 404다(api-spec.md §4).
	 *
	 * <p>몇 장을 돌려주는지는 {@code IMAGES_PER_UPLOAD}가 답한다 — 재게시 이력이 쌓여도 <b>현재
	 * 묶음만</b> 보여야 하므로 그 수만큼 최신 행에서 끊는다.
	 */
	public List<GeneratedImageResponse> listForPlacement(Long placementId, Long userId) {
		Placement placement = placements.findVisibleById(placementId, userId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		return generatedImages.findByPlacementIdOrderByIdDesc(placement.getId(),
						Limit.of(FeedEntryService.IMAGES_PER_UPLOAD)).stream()
				.sorted(Comparator.comparing(GeneratedImage::getId))
				.map(image -> new GeneratedImageResponse(image.getId(),
						publicImageUrl.url(image.getImageKey()), image.isPrimary(),
						image.getTimeOfDay(), image.getCreatedAt()))
				.toList();
	}
}
