package com.brunchies.dero.image.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

/**
 * 플래그가 꺼져 있으면 <b>소비 루프가 아예 없다</b>는 것을 못 박는다.
 *
 * <p>"스레드는 뜨는데 아무것도 안 한다"가 아니라 "빈이 없다"여야 테스트·로컬이 Redis 큐에 묶이지
 * 않는다는 보장이 눈에 보인다. 이 클래스가 {@code AbstractRedisIntegrationTest}가 아니라
 * Postgres 베이스를 상속하는 것 자체가 그 증거다 — Redis 없이도 컨텍스트가 뜬다.
 */
class ImagePublishWorkerTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private ApplicationContext context;

	@Test
	@DisplayName("app.image.worker.enabled 기본값(꺼짐)에서는 소비 루프 빈이 만들어지지 않는다")
	void 플래그가_꺼져_있으면_워커_빈이_없다() {
		assertThat(context.getBeanNamesForType(ImagePublishWorker.class)).isEmpty();
	}
}
