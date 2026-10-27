// 본문의 유튜브 주소는 렌더러가 플레이어로 바꾼다(DERO-616) — 저장 모델·에디터는 그대로다.
// iframe이 허용되는 것은 유튜브뿐이고(SSR 공개 페이지), 문구를 붙인 링크는 링크로 남는다.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PostContent from '@/components/community/PostContent';

const render = (content: string) => renderToStaticMarkup(createElement(PostContent, { content }));

const WATCH_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('PostContent 유튜브 임베드', () => {
  it('자동 링크된 유튜브 주소를 플레이어로 바꾼다', () => {
    const html = render(`타건음 들어보세요\n\n[${WATCH_URL}](${WATCH_URL})`);

    expect(html).toContain('<iframe');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html).not.toContain(`href="${WATCH_URL}"`);
  });

  it('`_`가 든 영상 id도 임베드한다 — 직렬화가 링크 글자만 `\\_`로 이스케이프한다', () => {
    const url = 'https://youtu.be/a_b-cdefghi';
    const html = render(`[${url.replace('_', '\\_')}](${url})`);

    expect(html).toContain('https://www.youtube-nocookie.com/embed/a_b-cdefghi');
  });

  it('문구를 붙인 링크는 링크로 둔다 — 그 문구가 작성자의 의도다', () => {
    const html = render(`[키보드 영상](${WATCH_URL})`);

    expect(html).not.toContain('<iframe');
    expect(html).toContain('키보드 영상');
  });

  it('문장 중간에 자동 링크된 주소는 링크로 둔다 — 플레이어가 문장을 가로로 쪼갠다', () => {
    const html = render(`이 영상 [${WATCH_URL}](${WATCH_URL}) 참고하세요`);

    expect(html).not.toContain('<iframe');
    expect(html).toContain('참고하세요');
  });

  it('유튜브가 아닌 주소는 iframe이 되지 않는다', () => {
    const url = 'https://vimeo.com/12345';
    const html = render(`[${url}](${url})`);

    expect(html).not.toContain('<iframe');
    expect(html).toContain(`href="${url}"`);
  });

  it('본문에 직접 쓴 iframe 태그는 sanitize가 지운다', () => {
    const html = render('<iframe src="https://evil.example"></iframe>');

    expect(html).not.toContain('<iframe');
  });
});
