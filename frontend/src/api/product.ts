// 제품 카탈로그 API — GET /api/v1/products?specType=DESK(책상 템플릿 목록, ProductController 1:1)
// 옛 GET /products/desks는 필터를 경로로 승격시킨 것이라 폐기됐다(api-spec.md §11).
//
// mock/real은 NEXT_PUBLIC_API_MODE(src/constants/api.ts) 하나로 전환한다 — 로컬 백엔드가
// 항상 떠 있지 않아 기본은 mock(로컬 3D 카탈로그, 2026-07-30 사용자 확인 당시 결정)이고,
// 백엔드가 뜬 로컬 환경에서는 real로 켜서 검증한다. 빈 배열을 돌려주면 안 된다 — /craft/new
// 1단계에서 책상 카드가 통째로 사라지고 "직접 입력"만 남는다(실제로 그렇게 되돌렸다가 되돌린
// 이력이 있다). 책상 목록은 사용자 데이터가 아니라 카탈로그라 백엔드가 없어도 보여줄 값이 있다
// — '내 데스크테리어'(api/craft.ts)와 다른 점이다.

import { isMockApi } from '@/constants/api';
import { desks } from '@/three/scene/product';
import { apiClient } from '@/api/client';
import type { CursorPage } from '@/types/api';
import type { DeskTexturePublicResponse, ProductDetailResponse } from '@/types/catalog';
import type { FrameType } from '@/types/placement';
import type { DeskSummaryResponse } from '@/types/product';

// 로컬 카탈로그의 문자열 id를 백엔드 시드의 숫자 id로 맞춘다 — CraftDeskPicker의 썸네일 폴백 표
// (PRODUCT_ID_TO_THUMBNAIL)와 mock desk-texture 행(아래 MOCK_DESK_TEXTURES)이 이 값을 기대하므로,
// 안 맞추면 썸네일이 "미리보기 없음"으로 빠지고 재질이 기본 오크로 떨어진다. 셋을 세트로 관리할 것.
const MOCK_DESK_SEED: Record<string, { id: number; deskTextureId: number }> = {
  'desk-oak-1200': { id: 51, deskTextureId: 1 },
  'desk-walnut-1400': { id: 101, deskTextureId: 51 },
};

/** CraftDeskPicker의 BACKEND_FRAME_TYPE_TO_LOCAL의 역방향 */
const LOCAL_FRAME_TYPE_TO_BACKEND: Record<string, FrameType> = {
  'four-leg': 'FOUR_LEG',
  't-frame': 'T_FRAME',
  'top-only': 'TOP_ONLY',
};

export async function getDeskTemplates(): Promise<DeskSummaryResponse[]> {
  return isMockApi() ? getMockDeskTemplates() : getRealDeskTemplates();
}

// `GET /products`는 14895bf부터 규격 5종 공용 CursorPage<ProductDetailResponse>를 돌려준다 —
// 옛 DeskSummaryResponse[] 직접 파싱은 여기서부터 깨져 있었다(실측 버그, DERO-325 수정).
async function getRealDeskTemplates(): Promise<DeskSummaryResponse[]> {
  const page = await apiClient.get<CursorPage<ProductDetailResponse>>(
    '/products?specType=DESK&size=100',
  );
  return page.content.flatMap(toDeskSummary);
}

function toDeskSummary(dto: ProductDetailResponse): DeskSummaryResponse[] {
  // desk 칸이 비면(데이터 오류) 카드에서 조용히 뺀다 — 씬을 죽이지 않는다(카탈로그 전반 원칙).
  if (!dto.desk) return [];
  return [
    {
      id: dto.id,
      name: dto.name,
      imageUrl: dto.images.find((i) => i.isPrimary)?.imageUrl ?? dto.images[0]?.imageUrl ?? null,
      priceKrw: dto.priceKrw,
      widthMm: dto.desk.widthMm,
      depthMm: dto.desk.depthMm,
      heightMm: dto.desk.heightMm,
      topThicknessMm: dto.desk.topThicknessMm,
      edgeThicknessMm: dto.desk.edgeThicknessMm,
      deskTextureId: dto.desk.deskTextureId,
      frameType: dto.desk.frameType,
    },
  ];
}

