// 카테고리 정본 — 전체·기타 포함 10개 대분류 + 소분류(칩/태그) 정적 고정(2026-08-05 사용자 확정,
// GET /categories 소비 제거). 제품 페이지 카테고리 내비(ProductCategorySidebar·ProductGrid)와
// 시뮬레이터 라이브러리 패널(simulator/LibraryPanel.tsx)이 이 정의를 그대로 공유한다.
// 그룹/소분류 키는 제품 페이지 URL(`?category=`)에 그대로 실린다 — 원시 ProductCategory 값이 아니다.
// 정렬 규약: '전체'는 각 화면이 첫 칸에 합성하고, 배열은 기타가 항상 마지막이다.

import type { ProductCategory, ProductSpec } from '@/three/scene/product';
import type { CategoryIconKey } from '@/components/product/ProductCategoryIcon';

/** `/product` 사이드바 카테고리 전환을 알리는 커스텀 이벤트 이름 — 카테고리만 바뀌는 내비게이션은
 *  Next 라우터(서버 재조회)를 타지 않고 `TransitionNavigator.tsx`가 History API로 URL만 바꾼 뒤
 *  이 이벤트로 `ProductGrid.tsx`에 새 값을 알린다(오른쪽 목록만 갱신, 페이지 이동 없음). */
export const PRODUCT_CATEGORY_CHANGE_EVENT = 'product-category-change';

export type ProductCategoryGroupKey =
  | 'desk'
  | 'monitor'
  | 'keyboard-mouse'
  | 'sound'
  | 'plant'
  | 'organizer'
  | 'decor'
  | 'chair'
  | 'lamp'
  | 'etc';

export type ProductCategorySub = {
  key: string;
  label: string;
  /** 이 소분류에 속하는 원시 카테고리 — mock 클라 필터용. 대응하는 원시 값이 아직 없으면 빈 배열. */
  categories: ProductCategory[];
  /** 백엔드 카테고리 마스터 id — 실 DB 트리 값 하드코딩(2026-08-05 결정, GET /categories 미사용;
   *  로컬·배포 DB가 같은 id로 시딩됨을 실측 확인. ⚠ 레포 seed 파일의 900~908은 낡은 값이다).
   *  대응하는 백엔드 카테고리가 없으면 비워 둔다(서버 조회 없이 0건). */
  categoryId?: number;
};

export type ProductCategoryGroup = {
  key: ProductCategoryGroupKey;
  label: string;
  /** 이 그룹에 속하는 원시 카테고리(자식 포함 합집합) — mock 필터링 대상 */
  categories: ProductCategory[];
  /** 아이콘 조회용 키(ProductCategoryIcon) */
  iconCategory: CategoryIconKey;
  /** 백엔드 카테고리 마스터 id — 소분류와 같은 하드코딩 규칙. 백엔드가 2단 트리라 그룹 = 루트 id
   *  하나고, 서버가 하위 전체를 롤업하므로(categoryIdsOf()) 자식 id를 따로 보낼 필요가 없다. */
  categoryId?: number;
  /** 소분류 — 대분류 선택 시 태그(칩)로 노출. 없으면 칩 행 자체를 그리지 않는다. */
  children?: ProductCategorySub[];
};

