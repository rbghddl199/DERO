'use client';
// 목록 카드의 사진 수 뱃지를 누르면 뜨는 **사진만 넘겨보는 오버레이**(D34·ADR-0037 결정 5).
// 상세로 이동하지 않고 그 자리에서 훑는 용도라 본문·댓글·좋아요는 일부러 없다.
//
// 사진 목록은 **열 때 상세를 한 번 받아서** 만든다 — 목록 응답에는 표지(coverUrl)와 장수만 있고
// 나머지 사진의 URL이 없다. 미리 다 받아 두면 카드 수만큼 상세를 치게 된다.
// 순서는 본문 마크다운이 정본이므로 `images` 배열이 아니라 **본문에 나온 순서**로 정렬한다.

import { useCallback, useEffect, useState } from 'react';
import { getDeskFeed } from '@/api/deskFeed';
import BodyPortal from '@/components/common/BodyPortal';
import { orderImageUrlsByContent } from '@/utils/deskFeedContent';

type Props = {
  deskFeedId: number;
  title: string;
  onClose: () => void;
};

const DeskFeedPhotoLightbox = ({ deskFeedId, title, onClose }: Props) => {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getDeskFeed(deskFeedId)
      .then((detail) => {
        if (cancelled) return;
        setUrls(orderImageUrlsByContent(detail.content, detail.images));
      })
      .catch((error: unknown) => {
        console.error('[DeskFeedPhotoLightbox] 사진을 불러오지 못했습니다', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deskFeedId]);

  const move = useCallback(
    (step: number) => {
      setIndex((prev) => {
        const total = urls?.length ?? 0;
        if (total === 0) return 0;
        return (prev + step + total) % total;
      });
    },
    [urls],
  );

  // Esc로 닫고 화살표로 넘긴다 — 오버레이가 떠 있는 동안 배경은 스크롤하지 않는다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [move, onClose]);

  const current = urls === null ? null : (urls[index] ?? null);

  return (
    <BodyPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 사진 보기`}
        className="bg-ink/90 fixed inset-0 z-[70] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-full w-full max-w-3xl flex-col items-center gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          {failed && <p className="text-paper text-[14px]">사진을 불러오지 못했어요.</p>}
          {!failed && current === null && (
            <p className="text-paper/80 text-[14px]">사진을 불러오는 중…</p>
          )}
          {current !== null && (
            // eslint-disable-next-line @next/next/no-img-element -- 자연 비율로 흘리는 사용자 사진이라 plain img를 쓴다(next/image 전환은 별건)
            <img
              src={current}
              alt={`${title} 사진 ${index + 1}`}
              className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain"
            />
          )}

          {urls !== null && urls.length > 1 && (
            <div className="text-paper flex items-center gap-6">
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="이전 사진"
                className="hover:bg-paper/20 cursor-pointer rounded-full px-3 py-1 text-[18px] transition-colors"
              >
                ‹
              </button>
              <span className="text-[13px] tabular-nums">
                {index + 1} / {urls.length}
              </span>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="다음 사진"
                className="hover:bg-paper/20 cursor-pointer rounded-full px-3 py-1 text-[18px] transition-colors"
              >
                ›
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="border-paper/40 text-paper hover:bg-paper/20 cursor-pointer rounded-full border px-4 py-1.5 text-[13px] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </BodyPortal>
  );
};

export default DeskFeedPhotoLightbox;
