package com.brunchies.dero.placement;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.global.exception.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 배치의 벽면 마감(ADR-0030, D31). 좌·전면·우 <b>배치당 정확히 3행</b>이고
 * {@code uq_placement_wall_placement_id_wall_side}가 그걸 강제한다.
 *
 * <p><b>테이블로 뺀 이유는 정본 이중화 회피다</b> — 종전 {@code placement.is_wall_*_on} 3컬럼에
 * 마감·창문을 컬럼으로 더 붙이면 면당 5개 × 3면 = 15컬럼이 되고, 벽 데이터가 컬럼과 자식 테이블
 * 두 곳에 갈리면 볼 때마다 어디를 보는지 갈린다. 옛 3컬럼은 이제 아무도 안 읽는다 — 실제 DROP은
 * 다음 배포의 V10이다(DERO-514).
 *
 * <p><b>{@code material}·{@code variant}로 WAS는 아무 판정도 하지 않는다</b> — 값 정본은 프론트
 * 계열 모듈이라 여기서 enum으로 닫으면 계열 하나 늘릴 때마다 백엔드 배포가 붙는다(ADR-0021 결정
 * 1 계승). 검증은 형식까지고 미상 값은 프론트가 {@code PAINT} 기본 변형으로 폴백한다.
 *
 * <p>배치와 함께 사라지므로 hard delete다 — {@code deleted_at}이 없어 {@link BaseEntity}를
 * 상속한다.
 */
