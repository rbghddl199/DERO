// 상세 페이지의 북마크/좋아요 공용 타원형 토글 — 아이콘(좌)+카운트(우)를 한 pill에 담는다.
// 목록 카드의 원형 아이콘 버튼(LikeButton, 카운트 없음)과 달리 상세 페이지는 제목 옆 숫자 표기와
// 원형 토글 버튼이 따로 있던 것을 하나로 합친 디자인이다. 북마크/좋아요는 색만 다르고 모양은 같다.

type Variant = 'bookmark' | 'like';

type Props = {
  variant: Variant;
  isActive: boolean;
  /** null이면 숫자 없이 아이콘만 — 서버 카운트를 아직(또는 비로그인이라 영영) 모르는 상태.
   *  목업 상수로 채우지 말 것: 실제와 다른 숫자를 보여주느니 안 보여주는 게 맞다. */
  count: number | null;
  onToggle: () => void;
  /** true면 배경·테두리 없이 아이콘+숫자만 표시한다(커뮤니티 카드·상세 전용) */
  bare?: boolean;
};

const ICON_PATH: Record<Variant, string> = {
  bookmark: 'M3.5 2.5h9v11l-4.5-3-4.5 3v-11Z',
  like: 'M8 13.6 6.7 12.4C3.3 9.3 1.4 7.6 1.4 5.5 1.4 3.6 2.9 2 4.9 2c1.1 0 2.2.5 3.1 1.4C8.9 2.5 10 2 11.1 2c2 0 3.5 1.6 3.5 3.5 0 2.1-1.9 3.8-5.3 6.9L8 13.6Z',
};

const LABEL: Record<Variant, string> = { bookmark: '북마크', like: '좋아요' };

/** 눌린 상태는 연한 highlight 대신 확실히 구분되는 solid 색 — 기존 원형 버튼들과 같은 규칙 */
const ACTIVE_CLASS: Record<Variant, string> = {
  bookmark: 'bg-primary-300 text-ink',
  like: 'bg-danger-50 text-danger-500',
};

const INACTIVE_HOVER_CLASS: Record<Variant, string> = {
  bookmark: 'hover:bg-highlight',
  like: 'hover:bg-danger-50 hover:text-danger-500',
};

/** bare(배경·테두리 없음) 스타일의 색상 — 활성 상태만 색으로 구분한다 */
const BARE_ACTIVE_CLASS: Record<Variant, string> = {
  bookmark: 'text-primary-600',
  like: 'text-danger-500',
};
const BARE_INACTIVE_CLASS: Record<Variant, string> = {
  bookmark: 'text-ash hover:text-primary-600',
  like: 'text-ash hover:text-danger-500',
};

const CountPillToggle = ({ variant, isActive, count, onToggle, bare = false }: Props) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={isActive}
    aria-label={isActive ? `${LABEL[variant]} 해제` : LABEL[variant]}
    className={
      bare
        ? `flex shrink-0 cursor-pointer items-center gap-1 text-[14px] font-medium tabular-nums transition-colors ${
            isActive ? BARE_ACTIVE_CLASS[variant] : BARE_INACTIVE_CLASS[variant]
          }`
        : // 비활성은 배경 없이 연한 테두리(border-ash/40)만 — 예전엔 bg-fog 회색 배경 + border-ink/70
          // 진한 테두리였다(2026-08-03 사용자 요청으로 LikeButton과 같은 톤에 맞췄다).
          // 배경 있는 이 분기의 소비처는 제품 상세 하단 액션 줄 하나뿐이다(커뮤니티 카드·상세는
          // 전부 bare) — 그래서 크기가 그 줄에 맞춰져 있다: 같은 줄의 '구매하러 가기'와 같은
          // h-12/16px다(2026-08-03 "버튼이 작다" 요청). 다른 화면에 배경 있는 pill을 새로 쓸 때는
          // 이 크기가 맞는지 확인할 것 — 아니면 그때 size prop을 만든다(지금은 단일 소비처라 안 만듦).
          `border-ash/40 flex h-12 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-5 text-[16px] font-medium tabular-nums transition-colors ${
            isActive ? ACTIVE_CLASS[variant] : `text-ash ${INACTIVE_HOVER_CLASS[variant]}`
          }`
    }
  >
    <svg
      width={bare ? 14 : 18}
      height={bare ? 14 : 18}
      viewBox="0 0 16 16"
      fill={isActive ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d={ICON_PATH[variant]} strokeLinejoin="round" />
    </svg>
    {count !== null && count}
  </button>
);

export default CountPillToggle;
