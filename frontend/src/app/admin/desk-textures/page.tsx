// 관리자 책상 재질 관리 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import DeskTexturesAdmin from '@/components/admin/masters/DeskTexturesAdmin';

export const metadata: Metadata = {
  title: '책상 재질 관리 — 데스크테리어 시뮬레이터',
  description: '상판 재질 선택지와 텍스처 맵을 관리합니다',
  robots: { index: false, follow: false },
};

const AdminDeskTexturesPage = () => <DeskTexturesAdmin />;

export default AdminDeskTexturesPage;
