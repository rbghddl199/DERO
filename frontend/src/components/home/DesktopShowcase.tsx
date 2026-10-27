'use client';
// 랜딩 데스크 GLB 쇼케이스 컨테이너 — three가 import 시점에 window를 건드리므로 ssr:false 동적 임포트 + 뷰포트 근접 시에만 청크 로드(랜딩 JS 예산 보호, MonitorArmShowcase.tsx와 같은 패턴)

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const DynamicDesktopScene = dynamic(() => import('./DesktopScene'), { ssr: false });

const DesktopShowcase = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative aspect-[4/3] overflow-hidden rounded-2xl">
      {isVisible && <DynamicDesktopScene />}
    </div>
  );
};

export default DesktopShowcase;
