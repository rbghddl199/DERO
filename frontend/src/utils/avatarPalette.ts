// 프로필 사진 미지정자용 아바타 배경 팔레트 — 흰색·노란색·연한 노란색 3종(입체 음영 없는 평면).
// 원래 community/communityAuthors.ts에 있던 것을 공용으로 옮겼다(2026-08-01 — 로그인 프로필
// (TopNavbar·mypage 등)도 같은 팔레트/아이콘을 쓰게 되며 도메인 폴더에 있을 이유가 없어졌다).
// 세 배경 모두 밝아서 아이콘은 항상 ink 톤이고, 흰 배경이 흰 카드 위에서 사라지지 않도록
// 테두리 색도 같이 든다.
// Math.random()은 쓰지 않는다 — 리렌더마다 색이 바뀌면 SSR/CSR 결과가 어긋나 하이드레이션이
// 깨진다(communityPosts.ts의 결정성 규칙과 같은 이유). 이름을 해시해 결정적으로 배정한다 —
// 같은 이름은 항상 같은 색.

export type AvatarPalette = {
  background: string;
  border: string;
};

export const AVATAR_PALETTES: AvatarPalette[] = [
  /** 흰색 — paper */
  { background: '#ffffff', border: '#d5cbb9' },
  /** 노란색 — primary-300 */
  { background: '#f8d172', border: '#e8a93a' },
  /** 연한 노란색 — primary-100 */
  { background: '#fef3d2', border: '#f8d172' },
];

/** 문자열 → 결정적 해시. community의 AUTHOR_NAMES처럼 고정 목록에서 균등 분포가 필요한
 *  경우가 아니면(=실제 로그인 사용자 이름처럼 목록이 없는 경우) 이 해시만으로 충분하다. */
export const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
};

/** 이름 → 팔레트(해시 기반 결정적 배정). */
export const getAvatarPalette = (name: string): AvatarPalette =>
  AVATAR_PALETTES[hashString(name) % AVATAR_PALETTES.length];
