// 제품 상세 — 이미지·가격·설명·테마 태그·실측 규격표를 한 화면에 보여준다
import Link from 'next/link';
import BackButton from '@/components/common/BackButton';
import ScrollProgress from '@/components/common/ScrollProgress';
import { CATEGORY_LABEL } from '@/constants/productCategory';
import { getCategoryGroup } from '@/constants/productCategoryGroup';
import type { ProductSpec } from '@/three/scene/product';
import {
  getDisplayBrand,
  getDisplayDescription,
  getDisplayPriceKrw,
  type ProductContent,
} from './productContent';
import ProductHeroImage from './ProductHeroImage';
import ProductImageGallery from './ProductImageGallery';
import ProductLikeControl from './ProductLikeControl';

// 실 카탈로그 제품은 imageUrl(대표 실사 이미지)을 우선한다 — 없으면(mock 카탈로그) 기존
// 빌드타임 정적 PNG로 폴백한다 (DERO-325, ADR-0017 결정 1).
const thumbnailUrl = (spec: ProductSpec): string =>
  spec.imageUrl ?? `/assets/thumbnails/${spec.id}.png`;

const formatMm = (mm: number): string => `${Math.round(mm)}mm`;
/** 저장 단위(g)를 표시 단위(kg)로 — 규격 원본은 항상 g 정수(ERD arm.allowed_load_g) */
const formatKg = (g: number): string => `${g / 1000}kg`;
/** 최소~최대 범위 — 한쪽만 등록됐으면 그쪽만 쓴다. 둘 다 없으면 행 자체를 만들지 않는다 */
const formatRangeMm = (min?: number, max?: number): string | null => {
  if (min != null && max != null) return `${formatMm(min)} ~ ${formatMm(max)}`;
  if (min != null) return `${formatMm(min)} 이상`;
  if (max != null) return `${formatMm(max)} 이하`;
  return null;
};

type SpecRow = { label: string; value: string };

const buildSpecRows = (product: ProductSpec): SpecRow[] => {
  // ARM은 예외다 — 백엔드 arm 테이블에 박스 치수 컬럼이 없어서 widthMm/depthMm/heightMm이
  // catalogAdapter의 ARM_FALLBACK_DIMS_MM(100×385×400) 상수다. 그 거짓값을 규격이라고 보여주는
  // 대신 실제로 등록된 가동 범위(리치·높이·클램프)를 쓴다 (2026-08-02).
  if (product.arm) {
    const rows: SpecRow[] = [];
    const reach = formatRangeMm(product.arm.reachMinMm, product.arm.reachMaxMm);
    const height = formatRangeMm(product.arm.heightMinMm, product.arm.heightMaxMm);
    const clamp = formatRangeMm(product.arm.clampMinMm, product.arm.clampMaxMm);
    if (reach) rows.push({ label: '암 리치', value: reach });
    if (height) rows.push({ label: '높이 조절', value: height });
    if (clamp) rows.push({ label: '클램프 물림', value: clamp });
    rows.push({ label: 'VESA', value: product.arm.vesa.join(', ') || '미지원' });
    rows.push({ label: '허용 하중', value: formatKg(product.arm.loadCapacityG) });
    return rows;
  }

  const rows: SpecRow[] = [
    { label: '가로', value: formatMm(product.widthMm) },
    { label: '깊이', value: formatMm(product.depthMm) },
    { label: '높이', value: formatMm(product.heightMm) },
  ];

  if (product.monitor) {
    rows.push({ label: 'VESA', value: product.monitor.vesa.join(', ') || '미지원' });
    rows.push({ label: '연결 포트', value: product.monitor.ports.join(', ') });
  }

  return rows;
};

/** 외부 구매 링크는 서버가 준 문자열이라 http(s)만 통과시킨다 (rules/nextjs/security.md) */
const safeExternalUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
};

type Props = {
  product: ProductSpec;
  content: ProductContent;
  returnHref?: string | null;
};

