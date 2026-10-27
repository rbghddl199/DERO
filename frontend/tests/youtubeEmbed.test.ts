// 유튜브 임베드 판정 — 허용 호스트·영상 id 형식만 통과시키고, 도메인을 흉내 낸 주소는 링크로 남긴다.
import { describe, expect, it } from 'vitest';
import { toYouTubeEmbedUrl } from '@/utils/youtubeEmbed';

const EMBED = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

describe('toYouTubeEmbedUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ])('%s 를 임베드 주소로 바꾼다', (url) => {
    expect(toYouTubeEmbedUrl(url)).toBe(EMBED);
  });

  // "타건 부분부터"가 이 기능의 동기라 시작 시각은 살려서 넘긴다
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', `${EMBED}?start=42`],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', `${EMBED}?start=42`],
    // 숫자가 아닌 t는 임베드 주소에 그대로 실어 나르지 않는다
    ['https://youtu.be/dQw4w9WgXcQ?t=evil', EMBED],
  ])('%s 의 시작 시각을 넘긴다', (url, expected) => {
    expect(toYouTubeEmbedUrl(url)).toBe(expected);
  });

  it.each([
    // 도메인을 흉내 낸 주소 — 문자열 매칭이면 통과한다
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/12345',
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v=../../evil',
    'https://www.youtube.com/@someone',
    'not a url',
  ])('%s 는 임베드하지 않는다', (url) => {
    expect(toYouTubeEmbedUrl(url)).toBeUndefined();
  });
});
