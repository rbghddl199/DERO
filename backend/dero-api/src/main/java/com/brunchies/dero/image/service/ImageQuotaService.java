package com.brunchies.dero.image.service;

import com.brunchies.dero.image.ImageProperties;
import com.brunchies.dero.image.dto.ImageQuotaResponse;
import com.brunchies.dero.image.repository.GeneratedImageRepository;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 오늘 쓴 장수·상한·리셋 시각({@code GET /users/me/image-quota}, REQ-IMG-03).
 *
 * <p><b>왜 {@code user}가 아니라 {@code image} 패키지인가</b>: 카운트 근거가
 * {@code generated_image}인데 의존 방향이 {@code image → user} 단방향이라 {@code user}에서는 그
 * 테이블을 볼 수 없다(ADR-0007 결정 7, {@code LayerDependencyTest}가 기계로 막는다).
 * {@code PUT /placements/{id}/feed-entry}가 같은 이유로 여기 사는 것과 같은 판단이다 — URL은 리소스
 * 계층이고 패키지는 의존 계층이다.
 *
 * <p><b>읽기 전용이다</b> — 차감·충전 경로를 여기 두지 마라. 차감은 상상도 행이 실제로 만들어질 때
 * ({@code GeneratedImageService.publish}) 일어나고, 초과 판단 지점은
 * {@code FeedEntryService.requireWithinDailyQuota} 하나다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ImageQuotaService {

	private final GeneratedImageRepository generatedImages;
	private final ImageProperties imageProperties;

	/**
	 * <b>하루의 경계는 JVM 기본 존이다</b>({@code user.timezone=Asia/Seoul}, {@code build.gradle}) —
	 * {@code FeedEntryService.requireWithinDailyQuota}가 세는 구간과 <b>같은 식이어야 한다</b>.
	 * 한쪽만 바꾸면 화면이 "0장 남음"인데 업로드는 되는(또는 그 반대) 상태가 된다.
	 */
	public ImageQuotaResponse getQuota(Long userId) {
		OffsetDateTime startOfDay = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS);
		return new ImageQuotaResponse(
				generatedImages.countByUserIdAndCreatedAtGreaterThanEqual(userId, startOfDay),
				imageProperties.dailyQuota(),
				startOfDay.plusDays(1));
	}
}