const ProductDetail = ({ product, content, returnHref = null }: Props) => {
  const specRows = buildSpecRows(product);
  // 브레드크럼은 5개 대분류(제품 페이지 카테고리 내비와 동일) 기준으로 이동한다 — 원시 카테고리
  // 배지(아래 CATEGORY_LABEL)와는 별개다.
  const categoryGroup = getCategoryGroup(product);
  const brand = getDisplayBrand(product);
  const priceKrw = getDisplayPriceKrw(product);
  const description = getDisplayDescription(product);
  const purchaseUrl = safeExternalUrl(product.productUrl);
  const galleryUrls = product.imageUrls ?? [];

  return (
    <div className="bg-paper min-h-full">
      <ScrollProgress />
      <div className="mx-auto max-w-[1200px] px-6 pt-8 pb-24 lg:px-[48px]">
        <div className="mb-4">
          <BackButton fallbackHref="/product" returnHref={returnHref} />
        </div>

        <nav
          aria-label="이동 경로"
          className="text-ash mb-6 flex flex-wrap items-center gap-1.5 text-[14px]"
        >
          <Link href="/product" className="hover:text-ink transition-colors">
            제품 라이브러리
          </Link>
          <span aria-hidden="true">›</span>
          <Link
            href={`/product?category=${encodeURIComponent(categoryGroup.key)}`}
            className="hover:text-ink transition-colors"
          >
            {categoryGroup.label}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {galleryUrls.length > 1 ? (
            <ProductImageGallery srcs={galleryUrls} alt={product.name} />
          ) : (
            <ProductHeroImage src={thumbnailUrl(product)} alt={product.name} />
          )}

          <div className="font-swiss tracking-[-0.03em]">
            <span className="bg-fog text-ink inline-block rounded-[10px] px-2 py-1 text-[14px] font-medium">
              {/* 실 카탈로그 제품은 category(닫힌 유니온)가 없다 — categoryName으로 폴백 (DERO-325) */}
              {product.category
                ? CATEGORY_LABEL[product.category]
                : (product.categoryName ?? '기타')}
            </span>

            {/* 목록 카드(ProductCard)와 같은 자리 — 제품명 위에 브랜드명을 작게 표시 */}
            <p className="text-ash mt-3 text-[15px]">{brand}</p>

            {/* 좋아요 pill은 여기(제목 옆)가 아니라 아래 구매 버튼 줄에 있다(2026-08-03 사용자 요청) */}
            <h1 className="text-ink mt-1 text-[32px] leading-[1.2] font-medium">{product.name}</h1>

            {priceKrw > 0 && (
              <p className="text-ink mt-2 text-[24px] font-medium tabular-nums">
                {priceKrw.toLocaleString('ko-KR')}원
              </p>
            )}

            <p className="text-ash mt-4 text-[15px] leading-[1.6] whitespace-pre-line">
              {description}
            </p>

            {content.themeTags.length > 0 && (
              <div className="mt-5">
                <p className="text-ash mb-2 text-[13px]">테마 태그</p>
                {/* 일단 이동 기능을 없앤 정적 표시 — 커서를 올려도 아무 반응 없음(비활성화) */}
                <div className="flex flex-wrap gap-2">
                  {content.themeTags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-primary-100 text-ink rounded-[10px] px-3 py-1 text-[14px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 규격·안내를 컨테이너 박스 없이 라벨/값 텍스트 줄로 나열한다(2026-08-03 사용자 요청,
              쇼핑 서비스 상세의 혜택/배송 정보 표기 참고) — 위쪽 구분선 하나로만 본문과 가른다 */}
            <dl className="border-ash/20 mt-8 flex flex-col gap-3 border-t pt-6 text-[14px]">
              {specRows.map((row) => (
                <div key={row.label} className="flex items-baseline">
                  <dt className="text-ash w-32 shrink-0">{row.label}</dt>
                  <dd className="text-ink font-medium tabular-nums">{row.value}</dd>
                </div>
              ))}

              {content.recommendedDeskWidthMm != null && (
                <div className="flex items-baseline">
                  <dt className="text-ash flex w-32 shrink-0 items-center gap-1.5">
                    권장 데스크 너비
                    <span
                      className="cursor-help"
                      title="이 제품을 여유롭게 올려두기 위한 최소 데스크 폭입니다"
                      aria-label="권장 데스크 너비 안내"
                    >
                      ⓘ
                    </span>
                  </dt>
                  <dd className="text-ink font-medium tabular-nums">
                    {formatMm(content.recommendedDeskWidthMm)} 이상
                  </dd>
                </div>
              )}
            </dl>

            {/* '시뮬레이터에 추가'는 2026-08-03, 장바구니 담기(POST /cart-items)는 2026-08-02
                장바구니 화면 삭제와 함께 걷어냈다. 백엔드 /cart-items API는 살아 있지만 프론트에서
                부르는 곳이 없다. '구매하러 가기'는 2026-08-02 ProductDetailResponse.productUrl에
                연동됐다 — 그 값이 없는 제품(자작·목업)은 버튼 자체를 안 그린다.
                줄 전체가 컬럼 너비를 채운다 — 좋아요 pill은 아이콘+숫자만큼만(shrink-0), 구매
                버튼이 남은 너비 전부(flex-1)를 먹는다 (2026-08-03 사용자 요청). */}
            <div className="mt-6 flex items-center gap-2">
              <ProductLikeControl productId={product.id} />
              {purchaseUrl && (
                <a
                  href={purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-ink text-paper hover:bg-ink/85 flex h-12 flex-1 items-center justify-center rounded-full px-4 text-[16px] font-medium transition-colors"
                >
                  구매하러 가기
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
