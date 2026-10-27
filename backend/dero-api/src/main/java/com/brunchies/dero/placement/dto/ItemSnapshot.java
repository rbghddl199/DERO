package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.WallSide;
import com.brunchies.dero.product.MountSurface;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Map;

/**
 * 씬 스냅샷의 배치 아이템 1개(ADR-0009 결정 3).
 *
 * <p><b>{@code ref}는 DTO 전용이고 DB 컬럼이 아니다.</b> 클라이언트 로컬 키(`p1`·`p2`…)이고, 서버가
 * {@code mountedToRef}를 실제 {@code placed_item.id}로 풀어 {@code mounted_to_placed_item_id}에 넣은
 * 뒤 버린다. 신규 아이템이 신규 아이템을 참조하는 경우를 {@code id}만으로는 표현할 수 없어서 있는
 * 필드다.
 *
 * <p><b>{@code id}는 "이게 기존 행인가"만 답한다</b> — 참조에는 쓰지 않는다. NULL이면 INSERT,
 * 값이 있으면 UPDATE 대상이고 그 id가 이 배치 소속인지 서버가 검증한다(403).
 *
 * <p><b>{@code isVesaMounted}를 받지 않는다</b> — 결합 여부는 {@code mountedToRef}의 유무가 이미
 * 답한다. 둘을 따로 받으면 "결합했다는데 대상이 없는" 조합이 열리고, 그건 엔티티가
 * {@code mountVesaTo}/{@code unmount}로 막고 있는 바로 그 상태다.
 *
 * <p>좌표·회전을 {@code int}·{@code BigDecimal}의 원시형이 아니라 래퍼로 받는 이유: 원시형이면
 * 누락된 필드가 조용히 {@code 0}이 된다. {@code @NotNull}로 400을 내보낸다.
 *
 * <p><b>{@code pitchDeg}만 {@code @NotNull}이 아니다</b> — 컬럼이 {@code DEFAULT 0}이고 누락을
 * "기울기 없음"으로 수용하기로 했다(ADR-0023 파급 — 기존 저장본은 리로드 시 평평해진다). 필수로
 * 걸면 아직 이 필드를 안 보내는 클라이언트의 저장이 전부 400이 된다. <b>범위(±75°)는 검증하지
 * 않는다</b> — 클램프는 클라이언트 책임이고 서버는 값을 저장만 한다(ADR-0023 결정 3).
 */
public record ItemSnapshot(
		@NotBlank String ref,
		Long id,
		@NotNull Long productId,
		@NotNull Integer positionXMm,
		@NotNull Integer positionYMm,
		@NotNull Integer positionZMm,
		@NotNull BigDecimal rotationDeg,
		BigDecimal pitchDeg,
		@NotNull MountSurface surfaceType,
		WallSide wallSide,
		String mountedToRef,
		Map<String, Double> jointValues,
		String emitterColor) {

	/** 컬럼이 {@code NOT NULL}이라 누락을 여기서 {@code 0}으로 접는다 — DDL 기본값과 같은 값이다. */
	public BigDecimal pitchDegOrZero() {
		return pitchDeg == null ? BigDecimal.ZERO : pitchDeg;
	}
}
