// 제품 상세 라우트 — mock이면 규격 DB(product.ts), real이면 GET /products/{id}에서 제품을 찾아
// 상세 페이지를 렌더링, 없으면 404
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductDetail from '@/components/product/ProductDetail';
import { getProductContent } from '@/components/product/productContent';
import { getProductById } from '@/api/product';
import { isMockApi } from '@/constants/api';
import { getProduct, type ProductSpec } from '@/three/scene/product';
import { toProductSpec } from '@/three/scene/catalogAdapter';
import { safeMypageReturnTo, type ReturnToQueryValue } from '@/utils/mypageReturnTo';

type Props = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ returnTo?: ReturnToQueryValue }>;
};

/** real 단건 조회 — 실패(404 포함, 원인 무관)는 전부 null로 접는다. 카탈로그 항목 단위 실패를 조용히
 *  건너뛰는 기존 원칙과 일관(product/page.tsx의 loadRealLibraryProducts와 같은 태도). 데스크 재질
 *  (deskTextures)은 이 화면이 3D 렌더를 안 해 안 쓰이므로 빈 배열로 넘긴다. */
async function loadRealProduct(productId: string): Promise<ProductSpec | null> {
  const id = Number(productId);
  if (!Number.isFinite(id)) return null;
  try {
    const dto = await getProductById(id);
    return await toProductSpec(dto, []);
  } catch (error: unknown) {
    console.error('[ProductDetailPage] 제품 조회 실패', error);
    return null;
  }
}

async function loadProduct(productId: string): Promise<ProductSpec | null> {
  return isMockApi() ? (getProduct(productId) ?? null) : loadRealProduct(productId);
}

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { productId } = await params;
  const product = await loadProduct(productId);

  if (!product) {
    return { title: '제품을 찾을 수 없습니다 — 데스크테리어 시뮬레이터' };
  }

  return {
    title: `${product.name} — 데스크테리어 시뮬레이터`,
    description: `${product.name}의 실측 규격과 상세 정보를 확인하세요`,
  };
};

const ProductDetailPage = async ({ params, searchParams }: Props) => {
  const { productId } = await params;
  const { returnTo } = await searchParams;
  const product = await loadProduct(productId);

  if (!product) {
    notFound();
  }

  const content = getProductContent(product.id);

  return (
    <ProductDetail
      product={product}
      content={content}
      returnHref={safeMypageReturnTo(returnTo, 'wishlist')}
    />
  );
};

export default ProductDetailPage;
