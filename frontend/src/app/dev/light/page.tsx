// 조명 GLB 등록 도구 라우트 — 운영진 전용 데브 화면(프로덕션 내비게이션에 링크 없음)
import type { Metadata } from 'next';
import DynamicLightAuthor from '@/components/dev/light/DynamicLightAuthor';

export const metadata: Metadata = {
  title: '조명 GLB 등록 도구',
  robots: { index: false, follow: false },
};

const LightDevPage = () => {
  return <DynamicLightAuthor />;
};

export default LightDevPage;
