package com.brunchies.dero.product.controller;

import com.brunchies.dero.product.dto.ProductImageCreateRequest;
import com.brunchies.dero.product.dto.ProductImageResponse;
import com.brunchies.dero.product.dto.ProductImageUploadUrlRequest;
import com.brunchies.dero.product.dto.ProductImageUploadUrlResponse;
import com.brunchies.dero.product.service.ProductImageService;
import jakarta.validation.Valid;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 제품 실사 이미지 2단계 presign 업로드(`docs/context/api-spec.md` §5). 대상 제품이 경로에 있어
 * 권한 검사를 붙일 자리가 생긴다 — 옛 {@code POST /products/images/presign}이 없어진 이유다(§11).
 */
@RestController
@RequestMapping("/api/v1/products/{productId}/images")
@RequiredArgsConstructor
public class ProductImageController {

	private final ProductImageService productImageService;

	/** 1단계 — presigned PUT URL 발급. 저장하는 게 없어 201이 아니라 200이다(§1 규칙 1⑵). */
	@PostMapping("/upload-urls")
	public ResponseEntity<ProductImageUploadUrlResponse> presignUpload(
			@PathVariable Long productId,
			@Valid @RequestBody ProductImageUploadUrlRequest request) {
		return ResponseEntity.ok(productImageService.presignUpload(productId, request));
	}

	/** 2단계 — 업로드한 key 등록. 행이 생기므로 201 + {@code Location}이다. */
	@PostMapping
	public ResponseEntity<ProductImageResponse> register(
			@PathVariable Long productId,
			@Valid @RequestBody ProductImageCreateRequest request) {
		ProductImageResponse response = productImageService.register(productId, request);
		return ResponseEntity
				.created(URI.create("/api/v1/products/" + productId + "/images/" + response.id()))
				.body(response);
	}

	/**
	 * 대표 이미지 지정 → 204(`docs/context/api-spec.md` §9). <b>서버가 기존 대표를 해제한다</b>
	 * (§1 규칙 2 토글 패턴) — 클라이언트가 해제와 지정을 두 번 호출하면 그 사이에 대표가 없는 순간이
	 * 생기고, 한 번이라도 실패하면 목록 카드가 폴백 아이콘으로 떨어진다.
	 *
	 * <p>본문이 없고 같은 요청을 몇 번 보내도 결과가 같아 PUT이다.
	 */
	@PutMapping("/{imageId}/primary")
	public ResponseEntity<Void> designatePrimary(
			@PathVariable Long productId, @PathVariable Long imageId) {
		productImageService.designatePrimary(productId, imageId);
		return ResponseEntity.noContent().build();
	}

	/**
	 * 이미지 삭제 → 204(`docs/context/api-spec.md` §5). 본문에 실을 게 없어 204다.
	 *
	 * <p><b>대표 이미지도 지워지고 대표 0장 상태가 남는다</b> — {@code CATALOG} 제품의 "최소 1장"은
	 * 여기서 강제하지 않는다(사유는 {@code ProductImageService#delete}). 권한 검사는 다른 이미지
	 * 엔드포인트와 같이 아직 없다.
	 */
	@DeleteMapping("/{imageId}")
	public ResponseEntity<Void> delete(@PathVariable Long productId, @PathVariable Long imageId) {
		productImageService.delete(productId, imageId);
		return ResponseEntity.noContent().build();
	}
}
