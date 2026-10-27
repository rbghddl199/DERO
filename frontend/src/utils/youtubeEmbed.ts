// 본문에 박힌 유튜브 주소를 임베드 주소로 바꾼다 — 유튜브가 아니면 undefined(호출부가 일반 링크로 둔다).

/** 임베드를 허용하는 호스트. 여기 없는 도메인은 iframe이 되지 않는다 — SSR 공개 페이지라 허용목록만 쓴다 */
const EMBEDDABLE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

/** 유튜브 영상 id는 11자 URL-safe base64다. 여기서 한 번 더 좁혀 임베드 주소에 임의 경로가 못 붙게 한다 */
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

/** 시작 시각(`?t=90`·`?t=90s`)만 초 단위 숫자로 받는다 — "타건 부분부터"가 이 기능의 동기다 */
const extractStartSeconds = (url: URL): string | undefined => {
  const raw = url.searchParams.get('t') ?? url.searchParams.get('start');
  return raw !== null && /^\d{1,6}s?$/.test(raw) ? raw.replace('s', '') : undefined;
};

const extractVideoId = (url: URL): string | undefined => {
  const [first, second] = url.pathname.split('/').filter((segment) => segment !== '');
  if (url.hostname.endsWith('youtu.be')) return first;
  if (first === 'watch') return url.searchParams.get('v') ?? undefined;
  // /shorts/ID · /embed/ID · /live/ID — 재생 화면 종류만 다르고 영상 id 자리는 같다
  if (first === 'shorts' || first === 'embed' || first === 'live') return second;
  return undefined;
};

/**
 * 유튜브 시청 주소 → `youtube-nocookie` 임베드 주소. 임베드할 수 없으면 undefined다.
 *
 * **호스트 판정은 정규식이 아니라 `URL`로 한다** — `https://youtube.com.evil.example/watch?v=…`처럼
 * 도메인을 흉내 낸 주소가 문자열 매칭은 통과하기 때문이다.
 */
export function toYouTubeEmbedUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  if (!EMBEDDABLE_HOSTS.has(parsed.hostname.toLowerCase())) return undefined;
  const videoId = extractVideoId(parsed);
  if (videoId === undefined || !VIDEO_ID_PATTERN.test(videoId)) return undefined;
  const start = extractStartSeconds(parsed);
  return `https://www.youtube-nocookie.com/embed/${videoId}${start === undefined ? '' : `?start=${start}`}`;
}
