'use client';
// 데스크피드 상세의 우측 플로팅 액션 레일 — 좋아요·댓글·공유 세 버튼(DERO-614).
//
// **데스크톱 전용이다**(`lg:` 이상에서만 그린다) — 모바일은 여백이 없어 본문 끝의 인라인 버튼을
// 그대로 쓴다. 그래서 이 레일은 기존 버튼을 **대체하지 않고 겹쳐 둔다**: 두 자리 모두 같은
// 상태(isLiked·likeCount)를 부모에서 받아 그린다.
//
// 댓글 버튼은 서버 왕복이 아니라 **댓글 섹션으로 스크롤 점프**다 — 상세 한 화면 안에 이미
// 댓글이 있고, 카운트 정본도 그 섹션이 쓰는 서버 totalCount다.

import { shareLink } from '@/utils/shareLink';

type Props = {
  isLiked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  commentCount: number;
  /** 댓글 섹션의 앵커 id — 부모가 그 섹션에 같은 id를 달아 둔다. */
  commentsAnchorId: string;
  /** 공유 결과 알림(토스트) — 부모가 이미 토스트를 들고 있어 문구만 넘긴다. */
  onNotify: (message: string) => void;
};

const BUTTON_CLASS_NAME =
  'focus-visible:outline-primary-600 border-ash/30 bg-paper text-ink hover:border-ink flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';
const COUNT_CLASS_NAME = 'text-ash mt-1 text-center text-[12px] tabular-nums';

const DeskFeedActionRail = ({
  isLiked,
  likeCount,
  onToggleLike,
  commentCount,
  commentsAnchorId,
  onNotify,
}: Props) => {
  const handleShare = async (): Promise<void> => {
    const outcome = await shareLink(window.location.href, document.title);
    if (outcome === 'copied') onNotify('링크를 복사했어요.');
    else if (outcome === 'failed') onNotify('링크를 공유하지 못했어요. 주소창을 복사해주세요.');
    // 'shared'는 시트가 알려 주고, 'cancelled'는 사용자가 스스로 닫은 것이라 아무 말도 하지 않는다.
  };

  return (
    // 본문(720px) 오른쪽 여백에 붙인다 — 컨테이너 폭이 아니라 **본문 중앙 기준**이라야 여백이
    // 넓어져도 글에서 떨어지지 않는다(372 = 본문 절반 360 + 간격 12).
    <div className="absolute inset-y-0 left-[calc(50%+372px)] hidden w-12 lg:block">
      <div className="sticky top-28 flex flex-col gap-4">
        <div>
          <button
            type="button"
            onClick={onToggleLike}
            aria-pressed={isLiked}
            aria-label="좋아요"
            className={
              isLiked
                ? `${BUTTON_CLASS_NAME} border-danger-500/40 bg-danger-50 text-danger-500`
                : `${BUTTON_CLASS_NAME} hover:text-danger-500`
            }
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill={isLiked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path
                d="M8 13.6 6.7 12.4C3.3 9.3 1.4 7.6 1.4 5.5 1.4 3.6 2.9 2 4.9 2c1.1 0 2.2.5 3.1 1.4C8.9 2.5 10 2 11.1 2c2 0 3.5 1.6 3.5 3.5 0 2.1-1.9 3.8-5.3 6.9L8 13.6Z"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <p className={COUNT_CLASS_NAME}>{likeCount}</p>
        </div>

        <div>
          {/* 같은 문서 안의 앵커라 next/link가 아니라 순수 앵커다 — 라우터를 태울 이유가 없다.
              다만 **기본 동작을 막고 직접 스크롤한다**: 해시 이동은 히스토리를 한 칸 쌓아서,
              그 뒤 화면의 "뒤로 가기"(`BackButton`의 `router.back()`)가 해시만 떼고 같은 글에
              머무는 것처럼 보인다. href는 남겨 둔다 — 새 탭·가운데 클릭이 살아 있어야 한다. */}
          <a
            href={`#${commentsAnchorId}`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(commentsAnchorId)?.scrollIntoView({ behavior: 'smooth' });
            }}
            aria-label="댓글로 이동"
            className={BUTTON_CLASS_NAME}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path
                d="M14 9.5c0 1.4-1.2 2.5-2.6 2.5H8l-3.4 2.2V12h-.9C2.2 12 1 10.9 1 9.5v-5C1 3.1 2.2 2 3.6 2h7.8C12.8 2 14 3.1 14 4.5v5Z"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <p className={COUNT_CLASS_NAME}>{commentCount}</p>
        </div>

        <button
          type="button"
          onClick={() => void handleShare()}
          aria-label="링크 공유"
          className={BUTTON_CLASS_NAME}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path
              d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l2-2a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1M9.4 6.6a2.6 2.6 0 0 0-3.9-.3l-2 2a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DeskFeedActionRail;
