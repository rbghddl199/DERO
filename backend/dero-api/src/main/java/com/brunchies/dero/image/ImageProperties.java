package com.brunchies.dero.image;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.image.*} 프로퍼티 바인딩.
 *
 * @param dailyQuota 하루에 뽑을 수 있는 상상도 <b>장</b> 수(ADR-0015 결정 8). 업로드 1회가
 *     {@code FeedEntryService.IMAGES_PER_UPLOAD}장이라 <b>그 배수여야 한다</b> — 아니면 "쓸 수 있는
 *     잔량이 있는데 업로드가 안 된다"는 설명 불가능한 상태가 생긴다. 1장 개정(2026-08-06) 이후로는
 *     모든 정수가 배수라 이 제약이 사실상 풀렸지만, 값의 뜻은 여전히 <b>장</b>이지 회차가 아니다.
 *     상수가 아니라 프로퍼티인 이유: 코드 상수는 조정에 재배포가 필요하고, 사용자별 DB 테이블은 지금
 *     전원이 같은 값이라 행이 전부 똑같아진다.
 * @param worker WAS 안 큐 소비 루프 설정.
 */
@ConfigurationProperties(prefix = "app.image")
public record ImageProperties(int dailyQuota, Worker worker) {

	/**
	 * @param enabled 소비 루프를 띄우는가. <b>안전 기본값은 꺼짐</b> — 켜면 그 프로세스가 Redis 큐에
	 *     묶이므로 테스트·로컬이 기본으로 붙지 않게 한다. 운영은 켠다({@code application-prod.yaml});
	 *     끄면 모든 업로드가 {@code PENDING}에서 멈춘다.
	 * @param pollTimeout {@code BLMOVE} 블로킹 시간. 이 주기마다 스위퍼도 한 번 돈다.
	 * @param processingTimeout 처리중 리스트에 이만큼 남아 있으면 유실로 보고 대기열로 되돌린다
	 *     (ADR-0015 결정 4). 10분은 <b>추측이고</b> 첫 실측 후 조정 대상이다.
	 */
	public record Worker(boolean enabled, Duration pollTimeout, Duration processingTimeout) {}
}
