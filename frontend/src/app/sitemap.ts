// sitemap.xml — 공개 글 URL을 크롤러가 발견하는 통로(D34·ADR-0037 결정 4). 새 글이 링크 추적만으로
// 발견되기를 기다리지 않는다.
//
// **글 목록은 커서 페이징이라 한 번에 다 오지 않는다** — 최신 SITEMAP_MAX_ENTRIES건까지만 훑고
// 멈춘다. 색인 예산도 유한하고, 그보다 오래된 글은 목록 페이지 링크로 발견된다.
// **목록 조회가 실패해도 sitemap 자체는 답한다** — 정적 경로만 담긴 sitemap이 500보다 낫다.
import type { MetadataRoute } from 'next';
import { listDeskFeeds } from '@/api/deskFeed';
import { listPosts } from '@/api/post';
import { SITE_ORIGIN } from '@/constants/site';

// 요청마다 그린다 — 목록 API가 `no-store`라 빌드 시점에 정적으로 구울 수 없고, 구워 봐야 배포
// 시점의 글 목록으로 굳는다(새 글이 다음 배포까지 sitemap에 안 뜬다). 아래 try/catch가
// Next의 DynamicServerError까지 삼켜 정적으로 굳는 것을 막는 뜻도 겸한다.
export const dynamic = 'force-dynamic';

/** 도메인당 상한. 페이지 크기 × 왕복 수 = 이 값이다. */
const SITEMAP_MAX_ENTRIES = 500;
const PAGE_SIZE = 50;

/** 목록 화면 — 로그인 벽 뒤가 아닌 것만. 관리자·dev·마이페이지는 robots가 막는다. */
const STATIC_PATHS = ['/', '/product', '/collection', '/community', '/desk-feed'];

type Entry = { url: string; lastModified?: string };

/** 커서를 따라 상한까지 걷는다 — 한 페이지라도 실패하면 거기까지 모은 것으로 답한다. */
async function walk(
  path: string,
  fetchPage: (cursor: string | null) => Promise<{
    content: { id: number; createdAt: string; updatedAt: string | null }[];
    nextCursor: string | null;
    hasNext: boolean;
  }>,
): Promise<Entry[]> {
  const entries: Entry[] = [];
  let cursor: string | null = null;
  // **페이지 수로도 끊는다** — 길이만 보면 빈 페이지가 `hasNext: true`로 오는 순간(커서가 안
  // 나아가는 서버 버그) 루프가 끝나지 않고, 이 라우트는 force-dynamic이라 요청마다 워커가 물린다.
  const maxPages = Math.ceil(SITEMAP_MAX_ENTRIES / PAGE_SIZE);
  try {
    for (let page_i = 0; page_i < maxPages && entries.length < SITEMAP_MAX_ENTRIES; page_i += 1) {
      const page = await fetchPage(cursor);
      if (page.content.length === 0) break;
      for (const row of page.content) {
        entries.push({
          url: `${SITE_ORIGIN}${path}/${row.id}`,
          lastModified: row.updatedAt ?? row.createdAt,
        });
      }
      if (!page.hasNext || page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
  } catch (error: unknown) {
    console.error(`[sitemap] ${path} 목록 조회 실패 — 모은 데까지만 싣는다`, error);
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [deskFeeds, posts] = await Promise.all([
    walk('/desk-feed', (cursor) => listDeskFeeds({ cursor, size: PAGE_SIZE })),
    walk('/community', (cursor) => listPosts({ cursor, size: PAGE_SIZE })),
  ]);

  return [
    ...STATIC_PATHS.map((path) => ({ url: `${SITE_ORIGIN}${path}` })),
    ...deskFeeds,
    ...posts,
  ];
}
