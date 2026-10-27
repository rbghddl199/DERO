// 리그 매니페스트 저작 도구 라우트 — 운영진 전용 데브 화면(프로덕션 내비게이션에 링크 없음)
import type { Metadata } from 'next';
import DynamicRigAuthor from '@/components/dev/rig/DynamicRigAuthor';

export const metadata: Metadata = {
  title: '리그 매니페스트 저작 도구',
  robots: { index: false, follow: false },
};

const RigDevPage = () => {
  return <DynamicRigAuthor />;
};

export default RigDevPage;
