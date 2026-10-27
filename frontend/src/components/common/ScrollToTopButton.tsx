'use client';
// 우측 하단 고정 "위로 가기" 버튼 — 아래로 조금이라도 스크롤하면 바로 나타난다. /simulator는 자체 풀스크린 캔버스 UI라 숨김.

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const ScrollToTopButton = () => {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsVisible(window.scrollY > 0);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (pathname?.startsWith('/simulator')) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="위로 가기"
      className={`bg-primary-500 text-ink fixed right-6 bottom-6 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:brightness-95 ${
        isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

export default ScrollToTopButton;
