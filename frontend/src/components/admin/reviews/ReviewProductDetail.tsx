'use client';
// 검수 행을 펼쳤을 때 보이는 제품 상세 — GLB 뷰 없이 규격·에셋 텍스트 요약과 이미지 썸네일만 보여준다.

import { useEffect, useState } from 'react';

import { getAdminProductDetail, type ProductDetailResponse } from '@/api/admin/products';
import { ApiError } from '@/api/client';
import InlineNotice from '@/components/common/InlineNotice';
import RemoteImage from '@/components/common/RemoteImage';
import {
  PRODUCT_SOURCE_LABEL,
  PRODUCT_STATUS_LABEL,
  SPEC_TYPE_LABEL,
} from '@/constants/admin/productLabels';
import { summarizeProductAsset, summarizeProductSpec } from '@/utils/admin/productSpecSummary';
import type { SpecSummaryRow } from '@/utils/admin/productSpecSummary';

type Props = {
  productId: number;
};

const toErrorMessage = (cause: unknown): string =>
  cause instanceof ApiError ? cause.message : '네트워크 오류로 제품 상세를 불러오지 못했습니다.';

// 자작 제품의 판매 URL은 사용자 입력이라 스킴을 검증하고 연다(javascript: 주입 방지).
const safeExternalUrl = (url: string | undefined): string | null => {
  if (url == null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

// 응답을 그게 속한 productId와 함께 담는다 — 이펙트 본문에서 동기로 초기화하면
// react-hooks/set-state-in-effect가 막으므로, "id가 안 맞으면 아직 로딩"으로 렌더 중에 판단한다.
type LoadedDetail = {
  productId: number;
  detail: ProductDetailResponse | null;
  error: string | null;
};

const SummaryTable = ({ title, rows }: { title: string; rows: SpecSummaryRow[] }) => {
  if (rows.length === 0) return null;

  return (
    <div className="min-w-0">
      <h4 className="text-ink text-[15px] font-semibold">{title}</h4>
      <table className="mt-2 w-full border-collapse">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-ash/20 border-t">
              <th
                scope="row"
                className="text-ash w-[45%] py-1.5 pr-3 text-left text-[13px] font-medium"
              >
                {row.label}
              </th>
              <td className="text-ink py-1.5 text-[13px] tabular-nums">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ReviewProductDetail = ({ productId }: Props) => {
  const [loaded, setLoaded] = useState<LoadedDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAdminProductDetail(productId)
      .then((response) => {
        if (!cancelled) setLoaded({ productId, detail: response, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoaded({ productId, detail: null, error: toErrorMessage(cause) });
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // 파생 상태라 렌더 중에 계산한다 — 다른 제품의 응답이 남아 있으면 아직 로딩으로 본다.
  const current = loaded !== null && loaded.productId === productId ? loaded : null;
  const detail = current?.detail ?? null;
  const loadError = current?.error ?? null;

  if (loadError !== null) {
    return <InlineNotice variant="error" message={loadError} />;
  }

  if (detail === null) {
    return <p className="text-ash text-[14px]">제품 상세를 불러오는 중…</p>;
  }

  const metaRows: SpecSummaryRow[] = [
    { label: '종류', value: detail.specType ? SPEC_TYPE_LABEL[detail.specType] : '—' },
    { label: '출처', value: detail.source ? PRODUCT_SOURCE_LABEL[detail.source] : '—' },
    { label: '브랜드', value: detail.brandName ?? '—' },
    { label: '카테고리', value: detail.categoryName ?? '—' },
    {
      label: '가격',
      value: detail.priceKrw == null ? '—' : `${detail.priceKrw.toLocaleString('ko-KR')}원`,
    },
    { label: '카탈로그 노출', value: detail.status ? PRODUCT_STATUS_LABEL[detail.status] : '—' },
  ];

  const specRows = summarizeProductSpec(detail);
  const assetRows = summarizeProductAsset(detail);
  const images = detail.images ?? [];
  const productUrl = safeExternalUrl(detail.productUrl);

  return (
    <div className="flex flex-col gap-5">
      {detail.source === 'USER' && (
        <InlineNotice
          variant="warning"
          title="미인증 자료입니다"
          message="인증되지 않은 사용자가 올린 자료로, 실제 규격과 다를 수 있습니다. 승인해도 이 경고는 사라지지 않습니다."
        />
      )}

      {detail.description && (
        <p className="text-ink text-[14px] leading-6 whitespace-pre-wrap">{detail.description}</p>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        <SummaryTable title="기본 정보" rows={metaRows} />
        <SummaryTable title="규격 (실측 mm)" rows={specRows} />
        <SummaryTable title="3D 에셋" rows={assetRows} />
      </div>

      {detail.asset?.reviewNote && (
        <div className="border-ash/20 rounded-[10px] border px-4 py-3">
          <p className="text-ash text-[13px]">직전 검수 메모</p>
          <p className="text-ink mt-1 text-[14px] leading-6 whitespace-pre-wrap">
            {detail.asset.reviewNote}
          </p>
        </div>
      )}

      <div>
        <h4 className="text-ink text-[15px] font-semibold">이미지</h4>
        {images.length === 0 ? (
          <p className="text-ash mt-2 text-[13px]">등록된 이미지가 없습니다.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-3">
            {images.map((image) => (
              <li key={image.imageId} className="w-[120px]">
                {/* imageUrl은 openapi상 optional이다 — 없으면 빈 자리를 그린다(전엔 깨진 <img>였다) */}
                {image.imageUrl !== undefined ? (
                  <RemoteImage
                    src={image.imageUrl}
                    alt={`${detail.name ?? '제품'} 이미지 ${image.displayOrder ?? ''}`}
                    width={120}
                    height={120}
                    className="border-ash/20 bg-fog/60 h-[120px] w-[120px] rounded-[10px] border object-cover"
                  />
                ) : (
                  <div className="border-ash/20 bg-fog/60 h-[120px] w-[120px] rounded-[10px] border" />
                )}
                {image.isPrimary && (
                  <span className="text-ash mt-1 block text-[12px]">대표 이미지</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {productUrl !== null && (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ash text-[13px] underline"
        >
          판매 페이지 열기
        </a>
      )}
    </div>
  );
};

export default ReviewProductDetail;
