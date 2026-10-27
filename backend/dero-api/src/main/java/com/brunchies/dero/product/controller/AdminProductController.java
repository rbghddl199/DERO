package com.brunchies.dero.product.controller;

import com.brunchies.dero.global.response.OffsetPage;
import com.brunchies.dero.product.ReviewStatus;
import com.brunchies.dero.product.dto.AdminProductCreateRequest;
import com.brunchies.dero.product.dto.AdminProductPatchRequest;
import com.brunchies.dero.product.dto.AdminProductResponse;
import com.brunchies.dero.product.dto.AdminProductReviewRequest;
import com.brunchies.dero.product.dto.AdminProductSummaryResponse;
import com.brunchies.dero.product.dto.OnCreate;
import com.brunchies.dero.product.service.AdminProductService;
import jakarta.validation.Valid;
import jakarta.validation.groups.Default;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 운영진 제품 관리(`docs/context/api-spec.md` §9 — REQ-ADM-01·02·04).
 *
 * <p><b>관리자는 {@code /admin/*} 별도 트리다</b>(같은 문서 §1 규칙 5) — 사용자 목록은 커서,
 * 관리자 목록은 offset이라 같은 경로가 두 페이지네이션 규약을 가질 수 없다. 그래서 {@code /products}가
 * 아니라 여기고, 응답 봉투도 {@link OffsetPage}다.
 *
 * <p><b>admin 톱레벨 패키지를 만들지 않는다</b>(ADR-0007 — 톱레벨 10개 고정). 관리자 화면이라는
 * 것은 <b>사용자</b>의 성격이지 도메인이 아니다: 이 컨트롤러가 다루는 애그리거트는 여전히
 * {@code Product}라 규격 서브타입·검수 상태·에러 코드를 제품 도메인과 공유한다. 패키지를 가르면 그
 * 어휘가 두 벌이 된다.
 *
 * <p><b>지금 권한 검사가 없다</b> — {@code SecurityConfig}가 2026-07-29부터 전 경로
 * {@code permitAll}이다(로그인 연동 일시 중단, 박동규 지시). 그 줄이 걷히면 이 컨트롤러는
 * {@code hasRole("ADMIN")} 대상이다({@code role} 클레임 → {@code ROLE_} 접두 변환이 이미 배선돼 있다).
 */
@RestController
@RequestMapping("/api/v1/admin/products")
@RequiredArgsConstructor
public class AdminProductController {

	private static final int DEFAULT_SIZE = 20;
	private static final int MAX_SIZE = 100;

	private final AdminProductService adminProductService;

	/**
	 * 검수 목록. {@code status}는 {@code asset.review_status} 필터이고 생략하면 전체다.
	 *
	 * <p>{@code page}·{@code size}는 어노테이션 검증 대신 여기서 자른다 —
	 * {@code @RequestParam}에 제약을 걸려면 컨트롤러에 {@code @Validated}를 얹어야 하는데 그러면
	 * 던져지는 {@code ConstraintViolationException}을 {@code GlobalExceptionHandler}가 처리하지 않아
	 * 500이 된다({@code ProductController}가 같은 판단을 이미 했다).
	 */
	@GetMapping
	public ResponseEntity<OffsetPage<AdminProductSummaryResponse>> list(
			@RequestParam(required = false) ReviewStatus status,
			@RequestParam(required = false) Long brandId,
			@RequestParam(required = false) Long categoryId,
			@RequestParam(required = false) String keyword,
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		int effectivePage = page == null ? 0 : Math.max(page, 0);
		int effectiveSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
		return ResponseEntity.ok(adminProductService.list(
				status, brandId, categoryId, keyword, effectivePage, effectiveSize));
	}

	/**
	 * 제품 등록 → 201 + {@code Location}.
	 *
	 * <p><b>{@code @Valid}가 아니라 {@code @Validated({Default, OnCreate})}다</b> — 규격 요청 record를
	 * PATCH와 공유하므로 "등록에서만 필수"인 제약이 {@link OnCreate} 그룹에 묶여 있다.
	 * {@code Default.class}를 빠뜨리면 {@code @Positive}·{@code @NotBlank}가 통째로 안 돈다.
	 */
	@PostMapping
	public ResponseEntity<AdminProductResponse> create(
			@Validated({Default.class, OnCreate.class}) @RequestBody AdminProductCreateRequest request) {
		AdminProductResponse response = adminProductService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/products/" + response.id()))
				.body(response);
	}

	/** 규격·메타데이터 부분 수정 → 200. NULL 필드는 "안 바꾼다"는 뜻이다. */
	@PatchMapping("/{productId}")
	public ResponseEntity<AdminProductResponse> update(
			@PathVariable Long productId,
			@Valid @RequestBody AdminProductPatchRequest request) {
		return ResponseEntity.ok(adminProductService.update(productId, request));
	}

	/** 삭제(soft delete) → 204. */
	@DeleteMapping("/{productId}")
	public ResponseEntity<Void> delete(@PathVariable Long productId) {
		adminProductService.delete(productId);
		return ResponseEntity.noContent().build();
	}

	/**
	 * 검수 승인·반려 → 204. 하위 리소스 + {@code PUT}이라 멱등이고, 동사 경로({@code /approve})를
	 * 만들지 않는다(§1 규칙 1).
	 */
	@PutMapping("/{productId}/review")
	public ResponseEntity<Void> review(
			@PathVariable Long productId,
			@Valid @RequestBody AdminProductReviewRequest request) {
		adminProductService.review(productId, request);
		return ResponseEntity.noContent().build();
	}
}
