// 컬렉션 "사용된 아이템" 조립 계약 검증 — 상세의 사이드바 드롭다운과 하단 그리드가 같은
// 배열을 보므로, 묶는 순서와 수량이 어긋나면 두 화면이 동시에 틀어진다.
import { describe, expect, it } from 'vitest';
import { groupItemsByProductId, primaryImageUrl } from '@/components/collection/usedItems';
import type { ProductDetailResponse, ProductImageDetailResponse } from '@/types/catalog';
import type { ItemDetailResponse } from '@/types/placement';

function item(productId: number): ItemDetailResponse {
  return {
    id: productId * 1000,
    productId,
    positionXMm: 0,
    positionYMm: 0,
    positionZMm: 0,
    rotationDeg: 0,
    surfaceType: 'TOP',
    wallSide: null,
    isVesaMounted: false,
    mountedToItemId: null,
    jointValues: null,
    emitterColor: null,
  };
}

function image(imageId: number, isPrimary: boolean): ProductImageDetailResponse {
  return { imageId, imageUrl: `https://example.test/${imageId}.png`, displayOrder: 0, isPrimary };
}

function product(images: ProductImageDetailResponse[]): ProductDetailResponse {
  return {
    id: 1,
    specType: 'PROP',
    source: 'ADMIN',
    brandId: null,
    brandName: null,
    categoryId: null,
    categoryName: null,
    name: '테스트 제품',
    description: null,
    priceKrw: null,
    productUrl: null,
    status: 'ACTIVE',
    desk: null,
    monitor: null,
    arm: null,
    light: null,
    prop: null,
    asset: null,
    emitter: null,
    images,
    vesaSpecs: [],
  };
}

describe('groupItemsByProductId', () => {
  it('같은 제품을 수량으로 묶는다', () => {
    expect(groupItemsByProductId([item(51), item(27), item(51)])).toEqual([
      { productId: 51, quantity: 2 },
      { productId: 27, quantity: 1 },
    ]);
  });

  it('배치에 처음 등장한 순서를 유지한다 — 조회할 때마다 카드 순서가 바뀌면 안 된다', () => {
    const grouped = groupItemsByProductId([item(88), item(12), item(88), item(51)]);
    expect(grouped.map((g) => g.productId)).toEqual([88, 12, 51]);
  });

  it('아이템이 없는 배치는 빈 배열이다 — 호출부가 섹션을 통째로 안 그린다', () => {
    expect(groupItemsByProductId([])).toEqual([]);
  });
});

describe('primaryImageUrl', () => {
  it('isPrimary인 이미지를 고른다', () => {
    expect(primaryImageUrl(product([image(1, false), image(2, true)]))).toBe(
      'https://example.test/2.png',
    );
  });

  it('대표가 지정 안 됐으면 첫 장으로 폴백한다', () => {
    expect(primaryImageUrl(product([image(1, false), image(2, false)]))).toBe(
      'https://example.test/1.png',
    );
  });

  it('이미지가 없으면 undefined — 카드가 빈 박스로 남는다', () => {
    expect(primaryImageUrl(product([]))).toBeUndefined();
  });
});
