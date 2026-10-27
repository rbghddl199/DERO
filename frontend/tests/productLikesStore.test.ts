// 제품 좋아요 스토어의 mock/real 분기 — real 모드에서만 서버에 쓰고, 서버 값으로 덮는다
// (DERO-356). API_MODE가 모듈 로드 시점 값이라 vi.stubEnv + resetModules로 매번 새로 import한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/api/client', () => ({
  apiClient: { get: getMock, put: putMock, delete: deleteMock },
}));

const loadStore = async (mode: 'mock' | 'real') => {
  vi.stubEnv('NEXT_PUBLIC_API_MODE', mode);
  vi.resetModules();
  const { useProductLikesStore } = await import('@/store/productLikesStore');
  return useProductLikesStore;
};

/** `?liked=me` 한 페이지 응답 — 목록 원소는 카탈로그와 같은 ProductDetailResponse다. */
const likedPage = (ids: number[]) => ({
  content: ids.map((id) => ({ id, specType: 'PROP', name: `p-${id}`, images: [] })),
  nextCursor: null,
  hasNext: false,
  totalCount: ids.length,
});

describe('productLikesStore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
  });

  it('mock 모드의 토글은 서버를 부르지 않는다 — 로컬 카탈로그 id는 백엔드가 못 푼다', async () => {
    const store = await loadStore('mock');

    expect(store.getState().toggleLike('monitor-27')).toBe(true);

    expect(store.getState().likedIds.has('monitor-27')).toBe(true);
    expect(putMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('real 모드의 토글은 숫자 id로 PUT·DELETE를 부른다', async () => {
    const store = await loadStore('real');
    putMock.mockResolvedValue(undefined);
    deleteMock.mockResolvedValue(undefined);

    store.getState().toggleLike('27');
    expect(putMock).toHaveBeenCalledWith('/products/27/like');

    store.getState().toggleLike('27');
    expect(deleteMock).toHaveBeenCalledWith('/products/27/like');
    expect(store.getState().likedIds.has('27')).toBe(false);
  });

  it('real 모드에서 쓰기가 실패하면 낙관적 갱신을 되돌린다', async () => {
    const store = await loadStore('real');
    putMock.mockRejectedValue(new Error('네트워크 실패'));

    store.getState().toggleLike('27');
    expect(store.getState().likedIds.has('27')).toBe(true);

    await vi.waitFor(() => {
      expect(store.getState().likedIds.has('27')).toBe(false);
    });
  });

  it('syncFromServer는 GET /products?liked=me 결과로 통째로 덮고 제품을 돌려준다', async () => {
    const store = await loadStore('real');
    getMock.mockResolvedValue(likedPage([7, 9]));
    store.setState({ likedIds: new Set(['999']) });

    const liked = await store.getState().syncFromServer();

    expect(getMock).toHaveBeenCalledWith('/products?liked=me&size=100');
    expect(liked).toHaveLength(2);
    expect([...store.getState().likedIds]).toEqual(['7', '9']);
  });

  it('mock 모드의 syncFromServer는 아무것도 부르지 않고 빈 배열이다', async () => {
    const store = await loadStore('mock');

    await expect(store.getState().syncFromServer()).resolves.toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });
});
