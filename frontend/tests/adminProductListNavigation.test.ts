// 관리자 제품 목록의 페이지·필터가 수정 화면 왕복 뒤에도 보존되는지 검증한다.

import { describe, expect, it } from 'vitest';
import {
  adminProductFormHref,
  adminProductListHref,
  parseProductPageIndex,
  parseProductListLocation,
  safeAdminProductReturnTo,
} from '@/utils/admin/productListNavigation';

describe('admin product list navigation', () => {
  it('사용자에게 보이는 3페이지를 내부 인덱스 2로 변환한다', () => {
    expect(parseProductPageIndex('3')).toBe(2);
  });

  it('잘못된 페이지 값은 첫 페이지로 처리한다', () => {
    expect(parseProductPageIndex(undefined)).toBe(0);
    expect(parseProductPageIndex('0')).toBe(0);
    expect(parseProductPageIndex('-1')).toBe(0);
    expect(parseProductPageIndex('abc')).toBe(0);
  });

  it('3페이지의 검수·브랜드·카테고리·검색어 필터를 목록 URL에 직렬화한다', () => {
    const listHref = adminProductListHref({
      pageIndex: 2,
      filters: { status: 'APPROVED', brandId: 7, categoryId: 9, keyword: '울트라 기어' },
    });

    expect(listHref).toBe(
      '/admin/products?page=3&status=APPROVED&brandId=7&categoryId=9&keyword=%EC%9A%B8%ED%8A%B8%EB%9D%BC+%EA%B8%B0%EC%96%B4',
    );
    expect(adminProductFormHref('/admin/products/42', listHref)).toBe(
      '/admin/products/42?returnTo=%2Fadmin%2Fproducts%3Fpage%3D3%26status%3DAPPROVED%26brandId%3D7%26categoryId%3D9%26keyword%3D%25EC%259A%25B8%25ED%258A%25B8%25EB%259D%25BC%2B%25EA%25B8%25B0%25EC%2596%25B4',
    );
  });

  it('첫 페이지 URL에는 불필요한 검색 조건을 붙이지 않는다', () => {
    expect(adminProductListHref({ pageIndex: 0, filters: {} })).toBe('/admin/products');
    expect(adminProductFormHref('/admin/products/42', '/admin/products')).toBe(
      '/admin/products/42',
    );
  });

  it('URL 쿼리를 내부 페이지와 필터로 복원한다', () => {
    expect(
      parseProductListLocation({
        page: '3',
        status: 'REJECTED',
        brandId: '12',
        categoryId: '15',
        keyword: '  모니터  ',
      }),
    ).toEqual({
      pageIndex: 2,
      filters: { status: 'REJECTED', brandId: 12, categoryId: 15, keyword: '모니터' },
    });
  });

  it('제품 목록 이외의 returnTo는 버리고 허용된 값만 정규화한다', () => {
    expect(
      safeAdminProductReturnTo(
        '/admin/products?page=3&status=APPROVED&brandId=7&categoryId=9&keyword=monitor',
      ),
    ).toBe('/admin/products?page=3&status=APPROVED&brandId=7&categoryId=9&keyword=monitor');
    expect(safeAdminProductReturnTo('https://evil.example/admin/products?page=3')).toBe(
      '/admin/products',
    );
    expect(safeAdminProductReturnTo('/admin/terms?page=3')).toBe('/admin/products');
    expect(safeAdminProductReturnTo('/admin/products?page=-2&brandId=nope')).toBe(
      '/admin/products',
    );
  });
});
