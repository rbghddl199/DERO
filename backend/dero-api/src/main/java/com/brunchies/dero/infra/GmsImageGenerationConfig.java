package com.brunchies.dero.infra;

import org.springframework.beans.factory.BeanInitializationException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * {@link GmsImageGeneration}이 쓰는 {@link RestClient} 빈. {@code app.image.generation.mode=gms}일
 * 때만 만들어진다.
 *
 * <p><b>{@link GmsImageGeneration} 안에서 {@code RestClient.Builder}로 조립하지 않는다.</b> 그러면
 * {@code MockRestServiceServer}가 빌더에 심어 둔 목 request factory를 생성자가 덮어써서 테스트가
 * 조용히 진짜 네트워크를 친다. 완성된 클라이언트를 주입받으면 테스트가 목을 그대로 넣을 수 있다.
 *
 * <p><b>키가 없으면 여기서 기동을 세운다.</b> 런타임 401로 미루면 업로드가 전부 {@code FAILED}로
 * 쌓인 뒤에야 드러나고, 그 사고 모양(운영 전용 설정 누락이 배포에서만 죽는 것)은 이 프로젝트에
 * 이미 3연속으로 있었다({@code dero-api/CLAUDE.md}).
 *
 * <p><b>request factory를 {@link BufferingClientHttpRequestFactory}로 감싸는 것이 이 빈의 세 번째
 * 이유다 — 빼면 상상도가 운영에서 100% 실패한다.</b> Spring 7의 {@code SimpleClientHttpRequest}는
 * {@code Content-Length}가 없으면 {@code setChunkedStreamingMode}로 보내는데,
 * {@code FormHttpMessageConverter}는 multipart를 쓸 때 길이를 설정하지 않으므로 항상 chunked로 나간다.
 * 그러면 GMS 앞단 cloudflare가 본문을 읽지 못하고 {@code 400 Bad Request} HTML로 튕긴다(2026-08-02
 * 운영 실측 — 같은 요청에 {@code -H "Transfer-Encoding: chunked"}만 붙이면 재현된다). 버퍼링 래퍼가
 * 본문을 {@code byte[]}로 모아 {@code Content-Length}를 채워 주므로 fixed-length로 나간다.
 * <b>{@code request-type=generations} 강등으로도 못 산다</b> — JSON 경로도 chunked면 똑같이 400이다.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "app.image.generation", name = "mode", havingValue = "gms")
public class GmsImageGenerationConfig {

	@Bean
	public RestClient gmsRestClient(ImageGenerationProperties properties) {
		if (properties.apiKey() == null || properties.apiKey().isBlank()) {
			// IllegalStateException이 아니라 Spring 예외다 — ADR-0012 결정 4가 Illegal*Exception을
			// 금지하고(ExceptionConventionTest가 기계로 막는다), 여기는 요청 처리가 아니라 빈 생성
			// 실패라 BusinessException + HTTP 상태를 붙일 자리도 아니다.
			throw new BeanInitializationException(
					"app.image.generation.mode=gms 인데 GMS_API_KEY가 비어 있습니다. "
							+ "환경변수를 채우거나 mode를 stub으로 되돌리세요.");
		}
		SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout(properties.connectTimeout());
		requestFactory.setReadTimeout(properties.readTimeout());
		return RestClient.builder()
				.baseUrl(properties.baseUrl())
				// 감싸지 않으면 multipart가 chunked로 나가 cloudflare가 400으로 튕긴다(클래스 javadoc).
				.requestFactory(new BufferingClientHttpRequestFactory(requestFactory))
				.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.apiKey())
				.build();
	}
}
