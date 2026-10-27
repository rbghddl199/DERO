// 관리자 VESA 규격 관리 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import VesaSpecsAdmin from '@/components/admin/masters/VesaSpecsAdmin';

export const metadata: Metadata = {
  title: 'VESA 규격 관리 — 데스크테리어 시뮬레이터',
  description: 'VESA 마운트 홀 간격(mm) 마스터를 관리합니다',
  robots: { index: false, follow: false },
};

const AdminVesaSpecsPage = () => <VesaSpecsAdmin />;

export default AdminVesaSpecsPage;
