// 제품 등록 브랜드 선택지는 백엔드의 페이지 크기 상한과 무관하게 모든 페이지를 합쳐야 한다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAllBrands, listAllCategories } from '@/api/admin/masters';
import { listAdminProducts } from '@/api/admin/products';
import { toDescendingNameOptions } from '@/utils/admin/masterOptions';

function jsonResponse(body: unknown): Response {
  return {
    status: 200,
    ok: true,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listAllBrands', () => {
  it('100개를 넘는 브랜드를 다음 페이지까지 조회해 합친다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          content: Array.from({ length: 100 }, (_, index) => ({
            id: index + 21,
            name: `브랜드 ${index + 21}`,
          })),
          page: { number: 0, size: 100, totalElements: 120, totalPages: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content: Array.from({ length: 20 }, (_, index) => ({
            id: index + 1,
            name: `브랜드 ${index + 1}`,
          })),
          page: { number: 1, size: 100, totalElements: 120, totalPages: 2 },
        }),
      );

    const brands = await listAllBrands(200);

    expect(brands).toHaveLength(120);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain('/admin/brands?page=0&size=200');
    expect(fetchSpy.mock.calls[1][0]).toContain('/admin/brands?page=1&size=200');
  });
});

describe('admin product filters', () => {
  it('전체 카테고리를 다음 페이지까지 조회해 합친다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          content: [{ id: 1, name: '책상', parentId: null }],
          page: { number: 0, size: 100, totalElements: 2, totalPages: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          content: [{ id: 2, name: '모니터', parentId: null }],
          page: { number: 1, size: 100, totalElements: 2, totalPages: 2 },
        }),
      );

    await expect(listAllCategories(100)).resolves.toHaveLength(2);
    expect(fetchSpy.mock.calls[1][0]).toContain('/admin/categories?page=1&size=100');
  });

  it('제품 목록 API에 브랜드와 카테고리 필터를 전달한다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        content: [],
        page: { number: 0, size: 20, totalElements: 0, totalPages: 0 },
      }),
    );

    await listAdminProducts({
      status: 'APPROVED',
      brandId: 7,
      categoryId: 9,
      keyword: '울트라기어',
      page: 2,
      size: 20,
    });

    expect(fetchSpy.mock.calls[0][0]).toContain(
      '/admin/products?status=APPROVED&brandId=7&categoryId=9&keyword=%EC%9A%B8%ED%8A%B8%EB%9D%BC%EA%B8%B0%EC%96%B4&page=2&size=20',
    );
  });
});

describe('brand options', () => {
  it('브랜드 이름을 한글·영문 내림차순으로 정렬한다', () => {
    const brands = [
      { id: 1, name: 'BOSE' },
      { id: 2, name: '후후루' },
      { id: 3, name: 'Royal Kludge' },
      { id: 4, name: '마켓비' },
      { id: 5, name: 'Deltah' },
    ];

    expect(toDescendingNameOptions(brands).map((option) => option.label)).toEqual([
      'Royal Kludge',
      'Deltah',
      'BOSE',
      '후후루',
      '마켓비',
    ]);
    expect(brands.map((brand) => brand.name)).toEqual([
      'BOSE',
      '후후루',
      'Royal Kludge',
      '마켓비',
      'Deltah',
    ]);
  });
});
