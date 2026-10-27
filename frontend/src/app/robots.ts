// robots.txt — 크롤러에게 무엇을 읽고 무엇을 읽지 말지 알린다(D34·ADR-0037 결정 4).
//
// **관리자·dev·인증 콜백은 색인에서 뺀다** — 로그인 벽 뒤라 크롤러가 내용을 못 읽는데도 URL만
// 색인되면 검색 결과에 빈 페이지가 뜬다. 나머지는 전부 열어 둔다: 이 서비스의 사활은 SEO다.
import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/constants/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/dev',
        '/auth',
        '/mypage',
        '/onboarding',
        '/simulator/thumbnail-render',
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
