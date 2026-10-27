// 전역 Footer 카피 상수 — Footer.tsx의 정적 문구를 한 곳에 모은다.

export const FOOTER_COPY = {
  tagline: '실측 규격 기반 3D 데스크 시뮬레이터',
  navLinks: [
    { href: '/', label: '홈' },
    { href: '/product', label: '제품' },
    { href: '/community', label: '커뮤니티' },
    { href: '/collection', label: '컬렉션' },
  ],
  // 본문은 /terms/[slug]가 항목별 현행 회차를 보여준다(슬러그 = terms.code의 kebab-case).
  legalLinks: [
    { href: '/terms/terms-of-service', label: '이용약관' },
    { href: '/terms/privacy-policy', label: '개인정보 수집·이용 동의' },
  ],
  // 쿠키는 약관 페이지가 아니라 동의 결정을 되돌리는 동작이라 링크가 아닌 버튼이다.
  cookieSettingsLabel: '쿠키 설정',
  companyName: '브런치즈',
  contactEmail: '브런치즈 팀 프로젝트',
  copyright: '© 2026 DERO. All rights reserved.',
};
