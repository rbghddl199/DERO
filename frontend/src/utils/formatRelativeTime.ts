// ISO 날짜 문자열(백엔드 Date 직렬화 형태) → 상대 시간 표기 — 방금 전/N분 전/N시간 전/N일 전,
// 일주일이 넘으면 절대 날짜(YYYY.MM.DD)로 대체한다 (커뮤니티 게시물·댓글 작성 시각 등).

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const formatAbsoluteDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
};

/** `now`는 테스트에서 고정 시각을 주입하기 위한 매개변수 — 기본값은 호출 시점의 실제 현재 시각 */
export function formatRelativeTime(input: string | Date, now: Date = new Date()): string {
  const target = typeof input === 'string' ? new Date(input) : input;
  const diffMs = Math.max(0, now.getTime() - target.getTime());

  if (diffMs < MINUTE_MS) return '방금 전';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}분 전`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}시간 전`;
  if (diffMs < WEEK_MS) return `${Math.floor(diffMs / DAY_MS)}일 전`;

  return formatAbsoluteDate(target);
}
