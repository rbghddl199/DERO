// 관리자 해시태그 관리 라우트 — 권한 게이트·레이아웃은 app/admin/layout.tsx(AdminShell)가 맡는다.

import type { Metadata } from 'next';

import HashtagsAdmin from '@/components/admin/masters/HashtagsAdmin';

export const metadata: Metadata = {
  title: '해시태그 관리 — 데스크테리어 시뮬레이터',
  description: '제품 탐색용 해시태그 마스터를 관리합니다',
  robots: { index: false, follow: false },
};

const AdminHashtagsPage = () => <HashtagsAdmin />;

export default AdminHashtagsPage;
