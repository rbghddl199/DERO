// 관리자 콘솔 좌측 내비와 대시보드가 함께 쓰는 화면 목록.

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/admin/products', label: '제품', description: '카탈로그 제품 등록·수정·삭제' },
  { href: '/admin/reviews', label: '검수 대기', description: '3D 에셋 검수 대기 목록 승인·반려' },
  {
    href: '/admin/placements',
    label: '템플릿 시딩',
    description: '운영진 배치를 컬렉션 시작 템플릿으로 지정',
  },
  { href: '/admin/brands', label: '브랜드', description: '브랜드 정보와 로고 이미지' },
  { href: '/admin/categories', label: '카테고리', description: '제품 분류 트리' },
  { href: '/admin/vibes', label: '무드', description: '데스크 무드 태그' },
  { href: '/admin/hashtags', label: '해시태그', description: '컬렉션 해시태그' },
  { href: '/admin/vesa-specs', label: 'VESA', description: 'VESA 마운트 홀 규격(mm)' },
  { href: '/admin/desk-textures', label: '책상 재질', description: '상판 재질과 텍스처 맵' },
  { href: '/admin/terms', label: '약관', description: '서비스 약관과 동의 항목 개정 관리' },
  {
    href: '/admin/search',
    label: '검색 색인',
    description: '제품·배치·게시글·사용자 인덱스 전량 재색인',
  },
] as const;
