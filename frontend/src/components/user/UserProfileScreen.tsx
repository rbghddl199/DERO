'use client';
// 남의 프로필 화면 — `GET /users/{id}`(비로그인도 200) + 그 사람의 공개 배치 목록
// (`GET /placements?owner=<id>&publishStatus=PUBLIC`) + 팔로워·팔로잉 목록.
//
// 자기 자신이면 팔로우 버튼을 안 그린다 — 서버가 422 `USER_SELF_FOLLOW_NOT_ALLOWED`로 막는 동작이라
// 버튼을 보여 주는 것 자체가 거짓말이다. 대신 마이페이지로 보낸다.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listPlacements } from '@/api/placement';
import { ApiError } from '@/api/client';
import { getUserProfile } from '@/api/user';
import PersonAvatar from '@/components/common/PersonAvatar';
import RemoteImage from '@/components/common/RemoteImage';
import FollowButton from '@/components/user/FollowButton';
import FollowListPanel from '@/components/user/FollowListPanel';
import { useAuthStore } from '@/store/authStore';
import type { PlacementSummaryResponse } from '@/types/placement';
import type { UserProfileResponse } from '@/types/user';

const PLACEMENT_PAGE_SIZE = 12;

type ProfileState =
  | { status: 'loading' }
  | { status: 'loaded'; profile: UserProfileResponse }
  | { status: 'not-found' }
  | { status: 'error' };

type PlacementsState = {
  items: PlacementSummaryResponse[];
  nextCursor: string | null;
  hasNext: boolean;
  status: 'idle' | 'loaded' | 'loading-more' | 'error';
};

const EMPTY_PLACEMENTS: PlacementsState = {
  items: [],
  nextCursor: null,
  hasNext: false,
  status: 'idle',
};

type PlacementCardProps = {
  placement: PlacementSummaryResponse;
};

const PlacementCard = ({ placement }: PlacementCardProps) => {
  // thumbnailUrl은 아직 캡처 전이면 null이고 404도 있을 수 있어 로드 실패를 감지해 폴백한다
  // (RemoteImage가 감지한다 — CollectionUploadForm의 픽커와 같은 패턴).
  const noPreview = (
    <div className="text-ash flex h-full w-full items-center justify-center text-[12px]">
      미리보기 없음
    </div>
  );

  return (
    <li>
      <Link
        href={`/collection/${placement.id}`}
        className="border-ash/20 block overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
      >
        <div className="bg-fog aspect-[4/3] w-full">
          {placement.thumbnailUrl ? (
            <RemoteImage
              src={placement.thumbnailUrl}
              alt={placement.title}
              width={400}
              height={300}
              sizes="(min-width: 640px) 33vw, 50vw"
              className="h-full w-full object-cover"
              fallback={noPreview}
            />
          ) : (
            noPreview
          )}
        </div>
        <div className="p-3">
          <p className="text-ink truncate text-[15px] font-medium">{placement.title}</p>
          <p className="text-ash mt-0.5 text-[13px]">좋아요 {placement.likeCount}</p>
        </div>
      </Link>
    </li>
  );
};

type Props = {
  userId: number;
};