// --- 마스터 목록 (DERO-325) ------------------------------------------
// isMockApi() 배타 전환(ADR-0017 결정 3) — 재질 소비 컴포넌트는 이 함수가 돌려주는
// 타입 하나만 보고 mock/real 분기를 모른다. 카테고리 마스터(getCategories)는 2026-08-05
// 정적 고정(constants/productCategoryGroup.ts)으로 삭제됐다 — 프론트는 GET /categories를 안 부른다.

// mock 모드의 재질 마스터 — 시딩된 2행(오크 id=1, 월넛 id=51)을 그대로 흉내낸다. 옛 수동 표
// (constants/deskTexture.ts의 DESK_TEXTURE_ID_TO_MATERIAL)는 DERO-335에서 삭제됐고,
// 이제 mock/real 모두 소비처가 이 모양 하나만 본다.
const MOCK_DESK_TEXTURES: DeskTexturePublicResponse[] = [
  {
    id: 1,
    name: '오크',
    baseColor: '#b8895a',
    albedoUrl: null,
    roughnessUrl: null,
    normalUrl: null,
    roughness: 0.55,
    metalness: 0,
    tileSizeMm: null,
    displayOrder: 0,
  },
  {
    id: 51,
    name: '월넛',
    baseColor: '#6f4a30',
    albedoUrl: null,
    roughnessUrl: null,
    normalUrl: null,
    roughness: 0.5,
    metalness: 0,
    tileSizeMm: null,
    displayOrder: 1,
  },
];

export async function getDeskTextures(): Promise<DeskTexturePublicResponse[]> {
  return isMockApi()
    ? MOCK_DESK_TEXTURES
    : apiClient.get<DeskTexturePublicResponse[]>('/desk-textures');
}

/** 제품 상세 단건 — real 전용, GET /products/{id} (api-spec.md §5, 공개). /product/[productId] 페이지가
 *  쓴다. */
export async function getProductById(id: number): Promise<ProductDetailResponse> {
  return apiClient.get<ProductDetailResponse>(`/products/${id}`);
}

/** 라이브러리 갤러리 한 페이지 기본 크기 — 백엔드 `DEFAULT_SIZE`와 같다. 옛 전량 프리페치
 *  `prefetchCatalog`는 `/product`도 `getProductPage` 커서 페이징으로 넘어가며 삭제됐다(2026-08-05). */
export const LIBRARY_PAGE_SIZE = 20;

export interface ProductPageQuery {
  /** 카테고리 마스터 id — 대분류든 세부 카테고리든 된다. 서버가 그 **하위 트리 전체**를 롤업해서
   *  걸러 준다(2026-08-04, `CategoryService.selfAndDescendantIds`). */
  categoryId?: number;
  cursor?: string | null;
  /** 기본 LIBRARY_PAGE_SIZE(20), 백엔드 상한 100. */
  size?: number;
  specType?: ProductDetailResponse['specType'];
  /** 검색어 — Elasticsearch + Nori(ADR-0019). 커서·categoryId와 공존한다. 빈 문자열이면 안 싣는다.
   *  **ES가 죽으면 이 파라미터를 실은 요청만 503 `PRODUCT_SEARCH_UNAVAILABLE`이고 폴백은 없다**
   *  (결정 6) — 호출부가 그 사실을 화면에 말해야 한다. */
  q?: string;
}

/** `GET /products` 한 페이지 — real 전용. 정렬 파라미터는 백엔드에 없다(항상 product.id 오름차순). */
export async function getProductPage(
  q: ProductPageQuery = {},
): Promise<CursorPage<ProductDetailResponse>> {
  const params = new URLSearchParams();
  if (q.specType) params.set('specType', q.specType);
  if (q.categoryId != null) params.set('categoryId', String(q.categoryId));
  params.set('size', String(q.size ?? LIBRARY_PAGE_SIZE));
  if (q.cursor) params.set('cursor', q.cursor);
  if (q.q) params.set('q', q.q);
  return apiClient.get<CursorPage<ProductDetailResponse>>(`/products?${params.toString()}`);
}

