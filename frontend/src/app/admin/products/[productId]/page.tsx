// 제품 수정 라우트 — 관리자 전용(색인 제외). 공통 정보·규격·실사 이미지에 이어 3D 에셋(GLB
// 업로드·리그 저작)과 발광 설정을 여기서 손본다.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ProductAssetPanel from '@/components/admin/asset/ProductAssetPanel';
import ProductForm from '@/components/admin/products/ProductForm';
import {
  safeAdminProductReturnTo,
  type ProductPageQueryValue,
} from '@/utils/admin/productListNavigation';

type Props = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ returnTo?: ProductPageQueryValue }>;
};

export const metadata: Metadata = {
  title: '제품 수정 — 관리자 콘솔',
  description: '카탈로그 제품의 공통 정보·규격·실사 이미지와 3D 에셋·발광 설정을 수정합니다',
  robots: { index: false, follow: false },
};

const AdminProductEditPage = async ({ params, searchParams }: Props) => {
  const { productId } = await params;
  const { returnTo } = await searchParams;
  const numericId = Number(productId);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }

  return (
    <>
      <ProductForm productId={numericId} returnTo={safeAdminProductReturnTo(returnTo)} />

      {/* 규격 폼과 상태를 공유하지 않는다 — 저장 주기가 달라(에셋은 파일 업로드가 선행) 상세를
          따로 읽는 편이 서로의 입력 초안을 덮지 않는다. */}
      <ProductAssetPanel productId={numericId} />
    </>
  );
};

export default AdminProductEditPage;
