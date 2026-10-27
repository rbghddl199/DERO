package com.brunchies.dero.product.controller;

import com.brunchies.dero.product.dto.AssetRegisterRequest;
import com.brunchies.dero.product.dto.AssetResponse;
import com.brunchies.dero.product.dto.AssetUploadUrlRequest;
import com.brunchies.dero.product.dto.AssetUploadUrlResponse;
import com.brunchies.dero.product.dto.ProductEmitterRequest;
import com.brunchies.dero.product.dto.ProductEmitterResponse;
import com.brunchies.dero.product.service.AdminProductAssetService;
import jakarta.validation.Valid;
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
 * 운영진 에셋 GLB·발광 저작(`docs/context/api-spec.md` §9 — REQ-ADM-01·02).
 *
 * <p><b>{@link AdminProductController}와 별도 클래스다</b> — 저쪽은 {@code product} + 규격 서브타입
 * 5종의 CRUD·검수고 여기는 그 아래 {@code asset}·{@code product_emitter}다. 경로는
 * {@code /admin/products/{productId}} 아래로 이어지므로 매핑이 겹치지 않는다.
 *
 * <p><b>admin 톱레벨 패키지를 만들지 않는다</b>(ADR-0007 — 톱레벨 10개 고정). 사유는
 * {@link AdminProductController} 주석에 있다.
 *
 * <p><b>에셋 DELETE가 없다</b>(api-spec §9) — 에셋 없는 제품이 유효한 건 {@code DESK}뿐이라
 * "제거"가 유효 상태가 아니다. 교체는 같은 PUT이다. 발광체는 반대로 "빛을 안 낸다"가 유효 상태라
 * DELETE가 있다.
 */
@RestController
@RequestMapping("/api/v1/admin/products/{productId}")
@RequiredArgsConstructor
public class AdminProductAssetController {

	private final AdminProductAssetService adminProductAssetService;

	/** 1단계 — GLB presign 발급 → 200. 저장하는 게 없어 201이 아니다(§1 규칙 1⑵). */
	@PostMapping("/asset/upload-url")
	public ResponseEntity<AssetUploadUrlResponse> presignAssetUpload(
			@PathVariable Long productId,
			@Valid @RequestBody AssetUploadUrlRequest request) {
		return ResponseEntity.ok(adminProductAssetService.presignUpload(productId, request));
	}

	/**
	 * 2단계 — 업로드한 key 등록 → 200. <b>201이 아닌 이유</b>: upsert라 재업로드가 같은 PUT으로
	 * 덮으므로 "새 리소스가 생겼다"가 항상 참이 아니고, 위치도 이 경로로 고정이라 실을
	 * {@code Location}이 없다.
	 */
	@PutMapping("/asset")
	public ResponseEntity<AssetResponse> registerAsset(
			@PathVariable Long productId,
			@Valid @RequestBody AssetRegisterRequest request) {
		return ResponseEntity.ok(adminProductAssetService.register(productId, request));
	}

	/** 발광 저작값 upsert → 200. 제품당 발광체 1개라 위치가 고정이다({@code /asset}과 같은 이유). */
	@PutMapping("/emitter")
	public ResponseEntity<ProductEmitterResponse> registerEmitter(
			@PathVariable Long productId,
			@Valid @RequestBody ProductEmitterRequest request) {
		return ResponseEntity.ok(adminProductAssetService.registerEmitter(productId, request));
	}

	/** 발광 없는 제품으로 → 204. */
	@DeleteMapping("/emitter")
	public ResponseEntity<Void> removeEmitter(@PathVariable Long productId) {
		adminProductAssetService.removeEmitter(productId);
		return ResponseEntity.noContent().build();
	}
}
