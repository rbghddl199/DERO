// 제품 카테고리 아이콘 — 실사 WebP(assets/3D-icons) 우선, 없으면 라인 SVG 폴백. CameraPresetIcon.tsx(시뮬레이터)와 같은 패턴
import type { ReactElement } from 'react';
import type { ProductCategory } from '@/three/scene/product';
import monitorIcon from '@/assets/3D-icons/monitor.webp';
import keyboardIcon from '@/assets/3D-icons/keyboard.webp';
import mouseIcon from '@/assets/3D-icons/mouse.webp';
import monitorArmIcon from '@/assets/3D-icons/monitor-arm.webp';
import speakerIcon from '@/assets/3D-icons/speaker.webp';
import plantIcon from '@/assets/3D-icons/plant.webp';
import mugIcon from '@/assets/3D-icons/mug.webp';
import decorIcon from '@/assets/3D-icons/decor.webp';
import lampIcon from '@/assets/3D-icons/lamp.webp';
import chairIcon from '@/assets/3D-icons/chair.webp';
import storageBoxIcon from '@/assets/3D-icons/storage-box.webp';

// 카테고리 그룹(정리·거치 등)이 raw ProductCategory에 없는 아이콘을 쓸 수 있게 확장한 키.
export type CategoryIconKey = ProductCategory | 'storage-box';

const IMAGE_MAP: Partial<Record<CategoryIconKey, string>> = {
  monitor: monitorIcon.src,
  keyboard: keyboardIcon.src,
  mouse: mouseIcon.src,
  'monitor-arm': monitorArmIcon.src,
  speaker: speakerIcon.src,
  plant: plantIcon.src,
  mug: mugIcon.src,
  decor: decorIcon.src,
  lamp: lampIcon.src,
  chair: chairIcon.src,
  'storage-box': storageBoxIcon.src,
};

// 실사 아이콘이 없는 카테고리(desk·water-bottle)만 라인 SVG로 남긴다.
const PATHS: Partial<Record<CategoryIconKey, ReactElement>> = {
  desk: (
    <>
      <rect x="3" y="6" width="18" height="3" rx="1" />
      <path d="M6 9v9M18 9v9" />
    </>
  ),
  'water-bottle': (
    <>
      <path d="M10 3h4v3.2l1.5 2.3v11a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 19.5v-11L10 6.2Z" />
      <path d="M9.5 12h5" />
    </>
  ),
};

const ALL_PATH: ReactElement = (
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.2" />
    <rect x="14" y="3" width="7" height="7" rx="1.2" />
    <rect x="3" y="14" width="7" height="7" rx="1.2" />
    <rect x="14" y="14" width="7" height="7" rx="1.2" />
  </>
);

interface ProductCategoryIconProps {
  category: CategoryIconKey | 'all';
  width?: number;
  height?: number;
  className?: string;
}

const ProductCategoryIcon = ({
  category,
  width = 16,
  height = 16,
  className,
}: ProductCategoryIconProps) => {
  const imageSrc = category === 'all' ? undefined : IMAGE_MAP[category];
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        width={width}
        height={height}
        className={className}
        alt=""
        draggable={false}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {category === 'all' ? ALL_PATH : PATHS[category]}
    </svg>
  );
};

export default ProductCategoryIcon;
