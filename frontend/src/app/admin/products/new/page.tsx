// 제품 등록 라우트 — 관리자 전용(색인 제외). 규격 5종 중 하나를 골라 공통 정보와 함께 등록한다.

import type { Metadata } from 'next';

import ProductForm from '@/components/admin/products/ProductForm';
import {
  safeAdminProductReturnTo,
  type ProductPageQueryValue,
} from '@/utils/admin/productListNavigation';

type Props = {
  searchParams: Promise<{ returnTo?: ProductPageQueryValue }>;
};

export const metadata: Metadata = {
  title: '제품 등록 — 관리자 콘솔',
  description: '카탈로그 제품의 공통 정보와 실측 규격을 등록합니다',
  robots: { index: false, follow: false },
};

const AdminProductCreatePage = async ({ searchParams }: Props) => {
  const { returnTo } = await searchParams;
  return <ProductForm productId={null} returnTo={safeAdminProductReturnTo(returnTo)} />;
};

export default AdminProductCreatePage;
