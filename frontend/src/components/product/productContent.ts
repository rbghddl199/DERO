// 제품 상세 페이지 마케팅용 목업 콘텐츠 조회 — 데이터 자체는 src/constants/productContent.ts.
// 호환성 판정에는 절대 쓰지 않는다 — 판정 입력은 언제나 ProductSpec(mm)뿐이다.

import { DEFAULT_CONTENT, PRODUCT_CONTENT, type ProductContent } from '@/constants/productContent';
import type { ProductSpec } from '@/three/scene/product';

export type { ProductContent };

export function getProductContent(id: string): ProductContent {
  return PRODUCT_CONTENT[id] ?? DEFAULT_CONTENT;
}

/** 표시용 브랜드·가격 — mock 목업 id(PRODUCT_CONTENT에 등록됨)는 그 마케팅 값을 그대로 쓰고, 실
 *  카탈로그 id(등록 안 됨)는 ProductSpec의 실제 값을 쓴다. `product.priceKrw ?? content.priceKrw`처럼
 *  단순 폴백을 쓰면 안 된다 — mock 카탈로그 제품 중 다수가 ProductSpec에도 priceKrw/brand를 들고
 *  있는데 그 값이 PRODUCT_CONTENT의 마케팅 값과 다르다(예: lamp-warm 39000원 vs 79000원) — 폴백을
 *  쓰면 mock 화면 가격이 조용히 바뀐다. */
export function getDisplayBrand(product: Pick<ProductSpec, 'id' | 'brand'>): string {
  const content = PRODUCT_CONTENT[product.id];
  return content ? content.brand : (product.brand ?? DEFAULT_CONTENT.brand);
}

export function getDisplayPriceKrw(product: Pick<ProductSpec, 'id' | 'priceKrw'>): number {
  const content = PRODUCT_CONTENT[product.id];
  return content ? content.priceKrw : (product.priceKrw ?? DEFAULT_CONTENT.priceKrw);
}

export function getDisplayDescription(product: Pick<ProductSpec, 'id' | 'description'>): string {
  const content = PRODUCT_CONTENT[product.id];
  return content ? content.description : (product.description ?? DEFAULT_CONTENT.description);
}

/** 좋아요 수 — 커뮤니티의 bookmarkCount와 같은 성격의 마케팅용 표시 전용 목업.
 *  reviewCount에서 결정적으로 파생시켜(Math.random 금지 — SSR/CSR 하이드레이션이 어긋난다)
 *  제품을 추가할 때마다 값을 손으로 채우지 않아도 되게 한다. */
export function getLikeCount(id: string): number {
  return Math.round(getProductContent(id).reviewCount * 0.15) + 10;
}
