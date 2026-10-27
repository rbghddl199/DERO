// 관리자 3D 에셋 검수 큐 라우트 — 목록·승인/반려는 클라이언트 패널(ReviewPanel)이 맡는다(운영진 전용, 색인 제외).

import type { Metadata } from 'next';

import ReviewPanel from '@/components/admin/reviews/ReviewPanel';

export const metadata: Metadata = {
  title: '검수 대기 — 관리자 콘솔',
  description: '사용자가 올린 3D 에셋을 검수해 승인하거나 반려합니다',
  robots: { index: false, follow: false },
};

const AdminReviewsPage = () => <ReviewPanel />;

export default AdminReviewsPage;
