package com.brunchies.dero.placement.dto;

/**
 * 배치 견적(REQ-REC-01) — 올린 제품 가격 합계와 예산 대비.
 *
 * <p><b>합계는 인스턴스 단위다</b> — {@code placed_item}에 수량 컬럼이 없고 인스턴스 1개가 행 1개라,
 * 같은 제품을 둘 놓으면 그 가격이 두 번 더해진다(모니터 2대 세팅).
 *
 * <p><b>직접 입력 규격 책상은 합계에 없다</b>(D18) — 카탈로그 제품이 아니라 사용자가 줄자로 잰
 * 수치일 뿐이라 살 대상이 아니다. 제품 모드 책상은 제품이므로 더해진다.
 *
 * <p><b>{@code budgetKrw}가 NULL이면 예산 대비 3필드가 전부 NULL이다.</b> 합계는 그래도 나온다 —
 * 예산을 안 넣었다고 "얼마짜리 책상인가"를 못 볼 이유가 없다. 프론트는 {@code budgetKrw} 하나만
 * 보고 예산 대비 영역을 그릴지 정하면 된다.
 *
 * @param totalPriceKrw 제품 가격 합계. 가격 미등록 제품(자작 제품 등)은 0으로 친다
 * @param budgetKrw     사용자가 입력한 예산. NULL이면 미설정
 * @param isOverBudget  예산 초과 여부. 예산 미설정이면 NULL
 * @param differenceKrw {@code budgetKrw - totalPriceKrw} — 양수는 남은 예산, 음수는 초과분.
 *                      예산 미설정이면 NULL
 */
public record EstimateResponse(
		long totalPriceKrw,
		Integer budgetKrw,
		Boolean isOverBudget,
		Long differenceKrw) {

	/** 예산이 없으면 대비 3필드가 통째로 빠진다 — "0원 초과"로 오독될 값을 만들지 않는다. */
	public static EstimateResponse of(long totalPriceKrw, Integer budgetKrw) {
		if (budgetKrw == null) {
			return new EstimateResponse(totalPriceKrw, null, null, null);
		}
		long difference = budgetKrw.longValue() - totalPriceKrw;
		return new EstimateResponse(totalPriceKrw, budgetKrw, difference < 0, difference);
	}
}
