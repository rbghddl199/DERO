'use client';
// 팔로우/언팔로우 토글 — PUT/DELETE /users/{id}/follow (멱등 204, 본문 없음).
//
// 204라 응답에 새 팔로워 수가 없다. 클라이언트가 ±1로 계산하면 연타나 다른 탭의 조작과 어긋나므로
// 성공 후 `GET /users/{id}`로 서버 값을 다시 확정한다(interaction.ts 좋아요와 같은 관례).
// **상태의 정본은 언제나 서버다** — localStorage에 팔로우 여부를 남기지 않는다.

import { useState } from 'react';
import { followUser, getUserProfile, unfollowUser } from '@/api/user';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import type { UserProfileResponse } from '@/types/user';

type Props = {
  userId: number;
  isFollowing: boolean;
  nickname: string;
  /** 재확정한 프로필을 그대로 올려 준다 — 팔로워 수 표시가 버튼과 같은 값을 보게 하려고. */
  onReconciled: (profile: UserProfileResponse) => void;
};

const FollowButton = ({ userId, isFollowing, nickname, onReconciled }: Props) => {
  const requireAuth = useRequireAuth();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async (): Promise<void> => {
    if (!requireAuth()) return;

    setIsBusy(true);
    setError(null);
    try {
      if (isFollowing) {
        await unfollowUser(userId);
      } else {
        await followUser(userId);
      }
      onReconciled(await getUserProfile(userId));
    } catch {
      setError('요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        aria-pressed={isFollowing}
        aria-label={`${nickname} ${isFollowing ? '팔로우 해제' : '팔로우'}`}
        data-testid="follow-toggle"
        className={`min-w-24 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          isFollowing
            ? 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
            : 'bg-neutral-900 text-white hover:bg-neutral-700'
        }`}
      >
        {isFollowing ? '팔로잉' : '팔로우'}
      </button>
      {error && (
        <p role="alert" className="text-danger-700 text-[13px] leading-5">
          {error}
        </p>
      )}
    </div>
  );
};

export default FollowButton;
