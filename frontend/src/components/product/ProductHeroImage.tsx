// 제품 상세 히어로 이미지 — 사진을 즉시 그대로 보여준다. 예전엔 살짝 확대된 상태에서 서서히
// 나타나는 등장 모션이 있었는데, 이미지가 느리게 뜬다는 피드백으로 제거했다(2026-08-02 사용자 확인).
// object-contain은 상세의 확정 결정이다 — 목록 카드(object-cover)와 맞추지 말 것(product/CLAUDE.md).

import RemoteImage from '@/components/common/RemoteImage';

type Props = {
  src: string;
  alt: string;
};

const ProductHeroImage = ({ src, alt }: Props) => (
  <div className="border-ash/40 bg-fog aspect-square overflow-hidden rounded-2xl border">
    <RemoteImage
      src={src}
      alt={alt}
      width={600}
      height={600}
      sizes="(min-width: 1024px) 600px, 100vw"
      priority
      className="h-full w-full object-contain"
    />
  </div>
);

export default ProductHeroImage;
