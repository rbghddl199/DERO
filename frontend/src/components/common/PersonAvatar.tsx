// 전역 공용 사람 아바타 — 프로필 사진이 있으면 그 사진을, 없으면 범용 사람 실루엣 아이콘을
// 이름으로 결정한 배경색(흰색/노란색/연한 노란색 3종, @/utils/avatarPalette) 위에 그린다.
// community/AuthorAvatar.tsx가 쓰던 아이콘·팔레트를 로그인 프로필(TopNavbar·mypage 등)에도
// 재사용하기 위해 공용으로 옮겼다(2026-08-01 — 이전엔 사진 미지정 시 닉네임 첫 글자를
// 보여줬는데, 커뮤니티 작성자와 같은 아이콘으로 통일해달라는 요청).
// 닉네임 첫 글자 대신 아이콘을 쓰는 이유: 이름이 같아도 사람마다 다르게 보이는 이니셜보다,
// "사진 미지정"이라는 상태 자체가 항상 같은 모양으로 드러나는 편이 더 명확하다.

import { getAvatarPalette } from '@/utils/avatarPalette';

type Props = {
  name: string;
  avatarUrl: string | null;
  /** 지름(px) */
  size: number;
  className?: string;
  /** 곁에 이름이 이미 텍스트로 보이면 true(장식용, 기본값) — 아바타만 단독으로 프로필 사진을
   *  대표하는 자리(예: 마이페이지)라면 false로 role="img"·aria-label을 준다. */
  decorative?: boolean;
};

const PersonAvatar = ({ name, avatarUrl, size, className = '', decorative = true }: Props) => {
  const a11yProps = decorative
    ? { 'aria-hidden': true }
    : { role: 'img' as const, 'aria-label': `${name} 프로필 이미지` };

  if (avatarUrl) {
    return (
      <span
        {...a11yProps}
        className={`inline-block shrink-0 rounded-full bg-cover bg-center select-none ${className}`}
        style={{ width: size, height: size, backgroundImage: `url("${avatarUrl}")` }}
      />
    );
  }

  const { background, border } = getAvatarPalette(name);
  const iconSize = Math.round(size * 0.56);

  return (
    <span
      {...a11yProps}
      className={`text-ink inline-flex shrink-0 items-center justify-center rounded-full select-none ${className}`}
      style={{
        width: size,
        height: size,
        background,
        // 흰 배경 아바타가 흰 카드 위에서 사라지지 않도록 테두리는 세 색 모두에 준다.
        border: `1px solid ${border}`,
      }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7v1H4v-1Z" />
      </svg>
    </span>
  );
};

export default PersonAvatar;
