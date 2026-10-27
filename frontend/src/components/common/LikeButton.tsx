// 원형 좋아요 버튼 — 목록 카드(제품/커뮤니티)의 원형 북마크 버튼과 같은 모양·자리를 쓰되
// 색만 빨간 계열(danger)로 바꾼 표현 전용 컴포넌트. 상태는 부모가 들고 있다(한 화면에 토스트가
// 여러 개 겹치지 않도록 목록은 각 Grid/Gallery가, 상세는 각 LikeControl이 소유). 제품·커뮤니티
// 두 도메인 카드에서 공유해 common/에 둔다.

type Props = {
  isLiked: boolean;
  onToggle: () => void;
  /** 'sm' = 목록 카드(32px), 'lg' = 상세 페이지(40px) — 북마크 버튼과 같은 치수 */
  size?: 'sm' | 'lg';
  /** 카드 이미지 위에 겹쳐 놓을 때만 절대 위치를 준다 */
  isOverlay?: boolean;
  /** 카드 위에서 다른 아이콘 버튼과 나란히 놓을 때 위치를 조정한다(기본 top-3 right-3) */
  overlayPositionClassName?: string;
};

const LikeButton = ({
  isLiked,
  onToggle,
  size = 'sm',
  isOverlay = false,
  overlayPositionClassName = 'top-3 right-3',
}: Props) => {
  const boxClass = size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const iconSize = size === 'lg' ? 16 : 14;
  const overlayClass = isOverlay ? `absolute ${overlayPositionClassName} z-10` : '';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isLiked}
      aria-label={isLiked ? '좋아요 해제' : '좋아요'}
      // 비활성은 배경 없이 연한 테두리(border-ash/40)만 — 카드 이미지가 그대로 비친다(2026-08-03
      // 사용자 요청, 예전엔 bg-paper/bg-fog 회색 배경 + border-ink/70 진한 테두리였다). 활성 테두리도
      // 같은 border-ash/40으로 통일(2026-08-03) — 예전엔 border-ink/70 진한 테두리였다.
      className={`focus-visible:outline-primary-600 border-ash/40 flex shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${boxClass} ${overlayClass} ${
        isLiked
          ? 'bg-danger-50 text-danger-500'
          : 'text-ash hover:bg-danger-50 hover:text-danger-500'
      }`}
    >
      <svg
        width={iconSize}
        height={iconSize}
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
  );
};

export default LikeButton;
