// getDeskTemplates()의 mock/real 분기 — API_MODE와 마찬가지로 모듈 로드 시점 값이라
// vi.stubEnv + resetModules로 매번 새로 import해야 한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();

vi.mock('@/api/client', () => ({
  apiClient: { get: getMock },
}));

describe('getDeskTemplates()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getMock.mockReset();
  });

  it('mock 모드에서는 apiClient를 안 부르고 로컬 카탈로그를 돌려준다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'mock');
    vi.resetModules();
    const { getDeskTemplates } = await import('@/api/product');

    const result = await getDeskTemplates();

    expect(getMock).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('deskTextureId');
    expect(result[0]).toHaveProperty('frameType');
  });

  it('real 모드에서는 GET /products?specType=DESK를 커서 페이지로 호출하고 desk 칸을 카드로 옮긴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'real');
    vi.resetModules();
    // 14895bf부터 GET /products는 규격 5종 공용 CursorPage<ProductDetailResponse>를 돌려준다
    // (옛 DeskSummaryResponse[] 직접 파싱은 이 계약과 어긋나 실측으로 깨져 있었다, DERO-325).
    getMock.mockResolvedValue({
      content: [
        {
          id: 1,
          specType: 'DESK',
          name: 'stub-desk',
          priceKrw: 100000,
          images: [{ imageId: 1, imageUrl: '/a.jpg', displayOrder: 0, isPrimary: true }],
          desk: {
            widthMm: 1200,
            depthMm: 600,
            heightMm: 740,
            topThicknessMm: 25,
            edgeThicknessMm: 25,
            deskTextureId: 1,
            frameType: 'FOUR_LEG',
          },
        },
      ],
      nextCursor: null,
      hasNext: false,
    });
    const { getDeskTemplates } = await import('@/api/product');

    const result = await getDeskTemplates();

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/products?specType=DESK&size=100');
    expect(result).toEqual([
      {
        id: 1,
        name: 'stub-desk',
        imageUrl: '/a.jpg',
        priceKrw: 100000,
        widthMm: 1200,
        depthMm: 600,
        heightMm: 740,
        topThicknessMm: 25,
        edgeThicknessMm: 25,
        deskTextureId: 1,
        frameType: 'FOUR_LEG',
      },
    ]);
  });

  it('real 모드에서 desk 칸이 없는 행(데이터 오류)은 카드에서 조용히 뺀다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'real');
    vi.resetModules();
    getMock.mockResolvedValue({
      content: [{ id: 2, specType: 'DESK', name: 'broken', images: [], desk: null }],
      nextCursor: null,
      hasNext: false,
    });
    const { getDeskTemplates } = await import('@/api/product');

    expect(await getDeskTemplates()).toEqual([]);
  });
});
