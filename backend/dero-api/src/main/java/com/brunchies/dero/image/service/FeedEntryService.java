package com.brunchies.dero.image.service;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.image.ImageErrorCode;
import com.brunchies.dero.image.ImageProperties;
import com.brunchies.dero.image.queue.ImagePublishJob;
import com.brunchies.dero.image.queue.ImagePublishQueue;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementChangedEvent;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.judgment.JudgmentResult;
import com.brunchies.dero.placement.judgment.PlacementJudge;
import com.brunchies.dero.placement.repository.PlacementRepository;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 배치 업로드(데스크 피드 공개) 게이트와 큐 투입 — {@code PUT}/{@code DELETE
 * /placements/{id}/feed-entry}(ADR-0015, api-spec.md §4).
 *
 * <p><b>왜 {@code placement}가 아니라 {@code image} 패키지인가</b>: 게이트 ③이 일일 이미지 한도라
 * {@code generated_image}를 세야 하는데, 의존 방향이 {@code image → placement} 단방향이라
 * {@code placement}에서는 그 테이블을 볼 수 없다(ADR-0007 결정 7, {@code LayerDependencyTest}가
 * 기계로 막는다). 반대로 여기서는 판정 순수 함수와 {@code Placement} 루트를 그대로 부를 수 있다.
 * 경로가 {@code /placements/...}인 것과 패키지가 갈리는 것은 모순이 아니다 — URL은 리소스 계층이고
 * 패키지는 의존 계층이다.
 *
 * <p>게이트 4단계의 <b>순서가 계약이다</b>(api-spec.md §4):
 * <pre>
 *   ① 호환성 판정   위반이면 422 PLACEMENT_JUDGMENT_FAILED — 큐에 넣지 않는다
 *   ② 스크린샷      없으면 422 — 상상도 생성의 입력이다
 *   ③ 일일 한도     초과면 429 IMAGE_QUOTA_EXCEEDED
 *   ④ PENDING 전이 + 큐 투입 → 202 Accepted
 * </pre>
 * 나중에 판정하면 <b>생성 비용과 한도를 쓰고 나서 버리게 된다</b>. 그리고 "업로드됐다"는 피드백을 준
 * 몇 분 뒤에 뒤집는다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class FeedEntryService {

	/**
	 * 업로드 1회가 만드는 상상도 장수(ADR-0015 결정 6, 2026-08-06 3→1 개정). 한도 계산의 단위이기도
	 * 하다.
	 *
	 * <p><b>이 상수 하나가 장수의 정본이다</b> — 포트 요청의 {@code count}, 계약 검증, 상세 조회
	 * 개수, 한도 선차감이 전부 여기서 읽는다. 어디에도 숫자를 다시 쓰지 마라.
	 */
	public static final int IMAGES_PER_UPLOAD = 1;

	private final PlacementRepository placements;
	private final GeneratedImageRepository generatedImages;
	private final HashtagRepository hashtags;
	private final ImagePublishQueue queue;
	private final ImageProperties imageProperties;
	private final ApplicationEventPublisher events;

	/**
	 * 업로드 → 202. 게이트를 하나라도 못 넘으면 <b>큐에 아무것도 안 들어간다</b> — 예외가 트랜잭션을
	 * 되돌리고, 투입 자체가 커밋 뒤로 미뤄져 있기 때문이다({@link #enqueueAfterCommit}).
	 *
	 * <p><b>{@code PUT}이 곧 재시도 버튼이다</b> — 별도 재시도 엔드포인트를 만들지 않는다. 그래서
	 * <b>이미 {@code PENDING}이어도 다시 투입한다</b>: {@link #enqueueAfterCommit}는 커밋 뒤에 돌아서
	 * Redis가 그 찰나에 끊기면 <b>DB는 {@code PENDING}인데 큐는 비어 있는</b> 상태가 남는데, 여기서
	 * "이미 대기 중이니 넘어간다"로 막으면 그 배치는 어떤 사용자 동작으로도 풀 수 없다.
	 *
	 * <p>중복 투입이 안전한 근거는 소비 쪽에 있다 — {@code GeneratedImageService.publish}가
	 * {@code PENDING}이 아니면 아무것도 하지 않으므로 두 번째 작업은 무해한 no-op이다.
	 * <b>멱등성을 요청 쪽에서 지키려 들면 위 갇힘이 생긴다</b>: 소비 쪽에서 지켜야 둘 다 만족한다.
	 */
	@Transactional
	public void requestFeedEntry(Long userId, Long placementId, List<String> tags) {
		Placement placement = placements.findForJudgmentById(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		requireOwner(placement, userId);

		// ① 판정 게이트. CONDITIONAL은 막지 않는다 — 그건 카탈로그 규격이 미등록이라는 안내이지
		// 사용자의 배치가 틀렸다는 뜻이 아니다. 막으면 우리 데이터 결측이 사용자 공개를 막는다.
		boolean hasViolation = PlacementJudge.judge(placement).stream()
				.anyMatch(row -> row.judgment().result() == JudgmentResult.INCOMPATIBLE);
		if (hasViolation) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_JUDGMENT_FAILED);
		}

		// ② 스크린샷이 없으면 워커에 보낼 입력이 없다(ADR-0015 결정 7).
		if (placement.getThumbnailKey() == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_THUMBNAIL_REQUIRED);
		}

		// ③ 한도. 이미 PENDING인 배치의 재투입에는 한도를 다시 묻지 않는다 — 발행이 아직 안 일어나
		// 새로 소모할 장이 없고, 물으면 상한에 닿은 사용자가 재시도조차 못 하게 된다.
		if (!placement.isFeedEntryQueued()) {
			requireWithinDailyQuota(userId);
		}

		// ④ 태그 반영. 게이트를 다 넘은 뒤라, 판정·한도에서 튕긴 요청의 태그가 남지 않는다.
		applyTags(placement, tags);

		placement.requestFeedEntry();
		enqueueAfterCommit(placement.getId());
	}

	/**
	 * 태그를 다는 시점이 <b>공개 전환</b>이다(ADR-0027 결정 5) — {@code PRIVATE} 배치의 태그는 아무도
	 * 못 보므로 저장할 때마다 묻지 않는다.
	 *
	 * <p><b>{@code null}은 미변경이고 빈 목록은 전부 제거다.</b> {@code PUT}이 곧 재시도 버튼이라
	 * 본문 없는 재호출이 실재하는데, 그것을 "태그 없음"으로 읽으면 재시도 한 번에 태그가 조용히
	 * 지워진다({@code FeedEntryRequest}).
	 *
	 * <p><b>마스터는 {@code hashtag} 한 벌을 공유한다</b> — 없는 이름만 새로 만든다. 정션을 셋으로
	 * 가르되 마스터를 나누지 않는 이유는 {@code #원목데스크}가 피드와 커뮤니티에서 다른 태그가 되면
	 * 안 되기 때문이다. 해석 규칙은 {@code PostService.resolveHashtags}와 글자 그대로 같아야 한다.
	 */
	private void applyTags(Placement placement, List<String> tags) {
		if (tags == null) {
			return;
		}
		// 중복은 유니크 제약에 걸리기 전에 여기서 접는다 — 화면에서 같은 태그를 두 번 칠 수 있다.
		Set<String> unique = new LinkedHashSet<>(tags);
		List<Hashtag> resolved = new ArrayList<>(unique.size());
		for (String name : unique) {
			resolved.add(hashtags.findByNameAndDeletedAtIsNull(name)
					.orElseGet(() -> hashtags.save(Hashtag.create(name, null))));
		}
		placement.replaceHashtags(resolved);
		// 태그가 색인 대상이라(ADR-0027) 커밋 뒤에 문서를 다시 만들어야 한다.
		events.publishEvent(new PlacementChangedEvent(placement.getId()));
	}

	/**
	 * 태그만 교체 → 204(DERO-493). <b>게시 상태도 큐도 건드리지 않는다</b> — 공개된 뒤에 태그를
	 * 고치려고 {@link #requestFeedEntry}를 다시 부르면 배치가 {@code PUBLIC}에서 {@code PENDING}으로
	 * 되돌아가 상상도를 다시 만들고 일일 한도까지 깎는다. 그래서 태그 수정은 별도 자리다.
	 *
	 * <p><b>본문의 {@code null}은 여기서 유효하지 않다</b>({@code FeedEntryTagsRequest}의
	 * {@code @NotNull}) — 재시도 호출이 없어 "미변경"이 뜻을 갖지 않는다. 빈 목록이 전부 제거다.
	 *
	 * <p>남의 배치면 404다(403이 아니다 — 존재 여부를 흘리지 않는다). <b>{@code PRIVATE} 배치도
	 * 막지 않는다</b>: 아무에게도 안 보이는 태그를 고치는 것은 무해하고, 상태를 하나 더 물으면 공개
	 * 취소 후 재공개 사이에 태그를 못 고치는 창이 생긴다.
	 */
	@Transactional
	public void replaceTags(Long userId, Long placementId, List<String> tags) {
		Placement placement = placements.findByIdAndDeletedAtIsNull(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		requireOwner(placement, userId);
		applyTags(placement, tags);
	}

	/** 공개 취소 → 204. 남의 배치면 404다(403이 아니다 — 존재 여부를 흘리지 않는다). */
	@Transactional
	public void withdrawFeedEntry(Long userId, Long placementId) {
		Placement placement = placements.findByIdAndDeletedAtIsNull(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		requireOwner(placement, userId);
		placement.withdrawFeedEntry();
	}

	/**
	 * <b>"이 사용자의 오늘 상한"을 답하는 판단 지점은 여기 하나다</b>(ADR-0015 결정 8) — 결제가 오면
	 * 바뀌는 것도 이 메서드 하나다.
	 *
	 * <p>하루의 경계는 JVM 기본 존이다({@code user.timezone=Asia/Seoul}, {@code build.gradle}).
	 * 이번 업로드가 만들 {@link #IMAGES_PER_UPLOAD}장을 <b>미리 더해서</b> 비교한다 — 안 그러면
	 * 모자란 잔량으로 업로드를 시작해 워커 쪽에서 상한을 넘긴다.
	 */
	private void requireWithinDailyQuota(Long userId) {
		OffsetDateTime startOfDay = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS);
		long usedToday = generatedImages.countByUserIdAndCreatedAtGreaterThanEqual(userId, startOfDay);
		if (usedToday + IMAGES_PER_UPLOAD > imageProperties.dailyQuota()) {
			throw new BusinessException(ImageErrorCode.IMAGE_QUOTA_EXCEEDED);
		}
	}

	/**
	 * <b>커밋된 뒤에 넣는다.</b> 트랜잭션 안에서 넣으면 워커가 커밋 전에 집어 {@code PRIVATE}인 배치를
	 * 보고 그대로 버릴 수 있다 — 작업이 유실되고 사용자는 영원히 대기 상태를 본다.
	 */
	private void enqueueAfterCommit(Long placementId) {
		ImagePublishJob job = new ImagePublishJob(placementId, OffsetDateTime.now());
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				queue.enqueue(job);
			}
		});
	}

	private void requireOwner(Placement placement, Long userId) {
		if (!placement.isOwnedBy(userId)) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND);
		}
	}
}