const UserProfileScreen = ({ userId }: Props) => {
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );
  const [profileState, setProfileState] = useState<ProfileState>({ status: 'loading' });
  const [placements, setPlacements] = useState<PlacementsState>(EMPTY_PLACEMENTS);

  const isSelf = myUserId !== null && Number(myUserId) === userId;

  useEffect(() => {
    let cancelled = false;
    getUserProfile(userId)
      .then((profile) => {
        if (!cancelled) setProfileState({ status: 'loaded', profile });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const isNotFound = error instanceof ApiError && error.status === 404;
        setProfileState({ status: isNotFound ? 'not-found' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 공개 배치만 본다 — 목록 가시성은 서버가 정하지만(비로그인은 PUBLIC만) 로그인 상태에서 남의
  // 프로필을 열면 owner 필터만으로는 내 비공개까지 섞일 여지가 없도록 publishStatus를 명시한다.
  useEffect(() => {
    if (placements.status !== 'idle') return;

    let cancelled = false;
    listPlacements({ owner: userId, publishStatus: 'PUBLIC', size: PLACEMENT_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setPlacements({
          items: page.content,
          nextCursor: page.nextCursor,
          hasNext: page.hasNext,
          status: 'loaded',
        });
      })
      .catch(() => {
        if (!cancelled) setPlacements((prev) => ({ ...prev, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, placements.status]);

  const handleLoadMorePlacements = async (): Promise<void> => {
    if (!placements.hasNext || placements.status === 'loading-more') return;

    setPlacements((prev) => ({ ...prev, status: 'loading-more' }));
    try {
      const page = await listPlacements({
        owner: userId,
        publishStatus: 'PUBLIC',
        cursor: placements.nextCursor,
        size: PLACEMENT_PAGE_SIZE,
      });
      setPlacements((prev) => ({
        items: [...prev.items, ...page.content],
        nextCursor: page.nextCursor,
        hasNext: page.hasNext,
        status: 'loaded',
      }));
    } catch {
      setPlacements((prev) => ({ ...prev, status: 'error' }));
    }
  };

  if (profileState.status === 'loading') {
    return <p className="py-20 text-center text-[15px] text-neutral-600">프로필을 불러오는 중…</p>;
  }

  if (profileState.status !== 'loaded') {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-ink text-[18px] font-medium">
          {profileState.status === 'not-found'
            ? '존재하지 않는 사용자예요'
            : '프로필을 불러오지 못했어요'}
        </p>
        <Link
          href="/collection"
          className="bg-highlight text-ink hover:bg-primary-300 mt-2 rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors"
        >
          컬렉션로 가기
        </Link>
      </div>
    );
  }

  const { profile } = profileState;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-center gap-6 border-b border-neutral-200 pb-8">
        <PersonAvatar
          name={profile.nickname}
          avatarUrl={profile.profileImageUrl}
          size={96}
          decorative={false}
          className="border border-neutral-200 shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[28px] font-bold tracking-[-0.03em] text-neutral-900">
            {profile.nickname}
          </h1>
          <p className="mt-1 text-[15px] text-neutral-600">
            팔로워 <b className="text-neutral-900">{profile.followerCount}</b> · 팔로잉{' '}
            <b className="text-neutral-900">{profile.followingCount}</b>
          </p>
        </div>

        {isSelf ? (
          <Link
            href="/mypage"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            내 정보 관리
          </Link>
        ) : (
          <FollowButton
            userId={userId}
            isFollowing={profile.following}
            nickname={profile.nickname}
            onReconciled={(next) => setProfileState({ status: 'loaded', profile: next })}
          />
        )}
      </header>

      <section aria-labelledby="user-placements-title">
        <h2
          id="user-placements-title"
          className="mb-4 text-[20px] font-bold tracking-[-0.03em] text-neutral-900"
        >
          공개한 데스크테리어
        </h2>

        {placements.status === 'idle' ? (
          <p className="py-10 text-center text-[15px] text-neutral-600">목록을 불러오는 중…</p>
        ) : placements.items.length > 0 ? (
          <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {placements.items.map((placement) => (
                <PlacementCard key={placement.id} placement={placement} />
              ))}
            </ul>
            {placements.hasNext && (
              <div className="pt-5 text-center">
                <button
                  type="button"
                  onClick={handleLoadMorePlacements}
                  disabled={placements.status === 'loading-more'}
                  className="cursor-pointer rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {placements.status === 'loading-more' ? '불러오는 중…' : '더 보기'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 text-center">
            <p className="text-[15px] font-medium text-neutral-600">
              {placements.status === 'error'
                ? '배치 목록을 불러오지 못했어요.'
                : '아직 공개한 데스크테리어가 없어요.'}
            </p>
          </div>
        )}
      </section>

      <FollowListPanel
        key={userId}
        userId={userId}
        followerCount={profile.followerCount}
        followingCount={profile.followingCount}
      />
    </div>
  );
};

export default UserProfileScreen;
