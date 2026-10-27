// 관리자 브랜드 관리 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import BrandsAdmin from '@/components/admin/masters/BrandsAdmin';

export const metadata: Metadata = {
  title: '브랜드 관리 — 데스크테리어 시뮬레이터',
  description: '카탈로그 브랜드와 로고 이미지를 관리합니다',
  robots: { index: false, follow: false },
};

const AdminBrandsPage = () => <BrandsAdmin />;

export default AdminBrandsPage;
