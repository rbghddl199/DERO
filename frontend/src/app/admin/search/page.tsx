import type { Metadata } from 'next';

import SearchIndexAdmin from '@/components/admin/search/SearchIndexAdmin';

export const metadata: Metadata = {
  title: '검색 색인 — DERO',
  description: '제품·배치·게시글·사용자 검색 인덱스를 전량 재색인합니다.',
  robots: { index: false, follow: false },
};

const AdminSearchPage = () => <SearchIndexAdmin />;

export default AdminSearchPage;
