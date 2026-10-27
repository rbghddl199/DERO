'use client';
// 컬렉션 상세 하단 "사용된 아이템" 가로 갤러리 — 이 배치에 실제로 놓인 제품들을 한 줄로
// 늘어놓고 좌우 화살표로 넘긴다(2026-08-02 요청, 종전 2~5열 그리드를 대체).
// 조회는 이 컴포넌트가 하지 않는다 — CollectionDetail이 GET /placements/{id}의
// items[].productId를 묶어 GET /products/{id}로 채운 뒤 prop으로 내려준다(조회 정본 한 곳).
// 좋아요 상태는 제품 카탈로그(ProductCard)와 같은 productLikesStore를 공유한다 — 같은 제품이면
// 어디서 좋아요를 누르든 같은 값을 봐야 한다(real 모드 키는 String(product.id)).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LikeButton from '@/components/common/LikeButton';
import RemoteImage from '@/components/common/RemoteImage';
import Toast from '@/components/common/Toast';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useProductLikesStore } from '@/store/productLikesStore';
import { primaryImageUrl, type UsedItem } from './usedItems';

/** 한 번 누를 때 넘기는 양 — 보이는 폭의 80%. 카드 폭 고정값을 곱하면 반응형에서 어긋난다. */
const SCROLL_RATIO = 0.8;
/** 서브픽셀 오차로 화살표가 끝에서 안 꺼지는 걸 막는 여유. */
const EDGE_EPSILON_PX = 1;

type ArrowButtonProps = {
  direction: 'left' | 'right';
  onClick: () => void;
};

const ArrowButton = ({ direction, onClick }: ArrowButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={direction === 'left' ? '이전 아이템 보기' : '다음 아이템 보기'}
    className={`border-ash/40 bg-paper/90 text-ink hover:bg-fog absolute top-[calc(50%-2.5rem)] flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors ${
      direction === 'left' ? '-left-3' : '-right-3'
    }`}
  >
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6l-3.5 3.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);

type Props = {
  items: UsedItem[];
};

const CollectionUsedItems = ({ items }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const likedIds = useProductLikesStore((s) => s.likedIds);
  const toggleLike = useProductLikesStore((s) => s.toggleLike);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ canScrollLeft: false, canScrollRight: false });

  // 스크롤바를 숨겼으므로(아래 트랙 className) 화살표가 유일한 가시 이동 수단이다 — 넘길 게
  // 남았는지를 실제 스크롤 폭으로 계산해 켜고 끈다.
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    const sync = (): void => {
      const maxScrollLeft = track.scrollWidth - track.clientWidth;
      setEdges({
        canScrollLeft: track.scrollLeft > EDGE_EPSILON_PX,
        canScrollRight: track.scrollLeft < maxScrollLeft - EDGE_EPSILON_PX,
      });
    };
    sync();
    track.addEventListener('scroll', sync, { passive: true });
    // 창 크기·이미지 로드로 폭이 바뀌면 넘길 게 남았는지도 바뀐다.
    const observer = new ResizeObserver(sync);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [items]);

  const scrollByPage = (direction: 1 | -1): void => {
    const track = trackRef.current;
    if (track === null) return;
    track.scrollBy({ left: direction * track.clientWidth * SCROLL_RATIO, behavior: 'smooth' });
  };

  const handleToggleLike = (productId: string): void => {
    if (!requireAuth()) return;
    const next = toggleLike(productId);
    setToastMessage(next ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.');
  };

  // 아이템이 없는 배치이거나 제품이 전부 비공개·삭제라 못 채운 경우에도 섹션은 그대로 두고
  // 빈 상태 문구만 보여준다(2026-08-06 요청 — 종전엔 CollectionGeneratedImages·CollectionRemixes와
  // 같은 규칙으로 섹션 자체를 통째로 숨겼었다).
  if (items.length === 0) {
    return (
      <section className="mt-12">
        <h2 className="text-ink mb-4 text-[20px] font-medium">
          사용된 아이템 <span className="text-ash text-[16px] font-normal">0개</span>
        </h2>
        <p className="text-ash border-ash/20 rounded-[10px] border border-dashed py-10 text-center text-[14px]">
          사용된 아이템이 없어요.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <h2 className="text-ink mb-4 text-[20px] font-medium">
        사용된 아이템 <span className="text-ash text-[16px] font-normal">{items.length}개</span>
      </h2>

      <div className="relative">
        <div
          ref={trackRef}
          // 전역 `html.hide-scrollbar`(globals.css)는 **문서** 스크롤바만 지운다 — 이 안쪽 요소는
          // 자기 가로 스크롤바를 그대로 그리므로 여기서 따로 숨긴다(2026-08-02 요청). 휠·트랙패드
          // 스와이프는 살아 있고 화살표가 가시 이동 수단이다. snap으로 카드가 잘린 채 멈추지 않게 한다.
          className="flex snap-x snap-mandatory scrollbar-none gap-4 overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden"
        >
          {items.map(({ product, quantity }) => {
            const productId = String(product.id);
            const imageUrl = primaryImageUrl(product);
            const isLiked = likedIds.has(productId);

            return (
              <article
                key={productId}
                className="group relative w-[calc((100%-1rem)/2)] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-4rem)/5)]"
              >
                <Link href={`/product/${productId}`} className="block">
                  <div className="border-ash/40 bg-fog group-hover:border-ink relative aspect-square overflow-hidden rounded-[10px] border transition-colors">
                    {imageUrl !== undefined && (
                      <RemoteImage
                        src={imageUrl}
                        alt={product.name}
                        fill
                        sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                        className="object-contain"
                      />
                    )}
                    {quantity > 1 && (
                      <span className="bg-ink/80 text-paper absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums">
                        ×{quantity}
                      </span>
                    )}
                  </div>
                  {product.brandName !== null && (
                    <p className="text-ash mt-2 text-[13px]">{product.brandName}</p>
                  )}
                  <p className="text-ink line-clamp-2 text-[14px] leading-[1.3] font-medium">
                    {product.name}
                  </p>
                  <p className="text-ink mt-1 text-[15px] font-bold tabular-nums">
                    {product.priceKrw === null
                      ? '가격 미정'
                      : `${product.priceKrw.toLocaleString('ko-KR')}원`}
                  </p>
                </Link>

                <LikeButton
                  isLiked={isLiked}
                  onToggle={() => handleToggleLike(productId)}
                  isOverlay
                />
              </article>
            );
          })}
        </div>

        {/* 넘길 게 없으면 화살표 자체를 안 그린다 — 눌리지 않는 버튼을 남겨두면 끝인지 고장인지
            구분이 안 된다. 카드 이미지가 정사각형이라 세로 중앙은 이미지 한가운데다. */}
        {edges.canScrollLeft && <ArrowButton direction="left" onClick={() => scrollByPage(-1)} />}
        {edges.canScrollRight && <ArrowButton direction="right" onClick={() => scrollByPage(1)} />}
      </div>
      {toastMessage !== null && (
        <Toast
          message={toastMessage}
          actionLabel="좋아요 목록 보기"
          actionColorClassName="text-danger-500"
          onAction={() => {
            setToastMessage(null);
            router.push('/mypage?menu=wishlist');
          }}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </section>
  );
};

export default CollectionUsedItems;
