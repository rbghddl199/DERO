// 컬렉션 태그 배선(DERO-493) — 태그가 서버 값이라는 계약이 깨지면 화면은 조용히
// "칩이 안 뜬다"로만 보인다. 여기서 잡는 건 세 가지다: 목록 응답의 tags를 카드로 옮기는가,
// 칩 필터가 `?hashtag=`로 나가는가, 태그 수정이 공개 전환 PUT이 아닌 별도 경로로 나가는가.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();

vi.mock('@/api/client', () => ({
  apiClient: { get: getMock, put: putMock },
}));

function page(content: unknown[]) {
  return { content, nextCursor: null, hasNext: false, totalCount: content.length };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: '원목 작업실',
    description: null,
    tags: ['원목데스크', '미니멀'],
    publishStatus: 'PUBLIC',
    isTemplate: false,
    budgetKrw: null,
    likeCount: 0,
    ownerId: 7,
    ownerNickname: '주인',
    thumbnailUrl: null,
    primaryImageUrl: null,
    isBookmarked: false,
    bookmarkGroupId: null,
    createdAt: '2026-08-07T12:00:00+09:00',
    updatedAt: null,
    ...overrides,
  };
}

describe('컬렉션 태그', () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
  });

  it('카드 태그는 목록 응답의 값이다 — 데모 태그도 사이드카도 아니다', async () => {
    getMock.mockResolvedValue(page([summary()]));
    const { getCollectionPage } = await import('@/api/collection');

    const result = await getCollectionPage();

    expect(result.posts[0].tags).toEqual(['원목데스크', '미니멀']);
  });

  it('태그가 없는 배치는 빈 배열이다', async () => {
    getMock.mockResolvedValue(page([summary({ tags: [] })]));
    const { getCollectionPage } = await import('@/api/collection');

    const result = await getCollectionPage();

    expect(result.posts[0].tags).toEqual([]);
  });

  it('칩 필터는 ?hashtag=로 서버에 나간다 — 받아 온 페이지 안에서 거르지 않는다', async () => {
    getMock.mockResolvedValue(page([]));
    const { getCollectionPage } = await import('@/api/collection');

    await getCollectionPage('latest', null, '', '원목데스크');

    expect(getMock.mock.calls[0][0]).toContain(
      'hashtag=%EC%9B%90%EB%AA%A9%EB%8D%B0%EC%8A%A4%ED%81%AC',
    );
  });

  it('칩을 안 골랐으면 hashtag 파라미터를 안 싣는다', async () => {
    getMock.mockResolvedValue(page([]));
    const { getCollectionPage } = await import('@/api/collection');

    await getCollectionPage();

    expect(getMock.mock.calls[0][0]).not.toContain('hashtag=');
  });

  it('태그 수정은 feed-entry가 아니라 feed-entry/tags로 나간다 — 공개 전환을 다시 태우면 안 된다', async () => {
    putMock.mockResolvedValue(undefined);
    const { replacePlacementTags } = await import('@/api/placement');

    await replacePlacementTags(12, ['게이밍']);

    expect(putMock).toHaveBeenCalledWith('/placements/12/feed-entry/tags', { tags: ['게이밍'] });
  });

  it('공개 전환은 태그를 본문에 싣고, 태그를 안 주면 본문 자체를 안 싣는다(= 태그 미변경)', async () => {
    putMock.mockResolvedValue(undefined);
    const { publishPlacementToFeed } = await import('@/api/placement');

    await publishPlacementToFeed(12, ['원목데스크']);
    expect(putMock).toHaveBeenLastCalledWith('/placements/12/feed-entry', {
      tags: ['원목데스크'],
    });

    await publishPlacementToFeed(12);
    expect(putMock).toHaveBeenLastCalledWith('/placements/12/feed-entry');
  });
});
