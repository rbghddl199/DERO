// 데스크피드 API 클라이언트 — 목록 질의 파라미터(정렬 탭·태그 칩·역방향 조회)가 서버 필터로
// 실려 나가는지. 화면이 클라이언트 필터로 뭉개면 페이지가 얇아지거나 칩이 헛돈다.
// 사진 업로드는 **webp 변환을 태우는지**를 본다 — 서버 MIME표가 webp만 받아서(ADR-0035) 원본
// 타입으로 presign을 치면 400으로 죽는데, 그 사실이 코드에서 보이지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();

vi.mock('@/api/client', () => ({
  apiClient: { get: getMock, post: postMock, put: putMock },
}));

vi.mock('@/utils/admin/imageCompression', () => ({
  prepareImageForUpload: vi.fn(async (file: File) => ({
    blob: file,
    contentType: 'image/webp',
  })),
}));

afterEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
});

const calledPath = (): string => String(getMock.mock.calls[0][0]);

describe('listDeskFeeds', () => {
  it('파라미터가 없으면 쿼리 없이 /desk-feeds를 부른다', async () => {
    getMock.mockResolvedValue({ content: [], nextCursor: null, hasNext: false, totalCount: 0 });
    const { listDeskFeeds } = await import('@/api/deskFeed');
    await listDeskFeeds();
    expect(calledPath()).toBe('/desk-feeds');
  });

  it('정렬·태그·커서를 서버 질의로 싣는다', async () => {
    getMock.mockResolvedValue({ content: [], nextCursor: null, hasNext: false, totalCount: 0 });
    const { listDeskFeeds } = await import('@/api/deskFeed');
    await listDeskFeeds({ sort: 'popular', hashtag: '원목데스크', cursor: 'cur', size: 20 });
    const path = calledPath();
    expect(path).toContain('sort=popular');
    expect(path).toContain(`hashtag=${encodeURIComponent('원목데스크')}`);
    expect(path).toContain('cursor=cur');
    expect(path).toContain('size=20');
  });

  it('역방향 조회는 placementId로 간다 — "이 배치의 실사 사진"', async () => {
    getMock.mockResolvedValue({ content: [], nextCursor: null, hasNext: false, totalCount: 0 });
    const { listDeskFeeds } = await import('@/api/deskFeed');
    await listDeskFeeds({ placementId: 42 });
    expect(calledPath()).toContain('placementId=42');
  });
});

// 사진별 제품 태그는 본문이 아니라 정션이 정본이다(ADR-0040) — 이미지에 딸린 경로로,
// **전체 교체**라 빈 배열이 곧 "태그 없음"이다(생략이나 null이 아니다).
describe('replaceDeskFeedImageProducts', () => {
  it('이미지에 딸린 경로로 전체 교체를 보낸다', async () => {
    putMock.mockResolvedValue({ id: 7, imageKey: 'k', imageUrl: 'u', productIds: [12, 34] });
    const { replaceDeskFeedImageProducts } = await import('@/api/deskFeed');
    await replaceDeskFeedImageProducts(5, 7, [12, 34]);
    expect(putMock).toHaveBeenCalledWith('/desk-feeds/5/images/7/products', {
      productIds: [12, 34],
    });
  });

  it('태그를 다 떼면 빈 배열이 나간다 — 안 보내는 것이 아니다', async () => {
    putMock.mockResolvedValue({ id: 7, imageKey: 'k', imageUrl: 'u', productIds: [] });
    const { replaceDeskFeedImageProducts } = await import('@/api/deskFeed');
    await replaceDeskFeedImageProducts(5, 7, []);
    expect(putMock).toHaveBeenCalledWith('/desk-feeds/5/images/7/products', { productIds: [] });
  });
});

// 사진의 위치 정본이 본문이라(D32 개정·ADR-0034) 지울 때 본문에서도 떼야 한다 — key가 정규식
// 메타문자를 담으면 엉뚱한 줄까지 지워진다.
describe('removeImageMarkdown', () => {
  it('그 key를 가리키는 이미지 줄만 뗀다', async () => {
    const { removeImageMarkdown } = await import('@/components/community/communityContent');
    const content = '앞\n\n![책상](desk-feed/a.png)\n![의자](desk-feed/b.png)\n뒤';
    expect(removeImageMarkdown(content, 'desk-feed/a.png')).toBe(
      '앞\n\n![의자](desk-feed/b.png)\n뒤',
    );
  });

  it('key의 정규식 메타문자를 이스케이프한다 — `.`이 임의 문자와 매치되면 남의 사진이 지워진다', async () => {
    const { removeImageMarkdown } = await import('@/components/community/communityContent');
    const content = '![a](desk-feed/aXpng)\n![b](desk-feed/a.png)\n';
    expect(removeImageMarkdown(content, 'desk-feed/a.png')).toBe('![a](desk-feed/aXpng)\n');
  });

  it('없는 key면 본문이 그대로다', async () => {
    const { removeImageMarkdown } = await import('@/components/community/communityContent');
    const content = '![a](desk-feed/a.png)\n';
    expect(removeImageMarkdown(content, 'desk-feed/zzz.png')).toBe(content);
  });
});

describe('uploadDeskFeedImages', () => {
  it('webp로 변환해 presign하고 key만 등록한다 — 순서·대표 파라미터가 없다', async () => {
    postMock
      .mockResolvedValueOnce({
        items: [{ imageKey: 'desk-feed-images/1/a.webp', uploadUrl: 'https://s3/a' }],
      })
      .mockResolvedValueOnce({
        id: 7,
        imageKey: 'desk-feed-images/1/a.webp',
        imageUrl: 'https://s3/get',
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );

    const { uploadDeskFeedImages } = await import('@/api/deskFeed');
    const registered = await uploadDeskFeedImages(1, [
      new File(['x'], 'desk.png', { type: 'image/png' }),
    ]);

    expect(postMock.mock.calls[0]).toEqual([
      '/desk-feeds/1/images/upload-urls',
      { contentTypes: ['image/webp'] },
    ]);
    expect(postMock.mock.calls[1]).toEqual([
      '/desk-feeds/1/images',
      { imageKey: 'desk-feed-images/1/a.webp' },
    ]);
    expect(registered).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe('orderImageUrlsByContent', () => {
  it('본문에 나온 순서로 URL을 준다 — 레지스트리 등록 순서가 아니다', async () => {
    const { orderImageUrlsByContent } = await import('@/utils/deskFeedContent');
    const images = [
      { imageKey: 'a.webp', imageUrl: 'https://s3/a' },
      { imageKey: 'b.webp', imageUrl: 'https://s3/b' },
    ];

    expect(orderImageUrlsByContent('본문\n\n![](b.webp)\n\n![](a.webp)', images)).toEqual([
      'https://s3/b',
      'https://s3/a',
    ]);
  });

  it('본문에 없는 사진도 뒤에 붙여 잃어버리지 않는다', async () => {
    const { orderImageUrlsByContent } = await import('@/utils/deskFeedContent');
    const images = [
      { imageKey: 'a.webp', imageUrl: 'https://s3/a' },
      { imageKey: 'orphan.webp', imageUrl: 'https://s3/orphan' },
    ];

    expect(orderImageUrlsByContent('![](a.webp)', images)).toEqual([
      'https://s3/a',
      'https://s3/orphan',
    ]);
  });
});
