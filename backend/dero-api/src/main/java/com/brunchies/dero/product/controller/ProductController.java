package com.brunchies.dero.product.controller;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.global.search.SearchEventLogger;
import com.brunchies.dero.global.search.SearchIndex;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.ProductDetailResponse;
import com.brunchies.dero.product.dto.ProductSuggestionsResponse;
import com.brunchies.dero.product.service.ProductCatalogService;
import java.util.List;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 제품 카탈로그 목록·상세(`docs/context/api-spec.md` §5). 사용자 대면 목록이라 커서 페이지네이션이다
 * (ADR-0008 결정 5 — "제품 카탈로그(배치 화면 패널)"가 그 표에 이미 커서로 지정돼 있다).
 *
 * <p><b>서브타입별 경로를 만들지 않는다</b> — 부분집합은 전부 쿼리 파라미터다(같은 문서 §1 규칙 3).
 * 옛 {@code GET /products/desks}가 {@code GET /products?specType=DESK}로 흡수됐다.
 *
 * <p><b>{@code specType}·{@code categoryId}는 둘 다 선택 필터다</b>(DERO-325부터 규격 5종 전부
 * 목록 조회가 가능하다) — 생략하면 전체 제품이 등록순으로 나온다.
 *
 * <p><b>{@code q}는 서버 검색이다</b>(ADR-0019) — Elasticsearch가 관련도 순서로 제품 id를 주고
 * 상세는 Postgres에서 읽는다. 커서 페이지네이션과 <b>병존</b>한다: {@code q}가 없으면 지금까지의
 * 등록순 목록 그대로다. ES가 죽으면 이 파라미터를 실은 요청만 503이고 나머지는 산다(결정 6).
 *
 * <p><b>{@code categoryId}는 반복해서 실을 수 있다</b> — {@code ?categoryId=52&categoryId=53}
 * (콤마 구분 {@code ?categoryId=52,53}도 같다). 값 하나만 실은 기존 호출은 원소 1개짜리 목록으로
 * 바인딩되므로 <b>동작이 바뀌지 않는다</b>. 각 id는 그대로 하위 트리로 롤업된 뒤 합집합이 된다.
 *
 * <p><b>상세는 관리자와 공유한다</b>(같은 문서 §9) — 표현이 같아 {@code /admin} 트리에 사본을 만들지
 * 않는다. 대신 검수 미통과 자작 제품·숨긴 제품의 열람 권한이 호출자에 따라 갈리므로 여기서
 * {@link Authentication}을 읽어 서비스에 넘긴다.
 */
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;
	private static final String ADMIN_AUTHORITY = "ROLE_ADMIN";

	/**
	 * {@code categoryId} 개수 상한. {@code size}처럼 자르지 않고 <b>거절한다</b> — 자르면 요청한
	 * 카테고리 일부가 조용히 빠진 목록이 200으로 나가고, 호출자는 그 카테고리에 제품이 없는 것으로
	 * 읽는다. 카테고리 마스터는 수십 행짜리 표라(2026-08-05 실측 54행) 정상 호출이 이 값에 닿지
	 * 않고, 상한 없이 두면 임의 길이 {@code in} 목록이 그대로 쿼리에 실린다.
	 */
	private static final int MAX_CATEGORY_IDS = 100;

	/**
	 * {@code sub} 클레임(= {@code user.id})의 형태. 익명 인증의 이름은 {@code "anonymousUser"}라 이
	 * 패턴에 걸리지 않는다 — 먼저 걸러야 {@code Long.valueOf}의 예외를 잡아 삼키지 않는다(규칙 8).
	 */
	private static final Pattern USER_ID_PATTERN = Pattern.compile("\\d{1,18}");

	private final ProductCatalogService productCatalogService;
	private final SearchEventLogger searchEventLogger;

	/**
	 * {@code size}는 어노테이션 검증 대신 여기서 [1, 100] 사이로 자른다 — {@code @RequestParam}에
	 * 제약을 걸려면 컨트롤러에 {@code @Validated}를 얹어야 하는데, 그러면 던져지는
	 * {@code ConstraintViolationException}을 {@code GlobalExceptionHandler}가 아직 처리하지 않는다
	 * (지금 처리하는 건 {@code @Valid @RequestBody}의 {@code MethodArgumentNotValidException}뿐).
	 * 새 예외 처리 배선을 늘리는 대신 자르는 쪽을 택했다 — 어차피 상한의 목적(무제한 쿼리 방지)은
	 * 자르기만 해도 달성된다.
	 *
	 * <p><b>{@code q}가 실린 요청은 검색어 이벤트를 하나 남긴다</b>(ADR-0020 결정 7 —
	 * {@link SearchEventLogger}). 여기가 그 자리인 이유는 <b>결과 건수가 노출 규칙까지 적용된 뒤의
	 * 값이어야 하기 때문</b>이다(0건 검색어 = 카탈로그 구멍 목록) — 서비스 안쪽 ES 히트 수는 숨김·
	 * 검수 대기 제품을 아직 포함한다.
	 *
	 * <p><b>첫 페이지에서만 남긴다.</b> 이벤트 하나가 "검색 한 번"이라 스크롤로 다음 페이지를 받을
	 * 때마다 남기면 같은 검색어가 여러 번 세어져 인기 검색어 순위가 스크롤 길이를 반영한다.
	 * <b>{@code /products/suggestions}는 남기지 않는다</b> — 키 입력마다 오는 호출이라 타이핑 도중의
	 * 접두사가 통째로 쌓여 두 대시보드가 모두 무의미해진다.
	 */
	@GetMapping
	public ResponseEntity<CursorPage<ProductDetailResponse>> list(
			@RequestParam(required = false) SpecType specType,
			@RequestParam(required = false) List<Long> categoryId,
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String cursor,
			@RequestParam(required = false) Integer size,
			Authentication authentication) {
		if (categoryId != null && categoryId.size() > MAX_CATEGORY_IDS) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		CursorPage<ProductDetailResponse> page =
				productCatalogService.list(specType, categoryId, q, cursor, effectiveSize);

		if (q != null && !q.isBlank() && cursor == null) {
			searchEventLogger.searched(
					SearchIndex.PRODUCTS, q, page.totalCount(), callerUserId(authentication));
		}
		return ResponseEntity.ok(page);
	}

	/**
	 * 검색어 추천 → 200. 입력창 아래 드롭다운에 세울 <b>문자열 목록</b>이다(ADR-0019 결정 1의 요구 ③).
	 *
	 * <p><b>{@code GET /products?q=}와 자료구조가 다르다.</b> 목록 쪽은 역색인을 타 결과 <b>제품</b>을
	 * 갱신하고, 여기는 메모리에 올라간 별도 FST(completion suggester)라 키 입력마다 불러도 싸다.
	 * 화면에서도 역할이 갈린다 — 하나는 결과 목록, 하나는 다음에 칠 검색어다.
	 *
	 * <p><b>{@code q}가 비면 ES를 부르지 않고 빈 목록이다</b> — 입력창을 비운 순간의 요청이 곧
	 * "추천할 것이 없다"라 400으로 막을 이유가 없다. ES가 죽으면 여기도 503이고 폴백은 없다(결정 6).
	 */
	@GetMapping("/suggestions")
	public ResponseEntity<ProductSuggestionsResponse> suggestions(
			@RequestParam(required = false) String q) {
		return ResponseEntity.ok(productCatalogService.suggest(q));
	}

	/**
	 * 단건 상세 → 200. 규격·에셋·발광·실사 이미지를 한 응답에 담는다.
	 *
	 * <p><b>{@code authentication}은 널일 수 있다</b> — 이 경로는 {@code permitAll}이고, 필터를 끈
	 * 슬라이스 테스트에서는 익명 토큰조차 만들어지지 않는다. 없는 제품·볼 권한이 없는 제품 모두
	 * 404이므로(존재 여부 자체가 정보다) 여기서 인증을 강제하지 않는다.
	 */
	@GetMapping("/{productId}")
	public ResponseEntity<ProductDetailResponse> detail(
			@PathVariable Long productId, Authentication authentication) {
		return ResponseEntity.ok(productCatalogService.getDetail(
				productId, callerUserId(authentication), isAdmin(authentication)));
	}

	private static Long callerUserId(Authentication authentication) {
		if (authentication == null || !authentication.isAuthenticated()) {
			return null;
		}
		String name = authentication.getName();
		return name != null && USER_ID_PATTERN.matcher(name).matches() ? Long.valueOf(name) : null;
	}

	/** {@code role} 클레임이 {@code ROLE_} 접두 권한으로 변환돼 있다({@code SecurityConfig}). */
	private static boolean isAdmin(Authentication authentication) {
		return authentication != null && authentication.getAuthorities().stream()
				.map(GrantedAuthority::getAuthority)
				.anyMatch(ADMIN_AUTHORITY::equals);
	}
}
