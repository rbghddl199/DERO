// 관리자 카테고리 관리 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import CategoriesAdmin from '@/components/admin/masters/CategoriesAdmin';

export const metadata: Metadata = {
  title: '카테고리 관리 — 데스크테리어 시뮬레이터',
  description: '제품 탐색용 분류 트리를 관리합니다',
  robots: { index: false, follow: false },
};

const AdminCategoriesPage = () => <CategoriesAdmin />;

export default AdminCategoriesPage;
