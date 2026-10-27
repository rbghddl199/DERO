// 제품 카테고리 한글 라벨 — 카드·상세·브레드크럼이 공유하는 정본

import type { ProductCategory } from '@/three/scene/product';

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  desk: '책상',
  monitor: '모니터',
  'monitor-arm': '모니터암',
  keyboard: '키보드',
  mouse: '마우스',
  speaker: '스피커',
  'water-bottle': '보틀',
  lamp: '조명',
  mug: '머그',
  plant: '식물',
  decor: '데코',
  chair: '의자',
};
