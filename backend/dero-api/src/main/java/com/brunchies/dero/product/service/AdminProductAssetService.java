package com.brunchies.dero.product.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.product.Asset;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductErrorCode;
import com.brunchies.dero.product.SpecType;
import com.brunchies.dero.product.dto.AssetRegisterRequest;
import com.brunchies.dero.product.dto.AssetResponse;
import com.brunchies.dero.product.dto.AssetUploadUrlRequest;
import com.brunchies.dero.product.dto.AssetUploadUrlResponse;
import com.brunchies.dero.product.dto.ProductEmitterRequest;
import com.brunchies.dero.product.dto.ProductEmitterResponse;
import com.brunchies.dero.product.repository.ProductRepository;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운영진 에셋·발광 저작(`docs/context/api-spec.md` §9 — REQ-ADM-01·02).
 *
 * <p><b>{@link AdminProductService}와 나눈 기준은 다루는 테이블이다</b> — 저쪽은 {@code product} +
 * 규격 서브타입 5종(등록·수정·삭제·검수), 이쪽은 {@code asset}·{@code product_emitter}다. 같은
 * 애그리거트라 리포지토리는 하나를 공유하지만 한 클래스에 합치면 규격 병합 로직과 저작값 upsert가
 * 섞여 500줄이 넘는다.
 *
 * <p><b>쓰기는 전부 루트 {@link Product}를 통과한다</b>(ADR-0007) —
 * {@code AssetRepository}·{@code ProductEmitterRepository}가 없다. 검증도 루트 아래 엔티티가 하고
 * 여기는 조회·조립·트랜잭션만 한다(ADR-0001 깊은 엔티티).
 *
 * <p><b>지금 권한 검사가 없다</b> — {@code SecurityConfig}가 전 경로 {@code permitAll}이다
 * ({@link AdminProductService}와 같은 상태).
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminProductAssetService {

	private static final String KEY_PREFIX = "assets/";
	private static final String KEY_SUFFIX = ".glb";

	/**
	 * {@code model/gltf-binary}가 GLB의 등록 MIME이고, {@code application/octet-stream}은 브라우저가
	 * {@code File.type}을 비워 보낼 때 실제로 오는 값이라 같이 받는다.
	 */
	private static final Set<String> ALLOWED_CONTENT_TYPES =
			Set.of("model/gltf-binary", "application/octet-stream");

	private final ProductRepository products;
	private final PresignPort presignPort;

	/** 1단계 — presigned PUT URL 발급. 저장하는 게 없으므로 200이다(§1 규칙 1⑵). */
	public AssetUploadUrlResponse presignUpload(Long productId, AssetUploadUrlRequest request) {
		requireAssetTarget(productId);
		if (!ALLOWED_CONTENT_TYPES.contains(request.contentType())) {
			throw new BusinessException(ProductErrorCode.PRODUCT_INVALID_ASSET_CONTENT_TYPE);
		}

		String assetKey = KEY_PREFIX + productId + "/" + UUID.randomUUID() + KEY_SUFFIX;
		return new AssetUploadUrlResponse(
				assetKey, presignPort.presignUpload(assetKey, request.contentType()));
	}

	/**
	 * 2단계 — 업로드가 끝난 key를 제품에 붙인다. upsert라 재업로드도 같은 PUT이고, 이미 행이 있으면
	 * 같은 행을 갈아끼운다(api-spec §9 — 에셋 DELETE는 없다).
	 *
	 * <p><b>{@code save()}가 아니라 {@code flush()}다</b>({@code ProductImageService}와 같은 이유) —
	 * {@code product}가 이미 영속이라 {@code cascade = ALL} 연관에 넣는 것만으로 INSERT가 예약되고,
	 * 교체는 dirty checking이 UPDATE를 낸다(규칙 13). {@code flush()}가 필요한 이유는
	 * {@code asset}의 PK가 {@link jakarta.persistence.MapsId}로 채워지기 때문이다 — 신규 등록이면
	 * INSERT 전까지 {@code productId}가 NULL이라 응답 본문이 빈 id를 싣는다(2026-07-31 실측).
	 */
	@Transactional
	public AssetResponse register(Long productId, AssetRegisterRequest request) {
		Product product = requireAssetTarget(productId);
		Asset asset = product.registerAsset(request.assetKey(), request.glbExportMode(),
				request.finish(), request.polygonCount(), request.rigManifest());
		products.flush();
		return AssetResponse.from(asset);
	}

	/**
	 * 발광 저작값 upsert. <b>{@code spec_type}을 보지 않는다</b> — 발광은 규격과 직교해서 조명
	 * ({@code LIGHT})이든 PC 본체 RGB({@code PROP})든 같은 행 구조를 쓰고, 절차 생성 갈래인 책상·모니터도
	 * 발광 제품이 될 수 있다(에셋과 달리 {@code DESK}·{@code MONITOR}를 막지 않는 이유다).
	 *
	 * <p>{@link #register}와 같은 이유로 {@code flush()}가 필요하다 — PK가
	 * {@link jakarta.persistence.MapsId}로 채워진다.
	 */
	@Transactional
	public ProductEmitterResponse registerEmitter(Long productId, ProductEmitterRequest request) {
		Product product = requireProduct(productId);
		var emitter = product.registerEmitter(request.shape(), request.distribution(),
				request.lumens(), request.radiusMm(), request.recolorable(), request.defaultColor(),
				request.pointXMm(), request.pointYMm(), request.pointZMm());
		products.flush();
		return ProductEmitterResponse.from(emitter);
	}

	/**
	 * 발광 없는 제품으로 되돌린다 → 204. <b>행이 없어도 204다</b> — DELETE는 멱등이고 끝 상태가
	 * 요청과 같다. (검수 {@code review}가 에셋 없음을 422로 막은 것과 다르다: 그쪽은 "승인했다"는
	 * 거짓 성공이 되지만 이쪽은 실제로 요청한 상태가 된다.)
	 */
	@Transactional
	public void removeEmitter(Long productId) {
		requireProduct(productId).removeEmitter();
	}

	private Product requireProduct(Long productId) {
		return products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(() -> new BusinessException(ProductErrorCode.PRODUCT_NOT_FOUND));
	}

	/**
	 * 에셋을 가질 수 있는 제품인지. <b>{@code DESK}·{@code MONITOR}는 422다</b> — 책상·모니터는
	 * 규격값으로 절차 생성하므로 {@code asset} 행이 아예 없다(D18, 2026-08-02 재개정). presign만 막고
	 * 등록을 열어 두면 클라이언트가 key를 지어 곧장 PUT하는 순간 존재할 수 없는 행이 생기므로
	 * <b>두 단계 모두</b> 여기를 통과한다.
	 *
	 * <p>어느 갈래가 절차 생성인지는 {@link SpecType#proceduralTypes()}가 정본이다 — 여기에 목록을
	 * 다시 적지 않는다. 같은 사실을 두 곳에 두면 D18이 갈래를 넓힐 때 한쪽만 따라가고, 그게 정확히
	 * DERO-369(카탈로그 노출 술어가 안 따라와 모니터가 목록에서 사라졌다)의 실패 방식이다.
	 *
	 * <p><b>값은 {@code product.getSpecType()}이 아니라 {@link SpecType#of}로 읽는다</b> — 읽기 전용
	 * 매핑은 DB에서 <b>로드된</b> 엔티티에서만 채워지고, 같은 트랜잭션에서 방금 만든 인스턴스를 1차
	 * 캐시로 되받는 이 경로에서는 {@code null}이다(2026-08-02 실측: 게터로 바꿨더니 이 가드가 조용히
	 * 무력화돼 절차 생성 제품에 에셋 등록이 통과했다 — 테스트 4건이 잡았다).
	 */
	private Product requireAssetTarget(Long productId) {
		Product product = requireProduct(productId);
		if (SpecType.proceduralTypes().contains(SpecType.of(product))) {
			throw new BusinessException(ProductErrorCode.PRODUCT_ASSET_NOT_APPLICABLE);
		}
		return product;
	}
}
