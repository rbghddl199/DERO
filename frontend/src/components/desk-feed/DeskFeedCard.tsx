'use client';
// 데스크피드 갤러리 카드 — 실사진이 주인공인 매스너리 카드. 컬렉션 카드와 달리 사진이 실제
// 비율을 가지므로 가짜 aspect 해시 없이 자연 높이(w-full h-auto)로 흘린다.
// **URL은 만료 없는 공개 주소다**(ADR-0035 — `/api/v1/images/{key}`). plain <img> + onError 폴백을
// 쓰는 것은 표지 비율이 사진마다 달라 자연 높이로 흘려야 해서고, next/image(RemoteImage) 전환은
// 별건이다. 여기 coverUrl은 사진이 없으면 정직하게 null이라 결정적 키 함정이 없어 별도
// 컴포넌트로 빼지 않았다.
//
// 카드에 거는 글자는 **title 필드**다 — 본문 첫 줄 파생 금지. 표지는 서버가 **본문 첫 이미지**로
// 파생해 주는 coverUrl이다(D34·ADR-0037 — 대표 컬럼도 대표 선택 UI도 없다).
//
// **사진 수 뱃지는 링크가 아니라 버튼이다**(ADR-0037 결정 5): 누르면 상세로 가지 않고 그 자리에서
// 사진만 넘겨보는 라이트박스가 열린다. 그래서 카드 본체 Link 안에 넣지 않는다 — 중첩된
// 인터랙티브 요소는 무효 HTML이고, 안에 두면 뱃지 클릭이 곧 상세 이동이 된다.
// 호버로 대신하지 않는 이유는 모바일에서 죽어서다.

import Link from 'next/link';
import { useState } from 'react';
import { resolveMentions, toPlainExcerpt } from '@/components/community/communityContent';
import type { DeskFeedSummaryResponse } from '@/types/deskFeed';
import DeskFeedPhotoLightbox from './DeskFeedPhotoLightbox';

/** 카드 발췌 길이 — 매스너리 폭에서 두 줄 안쪽. */
const EXCERPT_MAX_LENGTH = 60;

type Props = {
  post: DeskFeedSummaryResponse;
};

const DeskFeedCard = ({ post }: Props) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const label = post.title;
  // 멘션을 먼저 풀고 발췌한다 — 안 풀면 발췌에 `[[user:12]]`가 날것으로 실린다(카드에는 링크가
  // 필요 없지만, 마크다운 링크로 바뀐 뒤 toPlainExcerpt가 라벨(@닉네임)만 남긴다).
  const excerpt = toPlainExcerpt(resolveMentions(post.content, post.mentions), EXCERPT_MAX_LENGTH);

  return (
    <article className="group relative mb-1 overflow-hidden rounded-xl">
      <Link href={`/desk-feed/${post.id}`} className="relative block w-full">
        {post.coverUrl !== null && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- 자연 비율로 흘리는 표지라 plain img를 쓴다(위 주석)
          <img
            src={post.coverUrl}
            alt={label}
            className="h-auto w-full transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="bg-fog text-ash flex aspect-[4/3] w-full items-center justify-center text-[13px]">
            사진을 불러오지 못했어요
          </div>
        )}
        <div className="from-ink/80 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />

        <div className="text-paper absolute inset-x-0 bottom-0 p-4">
          <p className="truncate text-[17px] font-medium">{label}</p>
          {excerpt !== '' && (
            <p className="text-paper/85 mt-0.5 line-clamp-2 text-[13px] leading-[1.5]">{excerpt}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <p className="text-paper/80 min-w-0 truncate text-[13px]">{post.nickname}</p>
            {/* 첨부 배치가 있으면 뱃지 — 요약 카드 자체는 상세만 싣는다(ADR-0033 결정 4). */}
            {post.placementId !== null && (
              <span className="border-paper/50 text-paper/90 shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                배치 연결됨
              </span>
            )}
            <span className="text-paper/80 ml-auto flex shrink-0 items-center gap-1 text-[12px] tabular-nums">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 13.6 6.7 12.4C3.3 9.3 1.4 7.6 1.4 5.5 1.4 3.6 2.9 2 4.9 2c1.1 0 2.2.5 3.1 1.4C8.9 2.5 10 2 11.1 2c2 0 3.5 1.6 3.5 3.5 0 2.1-1.9 3.8-5.3 6.9L8 13.6Z" />
              </svg>
              {post.likeCount}
            </span>
          </div>
        </div>
      </Link>

      {/* 여러 장 글만 뱃지를 단다 — 1장짜리는 넘겨 볼 것이 없다. */}
      {post.imageCount > 1 && (
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          aria-label={`${label} 사진 ${post.imageCount}장 넘겨보기`}
          className="bg-ink/70 text-paper hover:bg-ink absolute top-3 right-3 flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[12px] tabular-nums transition-colors"
        >
          {/* 겹친 사진 아이콘 — 뒤 장이 살짝 비어져 나온 형태로 "여러 장"을 말한다. */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="3.5" width="9" height="9" rx="1.5" stroke="currentColor" />
            <path
              d="M5 1.5h7.5A1.5 1.5 0 0 1 14 3v7.5"
              stroke="currentColor"
              strokeLinecap="round"
            />
          </svg>
          {post.imageCount}
        </button>
      )}

      {isLightboxOpen && (
        <DeskFeedPhotoLightbox
          deskFeedId={post.id}
          title={label}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </article>
  );
};

export default DeskFeedCard;
