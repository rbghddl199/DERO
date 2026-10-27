package com.brunchies.dero.product.dto;

import com.brunchies.dero.product.Finish;
import com.brunchies.dero.product.GlbExportMode;
import com.brunchies.dero.product.RigManifest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * {@code PUT /admin/products/{id}/asset} 요청 — upsert다(재업로드는 같은 PUT이 덮는다).
 *
 * <p><b>{@code finish}에 {@code @NotNull}을 걸지 않는다</b> — 필수 여부를 {@code glbExportMode}가
 * 가르는 조건부 규칙이라 Bean Validation으로 표현되지 않는다. 그 짝 검사는
 * {@code Asset}이 하고 위반은 422다(규칙 15의 예외 — 사유는 그 메서드 주석에 있다).
 *
 * <p><b>{@code rigManifest}는 통째 교체만 한다</b> — 부분 갱신하면 이 레코드에 없는 필드가
 * 역직렬화에서 사라져 프론트가 추가한 필드가 조용히 유실된다(ADR-0006 결정 3).
 */
public record AssetRegisterRequest(
		@NotBlank String assetKey,
		@NotNull GlbExportMode glbExportMode,
		Finish finish,
		RigManifest rigManifest,
		@Positive Integer polygonCount) {
}
