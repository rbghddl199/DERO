package com.brunchies.dero.infra;

import java.util.List;

/**
 * AI 상상도 생성 포트({@code package-info.java}의 포트 3곳 중 {@code ImageGenerator}).
 *
 * <p>도메인({@code image})이 아는 것은 이 인터페이스뿐이다 — 구현은
 * {@code app.image.generation.mode}로 갈린다: {@code stub}(기본)이면 {@link StubImageGeneration},
 * {@code gms}면 {@link GmsImageGeneration}. {@link PresignPort}가 {@code app.storage.mode}로
 * 갈리는 것과 같은 관용구다.
 *
 * <p><b>저장까지 구현체 책임이다</b> — 도메인이 받는 것은 스토리지 key 몇 개뿐이고, 바이트를 어디에
 * 어떻게 넣었는지는 알지 않는다. 그래서 스텁(파일을 만들지 않고 입력 key를 되돌려 준다)과
 * GMS(base64를 디코드해 스토리지에 PNG로 넣는다)가 <b>같은 계약</b>을 만족한다.
 */
public interface ImageGenerationPort {

	/**
	 * 상상도를 만들고 저장한 뒤 <b>스토리지 key를</b> 돌려준다.
	 *
	 * <p>반환 개수는 {@link ImageGenerationRequest#count()}와 같아야 한다 — 부분 성공은 없다.
	 * 실패는 예외로 나간다({@code ImagePublishWorker}가 받아 배치를 {@code FAILED}로 옮긴다).
	 */
	List<String> generate(ImageGenerationRequest request);
}
