// presigned URL 업로드 데브 테스트 라우트 — 운영진 전용(프로덕션 내비게이션에 링크 없음)
import type { Metadata } from 'next';
import ProductImageUploadTester from '@/components/dev/product-image-upload/ProductImageUploadTester';

export const metadata: Metadata = {
  title: '제품 이미지 업로드 테스트',
  robots: { index: false, follow: false },
};

const ProductImageUploadDevPage = () => {
  return <ProductImageUploadTester />;
};

export default ProductImageUploadDevPage;
