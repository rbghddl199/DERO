'use client';
// 관리자 제품 등록·수정 폼 — 공통 정보 + 규격 5종 중 하나 + (수정 모드) 실사 이미지.
// 등록은 POST 후 상세 화면으로 보내고(이미지·에셋은 거기서 붙인다), 수정은 바뀐 필드만 PATCH한다.

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  listAllBrands,
  listCategories,
  listDeskTextures,
  listVesaSpecs,
} from '@/api/admin/masters';
import AssetGuideButton from '@/components/admin/asset/AssetGuideButton';
import {
  createAdminProduct,
  getAdminProductDetail,
  updateAdminProduct,
} from '@/api/admin/products';
import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import Toast from '@/components/common/Toast';
import {
  EMPTY_PRODUCT_FORM_DRAFT,
  MASTER_OPTION_PAGE_SIZE,
  SPEC_DRAFT_KEY,
} from '@/constants/admin/productForm';
import type {
  AdminProductPatchRequest,
  CommonDraft,
  ProductDetailResponse,
  ProductFormDraft,
  SelectOption,
  SpecDrafts,
} from '@/types/admin/productForm';
import {
  toCategoryTreeOptions,
  toDescendingNameOptions,
  toNameOptions,
  toVesaSpecOptions,
} from '@/utils/admin/masterOptions';
import {
  buildSpecPayload,
  draftFromDetail,
  supportsVesaSpecs,
  vesaSpecIdsPatch,
} from '@/utils/admin/productSpecDraft';
import { validateCommon, validateSpec } from '@/utils/admin/productSpecValidation';
import { adminProductFormHref } from '@/utils/admin/productListNavigation';
import ArmSpecFields from './ArmSpecFields';
import DeskSpecFields from './DeskSpecFields';
import LightSpecFields from './LightSpecFields';
import MonitorSpecFields from './MonitorSpecFields';
import ProductCommonFields from './ProductCommonFields';
import ProductImageSection from './ProductImageSection';
import ProductVesaFields from './ProductVesaFields';
import PropSpecFields from './PropSpecFields';

type Props = {
  /** null이면 등록 모드다. */
  productId: number | null;
  /** 목록에서 진입한 페이지와 필터를 담은 검증된 관리자 제품 목록 경로. */
  returnTo: string;
};

const toMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const ProductForm = ({ productId, returnTo }: Props) => {
  const router = useRouter();
  const isEditMode = productId !== null;

  const [draft, setDraft] = useState<ProductFormDraft>(EMPTY_PRODUCT_FORM_DRAFT);
  const [initialDraft, setInitialDraft] = useState<ProductFormDraft | null>(null);
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [brandOptions, setBrandOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [deskTextureOptions, setDeskTextureOptions] = useState<SelectOption[]>([]);
  const [vesaSpecOptions, setVesaSpecOptions] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [brands, categories, deskTextures, vesaSpecs, loadedDetail] = await Promise.all([
          listAllBrands(MASTER_OPTION_PAGE_SIZE),
          listCategories({ size: MASTER_OPTION_PAGE_SIZE }),
          listDeskTextures({ size: MASTER_OPTION_PAGE_SIZE }),
          listVesaSpecs({ size: MASTER_OPTION_PAGE_SIZE }),
          productId === null ? Promise.resolve(null) : getAdminProductDetail(productId),
        ]);

        if (!isActive) return;

        setBrandOptions(toDescendingNameOptions(brands));
        setCategoryOptions(toCategoryTreeOptions(categories.content ?? []));
        setDeskTextureOptions(toNameOptions(deskTextures.content ?? []));
        setVesaSpecOptions(toVesaSpecOptions(vesaSpecs.content ?? []));

        if (loadedDetail !== null) {
          setDetail(loadedDetail);
          const loadedDraft = draftFromDetail(loadedDetail);
          setDraft(loadedDraft);
          setInitialDraft(loadedDraft);
        }
      } catch (error) {
        if (isActive) {
          setLoadError(toMessage(error, '제품 정보를 불러오지 못했습니다.'));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [productId, reloadToken]);

  // 이미지 섹션 전용 새로고침 — 입력 중인 초안은 건드리지 않고 상세(이미지 목록)만 다시 읽는다.
  const refreshDetail = useCallback(async () => {
    if (productId === null) return;
    setDetail(await getAdminProductDetail(productId));
  }, [productId]);

  const updateCommon = (patch: Partial<CommonDraft>) => {
    setDraft((prev) => {
      const common = { ...prev.common, ...patch };
      // 규격 타입을 모니터·모니터암 밖으로 바꾸면 태깅을 비운다 — 남겨 두면 그대로 실려 422가 난다.
      return {
        ...prev,
        common: supportsVesaSpecs(common.specType) ? common : { ...common, vesaSpecIds: [] },
      };
    });
  };

  const updateSpec = <K extends keyof SpecDrafts>(key: K, patch: Partial<SpecDrafts[K]>) => {
    setDraft((prev) => ({
      ...prev,
      specs: { ...prev.specs, [key]: { ...prev.specs[key], ...patch } },
    }));
  };

  // 파생 상태라 렌더 중에 계산한다(CollectionUploadForm과 같은 방식).
  const commonErrors = validateCommon(draft.common, !isEditMode);
  const specErrors =
    draft.common.specType === '' ? {} : validateSpec(draft.common.specType, draft.specs);
  const isValid = Object.keys(commonErrors).length === 0 && Object.keys(specErrors).length === 0;
  const visibleCommonErrors = hasAttemptedSubmit ? commonErrors : {};
  const visibleSpecErrors = hasAttemptedSubmit ? specErrors : {};

  const submitCreate = async () => {
    const { common, specs } = draft;
    if (common.specType === '') return;

    const created = await createAdminProduct({
      specType: common.specType,
      brandId: Number(common.brandId),
      categoryId: Number(common.categoryId),
      name: common.name.trim(),
      description: common.description.trim() === '' ? undefined : common.description.trim(),
      priceKrw: Number(common.priceKrw),
      productUrl: common.productUrl.trim(),
      // 고르지 않았으면 아예 빼고 보낸다 — 생성에서 []와 생략은 같은 뜻이다.
      vesaSpecIds:
        supportsVesaSpecs(common.specType) && common.vesaSpecIds.length > 0
          ? common.vesaSpecIds.map(Number)
          : undefined,
      ...buildSpecPayload(common.specType, specs),
    });

    if (created.id == null) {
      throw new Error('등록은 됐지만 응답에 제품 id가 없어 상세로 이동하지 못했습니다.');
    }
    router.push(adminProductFormHref(`/admin/products/${created.id}`, returnTo));
  };

  // 빈칸은 "유지"다 — PATCH 본문에서 아예 뺀다(값을 NULL로 되돌리는 수단은 없다).
  const buildPatch = (initial: ProductFormDraft): AdminProductPatchRequest => {
    const { common, specs } = draft;
    const patch: AdminProductPatchRequest = {};

    if (common.name.trim() !== '' && common.name !== initial.common.name) {
      patch.name = common.name.trim();
    }
    if (common.brandId !== '' && common.brandId !== initial.common.brandId) {
      patch.brandId = Number(common.brandId);
    }
    if (common.categoryId !== '' && common.categoryId !== initial.common.categoryId) {
      patch.categoryId = Number(common.categoryId);
    }
    if (common.description.trim() !== '' && common.description !== initial.common.description) {
      patch.description = common.description.trim();
    }
    if (common.priceKrw !== '' && common.priceKrw !== initial.common.priceKrw) {
      patch.priceKrw = Number(common.priceKrw);
    }
    if (common.productUrl.trim() !== '' && common.productUrl !== initial.common.productUrl) {
      patch.productUrl = common.productUrl.trim();
    }
    if (common.status !== initial.common.status) {
      patch.status = common.status;
    }

    // 태깅만은 빈 배열이 "전부 해제"라 의미가 있다 — 안 바뀐 경우에만 본문에서 뺀다.
    const nextVesaSpecIds = vesaSpecIdsPatch(common.vesaSpecIds, initial.common.vesaSpecIds);
    if (nextVesaSpecIds !== undefined) {
      patch.vesaSpecIds = nextVesaSpecIds;
    }

    // 규격은 한 필드만 바뀌어도 통째로 다시 보낸다 — XxxSpecRequest가 부분 수정 형태가 아니다.
    if (common.specType !== '') {
      const key = SPEC_DRAFT_KEY[common.specType];
      if (JSON.stringify(specs[key]) !== JSON.stringify(initial.specs[key])) {
        Object.assign(patch, buildSpecPayload(common.specType, specs));
      }
    }

    return patch;
  };

  const submitPatch = async (initial: ProductFormDraft) => {
    if (productId === null) return;

    const patch = buildPatch(initial);
    if (Object.keys(patch).length === 0) {
      setToastMessage('변경된 내용이 없습니다.');
      return;
    }

    await updateAdminProduct(productId, patch);
    setInitialDraft(draft);
    setToastMessage('저장했습니다.');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setHasAttemptedSubmit(true);
    setSubmitError(null);

    if (!isValid) return;

    setIsSubmitting(true);
    try {
      if (isEditMode && initialDraft !== null) {
        await submitPatch(initialDraft);
      } else {
        await submitCreate();
      }
    } catch (error) {
      setSubmitError(toMessage(error, '저장에 실패했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState label="제품 정보를 불러오는 중" />;
  }

  if (loadError !== null) {
    return (
      <ErrorState description={loadError} onRetry={() => setReloadToken((prev) => prev + 1)} />
    );
  }

  const { specType } = draft.common;

  return (
    <form onSubmit={handleSubmit} className="font-swiss tracking-[-0.03em]">
      {/* 가이드 버튼은 제목 옆이다 — 등록·수정 어느 화면에서도 첫 화면에 보여야 한다. */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-ink text-[28px] font-bold">{isEditMode ? '제품 수정' : '제품 등록'}</h1>
        <AssetGuideButton />
      </div>
      <p className="text-ash mt-2 text-[15px] leading-6">
        {isEditMode
          ? '빈칸으로 둔 항목은 지금 값이 유지됩니다. 규격 타입은 바꿀 수 없습니다.'
          : '규격은 전부 실측값입니다. 등록을 마치면 상세 화면에서 실사 이미지와 3D 에셋을 붙입니다.'}
      </p>

      {detail?.source === 'USER' ? (
        <div className="mt-5">
          <InlineNotice
            variant="warning"
            title="사용자가 올린 자작 제품입니다"
            message="자작 제품은 브랜드·가격·구매처가 비어 있을 수 있습니다. 운영진이 등록한 카탈로그 제품(CATALOG)만 이 세 항목이 필수입니다."
          />
        </div>
      ) : null}

      <ProductCommonFields
        draft={draft.common}
        errors={visibleCommonErrors}
        brandOptions={brandOptions}
        categoryOptions={categoryOptions}
        isEditMode={isEditMode}
        onChange={updateCommon}
      />

      {specType === '' ? (
        <p className="border-ash/30 text-ash mt-6 rounded-2xl border border-dashed px-6 py-10 text-center text-[14px]">
          규격 타입을 먼저 고르면 그 규격의 입력칸이 나타납니다.
        </p>
      ) : null}

      {specType === 'DESK' ? (
        <DeskSpecFields
          draft={draft.specs.desk}
          errors={visibleSpecErrors}
          deskTextureOptions={deskTextureOptions}
          onChange={(patch) => updateSpec('desk', patch)}
        />
      ) : null}
      {specType === 'MONITOR' ? (
        <MonitorSpecFields
          draft={draft.specs.monitor}
          errors={visibleSpecErrors}
          onChange={(patch) => updateSpec('monitor', patch)}
        />
      ) : null}
      {specType === 'ARM' ? (
        <ArmSpecFields
          draft={draft.specs.arm}
          errors={visibleSpecErrors}
          onChange={(patch) => updateSpec('arm', patch)}
        />
      ) : null}
      {specType === 'LIGHT' ? (
        <LightSpecFields
          draft={draft.specs.light}
          errors={visibleSpecErrors}
          onChange={(patch) => updateSpec('light', patch)}
        />
      ) : null}
      {specType === 'PROP' ? (
        <PropSpecFields
          draft={draft.specs.prop}
          errors={visibleSpecErrors}
          onChange={(patch) => updateSpec('prop', patch)}
        />
      ) : null}

      {supportsVesaSpecs(specType) ? (
        <ProductVesaFields
          value={draft.common.vesaSpecIds}
          vesaSpecOptions={vesaSpecOptions}
          onChange={(value) => updateCommon({ vesaSpecIds: value })}
        />
      ) : null}

      {isEditMode && productId !== null ? (
        <ProductImageSection
          productId={productId}
          images={detail?.images ?? []}
          onChanged={refreshDetail}
        />
      ) : null}

      {hasAttemptedSubmit && !isValid ? (
        <div className="mt-6">
          <InlineNotice
            variant="error"
            message="입력하지 않았거나 형식이 맞지 않는 항목이 있습니다. 위에서 빨간 안내가 붙은 칸을 확인하세요."
          />
        </div>
      ) : null}

      {submitError !== null ? (
        <div className="mt-4">
          <InlineNotice variant="error" title="저장 실패" message={submitError} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(returnTo)}
          className="border-ash/20 text-ink hover:bg-ink hover:text-paper min-w-[140px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-[16px] font-medium transition-colors"
        >
          목록으로
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper min-w-[140px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-[16px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '저장하는 중...' : isEditMode ? '수정 저장' : '등록하기'}
        </button>
      </div>

      {toastMessage !== null ? (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}
    </form>
  );
};

export default ProductForm;
