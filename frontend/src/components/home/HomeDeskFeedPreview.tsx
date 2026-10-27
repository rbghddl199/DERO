'use client';
// 홈 랜딩 데스크피드 미리보기 — /desk-feed에 올라온 실사 책상 사진 일부를 링크 전용 카드로 보여준다.
// DeskFeedCard(매스너리 자연 높이)를 재사용하지 않는다 — 홈은 고정 비율 그리드라 카드마다 높이가
// 달라지면 줄이 흐트러진다. 대신 홈 컬렉션 미리보기(HomeFeedPreview)와 같은 타일 모양을 쓴다.
// coverUrl은 만료 없는 공개 URL이다(ADR-0035) — plain <img> + onError 폴백을 쓰는 것은 자연 비율
// (DeskFeedCard와 같은 이유). 그 폴백 상태 때문에 이 파일만 클라이언트 컴포넌트다.

import Link from 'next/link';
import { useState } from 'react';
import type { DeskFeedSummaryResponse } from '@/types/deskFeed';

type Props = {
  posts: DeskFeedSummaryResponse[];
};

const HomeDeskFeedPreviewCard = ({ post }: { post: DeskFeedSummaryResponse }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const label = post.title;

  return (
    <Link
      href={`/desk-feed/${post.id}`}
      className="focus-visible:outline-primary-600 group relative block aspect-[4/5] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {post.coverUrl !== null && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- 자연 비율로 흘리는 표지라 plain img를 쓴다(위 주석)
        <img
          src={post.coverUrl}
          alt={label}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="bg-fog text-ash flex h-full w-full items-center justify-center text-[13px]">
          사진을 불러오지 못했어요
        </div>
      )}
      <div className="from-ink/80 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="text-paper absolute inset-x-0 bottom-0 translate-y-2 p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <p className="truncate text-[15px] font-medium">{label}</p>
        <p className="text-paper/80 mt-0.5 truncate text-[13px]">{post.nickname}</p>
      </div>
    </Link>
  );
};

const HomeDeskFeedPreview = ({ posts }: Props) => {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <HomeDeskFeedPreviewCard key={post.id} post={post} />
      ))}
    </div>
  );
};

export default HomeDeskFeedPreview;
