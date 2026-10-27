// 마이페이지 찜하기 — real 모드는 서버의 내 찜 목록(GET /products?liked=me)을, mock 모드는
// localStorage에 재수화된 좋아요를 로컬 카탈로그와 대조해 표시한다(DERO-356).

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import LoadingState from '@/components/common/LoadingState';
import Toast from '@/components/common/Toast';
import ProductCard from '@/components/product/ProductCard';
import { isMockApi } from '@/constants/api';
import { useAuthStore } from '@/store/authStore';
import { useProductLikesStore } from '@/store/productLikesStore';
import { toProductSpec } from '@/three/scene/catalogAdapter';
import { libraryItems, type ProductSpec } from '@/three/scene/product';

export const filterWishlistedProducts = (
  products: readonly ProductSpec[],
  likedIds: ReadonlySet<string>,
): ProductSpec[] => products.filter((product) => likedIds.has(product.id));

type ProductWishlistListProps = {
  products: readonly ProductSpec[];
  visibleLikedIds: ReadonlySet<string>;
  likedIds: ReadonlySet<string>;
  onToggleLike: (id: string) => void;
};

export const ProductWishlistList = ({
  products,
  visibleLikedIds,
  likedIds,
  onToggleLike,
}: ProductWishlistListProps) => {
  // 목록 포함 여부는 진입 시점 스냅샷으로 고정한다. 하트는 즉시 바뀌고 서버에도 곧바로 쓰지만,
  // 실수로 누른 카드를 즉시 없애지 않고 메뉴 재진입·새로고침 때 새 서버 목록으로 정리한다.
  const wishlistedProducts = filterWishlistedProducts(products, visibleLikedIds);

  if (wishlistedProducts.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
        <p className="text-lg font-semibold text-neutral-800">아직 찜한 제품이 없어요.</p>
        <Link
          href="/product"
          className="mt-5 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
        >
          제품 둘러보기
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-x-5 gap-y-9">
      {wishlistedProducts.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isLiked={likedIds.has(product.id)}
          onToggleLike={onToggleLike}
          detailHref={`/product/${product.id}?returnTo=${encodeURIComponent('/mypage?menu=wishlist')}`}
        />
      ))}
    </div>
  );
};

type StableWishlistProps = {
  products: readonly ProductSpec[];
  productsAreAlreadyFiltered: boolean;
};

