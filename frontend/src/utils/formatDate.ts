// ISO 날짜 문자열 → "YYYY년 M월 D일" 포맷 (마이페이지 가입일 등, 시각 없이 날짜만 필요할 때)

export function formatDate(isoString: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).formatToParts(new Date(isoString));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}년 ${get('month')}월 ${get('day')}일`;
}
