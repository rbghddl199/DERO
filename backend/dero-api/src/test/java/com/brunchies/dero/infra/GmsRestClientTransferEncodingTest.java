package com.brunchies.dero.infra;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * {@link GmsImageGenerationConfig}가 만든 {@link RestClient}가 <b>실제로 전선에 무엇을 흘리는지</b>를
 * 못 박는다 — multipart 본문이 {@code Content-Length}와 함께 나가야 한다.
 *
 * <p><b>{@code MockRestServiceServer}로는 이 회귀를 못 잡는다</b> — 목이 request factory 자리를
 * 통째로 대신해서 HTTP 전송 계층(청크 인코딩 여부)이 아예 실행되지 않는다. 그래서 JDK 내장
 * {@link HttpServer}를 루프백 랜덤 포트에 띄우고 진짜 소켓으로 보낸다.
 *
 * <p>회귀 내용: chunked로 나가면 GMS 앞단 cloudflare가 본문을 못 읽고 {@code 400 Bad Request} HTML로
 * 튕겨 상상도가 100% 실패한다(2026-08-02 운영 실측). 사유는 {@link GmsImageGenerationConfig} javadoc.
 */
class GmsRestClientTransferEncodingTest {

	private HttpServer server;
	private final AtomicReference<HttpHeaders> received = new AtomicReference<>();
	private final AtomicReference<Integer> receivedBodyLength = new AtomicReference<>();

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/v1/images/edits", this::handle);
		server.start();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	@Test
	@DisplayName("multipart 요청이 Content-Length를 달고 나가고 chunked로 나가지 않는다")
	void multipart는_고정_길이로_나간다() {
		RestClient client = new GmsImageGenerationConfig().gmsRestClient(properties());

		client.post()
				.uri("/v1/images/edits")
				.contentType(MediaType.MULTIPART_FORM_DATA)
				.body(multipartBody())
				.retrieve()
				.toBodilessEntity();

		HttpHeaders headers = received.get();
		assertThat(headers).isNotNull();
		assertThat(headers.getContentLength()).isGreaterThan(0);
		assertThat(headers.getContentLength()).isEqualTo(receivedBodyLength.get().longValue());
		assertThat(headers.getFirst("Transfer-Encoding"))
				.satisfiesAnyOf(
						encoding -> assertThat(encoding).isNull(),
						encoding -> assertThat(encoding).isNotEqualToIgnoringCase("chunked"));
	}

	private void handle(HttpExchange exchange) throws IOException {
		HttpHeaders headers = new HttpHeaders();
		exchange.getRequestHeaders().forEach(headers::addAll);
		received.set(headers);
		try (InputStream body = exchange.getRequestBody()) {
			receivedBodyLength.set(body.readAllBytes().length);
		}
		exchange.sendResponseHeaders(200, -1);
		exchange.close();
	}

	private MultiValueMap<String, Object> multipartBody() {
		MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
		parts.add("model", "gpt-image-2");
		parts.add("prompt", "책상 위에 호두나무 상판이 있다");
		// 파일명이 있어야 파일 파트로 나간다 — infra/CLAUDE.md의 함정과 같은 이유다.
		parts.add("image", new ByteArrayResource("fake-png".getBytes()) {
			@Override
			public String getFilename() {
				return "screenshot.png";
			}
		});
		return parts;
	}

	private ImageGenerationProperties properties() {
		return new ImageGenerationProperties("gms", "test-gms-api-key",
				"http://127.0.0.1:" + server.getAddress().getPort(),
				ImageGenerationProperties.RequestType.EDITS, "gpt-image-2", "auto",
				Duration.ofSeconds(5), Duration.ofSeconds(30));
	}
}
