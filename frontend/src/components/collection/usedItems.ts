// 컬렉션 상세 "사용된 아이템" 조립 — 배치 아이템(placed_item)을 제품 단위로 묶는다.
// 같은 제품을 여러 개 놓으면 카드 하나에 수량(×N)으로 합친다(시뮬레이터 견적서 EstimatePanel의
// groupBySpec과 같은 규약이지만, 그쪽 입력은 엔진 PlacedItem이고 이쪽은 백엔드 ItemDetailResponse다).
// React·API 비의존 순수 함수라 tests/usedItems.test.ts가 직접 검증한다.

import type { ProductDetailResponse } from '@/types/catalog';
import type { ItemDetailResponse } from '@/types/placement';

/** 제품 카드 한 장 — 제품 상세 + 그 제품이 배치에 놓인 개수. */
export type UsedItem = {
  product: ProductDetailResponse;
  quantity: number;
};

/** 배치 아이템을 productId로 묶는다. 순서는 배치에 처음 등장한 순서를 유지한다 —
 *  카드 순서가 조회할 때마다 바뀌면 같은 배치가 매번 다른 화면으로 보인다. */
export function groupItemsByProductId(
  items: ItemDetailResponse[],
): { productId: number; quantity: number }[] {
  const quantityByProductId = new Map<number, number>();
  for (const item of items) {
    quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) ?? 0) + 1);
  }
  return [...quantityByProductId].map(([productId, quantity]) => ({ productId, quantity }));
}

/** 카드·목록의 대표 이미지 — 안정 공개 URL이라 common/RemoteImage(next/image)로 그린다
 *  (api/product.ts의 toDeskSummary·catalogAdapter.toProductSpec과 같은 선택 규칙). */
export function primaryImageUrl(product: ProductDetailResponse): string | undefined {
  return product.images.find((image) => image.isPrimary)?.imageUrl ?? product.images[0]?.imageUrl;
}
