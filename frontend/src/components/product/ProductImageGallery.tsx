'use client';
// 제품 상세 이미지 갤러리 — 히어로 1장 + 하단 썸네일 스트립. 이미지가 2장 이상일 때만 쓰고,
// 1장이면 호출부가 ProductHeroImage(서버 컴포넌트)를 그대로 쓴다 — 상태가 필요한 화면만 클라이언트로
// 떼어내는 ProductLikeControl과 같은 규칙이다.
// object-contain은 상세의 확정 결정이다 — 목록 카드(object-cover)와 맞추지 말 것(product/CLAUDE.md).

import { useState } from 'react';
import RemoteImage from '@/components/common/RemoteImage';

type Props = {
  srcs: string[];
  alt: string;
};

const ProductImageGallery = ({ srcs, alt }: Props) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSrc = srcs[activeIndex] ?? srcs[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="border-ash/40 bg-fog aspect-square overflow-hidden rounded-2xl border">
        <RemoteImage
          src={activeSrc}
          alt={alt}
          width={600}
          height={600}
          sizes="(min-width: 1024px) 600px, 100vw"
          priority
          className="h-full w-full object-contain"
        />
      </div>

      <ul className="flex flex-wrap gap-2">
        {srcs.map((src, index) => (
          <li key={src}>
            <button
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`${alt} 이미지 ${index + 1}`}
              aria-current={index === activeIndex}
              className={`bg-fog block size-16 cursor-pointer overflow-hidden rounded-[10px] border transition-colors ${
                index === activeIndex ? 'border-ink' : 'border-ash/40 hover:border-ash'
              }`}
            >
              <RemoteImage
                src={src}
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-contain"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProductImageGallery;
