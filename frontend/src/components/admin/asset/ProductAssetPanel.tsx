'use client';
// 제품 3D 에셋·발광 저작 묶음 — 상세를 따로 읽어(규격 폼과 상태를 섞지 않는다) 에셋 섹션과
// 발광 섹션을 얹고, 저장 결과 토스트를 한자리에서 낸다. 책상과 모니터는 절차 생성이라 에셋 행
// 자체가 없으므로(D18, 모니터 전량 절차 생성은 2026-08-02 재개정) 에셋 섹션을 안내로 대체한다
// — 발광은 spec_type과 직교라 그대로 둔다.

import { useCallback, useEffect, useState } from 'react';

import { getAdminProductDetail } from '@/api/admin/products';
import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import Toast from '@/components/common/Toast';
import type { ProductDetailResponse } from '@/types/admin/productForm';
import AssetSection from './AssetSection';
import EmitterSection from './EmitterSection';

type Props = {
  productId: number;
};

// 절차 생성 제품종(에셋 행 없음)의 안내 문구 — 여기 없는 spec_type은 GLB 등록 섹션을 그대로 쓴다.
const PROCEDURAL_NOTICE: Partial<
  Record<NonNullable<ProductDetailResponse['specType']>, { title: string; message: string }>
> = {
  DESK: {
    title: '책상은 절차 생성 — 에셋 없음',
    message:
      '책상 상판은 규격 mm 값으로 런타임에 만들어지므로 GLB를 등록하지 않습니다. 재질은 상판 재질(desk_texture) 선택이 정본입니다.',
  },
  MONITOR: {
    title: '모니터는 절차 생성 — 에셋 없음',
    message:
      '모니터는 화면 패널·베젤·스탠드를 인치·화면비·곡률 규격에서 런타임에 만들어내므로 GLB를 등록하지 않습니다.',
  },
};

const ProductAssetPanel = ({ productId }: Props) => {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const loaded = await getAdminProductDetail(productId);
        if (isActive) setDetail(loaded);
      } catch (error) {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : '에셋 정보를 불러오지 못했습니다.');
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [productId, reloadToken]);

  // 저장 후 표시용 값만 다시 읽는다 — 각 섹션의 입력 초안은 마운트 때 편 것을 그대로 쓴다.
  const refreshDetail = useCallback(async () => {
    setDetail(await getAdminProductDetail(productId));
  }, [productId]);

  if (isLoading) {
    return (
      <div className="mt-6">
        <LoadingState label="에셋 정보를 불러오는 중" />
      </div>
    );
  }

  if (loadError !== null || detail === null) {
    return (
      <div className="mt-6">
        <ErrorState
          title="에셋 정보를 불러오지 못했습니다"
          description={loadError ?? '응답이 비어 있습니다.'}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      </div>
    );
  }

  const proceduralNotice = detail.specType ? PROCEDURAL_NOTICE[detail.specType] : undefined;

  return (
    <>
      {proceduralNotice ? (
        <section
          id="asset"
          aria-labelledby="admin-product-asset-heading"
          className="border-ash/20 mt-6 rounded-2xl border p-6"
        >
          <h2 id="admin-product-asset-heading" className="text-ink text-[19px] font-semibold">
            3D 에셋 (GLB)
          </h2>
          <div className="mt-4">
            <InlineNotice
              variant="info"
              title={proceduralNotice.title}
              message={proceduralNotice.message}
            />
          </div>
        </section>
      ) : (
        <AssetSection
          productId={productId}
          asset={detail.asset}
          onSaved={refreshDetail}
          onToast={setToastMessage}
        />
      )}

      <EmitterSection
        productId={productId}
        emitter={detail.emitter}
        glbUrl={detail.asset?.assetUrl ?? null}
        onSaved={refreshDetail}
        onToast={setToastMessage}
      />

      {toastMessage !== null ? (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}
    </>
  );
};

export default ProductAssetPanel;
