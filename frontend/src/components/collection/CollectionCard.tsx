'use client';
// 컬렉션 갤러리 카드 — 핀터레스트풍 매스너리 카드(카드마다 세로 비율이 다르다). 커뮤니티
// PostCard와는 별개 컴포넌트: 텍스트 위주 카드가 아니라 사진이 주인공이고, 정보는 사진 위 하단
// 그라디언트 오버레이로 얹는다. 목업 글은 post.photoId로 정해지는 샘플 사진(collectionPhotos.ts,
// 2026-07-30), 실제 글은 AI 상상도 대표 1장(post.thumbnailUrl)을 쓴다 — 3D 스크린샷이 아니다
// (해석은 CollectionCoverImage가 한 곳에서 한다).

import Link from 'next/link';
import { hashString } from '@/utils/avatarPalette';
import CollectionCoverImage from './CollectionCoverImage';
import type { CollectionPost } from './types';

/** 카드마다 세로 비율을 다르게 줘서 매스너리(핀터레스트) 효과를 낸다 — 사진은 하나뿐이라
 *  object-cover로 다르게 잘리는 것만으로 높이 차이를 만든다. */
const ASPECT_RATIOS = ['aspect-[3/4]', 'aspect-square', 'aspect-[4/5]', 'aspect-[2/3]'];

type Props = {
  post: CollectionPost;
  onToggleBookmark: (id: string) => void;
};

const CollectionCard = ({ post, onToggleBookmark }: Props) => {
  const aspectClass = ASPECT_RATIOS[hashString(post.id) % ASPECT_RATIOS.length];

  return (
    <article className="group relative mb-1 break-inside-avoid overflow-hidden rounded-xl">
      <Link href={`/collection/${post.id}`} className={`relative block w-full ${aspectClass}`}>
        <CollectionCoverImage
          post={post}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="transition-transform duration-500 ease-out group-hover:scale-105"
        />
        <div className="from-ink/80 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
        <div className="text-paper absolute inset-x-0 bottom-0 p-4">
          <p className="truncate text-[15px] font-medium">{post.title}</p>
          <p className="text-paper/80 mt-0.5 truncate text-[13px]">{post.author}</p>
        </div>
      </Link>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onToggleBookmark(post.id);
          }}
          aria-pressed={post.isBookmarked}
          aria-label={post.isBookmarked ? '북마크 해제' : '북마크'}
          className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors ${
            post.isBookmarked
              ? 'bg-primary-300 text-ink border-transparent'
              : 'border-ink/10 text-ash hover:text-ink bg-transparent'
          }`}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill={post.isBookmarked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="M3.5 2.5h9v11l-4.5-3-4.5 3v-11Z" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </article>
  );
};

export default CollectionCard;
