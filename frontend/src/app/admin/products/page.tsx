// 관리자 제품 목록 라우트 — 목록·필터는 클라이언트 패널(ProductListPanel)이 맡는다(운영진 전용, 색인 제외).

import type { Metadata } from 'next';

import ProductListPanel from '@/components/admin/products/ProductListPanel';
import {
  parseProductListLocation,
  type ProductListQuery,
} from '@/utils/admin/productListNavigation';

type Props = {
  searchParams: Promise<ProductListQuery>;
};

export const metadata: Metadata = {
  title: '제품 관리 — 관리자 콘솔',
  description: '카탈로그 제품과 사용자 자작 제품을 검수 상태별로 조회합니다',
  robots: { index: false, follow: false },
};

const AdminProductsPage = async ({ searchParams }: Props) => {
  const query = await searchParams;
  return <ProductListPanel initialLocation={parseProductListLocation(query)} />;
};

export default AdminProductsPage;