/** 메뉴를 떠날 때까지 카드 목록을 고정하고 하트 상태만 공유 스토어에서 실시간으로 읽는다. */
const StableWishlist = ({ products, productsAreAlreadyFiltered }: StableWishlistProps) => {
  const likedIds = useProductLikesStore((state) => state.likedIds);
  const toggleLike = useProductLikesStore((state) => state.toggleLike);
  const [visibleLikedIds] = useState<ReadonlySet<string>>(() =>
    productsAreAlreadyFiltered
      ? new Set(products.map((product) => product.id))
      : new Set(useProductLikesStore.getState().likedIds),
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggleLike = (productId: string): void => {
    const next = toggleLike(productId);
    setToastMessage(next ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.');
  };

  return (
    <>
      <ProductWishlistList
        products={products}
        visibleLikedIds={visibleLikedIds}
        likedIds={likedIds}
        onToggleLike={handleToggleLike}
      />
      {toastMessage !== null && (
        // 마이페이지 안에 이미 좋아요 목록이 열려 있으므로 빨간색 '목록 보기' 액션은 붙이지 않는다.
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </>
  );
};

/**
 * real 모드의 찜 목록 — 서버가 준 제품을 카드가 아는 `ProductSpec`으로 옮긴다.
 *
 * <p>여기서 `libraryItems()`를 쓸 수 없다: 그건 시뮬레이터 엔진이 `setCatalog()`으로 적재해 둔
 * 카탈로그인데, 마이페이지는 시뮬레이터를 거치지 않아 real 모드에서도 여전히 목업 카탈로그다 —
 * 백엔드 숫자 id로 찾으면 하나도 안 걸려 "찜한 제품이 없어요"가 뜬다. 그래서 목록 응답의 제품을
 * 직접 변환한다(`/product` 페이지와 같은 계약, `app/product/page.tsx`).
 *
 * 3D 렌더가 없는 화면이라 desk 재질은 빈 배열로 넘기고 ARM 실측은 폴백을 쓴다 — 같은 이유·같은 생략.
 *
 * <p>`products`가 `null`이면 아직 답이 없다는 뜻이다(로딩). 로그인 상태가 확정되기 전에는 부르지
 * 않는다 — `?liked=me`는 비로그인 401이라 세션 복원 중에 쏘면 실패 화면이 잠깐 뜬다.
 */
const useServerWishlist = (): { products: ProductSpec[] | null; loadError: boolean } => {
  const authStatus = useAuthStore((state) => state.auth.status);
  const [products, setProducts] = useState<ProductSpec[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (isMockApi()) return;
    if (authStatus !== 'authenticated') return;

    let cancelled = false;
    const load = async () => {
      try {
        // 스토어의 sync를 거친다 — 좋아요 id(하트·필터의 입력)와 카드 목록이 같은 응답에서 나와야
        // 둘이 어긋나지 않는다. 따로 부르면 두 응답 사이에 목록이 비어 보이는 틈이 생긴다.
        const liked = await useProductLikesStore.getState().syncFromServer();
        const specs = await Promise.all(liked.map((dto) => toProductSpec(dto, [])));
        if (!cancelled) setProducts(specs.filter((spec): spec is ProductSpec => spec !== null));
      } catch (error: unknown) {
        console.error('[ProductWishlistPanel] 찜 목록 조회 실패', error);
        if (!cancelled) setLoadError(true);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  // 비로그인이 확정되면 로딩을 붙들지 않는다 — 빈 목록 안내가 답이다(마이페이지 진입 자체는 막지
  // 않는 화면이라 이 분기가 필요하다).
  if (authStatus === 'anonymous' && products === null) {
    return { products: [], loadError };
  }
  return { products, loadError };
};

const ProductWishlistPanel = () => {
  const mockProducts = useMemo(() => libraryItems(), []);
  const { products: serverProducts, loadError } = useServerWishlist();
  const [isHydrated, setIsHydrated] = useState(() => useProductLikesStore.persist.hasHydrated());

  useEffect(() => {
    if (isHydrated) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const markHydrated = () => {
      timer ??= setTimeout(() => setIsHydrated(true), 0);
    };

    if (useProductLikesStore.persist.hasHydrated()) {
      markHydrated();
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const unsubscribe = useProductLikesStore.persist.onFinishHydration(markHydrated);

    if (useProductLikesStore.persist.hasHydrated()) {
      markHydrated();
    }

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [isHydrated]);

  // mock은 localStorage 복원을, real은 서버 응답을 기다린다. real 모드에서 로컬 복원까지 기다리면
  // 서버 값을 이미 받아 놓고도 화면이 비어 있게 된다.
  const isPending = isMockApi() ? !isHydrated : serverProducts === null && !loadError;
  if (isPending) {
    return <LoadingState label="찜하기 확인 중" description="찜한 제품을 불러오고 있습니다." />;
  }

  const products = isMockApi() ? mockProducts : (serverProducts ?? []);

  return (
    <section aria-labelledby="product-wishlist-panel-title">
      <div className="max-w-full min-w-0 border-b border-neutral-200 pb-5">
        <p className="text-primary-700 mb-2 max-w-full min-w-0 text-sm font-semibold tracking-[0.14em] break-all">
          WISHLIST
        </p>
        <h1
          id="product-wishlist-panel-title"
          className="text-[34px] font-bold tracking-[-0.04em] text-neutral-900"
        >
          찜하기
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-neutral-600">
          찜한 제품을 한곳에서 확인해 보세요.
        </p>
      </div>

      <div className="pt-7">
        {loadError && (
          <p className="mb-5 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
            찜 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        <StableWishlist products={products} productsAreAlreadyFiltered={!isMockApi()} />
      </div>
    </section>
  );
};

export default ProductWishlistPanel;
