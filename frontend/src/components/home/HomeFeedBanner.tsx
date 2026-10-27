// 홈 첫 화면 컬렉션 배너 — 인기 컬렉션 게시물을 자동 캐러셀로 보여준다(오늘의집 홈 배너 방식).
// home/CLAUDE.md 원칙대로 도메인 로직·전역 상태 없음: 슬라이드 클릭은 /collection/{id}, CTA는
// /collection로 이동할 뿐이다. 표지는 CollectionCoverImage 경유(presigned URL·404 폴백, next/image
// 직접 사용 금지 — collection/CLAUDE.md).
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CollectionCoverImage from '@/components/collection/CollectionCoverImage';
import { HOME_FEED_BANNER_COPY } from '@/constants/homeCopy';
import type { CollectionPost } from '@/components/collection/types';

const SLIDE_INTERVAL_MS = 5000;

type Props = {
  posts: CollectionPost[];
};

const HomeFeedBanner = ({ posts }: Props) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (posts.length < 2) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % posts.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [posts.length]);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] sm:aspect-[16/7]">
      {posts.map((post, index) => (
        <Link
          key={post.id}
          href={`/collection/${post.id}`}
          aria-hidden={index !== activeIndex}
          tabIndex={index === activeIndex ? 0 : -1}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            index === activeIndex ? 'z-10 opacity-100' : 'z-0 opacity-0'
          }`}
        >
          <CollectionCoverImage
            post={post}
            sizes="(min-width: 1280px) 1200px, 100vw"
            priority={index === 0}
          />
          <div className="from-ink/80 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
          <div className="text-paper absolute inset-x-0 bottom-0 p-6 sm:p-10">
            <p className="text-paper/80 text-[13px] font-medium tracking-wide">
              {HOME_FEED_BANNER_COPY.eyebrow}
            </p>
            <p className="mt-1 line-clamp-2 max-w-2xl text-[22px] leading-[1.3] font-semibold sm:text-[30px]">
              {post.title}
            </p>
            <p className="text-paper/80 mt-2 truncate text-[14px]">{post.author}</p>
          </div>
        </Link>
      ))}

      <Link
        href="/collection"
        className="bg-paper/90 text-ink hover:bg-paper absolute right-6 bottom-6 z-20 hidden items-center gap-1 rounded-full px-5 py-2.5 text-[14px] font-medium shadow-sm transition-colors sm:inline-flex"
      >
        {HOME_FEED_BANNER_COPY.ctaLabel} →
      </Link>

      {posts.length > 1 && (
        <div className="absolute top-6 right-6 z-20 flex gap-2">
          {posts.map((post, index) => (
            <button
              key={post.id}
              type="button"
              aria-label={`${index + 1}번째 배너 보기`}
              onClick={() => setActiveIndex(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === activeIndex ? 'bg-paper w-6' : 'bg-paper/50 hover:bg-paper/70 w-2'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HomeFeedBanner;
