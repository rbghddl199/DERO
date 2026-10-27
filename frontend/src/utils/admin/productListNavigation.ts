// 관리자 제품 목록의 페이지·필터를 URL에 보존하고 등록·수정 화면의 안전한 복귀 경로를 만든다.

export type ProductPageQueryValue = string | string[] | undefined;

const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type ProductReviewFilter = (typeof REVIEW_STATUSES)[number];

export type ProductListFilters = {
  status?: ProductReviewFilter;
  brandId?: number;
  categoryId?: number;
  keyword?: string;
};

export type ProductListLocation = {
  pageIndex: number;
  filters: ProductListFilters;
};

export type ProductListQuery = {
  page?: ProductPageQueryValue;
  status?: ProductPageQueryValue;
  brandId?: ProductPageQueryValue;
  categoryId?: ProductPageQueryValue;
  keyword?: ProductPageQueryValue;
};

const firstQueryValue = (value: ProductPageQueryValue): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const parseProductPageIndex = (value: ProductPageQueryValue): number => {
  const pageNumber = Number(firstQueryValue(value));
  return Number.isSafeInteger(pageNumber) && pageNumber >= 1 ? pageNumber - 1 : 0;
};

const parsePositiveId = (value: ProductPageQueryValue): number | undefined => {
  const id = Number(firstQueryValue(value));
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

const parseReviewStatus = (value: ProductPageQueryValue): ProductReviewFilter | undefined => {
  const status = firstQueryValue(value);
  return REVIEW_STATUSES.find((candidate) => candidate === status);
};

const parseKeyword = (value: ProductPageQueryValue): string | undefined => {
  const keyword = firstQueryValue(value)?.trim();
  return keyword === undefined || keyword === '' ? undefined : keyword;
};

export const parseProductListLocation = (query: ProductListQuery): ProductListLocation => ({
  pageIndex: parseProductPageIndex(query.page),
  filters: {
    status: parseReviewStatus(query.status),
    brandId: parsePositiveId(query.brandId),
    categoryId: parsePositiveId(query.categoryId),
    keyword: parseKeyword(query.keyword),
  },
});

const normalizePageIndex = (pageIndex: number): number =>
  Number.isSafeInteger(pageIndex) && pageIndex > 0 ? pageIndex : 0;

export const adminProductListHref = ({ pageIndex, filters }: ProductListLocation): string => {
  const searchParams = new URLSearchParams();
  const normalizedPageIndex = normalizePageIndex(pageIndex);

  if (normalizedPageIndex > 0) searchParams.set('page', String(normalizedPageIndex + 1));
  if (filters.status !== undefined) searchParams.set('status', filters.status);
  if (filters.brandId !== undefined) searchParams.set('brandId', String(filters.brandId));
  if (filters.categoryId !== undefined) searchParams.set('categoryId', String(filters.categoryId));
  if (filters.keyword !== undefined) searchParams.set('keyword', filters.keyword);

  const query = searchParams.toString();
  return query === '' ? '/admin/products' : `/admin/products?${query}`;
};

export const adminProductFormHref = (pathname: string, returnTo: string): string =>
  returnTo === '/admin/products'
    ? pathname
    : `${pathname}?returnTo=${encodeURIComponent(returnTo)}`;

/** 외부·관리자 하위 경로는 버리고 제품 목록 경로와 허용된 필터만 다시 직렬화한다. */
export const safeAdminProductReturnTo = (value: ProductPageQueryValue): string => {
  const rawValue = firstQueryValue(value);
  if (rawValue === undefined) return '/admin/products';

  try {
    const parsed = new URL(rawValue, 'http://localhost');
    if (parsed.origin !== 'http://localhost' || parsed.pathname !== '/admin/products') {
      return '/admin/products';
    }

    return adminProductListHref(
      parseProductListLocation({
        page: parsed.searchParams.get('page') ?? undefined,
        status: parsed.searchParams.get('status') ?? undefined,
        brandId: parsed.searchParams.get('brandId') ?? undefined,
        categoryId: parsed.searchParams.get('categoryId') ?? undefined,
        keyword: parsed.searchParams.get('keyword') ?? undefined,
      }),
    );
  } catch {
    return '/admin/products';
  }
};
