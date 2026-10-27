package com.brunchies.dero.product;

import com.brunchies.dero.global.exception.BusinessException;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 이 제품의 규격이 어느 서브타입 테이블에 있는지 — JOINED 상속의 판별값({@code product.spec_type}).
 *
 * <p>{@code category_id}와 분리돼 있다: {@code category}는 탐색용이라 자유롭게 늘어나고 이쪽은 규격
 * 서브타입 테이블 개수만큼 고정이다. 둘을 한 컬럼으로 묶으면 카테고리를 추가할 때마다 규격 매핑이
 * 깨진다({@code docs/context/erd.md} {@code product} 절).
 *
 * <p><b>값은 변경할 수 없다</b> — JPA가 엔티티 타입 변경을 지원하지 않아 규격 종류를 바꾸려면
 * {@code product} 행을 지우고 새로 만들어야 하고, 그 순간 {@code placed_item}·{@code cart_item}·
 * {@code product_like}·{@code product_vibe}가 전부 끊어진다(ADR-0006 결정 4).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum SpecType {
  DESK("책상. 규격은 desk 서브타입 테이블에 있다.", true),
  MONITOR("모니터. 규격은 monitor 서브타입 테이블에 있다.", true),
  ARM("암(모니터암·마이크암). 규격은 arm 서브타입 테이블에 있다.", false),
  LIGHT("조명. 규격은 light 서브타입 테이블에 있다.", false),
  PROP("소품. 규격은 prop 서브타입 테이블에 있다.", false);

	private final String description;

	/**
	 * 절차 생성 규격인가 — GLB 없이 규격값(mm)만으로 3D를 만든다는 뜻이고, 그래서 이 종류의 제품은
	 * {@code asset} 행이 아예 생기지 않는다(D18 재개정 2026-08-02, {@code docs/CONTEXT.md} — 원래
	 * 책상뿐이던 것이 모니터까지 넓어졌다).
	 *
	 * <p><b>"GLB 에셋(과 그 검수)을 요구할지"의 정본이 이 플래그다.</b> 카탈로그 노출 술어가 여기서
	 * 파생되므로({@link #proceduralTypes()}) 값을 뒤집으면 그 종류가 목록에서 통째로 사라지거나
	 * 검수 없이 전부 뜬다.
	 */
	private final boolean procedural;

	private static final Set<SpecType> PROCEDURAL_TYPES = Collections.unmodifiableSet(
			Arrays.stream(values())
					.filter(SpecType::isProcedural)
					.collect(Collectors.toCollection(() -> EnumSet.noneOf(SpecType.class))));

	/**
	 * 절차 생성 종류 집합 — 카탈로그 노출 술어가 "검수를 면제할 규격 종류"로 읽는다
	 * ({@code ProductRepositoryImpl.reviewApprovedOrProceduralCatalog}).
	 */
	public static Set<SpecType> proceduralTypes() {
		return PROCEDURAL_TYPES;
	}

	/**
	 * 로드된 제품의 규격 판별값을 되읽는다.
	 *
	 * <p>{@code spec_type}은 {@code @DiscriminatorColumn}이라 {@link Product}에 필드가 없다 — 필드로
	 * 또 선언하면 같은 컬럼을 두 번 매핑해 부팅이 죽는다({@code product/CLAUDE.md}). 그래서 구체
	 * 타입에서 되읽는 것이 유일한 경로이고, 그 스위치를 호출부마다 복사하지 않도록 여기 둔다.
	 *
	 * <p><b>lazy 프록시에는 쓰면 안 된다.</b> 다형 루트에 대한 프록시는 구체 타입을 몰라
	 * {@code instanceof}가 전부 거짓이 되고 {@code default} 가지로 떨어진다 — 실제로 로드한
	 * 엔티티(또는 방금 만든 인스턴스)에만 쓴다.
	 */
	public static SpecType of(Product product) {
		return switch (product) {
			case Desk ignored -> DESK;
			case Monitor ignored -> MONITOR;
			case Arm ignored -> ARM;
			case Light ignored -> LIGHT;
			case Prop ignored -> PROP;
			default -> throw new BusinessException(ProductErrorCode.PRODUCT_UNKNOWN_SPEC_SUBTYPE);
		};
	}

}
