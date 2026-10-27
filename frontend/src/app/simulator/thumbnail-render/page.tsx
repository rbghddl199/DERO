// 갤러리 썸네일 캡처 전용 내부 라우트 — scripts/generate-thumbnails.mjs가 ?id=&kind=로 순회 방문한다. 화면 어디에도 링크되지 않음
import { Suspense } from 'react';
import DynamicThumbnailRenderer from '@/components/simulator/DynamicThumbnailRenderer';

const ThumbnailRenderPage = () => {
  return (
    <Suspense fallback={null}>
      <DynamicThumbnailRenderer />
    </Suspense>
  );
};

export default ThumbnailRenderPage;
