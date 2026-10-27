package com.brunchies.dero.image.queue;

import java.time.OffsetDateTime;

/**
 * 상상도 생성 작업 한 건 — 큐에 실리는 메시지 본문이다(ADR-0015).
 *
 * <p><b>스텁 전용 필드를 넣지 않는다.</b> 스텁이 편하려고 필드를 더하면 생성기를 갈아탈 때 큐 계약이
 * 같이 바뀐다 — 갈리는 것은 {@code ImageGenerationPort} 구현 하나여야 한다(D29·ADR-0025 결정 4로
 * 로컬 python 워커 기획이 파기되면서 실제로 그렇게 됐다).
 *
 * <p>스크린샷 presigned GET·업로드 대상 presigned PUT을 <b>여기 싣지 않는다</b> — presign은 TTL이
 * 있고 큐 대기 시간은 상한이 없어서, 워커가 늦게 집으면 만료된 URL을 받는다. 워커는 배치 id를
 * 들고 와서 그때 발급받는다.
 *
 * @param placementId 어느 배치의 상상도인가.
 * @param requestedAt 사용자가 업로드를 누른 시각. 큐 적체를 눈으로 재는 유일한 값이다.
 */
public record ImagePublishJob(Long placementId, OffsetDateTime requestedAt) {}
