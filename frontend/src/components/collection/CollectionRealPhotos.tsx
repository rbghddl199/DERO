'use client';
// 이 배치의 실사 사진 — 데스크피드 글이 이 배치를 첨부하면 여기에 역방향으로 걸린다
// (`GET /desk-feeds?placementId=`, ADR-0033 결정 4). 단일 FK + 인덱스라 조회가 한 방이다.
//
// **데스크피드 글만 노출한다** — 커뮤니티 스토리 글은 그 책상 사진이 아닐 수 있어 "실사"의 의미가
// 흐려진다(결정 4). 연결된 사진이 없으면 섹션 자체를 그리지 않는다: 빈 섹션은 "아직 없다"가
// 아니라 화면 낭비다.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listDeskFeeds } from '@/api/deskFeed';
import type { DeskFeedSummaryResponse } from '@/types/deskFeed';

type Props = {
  placementId: number;
};

const CollectionRealPhotos = ({ placementId }: Props) => {
  const [posts, setPosts] = useState<DeskFeedSummaryResponse[]>([]);
  /** 표지를 못 받아 온 글 — 깨진 이미지 아이콘 대신 회색 자리로 떨어뜨린다. */
  const [failedIds, setFailedIds] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    listDeskFeeds({ placementId, size: 12 })
      .then((page) => {
        if (!cancelled) setPosts(page.content);
      })
      .catch((error: unknown) => {
        // 부가 섹션이라 실패해도 배치 상세를 막지 않는다 — 조용히 안 그린다.
        console.error('[CollectionRealPhotos] 실사 사진을 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, [placementId]);

  if (posts.length === 0) return null;

  return (
    <section className="font-swiss mt-8 tracking-[-0.03em]">
      <h2 className="text-ink mb-3 text-[18px] font-medium">이 배치의 실사 사진</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {posts.map((post) => (
          <li key={post.id} className="overflow-hidden rounded-xl">
            <Link href={`/desk-feed/${post.id}`} className="group block">
              {post.coverUrl !== null && !failedIds.has(post.id) ? (
                // eslint-disable-next-line @next/next/no-img-element -- 표지 비율이 사진마다 달라 자연 비율로 흘리는 카드 계열과 같은 처방(next/image 전환은 별건)
                <img
                  src={post.coverUrl}
                  alt={post.title}
                  className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  // 폴백이 없으면 깨진 이미지 아이콘이 그대로 보인다(카드 계열과 같은 규칙).
                  onError={() => setFailedIds((prev) => new Set(prev).add(post.id))}
                />
              ) : (
                <div className="bg-fog aspect-[4/3] w-full" />
              )}
              <p className="text-ash mt-1 truncate text-[13px]">{post.nickname}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default CollectionRealPhotos;
