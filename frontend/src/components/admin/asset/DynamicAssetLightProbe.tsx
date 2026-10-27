'use client';
// SSR 회피용 동적 임포트 — three가 import 시점에 window를 건드리므로 ssr:false로 조명 판정
// 도구를 클라이언트에서만 로드한다(/dev/light의 DynamicLightAuthor와 같은 패턴).

import dynamic from 'next/dynamic';

const DynamicAssetLightProbe = dynamic(() => import('./AssetLightProbe'), {
  ssr: false,
  loading: () => (
    <p className="border-ash/30 text-ash mt-4 rounded-[10px] border border-dashed px-4 py-10 text-center text-[14px]">
      조명 판정 도구를 불러오는 중…
    </p>
  ),
});

export default DynamicAssetLightProbe;