export const PRODUCT_CATEGORY_GROUPS: ProductCategoryGroup[] = [
  // desk는 내비에서 숨긴다(HIDDEN_CATEGORY_NAMES) — 정의를 지우면 desk 제품 상세
  // (/product/{id}는 surface도 조회된다)의 브레드크럼이 getCategoryGroup 폴백('기타')을 탄다.
  { key: 'desk', label: '책상', categories: ['desk'], iconCategory: 'desk' },
  {
    key: 'monitor',
    label: '모니터 · 모니터암',
    categories: ['monitor', 'monitor-arm'],
    iconCategory: 'monitor',
    categoryId: 52,
    children: [
      { key: 'sub-monitor', label: '모니터', categories: ['monitor'], categoryId: 62 },
      { key: 'sub-monitor-arm', label: '모니터암', categories: ['monitor-arm'], categoryId: 63 },
    ],
  },
  {
    key: 'keyboard-mouse',
    label: '키보드 · 마우스',
    categories: ['keyboard', 'mouse'],
    iconCategory: 'keyboard',
    categoryId: 53,
    children: [
      { key: 'sub-keyboard', label: '키보드', categories: ['keyboard'], categoryId: 64 },
      { key: 'sub-mouse', label: '마우스', categories: ['mouse'], categoryId: 65 },
    ],
  },
  {
    key: 'sound',
    label: '음향',
    categories: ['speaker'],
    iconCategory: 'speaker',
    categoryId: 55,
    children: [
      { key: 'sub-headphone', label: '헤드폰', categories: [], categoryId: 66 },
      { key: 'sub-speaker', label: '스피커', categories: ['speaker'], categoryId: 67 },
    ],
  },
  { key: 'plant', label: '식물', categories: ['plant'], iconCategory: 'plant', categoryId: 56 },
  {
    key: 'organizer',
    label: '정리 · 거치',
    categories: [],
    iconCategory: 'storage-box',
    categoryId: 57,
    children: [
      { key: 'sub-holder', label: '거치대', categories: [], categoryId: 68 },
      { key: 'sub-pegboard', label: '타공판', categories: [], categoryId: 69 },
      { key: 'sub-partition', label: '파티션', categories: [], categoryId: 70 },
      { key: 'sub-storage', label: '수납', categories: [], categoryId: 71 },
    ],
  },
  {
    key: 'decor',
    label: '데코',
    categories: ['decor', 'mug'],
    iconCategory: 'decor',
    categoryId: 58,
    children: [
      { key: 'sub-figure', label: '인형·피규어', categories: [], categoryId: 74 },
      { key: 'sub-diffuser-candle', label: '디퓨저·캔들', categories: [], categoryId: 72 },
      { key: 'sub-clock', label: '시계', categories: [], categoryId: 73 },
      { key: 'sub-cup', label: '컵', categories: ['mug'], categoryId: 76 },
    ],
  },
  { key: 'chair', label: '의자', categories: ['chair'], iconCategory: 'chair', categoryId: 59 },
  { key: 'lamp', label: '조명', categories: ['lamp'], iconCategory: 'lamp', categoryId: 60 },
  {
    key: 'etc',
    label: '기타',
    categories: ['water-bottle'],
    iconCategory: 'mug',
    categoryId: 61,
    children: [
      { key: 'sub-desktop-pc', label: '데스크톱 PC', categories: [], categoryId: 77 },
      { key: 'sub-tablet', label: '태블릿', categories: [], categoryId: 78 },
    ],
  },
];

/** 카테고리 내비(사이드바·모바일 칩·시뮬레이터 그리드)에 실제로 노출하는 목록 — '책상'을 뺀 9개.
 *  ProductGrid가 쓰는 libraryItems()/useCatalogPage 경로가 kind:'surface'인 desk를 걸러내 카탈로그에
 *  desk가 아예 없다. 즉 '책상'은 눌러도 항상 0건인 메뉴였다(2026-08-02 사용자 요청으로 제거). */
export const PRODUCT_CATEGORY_NAV_GROUPS: ProductCategoryGroup[] = PRODUCT_CATEGORY_GROUPS.filter(
  (group) => group.key !== 'desk',
);

/** 카테고리 내비에서 빼는 그룹의 label — 현재 '책상' 하나. */
export const HIDDEN_CATEGORY_NAMES: ReadonlySet<string> = new Set(
  PRODUCT_CATEGORY_GROUPS.filter((group) => !PRODUCT_CATEGORY_NAV_GROUPS.includes(group)).map(
    (group) => group.label,
  ),
);

