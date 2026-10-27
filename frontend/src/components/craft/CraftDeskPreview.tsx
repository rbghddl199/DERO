// SSR 회피용 동적 임포트 — CraftDeskPreviewScene도 three를 import 시점에 건드리므로 ssr:false로 로드
'use client';

import dynamic from 'next/dynamic';

const CraftDeskPreview = dynamic(() => import('./CraftDeskPreviewScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-neutral-200" />,
});

export default CraftDeskPreview;
