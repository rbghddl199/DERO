'use client';
// SSR 회피용 동적 임포트 — three가 import 시점에 window를 건드리므로 ssr:false로 SimulatorCanvas를 클라이언트에서만 로드

import dynamic from 'next/dynamic';

const DynamicSimulator = dynamic(() => import('./SimulatorCanvas'), { ssr: false });

export default DynamicSimulator;
