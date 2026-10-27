// ISO 날짜 문자열 → "YYYY년 M월 D일 오전/오후 H시 M분" 포맷 (내 데스크테리어 목록 등)

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}년 ${get('month')}월 ${get('day')}일 ${get('dayPeriod')} ${get('hour')}시 ${get('minute')}분`;
}
