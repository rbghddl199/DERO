package com.brunchies.dero.catalog;

/**
 * 마스터 삭제 게이트가 묻는 단 하나의 질문 — "이 마스터를 참조 중인 제품이 살아 있는가".
 *
 * <p><b>왜 인터페이스인가</b>: 답은 {@code product} 도메인만 알지만 {@code catalog}는 ADR-0007 결정 7의
 * <b>최하층</b>이라 {@code product}를 import할 수 없다({@code LayerDependencyTest.catalog는_위를_모른다},
 * freeze 없는 굳히기 규칙). 그래서 질문(이 인터페이스)만 {@code catalog}에 두고 답
 * ({@code product.service.ProductCatalogMasterUsage})을 위층이 구현한다 — 의존 화살표가 위에서 아래로
 * 유지된다.
 *
 * <p><b>{@code infra}의 포트 3곳과는 다른 물건이다.</b> 저쪽은 외부 경계(스토리지·AI·추천)를 갈아끼우기
 * 위한 것이고, 여기는 계층 역류를 막기 위한 도메인 간 질의다. 구현체를 갈아끼울 계획은 없다.
 *
 * <p>소프트 삭제 마스터라 이 검사를 빼도 FK는 안 깨진다 — 막는 것은 "제품이 죽은 브랜드·카테고리를
 * 계속 가리키는 상태"다. {@code vibe}·{@code hashtag}·{@code vesa_spec}에 같은 메서드가 없는 이유는
 * 그쪽 참조가 정션 테이블이고 FK가 {@code ON DELETE CASCADE}라 게이트 자체가 필요 없기 때문이다.
 */
public interface CatalogMasterUsage {

	boolean isBrandInUse(Long brandId);

	boolean isCategoryInUse(Long categoryId);
}
