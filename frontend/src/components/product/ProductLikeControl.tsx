'use client';
// 제품 상세의 좋아요(아이콘+카운트 pill) + 토스트 — 상태가 필요한 부분만 클라이언트로 떼어낸 조각이다.
// ProductDetail 전체에 'use client'를 붙이면 규격표·설명까지 클라이언트 번들로 넘어가므로 이렇게 가른다
// (커뮤니티 상세는 이미 전체가 클라이언트라 자체 state를 쓰지만, 제품 상세는 서버 컴포넌트를 유지한다).
// 좋아요 여부는 useProductLikesStore를 목록(ProductGrid)과 공유한다 — 로컬 useState로 들면 목록에서
// 누르고 상세로 들어가거나 그 반대일 때 상태가 어긋난다.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getProductLike } from '@/api/interaction';
import CountPillToggle from '@/components/common/CountPillToggle';
import Toast from '@/components/common/Toast';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useProductLikesStore } from '@/store/productLikesStore';
import type { LikeStatusResponse } from '@/types/interaction';

type Props = {
  productId: string;
};

const ProductLikeControl = ({ productId }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const isAuthenticated = useIsAuthenticated();
  // 비로그인이면 localStorage에 남은 좋아요가 있어도 화면엔 항상 "안 누른 상태"로 보여준다
  // (ProductGrid의 likedIds 게이팅과 같은 이유) — 토글 자체는 handleToggle의 requireAuth가 막는다.
  const isLiked = useProductLikesStore((s) => isAuthenticated && s.likedIds.has(productId));
  const toggleLikeStore = useProductLikesStore((s) => s.toggleLike);
  const [toast, setToast] = useState<'added' | 'removed' | null>(null);
  // 서버 좋아요 수 — GET /products/{id}/like는 비로그인 401이라(실측) 로그인 상태에서만 부른다.
  // 못 받으면 숫자를 아예 안 보여준다(옛 getLikeCount 목업 상수는 실제품에서 전부 10이었다).
  const [serverStatus, setServerStatus] = useState<LikeStatusResponse | null>(null);

  useEffect(() => {
    // mock 카탈로그 id('monitor-27')는 서버가 못 푼다 — real 모드의 숫자 id일 때만 조회한다.
    const numericId = Number(productId);
    if (!isAuthenticated || !Number.isInteger(numericId)) return;
    let cancelled = false;
    getProductLike(numericId)
      .then((status) => {
        if (!cancelled) setServerStatus(status);
      })
      .catch((error: unknown) => {
        console.error('[ProductLikeControl] 좋아요 상태를 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
    // isLiked를 deps에 넣어 토글 후 서버 값을 다시 확정한다 — 토글 write는 스토어가 멱등 204로
    // 쏘고 응답에 카운트가 없다(api/CLAUDE.md '토글 계열' 규약).
  }, [productId, isAuthenticated, isLiked]);

  // 서버 값과 스토어 상태가 어긋난 그 찰나(토글 직후 재조회 전)만 내 토글분 ±1을 얹는다.
  const count =
    serverStatus === null
      ? null
      : serverStatus.likeCount + ((isLiked ? 1 : 0) - (serverStatus.liked ? 1 : 0));

  const handleToggle = () => {
    if (!requireAuth()) return;
    const next = toggleLikeStore(productId);
    setToast(next ? 'added' : 'removed');
  };

  return (
    <>
      <CountPillToggle variant="like" isActive={isLiked} count={count} onToggle={handleToggle} />
      {toast && (
        <Toast
          message={toast === 'added' ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.'}
          actionLabel="좋아요 목록 보기"
          actionColorClassName="text-danger-500"
          onAction={() => {
            setToast(null);
            // 마이페이지 '찜하기'가 제품 좋아요 목록의 정본이다(ProductWishlistPanel도 같은
            // productLikesStore를 읽는다) — 목록 페이지의 ?view=liked 필터가 아니라 여기로 보낸다
            router.push('/mypage?menu=wishlist');
          }}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
};

export default ProductLikeControl;
