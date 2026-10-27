'use client';
// 관리자 제품 목록 — 검수 상태 필터 탭 + offset 페이지 테이블. 행을 누르면 제품 편집 화면으로 간다.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { listAllBrands, listAllCategories } from '@/api/admin/masters';
import {
  listAdminProducts,
  type AssetReviewStatus,
  type OffsetPageAdminProductSummaryResponse,
} from '@/api/admin/products';
import { ApiError } from '@/api/client';
import ErrorState from '@/components/common/ErrorState';
import LoadingState from '@/components/common/LoadingState';
import { MASTER_INPUT_CLASS } from '@/constants/admin/masters';
import { MASTER_OPTION_PAGE_SIZE } from '@/constants/admin/productForm';
import {
  NO_ASSET_LABEL,
  PRODUCT_SOURCE_LABEL,
  PRODUCT_STATUS_LABEL,
  REVIEW_STATUS_BADGE_CLASS,
  REVIEW_STATUS_LABEL,
  SPEC_TYPE_LABEL,
} from '@/constants/admin/productLabels';
import type { SelectOption } from '@/types/admin/productForm';
import { toCategoryTreeOptions, toDescendingNameOptions } from '@/utils/admin/masterOptions';
import {
  adminProductFormHref,
  adminProductListHref,
  type ProductListFilters,
  type ProductListLocation,
} from '@/utils/admin/productListNavigation';

const PAGE_SIZE = 20;

type StatusTabValue = AssetReviewStatus | 'ALL';

const STATUS_TABS: readonly { value: StatusTabValue; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'PENDING', label: '검수 대기' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
] as const;

const toErrorMessage = (cause: unknown): string =>
  cause instanceof ApiError ? cause.message : '네트워크 오류로 제품 목록을 불러오지 못했습니다.';

// 응답을 그게 속한 요청 키와 함께 담는다 — 이펙트 본문에서 동기로 초기화하면
// react-hooks/set-state-in-effect가 막으므로, "키가 안 맞으면 아직 로딩"으로 렌더 중에 판단한다.
type LoadedPage = {
  key: string;
  data: OffsetPageAdminProductSummaryResponse | null;
  error: string | null;
};

const HEAD_CELL_CLASS = 'text-ash px-3 py-2 text-left text-[13px] font-medium';
const BODY_CELL_CLASS = 'text-ink px-3 py-3 text-[14px]';

type Props = {
  initialLocation: ProductListLocation;
};

