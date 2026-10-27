package com.brunchies.dero.global.search;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * 별칭 뒤 실체 인덱스의 수명 주기 — 생성·별칭 스왑·매핑 비교(ADR-0019 결정 5).
 *
 * <p><b>도메인 지식이 하나도 없다.</b> 무엇을 색인하는지(문서 모양·질의·이벤트)는 각 도메인의
 * {@code *SearchService}가 알고, 여기는 "정의 파일로 인덱스를 만들고 별칭을 옮긴다"만 안다 —
 * 그래서 {@code global}에 있고 어떤 도메인도 모른다.
 *
 * <p><b>{@code posts}와 {@code users} 둘이 같은 절차를 쓰게 되면서 뽑았다</b>(DERO-491).
 * {@code ProductSearchService}는 아직 자기 안에 같은 코드를 들고 있다 — 검색 품질 회귀 가드가
 * 그쪽에 걸려 있어 이 티켓에서 건드리지 않았다. 배치 검색(DERO-490)이 세 번째 사용자다.
 *
 * <p><b>사용자 사전은 여기서 꽂지 않는다.</b> 브랜드 사전은 {@code catalog}를 읽어야 하는데
 * {@code global}은 도메인을 모르고, 게시글·닉네임은 브랜드 오분해가 문제가 되는 자리도 아니다
 * (제품 이름과 달리 브랜드명이 통째로 들어오는 필드가 아니다).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SearchIndexLifecycle {

	/**
	 * 실체 인덱스 이름의 꼬리. <b>밀리초까지 찍는다</b> — 초 단위로 자르면 같은 초에 재색인을 두 번
	 * 부른 순간 {@code resource_already_exists_exception}으로 두 번째가 통째로 실패한다
	 * (2026-08-06 실측, 연속 실행되는 통합 테스트에서 재현).
	 */
	private static final DateTimeFormatter INDEX_SUFFIX =
			DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

	private final ElasticsearchClient elasticsearch;
	private final ObjectMapper objectMapper;

	/** 별칭이 이미 서 있는가. 없으면 첫 색인이다. */
	public boolean aliasExists(String alias) throws IOException {
		return elasticsearch.indices().existsAlias(request -> request.name(alias)).value();
	}

	/**
	 * 정의 파일로 새 실체 인덱스를 만든다 — <b>별칭은 아직 안 옮긴다</b>. 채운 뒤
	 * {@link #swapAlias(String, String)}을 부르는 것이 짝이다.
	 *
	 * @return 만들어진 실체 인덱스 이름
	 */
	public String createIndex(String alias, String definitionPath) throws IOException {
		String index = alias + "_v" + OffsetDateTime.now().format(INDEX_SUFFIX);
		String definition = definition(definitionPath);
		elasticsearch.indices().create(create -> create
				.index(index)
				.withJson(new StringReader(definition)));
		return index;
	}

	/**
	 * 별칭을 새 인덱스로 옮기고 옛 인덱스를 지운다. 붙이기와 떼기를 한 요청에 담아야 <b>별칭이
	 * 어디에도 안 붙은 순간</b>이 생기지 않는다.
	 */
	public void swapAlias(String alias, String index) throws IOException {
		Set<String> previous = aliasedIndices(alias);

		elasticsearch.indices().updateAliases(update -> {
			previous.forEach(old -> update.actions(action ->
					action.remove(remove -> remove.index(old).alias(alias))));
			return update.actions(action -> action.add(add -> add.index(index).alias(alias)));
		});

		for (String old : previous) {
			elasticsearch.indices().delete(delete -> delete.index(old));
		}
	}

	/**
	 * 정의 파일에는 있는데 살아 있는 인덱스에는 없는 최상위 필드들. 비어 있으면 매핑이 최신이다.
	 *
	 * <p><b>같은 이름으로 분석 규칙만 바뀐 배포는 여기서 안 잡힌다</b>(ADR-0028) — 그때는 손으로
	 * 전량 재색인을 불러야 한다.
	 */
	public Set<String> missingMappedFields(String alias, String definitionPath) throws IOException {
		Set<String> live = elasticsearch.indices().getMapping(mapping -> mapping.index(alias))
				.mappings().values().stream()
				.flatMap(record -> record.mappings().properties().keySet().stream())
				.collect(Collectors.toSet());

		Set<String> defined = new LinkedHashSet<>(objectMapper.readTree(definition(definitionPath))
				.get("mappings").get("properties").propertyNames());

		defined.removeAll(live);
		return defined;
	}

	/**
	 * 별칭을 넘기기 전에 새 인덱스를 검색 가능 상태로 만든다 — refresh 없이 스왑하면 스왑 직후
	 * 1초 남짓 동안 검색이 0건을 돌려준다.
	 */
	public void refresh(String index) throws IOException {
		elasticsearch.indices().refresh(request -> request.index(index));
	}

	/** 실패 경로의 뒷정리 — 이미 다른 예외를 던지는 중이라 여기서 더 던지지 않는다. */
	public void deleteQuietly(String index) {
		if (index == null) {
			return;
		}
		try {
			elasticsearch.indices().delete(delete -> delete.index(index));
		} catch (IOException | ElasticsearchException e) {
			log.warn("실패한 재색인 인덱스를 지우지 못했습니다 — 손으로 지웁니다: index={}", index, e);
		}
	}

	/**
	 * 별칭이 가리키는 인덱스들. <b>아직 아무 인덱스도 없으면 빈 집합이다</b> — ES는 없는 별칭 조회에
	 * 404를 주고, {@code ignore_unavailable}은 인덱스에만 걸리지 별칭에는 안 걸린다(2026-08-06 실측:
	 * {@code alias [products] missing}으로 첫 색인이 통째로 실패했다).
	 */
	private Set<String> aliasedIndices(String alias) throws IOException {
		try {
			return elasticsearch.indices().getAlias(request -> request.name(alias))
					.aliases().keySet();
		} catch (ElasticsearchException e) {
			// 404는 "첫 색인"이라는 정상 상태다. 나머지 오류는 그대로 올린다.
			if (e.status() == HttpStatus.NOT_FOUND.value()) {
				return Set.of();
			}
			throw e;
		}
	}

	private String definition(String path) throws IOException {
		try (InputStream in = new ClassPathResource(path).getInputStream()) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
	}
}
