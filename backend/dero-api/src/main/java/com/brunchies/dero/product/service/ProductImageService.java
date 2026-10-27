package com.brunchies.dero.product.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.ProductImage;
import com.brunchies.dero.product.dto.ProductImageCreateRequest;
import com.brunchies.dero.product.dto.ProductImageResponse;
import com.brunchies.dero.product.dto.ProductImageUploadUrlRequest;
import com.brunchies.dero.product.dto.ProductImageUploadUrlResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 제품 실사 이미지({@code product_image.image_key}) 2단계 presign 업로드
 * (`docs/context/api-spec.md` §1 규칙 4).
 *
 * <p><b>대상 제품이 경로에 온다</b> — 옛 {@code POST /products/images/presign}은 대상이 본문에도
 * 경로에도 없어 "이 제품에 올릴 권한이 있는가"를 검사할 자리가 없었다(같은 문서 §11). 지금은 두
 * 단계 모두 제품 존재를 먼저 확인한다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ProductImageService {

	private static final String KEY_PREFIX = "product-images/";

	/**
	 * 허용 {@code contentType} → 확장자. <b>서버가 확장자를 정하는 근거</b>다 — 파일명에서 뽑으면
	 * 사용자 입력이 object key에 섞여 경로 조작 입력이 key에 실린다({@code UserService}와 동형,
	 * DERO-575). 요청의 {@code fileName}은 계약 유지를 위해 받되 key에 쓰지 않는다.
	 */
	private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
			// 저장 포맷은 webp로 통일한다(ADR-0035 결정 4) — 변환은 프론트가 업로드 전에 한다.
			"image/webp", ".webp");

	private final ProductRepository products;
	private final PresignPort presignPort;

	/** 1단계 — presigned PUT URL 발급. 저장하는 게 없으므로 200이다. */
	public ProductImageUploadUrlResponse presignUpload(
			Long productId, ProductImageUploadUrlRequest request) {
		requireExistingProduct(productId);
		String extension = IMAGE_EXTENSIONS.get(request.contentType());
		if (extension == null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_INVALID_IMAGE_CONTENT_TYPE);
		}

		String imageKey = KEY_PREFIX + productId + "/" + UUID.randomUUID() + extension;
		String uploadUrl = presignPort.presignUpload(imageKey, request.contentType());
		return new ProductImageUploadUrlResponse(imageKey, uploadUrl);
	}

	/**
	 * 2단계 — 업로드가 끝난 key를 제품에 등록한다. {@code ProductImageRepository}가 없으므로
	 * (ADR-0011 결정 8) 저장이 루트 {@link Product}를 통과한다.
	 *
	 * <p><b>{@code save()}를 부르지 않고 {@code flush()}만 부른다.</b> {@code product}는 이미 영속
	 * 상태라 {@code cascade = ALL} 컬렉션에 넣는 것만으로 INSERT가 예약된다(규칙 13 — 영속 엔티티에
	 * 불필요한 {@code save()}를 부르지 않는다). {@code save()}를 부르면 id가 있는 엔티티라
	 * {@code merge()} 경로를 타고, cascade merge가 <b>새 관리 인스턴스를 만들어</b> 채번된 id가 여기
	 * {@code image}가 아니라 그 복사본에 붙는다 — 201의 {@code Location}이 {@code null}이 된다
	 * (2026-07-31 실측). {@code flush()}는 201 응답의 {@code Location}에 실을
	 * {@code product_image.id}를 지금 받기 위해 필요하다.
	 */
	@Transactional
	public ProductImageResponse register(Long productId, ProductImageCreateRequest request) {
		Product product = products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));

		ProductImage image = ProductImage.create(
				product, request.imageKey(), request.displayOrder(), request.isPrimary());
		product.addImage(image);
		products.flush();

		return ProductImageResponse.from(image);
	}

	/**
	 * 대표 이미지 지정 — 기존 대표를 <b>먼저</b> 해제하고 그 UPDATE를 DB에 밀어낸 뒤 새 대표를 세운다.
	 *
	 * <p><b>{@code flush()}가 없으면 유니크 위반으로 죽는다.</b> 부분 유니크 인덱스
	 * {@code uq_product_image_product_id}({@code WHERE is_primary})는 문장 단위로 검사되는데, 한
	 * flush 안에서 Hibernate가 UPDATE 두 개를 내보내는 순서는 보장되지 않는다 — 지정이 먼저 나가면
	 * 그 순간 {@code is_primary = true}인 행이 둘이 된다.
	 *
	 * <p>이미 대표면 아무것도 하지 않는다(PUT은 멱등이다). 해제만 해두고 지정에서 실패하면 대표가
	 * 없는 상태로 남는데, 같은 트랜잭션이라 롤백된다.
	 */
	@Transactional
	public void designatePrimary(Long productId, Long imageId) {
		Product product = products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));

		ProductImage target = product.findImage(imageId);
		if (target.isPrimary()) {
			return;
		}

		product.clearPrimaryImage();
		products.flush();
		target.changePrimary(true);
	}

	/**
	 * 이미지 삭제 — 루트 {@link Product}의 컬렉션에서 빼면 {@code orphanRemoval}이
	 * {@code product_image} 행을 지운다({@code ProductImageRepository}가 없다, ADR-0011 결정 8).
	 *
	 * <p><b>대표 이미지도 지워진다</b> — 남은 대표가 0장이 되는 상태를 허용한다. {@code CATALOG}
	 * 제품의 "최소 1장"은 다른 지점이 강제할 규칙이고, 여기서 막으면 잘못 올린 마지막 한 장을 지울
	 * 길이 없어진다(사유는 {@link Product#removeImage} 주석).
	 *
	 * <p>{@code flush()}를 부르지 않는다 — 204라 응답에 실을 값이 없고, DELETE는 커밋 시점에 나가면
	 * 된다(등록·대표 지정이 {@code flush()}를 부르는 이유는 각각 채번된 id와 유니크 인덱스다).
	 */
	@Transactional
	public void delete(Long productId, Long imageId) {
		Product product = products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));

		product.removeImage(imageId);
	}

	private void requireExistingProduct(Long productId) {
		if (!products.existsByIdAndDeletedAtIsNull(productId)) {
			throw new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND);
		}
	}

}
