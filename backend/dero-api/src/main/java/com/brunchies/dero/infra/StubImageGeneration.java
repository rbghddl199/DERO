package com.brunchies.dero.infra;

import java.util.Collections;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * {@link ImageGenerationPort}의 스텁 구현 — <b>그림을 만들지 않고 스크린샷 key를 그대로 돌려준다</b>
 * (D27-보). {@code app.image.generation.mode}의 기본값이라 아무것도 설정하지 않으면 이쪽이 뜬다.
 *
 * <p><b>스토리지에 파일을 복사하지 않는다.</b> 도메인이 아는 스토리지 연산은 {@link PresignPort}뿐이고
 * 바이트를 만지는 건 {@link LocalFileController}인 데다, S3 모드엔 복사 연산 자체가 없다
 * ({@code infra/CLAUDE.md}). 그래서 스텁 모드의 상상도는 스크린샷 파일 그 자체를 가리킨다 —
 * 계약("{@code count}개의 유효한 key")은 그대로 만족한다.
 */
@Component
@ConditionalOnProperty(prefix = "app.image.generation", name = "mode", havingValue = "stub",
		matchIfMissing = true)
public class StubImageGeneration implements ImageGenerationPort {

	@Override
	public List<String> generate(ImageGenerationRequest request) {
		return Collections.nCopies(request.count(), request.screenshotKey());
	}
}