const GROUP_BY_KEY: Record<ProductCategoryGroupKey, ProductCategoryGroup> = Object.fromEntries(
  PRODUCT_CATEGORY_GROUPS.map((group) => [group.key, group]),
) as Record<ProductCategoryGroupKey, ProductCategoryGroup>;

/** `?category=` 키(그룹 key 또는 소분류 key)를 (그룹, 소분류?)로 푼다 — 미지의 키는 null(=전체). */
export const resolveCategoryKey = (
  key: string,
): { group: ProductCategoryGroup; sub: ProductCategorySub | null } | null => {
  for (const group of PRODUCT_CATEGORY_NAV_GROUPS) {
    if (group.key === key) return { group, sub: null };
    const sub = group.children?.find((child) => child.key === key);
    if (sub) return { group, sub };
  }
  return null;
};

/** (그룹 또는 소분류) 필터가 서버 조회에 쓸 categoryId 목록. 자기 id가 있으면 그것 하나다 —
 *  서버가 하위 트리를 통째로 롤업하므로 자식 id를 같이 보내면 같은 제품이 **중복**으로 온다.
 *  자기 id가 없을 때만 children 합집합으로 폴백. 빈 배열이면 백엔드에 대응 카테고리가 없는 것 —
 *  호출부는 요청 없이 0건으로 처리한다. */
export const categoryIdsOf = (filter: ProductCategoryGroup | ProductCategorySub): number[] => {
  if (filter.categoryId != null) return [filter.categoryId];
  const children = 'children' in filter ? (filter.children ?? []) : [];
  return children.flatMap((child) => (child.categoryId != null ? [child.categoryId] : []));
};

const normalizeName = (name: string): string => name.replace(/\s+/g, '');

/** 제품 하나가 (그룹 또는 소분류) 필터에 속하는지 — 클라 필터 정본.
 *  mock 제품은 category(닫힌 유니온)로, 실 카탈로그 제품(category 없음, DERO-325)은
 *  categoryName을 라벨과 공백 무시 비교로 매칭한다('모니터·모니터암'도 히트). 그룹 필터는
 *  자식 라벨까지 히트로 친다. 어느 쪽에도 안 걸리면 0건(정상 — 신규 소분류 상품은 백엔드
 *  이름이 라벨과 일치할 때 잡힌다). */
export const matchesCategoryFilter = (
  product: ProductSpec,
  filter: ProductCategoryGroup | ProductCategorySub,
): boolean => {
  if (product.category != null) return filter.categories.includes(product.category);
  if (product.categoryName == null) return false;
  const name = normalizeName(product.categoryName);
  if (name === normalizeName(filter.label)) return true;
  const children = 'children' in filter ? filter.children : undefined;
  return children?.some((child) => normalizeName(child.label) === name) ?? false;
};

/** 제품 하나가 속하는 그룹을 찾는다 — 상세 페이지 브레드크럼, ProductGrid 카테고리 필터가 쓴다.
 *  실 카탈로그 제품은 category(닫힌 유니온)가 없을 수 있다(categoryId/categoryName만 있음,
 *  DERO-325) — 그 경우 ProductSpec의 구조적 필드(kind/monitor/arm)로 판별하고, 그래도
 *  모르면 '기타'로 떨어진다. */
export const getCategoryGroup = (product: ProductSpec): ProductCategoryGroup => {
  if (product.category != null) {
    const category: ProductCategory = product.category;
    return (
      PRODUCT_CATEGORY_GROUPS.find((group) => group.categories.includes(category)) ??
      GROUP_BY_KEY.etc
    );
  }
  if (product.kind === 'surface') return GROUP_BY_KEY.desk;
  if (product.kind === 'lamp') return GROUP_BY_KEY.lamp;
  if (product.monitor) return GROUP_BY_KEY.monitor;
  if (product.arm) return GROUP_BY_KEY.monitor;
  return GROUP_BY_KEY.etc;
};
