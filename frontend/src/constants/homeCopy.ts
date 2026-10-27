// 홈 랜딩(`/`) 카피 상수 — page.tsx·ServiceFeatures.tsx의 정적 문구를 한 곳에 모은다.

import monitorArmImg from '@/assets/home/모니터암_배경투명화.webp';
import budgetImg from '@/assets/home/예산_배경투명화.webp';
import lightingImg from '@/assets/home/조명_배경투명화.webp';
import deskImg from '@/assets/home/책상_배경투명화.webp';
import commnunityImg from '@/assets/home/커뮤니티_배경투명화.webp';

export const HOME_FEED_BANNER_COPY = {
  eyebrow: '컬렉션',
  ctaLabel: '컬렉션 보러가기',
};

export const HOME_FEED_PREVIEW_COPY = {
  title: '다른 사람들의 데스크테리어',
  subtitle: '컬렉션에 공개된 배치를 둘러보세요.',
  viewAllLabel: '컬렉션 더보기',
};

export const HOME_DESK_FEED_PREVIEW_COPY = {
  title: '실제 책상 사진',
  subtitle: '데스크피드에 올라온 진짜 책상들을 둘러보세요.',
  viewAllLabel: '데스크피드 더보기',
};

export const HOME_PRODUCT_PREVIEW_COPY = {
  title: '인기 제품',
  subtitle: '실측 규격으로 검증된 제품을 살펴보세요.',
  viewAllLabel: '전체 제품 보기',
};

// 히어로 카피는 2026-08-04 홈 개편(컬렉션 배너 우선)으로 렌더에서 빠졌다 — 복원 가능성이 있어 보존.
export const HOME_HERO_COPY = {
  badge: '',
  // '사보기 전에,' 뒤에서 반드시 줄바꿈 — 렌더 쪽에서 whitespace-pre-line으로 살린다(2026-08-02 사용자 지정)
  title: '사보기 전에,\n내 책상에 먼저 올려보세요',
  subtitle:
    '시뮬레이터를 통해 배치와 무드까지 확인할 수 있는, 유일한 데스크테리어 서비스 DERO입니다.',
};

export const HOME_DESKTOP_SHOWCASE_COPY = {
  title: '에셋으로 당신의 데스크를 꾸며보세요',
  description:
    '실측 규격 그대로 옮긴 데스크를 360도 돌려보고, 제품은 끌어다 놓기만 하면 표면에 맞춰 배치돼요. 축 하나하나 직접 맞출 필요 없이 나만의 조합을 완성해보세요.',
};

export const HOME_MONITOR_ARM_SHOWCASE_COPY = {
  title: '관절 하나하나까지 실측 그대로',
  description:
    '클램프부터 헤드까지, 실제 규격대로 움직이는 관절을 미리 확인해보세요. 모니터를 가까이 가져가면 VESA 규격이 맞는지 자동으로 판정하고, 맞으면 자석처럼 딱 붙어요.',
};

export const HOME_CLOSING_CTA_COPY = {
  title: '지금 내 책상을 시뮬레이터에 올려보세요',
  description:
    '로그인하고 배치부터 호환성 검증까지 바로 확인해보세요. 둘러보기는 로그인 없이도 가능해요.',
};

export const HOME_SERVICE_FEATURES_COPY = {
  titleHighlight: 'DERO',
  titleRest: '에서 데스크테리어를 완성하는 법을 소개드릴게요.',
};

export type ServiceFeature = {
  eyebrow: string;
  image: string;
  imageFit: 'contain' | 'cover';
  alt: string;
  title: string;
  description: string;
};

export const SERVICE_FEATURES: ServiceFeature[] = [
  {
    eyebrow: '호환성 판정',
    image: monitorArmImg.src,
    imageFit: 'contain',
    alt: '모니터암 클램프와 헤드 관절',
    title: '규격까지 검증하는\n호환성 판정',
    description:
      '모니터암-책상 클램프, 모니터 VESA·하중까지 mm 단위 규격으로 맞는지 미리 확인해요.',
  },
  {
    eyebrow: '무드 조명',
    image: lightingImg.src,
    imageFit: 'contain',
    alt: '따뜻한 색감의 무드 조명',
    title: '조명 위치로\n미리 보는 무드',
    description:
      '조명을 어디에 두느냐에 따라 책상 분위기가 어떻게 달라지는지 표면 반사까지 눈으로 확인하고 구매를 결정하세요.',
  },
  {
    eyebrow: '실시간 견적',
    image: budgetImg.src,
    imageFit: 'contain',
    alt: '여러 제품이 놓인 데스크테리어 배치 예시',
    title: '저장한 배치로\n미리 보는 예상 총액',
    description: '배치를 저장하면 담긴 제품들의 합계와 예산 대비 차액을 바로 계산해요.',
  },
  {
    eyebrow: '커뮤니티',
    image: commnunityImg.src,
    imageFit: 'contain',
    alt: '커뮤니티에 공유된 데스크테리어',
    title: '완성한 배치를\n커뮤니티에 공유해요',
    description:
      '내가 완성한 데스크테리어를 커뮤니티에 올리고, 다른 사용자의 배치에 댓글과 좋아요를 남겨보세요.',
  },
  {
    eyebrow: '컬렉션',
    image: deskImg.src,
    imageFit: 'contain',
    alt: '컬렉션에서 둘러보는 배치 갤러리',
    title: '마음에 드는 배치\n내 시뮬레이터로 가져오기',
    description:
      '컬렉션에서 발견한 배치를 그대로 가져와 리믹스하고, 내 책상 규격에 맞게 다시 확인해보세요.',
  },
];
