import type { Metadata } from 'next';

import TermsAdmin from '@/components/admin/terms/TermsAdmin';

export const metadata: Metadata = {
  title: '약관 관리 — DERO',
  description: '서비스 약관과 동의 항목의 개정 회차를 관리합니다.',
  robots: { index: false, follow: false },
};

const AdminTermsPage = () => <TermsAdmin />;

export default AdminTermsPage;
