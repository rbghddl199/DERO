'use client';
// 문서 스크롤바 숨김 — mount된 동안 html에 hide-scrollbar 토글(ScrollProgress와 같은 CSS, 인디케이터 없이)

import { useEffect } from 'react';

const HideScrollbar = () => {
  useEffect(() => {
    document.documentElement.classList.add('hide-scrollbar');
    return () => document.documentElement.classList.remove('hide-scrollbar');
  }, []);

  return null;
};

export default HideScrollbar;
