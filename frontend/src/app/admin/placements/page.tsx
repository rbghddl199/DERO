// 관리자 템플릿 시딩 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import PlacementTemplatesAdmin from '@/components/admin/placements/PlacementTemplatesAdmin';

export const metadata: Metadata = {
  title: '템플릿 시딩 — 데스크테리어 시뮬레이터',
  description: '운영진 배치를 컬렉션 시작 템플릿으로 지정합니다',
  robots: { index: false, follow: false },
};

const AdminPlacementsPage = () => <PlacementTemplatesAdmin />;

export default AdminPlacementsPage;
