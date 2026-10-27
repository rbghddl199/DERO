import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 이미지 조회가 만료 있는 presigned GET에서 만료 없는 안정 공개 URL로 바뀌면서(ADR-0035 결정 1,
  // DERO-571) 원격 호스트가 환경마다 이 둘로 고정됐다 — 그래서 next/image 등록이 가능해졌다
  // (결정 5). 경로를 `/api/v1/images/**`로 좁혀 임의 원격지가 최적화 프록시를 타지 못하게 한다.
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8080', pathname: '/api/v1/images/**' },
      { protocol: 'https', hostname: 'www.dero.life', pathname: '/api/v1/images/**' },
    ],
  },
  // 종전의 /desk-feed→/collection 리다이렉트(리네임 링크 보존)는 2026-08-10 제거 — /desk-feed가
  // 실사진 데스크피드(신규 도메인)의 라우트가 됐다. permanent(308)를 이미 캐시한 브라우저는
  // 강력 새로고침 전까지 컬렉션으로 갈 수 있다.
};

export default nextConfig;