@Entity
@Table(name = "placement_wall")
@SequenceGenerator(name = "placement_wall_seq", sequenceName = "placement_wall_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PlacementWall extends BaseEntity {

	/** 요청이 마감을 생략했을 때의 기본 계열 — 이관 매핑의 {@code neutral} 벽면과 같은 값이다. */
	public static final String DEFAULT_MATERIAL = "PAINT";

	/** {@link #DEFAULT_MATERIAL}의 기본 변형. 계열과 변형은 항상 쌍으로 온다(erd.md). */
	public static final String DEFAULT_VARIANT = "NEUTRAL";

	/** 좌·우 벽의 기본 거리(mm). 엔진의 시작 좌표와 같은 값이다({@code scene.ts WALL_LEFT_X 1.55m}). */
	public static final int DEFAULT_SIDE_DISTANCE_MM = 1550;

	/**
	 * 전면 벽의 기본 간격(mm). 좌·우와 기준이 달라(책상 뒷변) 값도 다르다 —
	 * 1mm는 벽이 책상에 붙어 답답하다는 피드백으로 50mm가 됐다(2026-08-06,
	 * {@code scene.ts FRONT_WALL_GAP_DEFAULT_M}).
	 */
	public static final int DEFAULT_FRONT_DISTANCE_MM = 50;

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "placement_wall_seq")
	private Long id;

	/**
	 * 소유 배치. 애그리거트 <b>안</b>이라 저장·삭제는 {@link Placement}를 통과한다 — {@code cascade}는
	 * 루트 쪽에만 걸려 있다({@code PlacementDesk}와 같은 결).
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "placement_id", nullable = false)
	private Placement placement;

	/** {@code placed_item.wall_side}와 같은 값 공간이라 enum도 같은 {@link WallSide}를 쓴다. */
	@Enumerated(EnumType.STRING)
	@Column(name = "wall_side", nullable = false, length = 10)
	private WallSide wallSide;

	/**
	 * 벽면 표시 여부. 종전 {@code placement.is_wall_*_on} 3컬럼이 이 한 컬럼으로 접혔다 — 저장하지
	 * 않으면 재로드 후 꺼진 벽에 타공판이 떠 있는 상태가 재현된다(REQ-ENV-04, D4).
	 */
	@Column(name = "is_on", nullable = false)
	private boolean isOn;

	/**
	 * 이 벽면까지의 거리(mm). <b>기준이 면마다 다르다</b> — 좌·우는 책상 중심 기준 거리,
	 * 전면은 책상 뒷변 기준 간격이다({@code window_center_x_mm}이 면마다 다른 축을 재는 것과 같은
	 * 성질이라 컬럼을 나누지 않는다). 저장하지 않으면 사용자가 넓힌 방이 재로드마다 기본값으로
	 * 돌아간다(REQ-ENV-06, DERO-548).
	 *
	 * <p><b>클램프는 WAS가 하지 않는다</b> — 최소값이 책상 반폭에 걸려 런타임 규격마다 달라
	 * 여기서 판정하려면 책상 스냅샷을 끌어와야 한다. 형식 범위만 DTO가 보고, 실제 클램프는 엔진이
	 * 적용 시점에 건다(마감 값 집합을 프론트가 갖는 것과 같은 분담).
	 */
	@Column(name = "distance_mm", nullable = false)
	private int distanceMm;

	@Column(name = "material", nullable = false, length = 30)
	private String material;

	@Column(name = "variant", nullable = false, length = 30)
	private String variant;

	/** 이 벽면의 창문 유무. 벽면당 0~1개다. */
	@Column(name = "has_window", nullable = false)
	private boolean hasWindow;

	/** 창문 중심의 벽면 로컬 x(mm). {@code hasWindow = false}면 NULL. */
	@Column(name = "window_center_x_mm")
	private Integer windowCenterXMm;

	/** 창문 중심의 바닥 기준 y(mm). UI는 창턱 900mm 고정이지만 저장은 좌표다(ADR-0030 결정 6). */
	@Column(name = "window_center_y_mm")
	private Integer windowCenterYMm;

	@Column(name = "window_width_mm")
	private Integer windowWidthMm;

	@Column(name = "window_height_mm")
	private Integer windowHeightMm;

	public static PlacementWall create(Placement placement, WallSide wallSide, boolean isOn,
			int distanceMm, String material, String variant, boolean hasWindow,
			Integer windowCenterXMm, Integer windowCenterYMm, Integer windowWidthMm,
			Integer windowHeightMm) {
		requireWindowAllOrNone(hasWindow, windowCenterXMm, windowCenterYMm, windowWidthMm,
				windowHeightMm);
		return PlacementWall.builder()
				.placement(placement)
				.wallSide(wallSide)
				.isOn(isOn)
				.distanceMm(distanceMm)
				.material(material)
				.variant(variant)
				.hasWindow(hasWindow)
				.windowCenterXMm(windowCenterXMm)
				.windowCenterYMm(windowCenterYMm)
				.windowWidthMm(windowWidthMm)
				.windowHeightMm(windowHeightMm)
				.build();
	}

	/**
	 * 스냅샷 저장의 UPDATE 갈래 — 면당 1행이라 새 행으로 갈아끼우지 않고 제자리에서 고친다
	 * (영속 엔티티는 dirty checking이 UPDATE를 낸다, 규칙 13). {@code wallSide}는 안 받는다 —
	 * 면의 정체성이라 바뀌지 않는다.
	 */
	public void apply(boolean isOn, int distanceMm, String material, String variant,
			boolean hasWindow, Integer windowCenterXMm, Integer windowCenterYMm,
			Integer windowWidthMm, Integer windowHeightMm) {
		requireWindowAllOrNone(hasWindow, windowCenterXMm, windowCenterYMm, windowWidthMm,
				windowHeightMm);
		this.isOn = isOn;
		this.distanceMm = distanceMm;
		this.material = material;
		this.variant = variant;
		this.hasWindow = hasWindow;
		this.windowCenterXMm = windowCenterXMm;
		this.windowCenterYMm = windowCenterYMm;
		this.windowWidthMm = windowWidthMm;
		this.windowHeightMm = windowHeightMm;
	}

	/** 리믹스 복사본({@link Placement#copyOf}). 벽면도 씬 상태라 안 물려주면 방 룩이 달라진다. */
	PlacementWall copyInto(Placement target) {
		return PlacementWall.builder()
				.placement(target)
				.wallSide(wallSide)
				.isOn(isOn)
				.distanceMm(distanceMm)
				.material(material)
				.variant(variant)
				.hasWindow(hasWindow)
				.windowCenterXMm(windowCenterXMm)
				.windowCenterYMm(windowCenterYMm)
				.windowWidthMm(windowWidthMm)
				.windowHeightMm(windowHeightMm)
				.build();
	}

	/**
	 * 창문 4값은 넷 다 있거나 넷 다 없다 — {@code hasWindow}가 그 불변식의 선언이고 강제는 WAS가
	 * 한다(전역 규칙 "{@code CHECK} 제약을 쓰지 않는다", {@code point_*_mm} 3컬럼과 동형). 반만 있는
	 * 창문을 통과시키면 씬이 크기 없는 구멍을 뚫으려다 그 자리에서 갈린다.
	 */
	private static void requireWindowAllOrNone(boolean hasWindow, Integer windowCenterXMm,
			Integer windowCenterYMm, Integer windowWidthMm, Integer windowHeightMm) {
		boolean allPresent = windowCenterXMm != null && windowCenterYMm != null
				&& windowWidthMm != null && windowHeightMm != null;
		boolean allAbsent = windowCenterXMm == null && windowCenterYMm == null
				&& windowWidthMm == null && windowHeightMm == null;
		if (hasWindow ? !allPresent : !allAbsent) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_WINDOW);
		}
	}
}
