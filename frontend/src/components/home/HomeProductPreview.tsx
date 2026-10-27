// 홈 랜딩 제품 미리보기 — ProductGrid(필터·정렬·사이드바)는 재사용하지 않고 ProductCard만 얇게
// 감싼다. 좋아요 토글은 ProductGrid.tsx의 handleToggleLike와 같은 얕은 zustand 토글이라(전역 상태
// 하나 구독하는 4줄) 새 카드를 만들어 좋아요 버튼을 없애는 것보다 이 코드를 그대로 재사용하는 쪽이
// 더 적은 코드다 — ProductCard는 좋아요 버튼을 끌 수 있는 prop이 없다.
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import Toast from '@/components/common/Toast';
import ProductCard from '@/components/product/ProductCard';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { useProductLikesStore } from '@/store/productLikesStore';
import type { ProductSpec } from '@/three/scene/product';

const EMPTY_LIKED_IDS: ReadonlySet<string> = new Set();

type Props = {
  products: ProductSpec[];
};

const HomeProductPreview = ({ products }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const isAuthenticated = useIsAuthenticated();
  const storedLikedIds = useProductLikesStore((s) => s.likedIds);
  const toggleLikeStore = useProductLikesStore((s) => s.toggleLike);
  const likedIds = isAuthenticated ? storedLikedIds : EMPTY_LIKED_IDS;
  const [likeToast, setLikeToast] = useState<'added' | 'removed' | null>(null);

  const handleToggleLike = (id: string) => {
    if (!requireAuth()) return;
    const willLike = toggleLikeStore(id);
    setLikeToast(willLike ? 'added' : 'removed');
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isLiked={likedIds.has(product.id)}
            onToggleLike={handleToggleLike}
          />
        ))}
      </div>

      {likeToast && (
        <Toast
          message={likeToast === 'added' ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.'}
          actionLabel="좋아요 목록 보기"
          actionColorClassName="text-danger-500"
          onAction={() => {
            setLikeToast(null);
            router.push('/mypage?menu=wishlist');
          }}
          onDismiss={() => setLikeToast(null)}
        />
      )}
    </>
  );
};

export default HomeProductPreview;
