// 피드 카드 표지 계약 — 대표 상상도(primaryImageUrl)만 쓰고, 없으면 카드가 샘플 사진으로 내려앉는다
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/placement', () => ({
  listPlacements: vi.fn(),
  listPlacementRemixes: vi.fn(),
}));

import { listPlacements } from '@/api/placement';
import { getCollectionPage } from '@/api/collection';
import type { PlacementSummaryResponse } from '@/types/placement';

function summary(overrides: Partial<PlacementSummaryResponse>): PlacementSummaryResponse {
  return {
    id: 1,
    title: '내 데스크',
    description: null,
    publishStatus: 'PUBLIC',
    isTemplate: false,
    budgetKrw: null,
    likeCount: 0,
    ownerId: 7,
    ownerNickname: '동규',
    createdAt: '2026-08-02T00:00:00Z',
    updatedAt: null,
    thumbnailUrl: null,
    primaryImageUrl: null,
    isBookmarked: false,
    bookmarkGroupId: null,
    ...overrides,
  };
}

function pageOf(items: PlacementSummaryResponse[]) {
  return { content: items, nextCursor: null, hasNext: false };
}

describe('collection cover image', () => {
  beforeEach(() => {
    vi.mocked(listPlacements).mockReset();
  });

  it('상상도가 있으면 스크린샷보다 상상도를 표지로 쓴다', async () => {
    vi.mocked(listPlacements).mockResolvedValue(
      pageOf([
        summary({
          primaryImageUrl: 'https://s3/imagined.png',
          thumbnailUrl: 'https://s3/shot.png',
        }),
      ]),
    );

    const page = await getCollectionPage();

    expect(page.posts[0].thumbnailUrl).toBe('https://s3/imagined.png');
  });

  it('스크린샷은 피드 표지로 쓰지 않는다 — 상상도가 없으면 표지가 빈다', async () => {
    vi.mocked(listPlacements).mockResolvedValue(
      pageOf([summary({ primaryImageUrl: null, thumbnailUrl: 'https://s3/shot.png' })]),
    );

    const page = await getCollectionPage();

    expect(page.posts[0].thumbnailUrl).toBeUndefined();
  });

  it('둘 다 없으면 표지가 비어 카드가 샘플로 폴백한다', async () => {
    vi.mocked(listPlacements).mockResolvedValue(pageOf([summary({})]));

    const page = await getCollectionPage();

    expect(page.posts[0].thumbnailUrl).toBeUndefined();
  });
});
