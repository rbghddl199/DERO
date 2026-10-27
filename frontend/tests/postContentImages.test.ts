// 본문 이미지의 src는 만료 없는 imageKey로 저장되고, 렌더 시점에만 조회 URL로 해석된다.
// 조회 URL을 본문에 박아 저장하던 시절엔 TTL(S3 15분)이 지나면 글의 이미지가 전부 깨졌다 —
// 그 회귀를 막는 테스트다(ADR-0013 결정 5·8, PostImageResponse.imageKey가 존재하는 이유).
// 2026-08-11(DERO-572)부터 렌더는 common/RemoteImage(next/image)라 최종 src가
// `/_next/image?url=<인코딩된 원본>`이다 — 원본 URL은 인코딩된 꼴로 확인한다.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import PostContent from '@/components/community/PostContent';

const IMAGE_KEY = 'post-images/a.png';
const IMAGE_URL = 'https://www.dero.life/api/v1/images/post-images/a.png';

const render = (content: string, imageUrls?: ReadonlyMap<string, string>) =>
  renderToStaticMarkup(createElement(PostContent, { content, imageUrls }));

describe('PostContent 본문 이미지', () => {
  it('본문에 저장된 imageKey를 맵의 조회 URL로 해석해 그린다', () => {
    const html = render(`![책상](${IMAGE_KEY})`, new Map([[IMAGE_KEY, IMAGE_URL]]));

    expect(html).toContain(encodeURIComponent(IMAGE_URL));
    expect(html).toContain('alt="책상"');
    // key가 그대로 src에 남으면 브라우저가 상대 경로로 해석해 404다
    expect(html).not.toContain(`src="${IMAGE_KEY}"`);
  });

  it('맵에 없는 src는 원문 그대로 둔다 — 과거에 URL로 저장된 글도 그냥 뜬다', () => {
    const html = render(`![옛날](${IMAGE_URL})`, new Map());

    expect(html).toContain(encodeURIComponent(IMAGE_URL));
  });

  it('맵을 안 넘겨도 렌더가 죽지 않는다 — 해석 못 한 key는 그리지 않는다', () => {
    const html = render(`![키만](${IMAGE_KEY})`);

    expect(html).not.toContain(IMAGE_KEY);
    expect(html).not.toContain('<img');
  });
});
