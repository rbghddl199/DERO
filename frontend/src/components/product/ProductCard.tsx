// 제품 카탈로그 카드 — 정적 썸네일(빌드타임 PNG) + 이름 + 카테고리 배지 + 실측 규격, 클릭 시 상세 페이지로 이동.
// 좋아요 버튼은 커뮤니티 PostCard와 같은 자리(이미지 우측 상단)에 두고, 상태는 ProductGrid가 소유한다.
'use client';

import Link from 'next/link';
import LikeButton from '@/components/common/LikeButton';
import RemoteImage from '@/components/common/RemoteImage';
import { CATEGORY_LABEL } from '@/constants/productCategory';
import { getDisplayBrand, getDisplayPriceKrw } from './productContent';
import type { ProductSpec } from '@/three/scene/product';

// 실 카탈로그 제품은 imageUrl(대표 실사 이미지)을 우선한다 — 없으면(mock 카탈로그) 기존
// 빌드타임 정적 PNG로 폴백한다 (DERO-325, ADR-0017 결정 1).
const thumbnailUrl = (spec: ProductSpec): string =>
  spec.imageUrl ?? `/assets/thumbnails/${spec.id}.png`;

type Props = {
  product: ProductSpec;
  isLiked: boolean;
  onToggleLike: (id: string) => void;
  /** 마이페이지처럼 상세에서 반드시 돌아와야 할 목록이 있으면 명시한다. */
  detailHref?: string;
};

const ProductCard = ({ product, isLiked, onToggleLike, detailHref }: Props) => {
  const brand = getDisplayBrand(product);
  const priceKrw = getDisplayPriceKrw(product);
  // 이미지 로드 실패(깨진 링크, 404 등) 감지는 RemoteImage가 한다 — DeskProjectCard.tsx와 같은 패턴
  const brokenImageIcon = (
    <div className="text-ash flex h-full w-full items-center justify-center" aria-hidden="true">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );

  return (
    // group/relative를 article로 올린다 — 좋아요 버튼을 Link(<a>) 바깥 형제로 둬야 앵커에 중첩되지 않고
    // (중첩 버튼은 잘못된 HTML이다) TransitionNavigator의 closest('a') 가로채기에도 안 걸린다.
    <article className="group relative">
      {/* 포커스 링은 Link 자신에 건다 — 아래 이미지 프레임은 overflow-hidden이라 그 안에 걸면
          UA 기본 outline처럼 잘려버린다. 링 조합은 ErrorState.tsx 것을 그대로 쓴다(레포 유일 선례). */}
      <Link
        href={detailHref ?? `/product/${product.id}`}
        className="focus-visible:outline-primary-600 block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* duration-500 ease-out — 이전엔 200ms라 즉각적으로 튀어 보였다. -translate-y-1로 뜨는
            높이도 살짝(2px→4px) 더 올렸다. 그림자를 같이 올리는 이유: 그림자 없이 4px만 떠오르면
            "떠오른다"가 아니라 "튄다"로 읽힌다(2026-08-02) */}
        <div className="border-ash/40 bg-fog group-hover:border-ink relative aspect-square overflow-hidden rounded-2xl border transition-[border-color,transform,box-shadow] duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-lg">
          <RemoteImage
            src={thumbnailUrl(product)}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            fallback={brokenImageIcon}
          />
          {/* 13px pill — 종전 14px/rounded-[10px]은 바로 아래 브랜드(13px)보다 커서 위계가 뒤집혀 있었다 */}
          <span className="bg-paper text-ink absolute top-3 left-3 rounded-full px-2.5 py-1 text-[13px] font-medium">
            {/* 실 카탈로그 제품은 category(닫힌 유니온)가 없다 — categoryName으로 폴백 (DERO-325) */}
            {product.category ? CATEGORY_LABEL[product.category] : (product.categoryName ?? '기타')}
          </span>
        </div>

        {/* text-ash(#a3a3a3)는 흰 배경 대비가 약 2.3:1로 WCAG 4.5:1에 못 미친다 — neutral-600으로 올린다 */}
        <p className="mt-2 text-[13px] text-neutral-600">{brand}</p>
        {/* 좋아요 수 표기는 2026-08-02 제거 — 목록 응답(ProductDetailResponse)에 likeCount가 없어
            실 카탈로그 제품이 전부 목업 상수(10)로 떴다. 하트 토글(LikeButton)만 남는다. */}
        {/* duration-500 — 위 프레임과 같은 값이어야 한 번의 hover가 두 속도로 갈라지지 않는다 */}
        <p className="text-ink mt-0.5 line-clamp-2 text-[15px] leading-[1.3] font-medium transition-opacity duration-500 group-hover:opacity-70">
          {product.name}
        </p>
        <p className="text-ink mt-1.5 text-[17px] font-bold tabular-nums">
          {priceKrw.toLocaleString('ko-KR')}원
        </p>
      </Link>

      <LikeButton isLiked={isLiked} onToggle={() => onToggleLike(product.id)} isOverlay />
    </article>
  );
};

export default ProductCard;
