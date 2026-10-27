// 제품 상세 페이지 마케팅용 목업 콘텐츠 데이터 — 규격 DB(three/scene/product.ts)와 분리된 UI 전용 데이터.
// 가격·설명·테마 태그·권장 데스크 너비는 백엔드 연동 전까지 여기서만 관리한다.
// 호환성 판정에는 절대 쓰지 않는다 — 판정 입력은 언제나 ProductSpec(mm)뿐이다.
// 조회 함수(getProductContent·getLikeCount)는 src/components/product/productContent.ts에 있다.

export interface ProductContent {
  /** 목록 카드의 "회사" 표기용 — 실제 제조사가 아닌 카탈로그 표시용 가상 브랜드명 */
  brand: string;
  priceKrw: number;
  description: string;
  themeTags: string[];
  /** 데스크에 놓기 적합한 최소 너비(мм) — 놓는 용도가 없는 소품(머그·보틀·식물)은 생략 */
  recommendedDeskWidthMm?: number;
  /** 목록 카드의 좋아요 수를 파생시키는 값(getLikeCount) — 리뷰 평점·리뷰 수 표기 자체는 실 API
   *  데이터가 아니라 2026-08-02에 화면에서 걷어냈다. */
  reviewCount: number;
}

export const DEFAULT_CONTENT: ProductContent = {
  brand: 'DERO',
  priceKrw: 0,
  description: '실측 규격으로 등록된 제품입니다.',
  themeTags: [],
  reviewCount: 0,
};

export const PRODUCT_CONTENT: Record<string, ProductContent> = {
  'desk-oak-1200': {
    brand: '우드랩',
    priceKrw: 189000,
    description:
      '오크 원목 무늬목 상판의 1200mm 데스크입니다.\n포서 프레임으로 안정적인 하중을 지지합니다.',
    themeTags: ['우드톤', '내추럴', '미니멀'],
    reviewCount: 1284,
  },
  'desk-walnut-1400': {
    brand: '우드랩',
    priceKrw: 259000,
    description:
      '월넛 상판의 1400mm 와이드 데스크입니다.\nT자 프레임으로 다리 공간을 넓게 확보했습니다.',
    themeTags: ['우드톤', '다크', '홈오피스'],
    reviewCount: 892,
  },
  'monitor-27': {
    brand: '뷰텍',
    priceKrw: 249000,
    description:
      '27인치 FHD 모니터로 선명한 화질과 화면을 제공합니다.\n슬림베젤 디자인으로 몰입감 있는 작업 환경을 만들어줍니다.',
    themeTags: ['미니멀', '화이트', '심플'],
    recommendedDeskWidthMm: 1200,
    reviewCount: 3210,
  },
  'monitor-34-curved': {
    brand: '뷰텍',
    priceKrw: 589000,
    description:
      '34인치 커브드 울트라와이드 모니터입니다.\n곡면 패널이 시야 전체를 감싸 몰입감 있는 멀티태스킹 환경을 제공합니다.',
    themeTags: ['게이밍', '몰입형', '다크'],
    recommendedDeskWidthMm: 1400,
    reviewCount: 1560,
  },
  'keyboard-tkl': {
    brand: '키트라',
    priceKrw: 129000,
    description:
      'TKL(텐키리스) 배열 키보드입니다.\n숫자패드를 덜어내 마우스 공간을 넓게 확보했습니다.',
    themeTags: ['게이밍', '컴팩트'],
    recommendedDeskWidthMm: 1000,
    reviewCount: 4521,
  },
  'speaker-book': {
    brand: '사운드베이',
    priceKrw: 219000,
    description:
      '북셸프형 스피커입니다.\n패브릭 그릴 마감으로 어떤 데스크테리어에도 잘 어우러집니다.',
    themeTags: ['오디오', '미니멀'],
    recommendedDeskWidthMm: 1200,
    reviewCount: 673,
  },
  'bottle-steel': {
    brand: '스틸웨어',
    priceKrw: 32000,
    description: '스테인리스 보온 보틀입니다.\n무광 브러시 마감으로 데스크 위에서도 튀지 않습니다.',
    themeTags: ['미니멀', '메탈'],
    reviewCount: 2210,
  },
  'mug-ceramic': {
    brand: '클레이하우스',
    priceKrw: 18000,
    description: '세라믹 머그입니다.\n따뜻한 아이보리 톤으로 우드 데스크와 잘 어울립니다.',
    themeTags: ['내추럴', '아늑한'],
    reviewCount: 1890,
  },
  'plant-pot': {
    brand: '그린데스크',
    priceKrw: 45000,
    description: '화분에 심은 데스크 식물입니다.\n작업 공간에 생기를 더해줍니다.',
    themeTags: ['내추럴', '아늑한'],
    reviewCount: 2765,
  },
  'monitor-arm-white': {
    brand: '암랩',
    priceKrw: 89000,
    description:
      '화이트 모니터암입니다.\n클램프 방식으로 데스크에 고정하며, 높이·각도를 자유롭게 조절할 수 있습니다.',
    themeTags: ['미니멀', '화이트', '홈오피스'],
    recommendedDeskWidthMm: 1200,
    reviewCount: 1342,
  },
  'decor-waves': {
    brand: '데코라인',
    priceKrw: 68000,
    description: '블루 웨이브 오브제입니다.\n은은한 발광 효과로 데스크에 포인트를 더합니다.',
    themeTags: ['데코', '포인트'],
    recommendedDeskWidthMm: 1000,
    reviewCount: 289,
  },
  'deskmat-900': {
    brand: '매트웍스',
    priceKrw: 39000,
    description:
      '900mm 폭의 데스크 매트입니다.\n키보드·마우스를 함께 올릴 수 있는 넉넉한 크기입니다.',
    themeTags: ['게이밍', '패브릭'],
    recommendedDeskWidthMm: 1200,
    reviewCount: 1975,
  },
  'lamp-warm': {
    brand: '라이트무드',
    priceKrw: 79000,
    description: '2700K 웜 톤 데스크 램프입니다.\n은은한 조명으로 아늑한 작업 환경을 만들어줍니다.',
    themeTags: ['아늑한', '내추럴'],
    recommendedDeskWidthMm: 1000,
    reviewCount: 1102,
  },
  'lamp-task': {
    brand: '라이트무드',
    priceKrw: 99000,
    description: '5000K 주광색 태스크 램프입니다.\n넓은 조사각으로 작업 면 전체를 밝혀줍니다.',
    themeTags: ['홈오피스', '메탈'],
    recommendedDeskWidthMm: 1000,
    reviewCount: 845,
  },
};
