package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.BrandCreateRequest;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlRequest;
import com.brunchies.dero.catalog.dto.BrandLogoUploadUrlResponse;
import com.brunchies.dero.catalog.dto.BrandPatchRequest;
import com.brunchies.dero.catalog.dto.BrandResponse;
import com.brunchies.dero.catalog.service.AdminBrandService;
import com.brunchies.dero.global.response.OffsetPage;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 운영진 브랜드 마스터 관리(`docs/context/api-spec.md` §9 — 시드 데이터를 SQL이 아니라 관리자 UI로
 * 넣는다, 2026-07-31 확장).
 *
 * <p><b>마스터별로 컨트롤러를 나눈다</b> — 여섯을 한 파일에 뭉치면 핸들러 26개짜리 클래스가 되고,
 * 브랜드 로고·상판 재질 맵처럼 마스터 하나에만 있는 경로가 그 안에 섞여 어느 마스터의 계약인지
 * 안 보인다.
 *
 * <p><b>admin 톱레벨 패키지를 만들지 않는다</b>(ADR-0007 — 톱레벨 10개 고정). 관리자 화면이라는 것은
 * <b>사용자</b>의 성격이지 도메인이 아니다({@code AdminProductController}와 같은 판단).
 *
 * <p><b>지금 권한 검사가 없다</b> — {@code SecurityConfig}가 2026-07-29부터 전 경로
 * {@code permitAll}이다(로그인 연동 일시 중단, 박동규 지시). 그 줄이 걷히면 이 컨트롤러는
 * {@code hasRole("ADMIN")} 대상이다.
 */
@RestController
@RequestMapping("/api/v1/admin/brands")
@RequiredArgsConstructor
public class AdminBrandController {

	private final AdminBrandService adminBrandService;

	/** 목록. 관리자라 offset 페이지네이션이다(ADR-0008 결정 5). */
	@GetMapping
	public ResponseEntity<OffsetPage<BrandResponse>> list(
			@RequestParam(required = false) Integer page,
			@RequestParam(required = false) Integer size) {
		return ResponseEntity.ok(
				adminBrandService.list(AdminPageParams.page(page), AdminPageParams.size(size)));
	}

	/** 등록 → 201 + {@code Location}. */
	@PostMapping
	public ResponseEntity<BrandResponse> create(@Valid @RequestBody BrandCreateRequest request) {
		BrandResponse response = adminBrandService.create(request);
		return ResponseEntity
				.created(URI.create("/api/v1/admin/brands/" + response.id()))
				.body(response);
	}

	/** 부분 수정 → 200. NULL 필드는 "안 바꾼다"는 뜻이다. 로고 key 등록도 이 경로다. */
	@PatchMapping("/{brandId}")
	public ResponseEntity<BrandResponse> update(
			@PathVariable Long brandId,
			@Valid @RequestBody BrandPatchRequest request) {
		return ResponseEntity.ok(adminBrandService.update(brandId, request));
	}

	/** 삭제(soft delete) → 204. 참조 중인 제품이 있으면 409다. */
	@DeleteMapping("/{brandId}")
	public ResponseEntity<Void> delete(@PathVariable Long brandId) {
		adminBrandService.delete(brandId);
		return ResponseEntity.noContent().build();
	}

	/** 로고 presigned PUT URL 발급 → 200. 저장하는 게 없어 201이 아니다(§1 규칙 1⑵). */
	@PostMapping("/{brandId}/logo/upload-url")
	public ResponseEntity<BrandLogoUploadUrlResponse> presignLogoUpload(
			@PathVariable Long brandId,
			@Valid @RequestBody BrandLogoUploadUrlRequest request) {
		return ResponseEntity.ok(adminBrandService.presignLogoUpload(brandId, request));
	}
}