const StatusBadge = ({ value }: { value: AssetReviewStatus | undefined }) => {
  if (value == null) {
    return <span className="text-ash text-[13px]">{NO_ASSET_LABEL}</span>;
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[13px] font-medium ${REVIEW_STATUS_BADGE_CLASS[value]}`}
    >
      {REVIEW_STATUS_LABEL[value]}
    </span>
  );
};

const ProductListPanel = ({ initialLocation }: Props) => {
  const router = useRouter();
  const [statusTab, setStatusTab] = useState<StatusTabValue>(
    initialLocation.filters.status ?? 'ALL',
  );
  const [brandId, setBrandId] = useState(
    initialLocation.filters.brandId === undefined ? '' : String(initialLocation.filters.brandId),
  );
  const [categoryId, setCategoryId] = useState(
    initialLocation.filters.categoryId === undefined
      ? ''
      : String(initialLocation.filters.categoryId),
  );
  const [keyword, setKeyword] = useState(initialLocation.filters.keyword ?? '');
  const [keywordInput, setKeywordInput] = useState(initialLocation.filters.keyword ?? '');
  const [page, setPage] = useState(initialLocation.pageIndex);
  const [brandOptions, setBrandOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedPage | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const filters: ProductListFilters = {
    status: statusTab === 'ALL' ? undefined : statusTab,
    brandId: brandId === '' ? undefined : Number(brandId),
    categoryId: categoryId === '' ? undefined : Number(categoryId),
    keyword: keyword === '' ? undefined : keyword,
  };
  const currentListHref = adminProductListHref({ pageIndex: page, filters });
  const requestKey = `${statusTab}:${brandId}:${categoryId}:${keyword}:${page}:${reloadToken}`;

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listAllBrands(MASTER_OPTION_PAGE_SIZE),
      listAllCategories(MASTER_OPTION_PAGE_SIZE),
    ])
      .then(([brands, categories]) => {
        if (cancelled) return;
        setBrandOptions(toDescendingNameOptions(brands));
        setCategoryOptions(toCategoryTreeOptions(categories));
        setMasterError(null);
      })
      .catch(() => {
        if (!cancelled) setMasterError('브랜드와 카테고리 선택 목록을 불러오지 못했습니다.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    listAdminProducts({
      status: filters.status,
      brandId: filters.brandId,
      categoryId: filters.categoryId,
      keyword: filters.keyword,
      page,
      size: PAGE_SIZE,
    })
      .then((response) => {
        if (!cancelled) setLoaded({ key: requestKey, data: response, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoaded({ key: requestKey, data: null, error: toErrorMessage(cause) });
      });

    return () => {
      cancelled = true;
    };
  }, [filters.brandId, filters.categoryId, filters.keyword, filters.status, page, requestKey]);

  const replaceListLocation = (nextFilters: ProductListFilters, nextPage: number): void => {
    router.replace(adminProductListHref({ pageIndex: nextPage, filters: nextFilters }), {
      scroll: false,
    });
  };

  const handleSelectTab = (value: StatusTabValue): void => {
    setStatusTab(value);
    setPage(0);
    replaceListLocation({ ...filters, status: value === 'ALL' ? undefined : value }, 0);
  };

  const handleBrandChange = (value: string): void => {
    setBrandId(value);
    setPage(0);
    replaceListLocation({ ...filters, brandId: value === '' ? undefined : Number(value) }, 0);
  };

  const handleCategoryChange = (value: string): void => {
    setCategoryId(value);
    setPage(0);
    replaceListLocation({ ...filters, categoryId: value === '' ? undefined : Number(value) }, 0);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nextKeyword = keywordInput.trim();
    setKeywordInput(nextKeyword);
    setKeyword(nextKeyword);
    setPage(0);
    replaceListLocation({ ...filters, keyword: nextKeyword === '' ? undefined : nextKeyword }, 0);
  };

  const handleSearchReset = (): void => {
    setKeywordInput('');
    setKeyword('');
    setPage(0);
    replaceListLocation({ ...filters, keyword: undefined }, 0);
  };

  const moveToPage = (nextPage: number): void => {
    setPage(nextPage);
    replaceListLocation(filters, nextPage);
  };

  // 파생 상태라 렌더 중에 계산한다 — 지금 요청 키와 다른 응답은 아직 안 온 것으로 본다.
  const current = loaded !== null && loaded.key === requestKey ? loaded : null;
  const data = current?.data ?? null;
  const loadError = current?.error ?? null;
  const items = data?.content ?? [];
  const pageInfo = data?.page;
  const totalPages = pageInfo?.totalPages ?? 0;
  const totalElements = pageInfo?.totalElements ?? 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink text-[28px] font-bold">제품</h1>
          <p className="text-ash mt-2 text-[15px]">
            카탈로그 제품과 사용자 자작 제품을 한 목록에서 봅니다. 규격은 모두 실측 mm 정수입니다.
          </p>
        </div>
        <Link
          href={adminProductFormHref('/admin/products/new', currentListHref)}
          className="bg-ink hover:bg-ink/85 shrink-0 rounded-[10px] px-5 py-3 text-sm font-semibold text-white transition-colors"
        >
          새 제품
        </Link>
      </div>

      <div className="mt-8">
        <div role="group" aria-label="검수 상태 필터" className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = tab.value === statusTab;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleSelectTab(tab.value)}
                aria-pressed={isActive}
                className={`rounded-[10px] border px-4 py-2 text-[14px] font-medium transition-colors ${
                  isActive
                    ? 'border-ink bg-ink text-white'
                    : 'border-ash/30 text-ink hover:bg-fog/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="text-ash mt-2 text-[13px] leading-5">
          검수 상태는 3D 에셋(GLB)에 달린 값입니다. 전체가 아닌 상태를 고르면 에셋 자체가 없는
          제품은 목록에서 빠집니다 — 책상은 절차 생성이라 GLB를 올리지 않아 &lsquo;전체&rsquo;에서만
          보입니다.
        </p>
        <div className="mt-5 grid max-w-[720px] gap-4 sm:grid-cols-2">
          <form onSubmit={handleSearchSubmit} className="sm:col-span-2">
            <label htmlFor="admin-product-keyword" className="text-ink text-[14px] font-semibold">
              제품명 검색
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="admin-product-keyword"
                type="search"
                value={keywordInput}
                maxLength={200}
                placeholder="제품명을 입력하세요"
                onChange={(event) => setKeywordInput(event.target.value)}
                className={MASTER_INPUT_CLASS}
              />
              <button
                type="submit"
                className="bg-ink hover:bg-ink/85 shrink-0 rounded-[10px] px-5 text-[14px] font-semibold text-white transition-colors"
              >
                검색
              </button>
              {filters.keyword !== undefined && (
                <button
                  type="button"
                  onClick={handleSearchReset}
                  className="border-ash/30 text-ink shrink-0 rounded-[10px] border px-4 text-[14px] font-medium"
                >
                  초기화
                </button>
              )}
            </div>
          </form>
          <label className="text-ink text-[14px] font-semibold">
            브랜드
            <select
              value={brandId}
              onChange={(event) => handleBrandChange(event.target.value)}
              className={`${MASTER_INPUT_CLASS} mt-2`}
            >
              <option value="">전체 브랜드</option>
              {brandOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-ink text-[14px] font-semibold">
            카테고리
            <select
              value={categoryId}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className={`${MASTER_INPUT_CLASS} mt-2`}
            >
              <option value="">전체 카테고리</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {masterError !== null && <p className="text-danger-700 mt-2 text-[13px]">{masterError}</p>}
      </div>

      {loadError !== null && (
        <div className="mt-8">
          <ErrorState
            description={loadError}
            title="제품 목록을 불러오지 못했습니다"
            onRetry={() => setReloadToken((token) => token + 1)}
          />
        </div>
      )}

      {loadError === null && data === null && (
        <div className="mt-8">
          <LoadingState label="제품 목록 불러오는 중" />
        </div>
      )}

      {loadError === null && data !== null && items.length === 0 && (
        <p className="border-ash/20 text-ash mt-8 rounded-2xl border border-dashed px-6 py-16 text-center text-[15px]">
          조건에 맞는 제품이 없습니다.
        </p>
      )}

      {loadError === null && items.length > 0 && (
        <>
          <div className="border-ash/20 mt-8 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="bg-fog/60">
                <tr>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    id
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    이름
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    종류
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    출처
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    검수 상태
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    카탈로그 노출
                  </th>
                  <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                    가격
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() =>
                      router.push(
                        adminProductFormHref(`/admin/products/${item.id}`, currentListHref),
                      )
                    }
                    className="border-ash/20 hover:bg-fog/40 cursor-pointer border-t transition-colors"
                  >
                    <td className={`${BODY_CELL_CLASS} text-ash tabular-nums`}>{item.id}</td>
                    <td className={BODY_CELL_CLASS}>
                      <Link
                        href={adminProductFormHref(`/admin/products/${item.id}`, currentListHref)}
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold hover:underline"
                      >
                        {item.name ?? '(이름 없음)'}
                      </Link>
                      <span className="text-ash mt-0.5 block text-[13px]">
                        {[item.brandName, item.categoryName].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </td>
                    <td className={BODY_CELL_CLASS}>
                      {item.specType ? SPEC_TYPE_LABEL[item.specType] : '—'}
                    </td>
                    <td className={BODY_CELL_CLASS}>
                      {item.source ? PRODUCT_SOURCE_LABEL[item.source] : '—'}
                    </td>
                    <td className={BODY_CELL_CLASS}>
                      <StatusBadge value={item.reviewStatus} />
                    </td>
                    <td className={BODY_CELL_CLASS}>
                      {item.status ? PRODUCT_STATUS_LABEL[item.status] : '—'}
                    </td>
                    <td className={`${BODY_CELL_CLASS} text-right tabular-nums`}>
                      {item.priceKrw == null ? '—' : `${item.priceKrw.toLocaleString('ko-KR')}원`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-ash text-[13px] tabular-nums">
              전체 {totalElements.toLocaleString('ko-KR')}개 · {page + 1} /{' '}
              {Math.max(totalPages, 1)} 페이지
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => moveToPage(Math.max(page - 1, 0))}
                className="border-ash/30 text-ink rounded-[10px] border px-4 py-2 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => moveToPage(page + 1)}
                className="border-ash/30 text-ink rounded-[10px] border px-4 py-2 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProductListPanel;
