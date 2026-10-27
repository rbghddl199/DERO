// 관리자 무드(vibe) 관리 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import VibesAdmin from '@/components/admin/masters/VibesAdmin';

export const metadata: Metadata = {
  title: '무드 관리 — 데스크테리어 시뮬레이터',
  description: '제품 분위기 태그 마스터를 관리합니다',
  robots: { index: false, follow: false },
};

const AdminVibesPage = () => <VibesAdmin />;

export default AdminVibesPage;
