// 데스크피드 상세의 SEO 산출물 — 제목·설명이 **글 내용에서** 나오는지(D34·ADR-0037 결정 4).
// 고정 문구로 돌아가면 검색 결과가 전부 같은 줄이 되는데, 화면으로는 아무 증상이 없어 조용히 썩는다.
import { describe, expect, it, vi } from 'vitest';

const getDeskFeedMock = vi.fn();

vi.mock('@/api/deskFeed', () => ({
  getDeskFeed: getDeskFeedMock,
}));

const detail = {
  id: 12,
  title: '3년 쓴 원목 책상',
  content: '모니터암을 달고 넓어졌어요.\n\n![](desk-feed-images/12/a.webp)',
  mentions: [],
  hashtags: [],
  images: [{ id: 1, imageKey: 'desk-feed-images/12/a.webp', imageUrl: 'https://s3/a' }],
  likeCount: 0,
  commentCount: 0,
  placementId: null,
  placement: null,
  usedProducts: [],
  authorId: 3,
  nickname: '글쓴이',
  profileImageKey: null,
  createdAt: '2026-08-11T10:00:00+09:00',
  updatedAt: null,
};

describe('데스크피드 상세 generateMetadata', () => {
  it('제목과 본문 발췌로 메타태그를 만든다 — 이미지 마크다운은 발췌에서 빠진다', async () => {
    getDeskFeedMock.mockResolvedValue(detail);
    const { generateMetadata } = await import('@/app/desk-feed/[postId]/page');

    const metadata = await generateMetadata({ params: Promise.resolve({ postId: '12' }) });

    expect(String(metadata.title)).toContain('3년 쓴 원목 책상');
    expect(metadata.description).toBe('모니터암을 달고 넓어졌어요.');
    expect(metadata.alternates?.canonical).toContain('/desk-feed/12');
  });

  it('조회가 실패하면 고정 문구로 떨어진다 — 404에서 예외를 던지지 않는다', async () => {
    getDeskFeedMock.mockRejectedValue(new Error('404'));
    const { generateMetadata } = await import('@/app/desk-feed/[postId]/page');

    const metadata = await generateMetadata({ params: Promise.resolve({ postId: '99' }) });

    expect(String(metadata.title)).toContain('데스크피드');
  });
});
