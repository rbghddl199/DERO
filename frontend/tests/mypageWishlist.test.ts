// 마이페이지 찜한 제품 필터·목록·빈 상태 계약을 검증한다.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  filterWishlistedProducts,
  ProductWishlistList,
} from '@/components/mypage/ProductWishlistPanel';
import { libraryItems } from '@/three/scene/product';

const renderWishlist = (likedIds: ReadonlySet<string>) =>
  renderToStaticMarkup(
    createElement(ProductWishlistList, {
      products: libraryItems(),
      visibleLikedIds: likedIds,
      likedIds,
      onToggleLike: () => undefined,
    }),
  );

describe('mypage product wishlist', () => {
  it('likedIds에 포함된 제품만 3열 목록에 표시한다', () => {
    const products = libraryItems();
    const likedProducts = [products[0], products[2]];
    const likedIds = new Set(likedProducts.map((product) => product.id));
    const html = renderWishlist(likedIds);

    expect(filterWishlistedProducts(products, likedIds)).toEqual(likedProducts);
    expect(html).toContain('grid-cols-3');
    for (const product of likedProducts) {
      expect(html).toContain(
        `href="/product/${product.id}?returnTo=%2Fmypage%3Fmenu%3Dwishlist"`,
      );
      expect(html).toContain(product.name);
    }
    expect(html).not.toContain(`href="/product/${products[1].id}"`);
  });

  it('빈 Set이면 확정 빈 상태와 제품 목록 링크를 표시한다', () => {
    const html = renderWishlist(new Set());

    expect(html).toContain('아직 찜한 제품이 없어요.');
    expect(html).toContain('href="/product"');
    expect(html).toContain('제품 둘러보기');
  });

  it('좋아요를 해제해도 진입 시점 목록에는 남고 하트 상태만 바뀐다', () => {
    const products = libraryItems();
    const targetId = products[0].id;
    const visibleLikedIds = new Set([targetId, products[1].id]);
    const nextLikedIds = new Set(visibleLikedIds);

    nextLikedIds.delete(targetId);

    const html = renderToStaticMarkup(
      createElement(ProductWishlistList, {
        products,
        visibleLikedIds,
        likedIds: nextLikedIds,
        onToggleLike: () => undefined,
      }),
    );

    expect(html).toContain(products[0].name);
    expect(html).toContain('aria-label="좋아요"');
  });
});