/** 검색어 추천 — real 전용, `GET /products/suggestions?q=`(ADR-0019 결정 1의 요구 ③).
 *  **결과 목록을 채우는 `getProductPage({ q })`와 다른 물건이다** — 이쪽은 ES의 별도 FST
 *  (completion suggester)라 키 입력마다 불러도 싸고, 돌려주는 것은 제품이 아니라 **다음에 칠
 *  검색어 문자열**이다. 전부 실제로 검색되는 이름이라(서버가 노출 규칙을 태운다) 눌렀는데 0건이
 *  나오는 일은 없다. 빈 질의는 서버를 안 친다. */
export async function getProductSuggestions(q: string): Promise<string[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const response = await apiClient.get<{ suggestions: string[] }>(
    `/products/suggestions?q=${encodeURIComponent(trimmed)}`,
  );
  return response.suggestions ?? [];
}

/** 스냅샷 복원 전용 — 백엔드에 벌크 조회(`?ids=`)가 HTTP로 안 열려 있어 id마다 친다(병렬).
 *  개별 404(비공개·삭제된 제품)는 조용히 빠진다(카탈로그 전반의 "씬을 죽이지 않는다" 원칙). */
export async function getProductsByIds(ids: number[]): Promise<ProductDetailResponse[]> {
  const results = await Promise.all(
    [...new Set(ids)].map((id) =>
      getProductById(id).catch((error: unknown) => {
        console.warn(`[product] productId=${id} 조회 실패 — 건너뜁니다`, error);
        return null;
      }),
    ),
  );
  return results.filter((r): r is ProductDetailResponse => r !== null);
}

/** 내가 찜한 제품 전량 — real 전용, `GET /products?liked=me`(🔒, DERO-356).
 *  원소가 카탈로그 목록과 같은 `ProductDetailResponse`라 변환·표시 경로를 그대로 재사용한다.
 *  **비로그인이면 401이다** — 호출부가 로그인 여부를 먼저 확인한다. */
export async function getLikedProducts(): Promise<ProductDetailResponse[]> {
  return fetchAllProductPages('liked=me');
}

/** `GET /products` 커서 페이지를 끝까지 모은다. `extraQuery`는 `size`·`cursor` 앞에 붙는 필터다. */
async function fetchAllProductPages(extraQuery: string): Promise<ProductDetailResponse[]> {
  const prefix = extraQuery ? `${extraQuery}&` : '';
  const all: ProductDetailResponse[] = [];
  let cursor: string | null = null;
  do {
    const qs = cursor
      ? `?${prefix}size=100&cursor=${encodeURIComponent(cursor)}`
      : `?${prefix}size=100`;
    const page: CursorPage<ProductDetailResponse> = await apiClient.get<
      CursorPage<ProductDetailResponse>
    >(`/products${qs}`);
    all.push(...page.content);
    cursor = page.hasNext ? page.nextCursor : null;
  } while (cursor !== null);
  return all;
}

async function getMockDeskTemplates(): Promise<DeskSummaryResponse[]> {
  return desks().flatMap((desk) => {
    const seed = MOCK_DESK_SEED[desk.id];
    // 시드 매핑이 없는 책상은 건너뛴다 — id를 임의로 만들면 썸네일·재질 표와 어긋난다
    if (!seed) return [];

    return [
      {
        id: seed.id,
        name: desk.name,
        // null이면 CraftDeskPicker가 PRODUCT_ID_TO_THUMBNAIL로 대체한다(실제 백엔드도 아직 전부 null)
        imageUrl: null,
        priceKrw: desk.priceKrw ?? null,
        widthMm: desk.widthMm,
        depthMm: desk.depthMm,
        heightMm: desk.heightMm,
        topThicknessMm: desk.topThicknessMm ?? 25,
        edgeThicknessMm: desk.edgeThicknessMm ?? desk.topThicknessMm ?? 25,
        deskTextureId: seed.deskTextureId,
        frameType: LOCAL_FRAME_TYPE_TO_BACKEND[desk.frameType ?? 'four-leg'] ?? 'FOUR_LEG',
      },
    ];
  });
}
