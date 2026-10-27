// 커뮤니티 작성자 아바타 — 프로필 사진 미지정 시 쓰는 기본 아이콘.
// 흰 배경 + 얇은 테두리로 통일한다(2026-07-30 사용자 확인 — 이름별 색 배정 제거).
// 아이콘은 이니셜 글자 대신 범용 사람 실루엣 — 실제 프로필 사진을 아직 안 올린 사람 전부에게 같은
// 모양이 나오는 게(사진 미지정을 사진 미지정처럼 보이게) 자연스럽다.

type Props = {
  name: string;
  /** 지름(px) — 목록 카드 24, 상세 32 */
  size: number;
};

const AuthorAvatar = ({ size }: Props) => {
  const iconSize = Math.round(size * 0.56);

  return (
    <span
      aria-hidden="true"
      className="text-ink border-ash/40 bg-paper inline-flex shrink-0 items-center justify-center rounded-full border select-none"
      style={{ width: size, height: size }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7v1H4v-1Z" />
      </svg>
    </span>
  );
};

export default AuthorAvatar;
