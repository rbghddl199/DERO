'use client';
// SSR 회피용 동적 임포트 — ThumbnailRenderer도 three를 import 시점에 건드리므로 ssr:false로 로드

import dynamic from 'next/dynamic';

const DynamicThumbnailRenderer = dynamic(() => import('./ThumbnailRenderer'), { ssr: false });

export default DynamicThumbnailRenderer;
