'use client';
// 컬렉션 상단 인기 배너 — 북마크 수가 가장 많은 글 1건을 소개 배너로 보여준다. 목업 글은
// post.photoId로 정해지는 샘플 사진, 실제 글은 AI 상상도 대표 1장을 쓴다(getCollectionCoverImage,
// collectionPhotos.ts, collection/CLAUDE.md 참고).

import Link from 'next/link';
import CollectionCoverImage from './CollectionCoverImage';
import type { CollectionPost } from './types';

type Props = {
  post: CollectionPost;
  /** 왼쪽 위 강조 배지 — 고정 글일 때 갤러리가 넣어 준다. 없으면 안 그린다. */
  badge?: string;
};

const CollectionPopularBanner = ({ post, badge }: Props) => (
  <Link
    href={`/collection/${post.id}`}
    className="group relative mb-8 block h-[220px] w-full overflow-hidden rounded-2xl sm:h-[260px]"
  >
    <CollectionCoverImage
      post={post}
      sizes="100vw"
      priority
      className="transition-transform duration-500 ease-out group-hover:scale-105"
    />
    <div className="from-ink/85 via-ink/30 absolute inset-0 bg-gradient-to-t to-transparent" />

    {badge !== undefined && (
      <span className="bg-ink/60 text-paper absolute top-4 left-4 rounded-full px-3.5 py-1.5 text-[13px] font-medium backdrop-blur-sm sm:top-5 sm:left-5">
        {badge}
      </span>
    )}

    <div className="text-paper absolute inset-x-0 bottom-0 p-6 sm:p-8">
      <p className="text-primary-200 mb-1.5 text-[13px] font-medium tabular-nums">
        지금 인기 있는 데스크테리어
      </p>
      <h2 className="text-[22px] leading-[1.3] font-medium sm:text-[26px]">{post.title}</h2>
      <p className="text-paper/70 mt-2 text-[13px]">{post.author}</p>
    </div>
  </Link>
);

export default CollectionPopularBanner;
