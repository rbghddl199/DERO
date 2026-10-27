'use client';
// 제품 페이지 상단 광고 배너 3연 — '많이 팔린 상품'에 쓰던 것과 같은 AutoCarousel(자동 넘김 + 하단
// 진행 바 + 노란 좌우 버튼, 2026-08-03 사용자 요청)로 순환한다. 3장이 모두 보이는 채로 계속 도는
// 구조라 forceLoop를 켠다. 클릭하면 해당 상품 상세(/product/{productId})로 이동한다 — 이미지
// 파일명이 `{productId}-{슬러그}.webp`라 파일과 이동 대상이 눈으로 대응된다.

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import AutoCarousel from '@/components/common/AutoCarousel';
import acrylicTabletStandImg from '@/assets/product/promo/203-acrylic-tablet-stand.webp';
import elgatoStreamDeckNeoImg from '@/assets/product/promo/208-elgato-stream-deck-neo.webp';
import glassMonitorShelfImg from '@/assets/product/promo/1-glass-monitor-shelf.webp';
import steamDeckOledImg from '@/assets/product/promo/253-steam-deck-oled.webp';

type PromoItem = {
  id: string;
  label: string;
  imageSrc: typeof elgatoStreamDeckNeoImg;
  /** 카탈로그 상품 id — 클릭 시 이 값의 상세로 이동한다 */
  productId: number;
};

const PROMO_ITEMS: PromoItem[] = [
  {
    id: 'elgato-stream-deck-neo',
    label: '엘가토 스트림덱 네오',
    imageSrc: elgatoStreamDeckNeoImg,
    productId: 208,
  },
  {
    id: 'steam-deck-oled',
    label: '밸브 스팀덱 OLED',
    imageSrc: steamDeckOledImg,
    productId: 253,
  },
  {
    id: 'glass-monitor-shelf',
    label: '유리 모니터 받침대',
    imageSrc: glassMonitorShelfImg,
    productId: 1,
  },
  {
    id: 'acrylic-tablet-stand',
    label: '밍쓰마켓 투명 아크릴 거치대',
    imageSrc: acrylicTabletStandImg,
    productId: 203,
  },
];

const ProductPromoBanner = () => {
  const router = useRouter();

  const handleClick = (item: PromoItem) => {
    router.push(`/product/${item.productId}`);
  };

  return (
    // 섹션 간격 — 디자인 시스템의 섹션 간격은 96px(모바일 48px)이지만 카드 그리드가 이미 세로
    // 40px 리듬이라 96px은 이 화면에서 과하다. 80px(sm:mb-20)로 타협한다.
    <section className="mb-12 sm:mb-20">
      <AutoCarousel
        items={PROMO_ITEMS}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <button
            type="button"
            onClick={() => handleClick(item)}
            className="focus-visible:outline-primary-600 relative flex aspect-[3/2] w-full cursor-pointer overflow-hidden rounded-lg transition-opacity duration-300 ease-out hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Image
              src={item.imageSrc}
              alt={item.label}
              fill
              sizes="(min-width: 640px) 33vw, 100vw"
              className="object-cover"
            />
          </button>
        )}
        step={1}
        itemBasisClassName="basis-full sm:basis-[calc((100%-24px)/3)]"
        visibleCount={3}
        forceLoop
      />
    </section>
  );
};

export default ProductPromoBanner;
