'use client';
// 팔로워·팔로잉 목록 — `GET /users/{id}/followers`·`/following`(비로그인도 200, 커서 페이지네이션).
//
// 커서는 불투명 문자열이라 열어 보지 않고 그대로 다음 요청에 싣는다. 탭마다 따로 쌓아 두므로 탭을
// 오가도 이미 불러온 페이지를 다시 받지 않는다. 사용자 검색 입력은 두지 않았다 — 서버에 검색
// 엔드포인트가 없고, 이미 불러온 페이지만 거르는 필터는 "없는 사람"을 없다고 잘못 말한다.
//
// **부모는 `key={userId}`로 마운트해야 한다** — 이 컴포넌트는 userId가 바뀌어도 쌓아 둔 페이지를
// 스스로 비우지 않는다.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listFollowers, listFollowing } from '@/api/user';
import PersonAvatar from '@/components/common/PersonAvatar';
import type { FollowUserResponse } from '@/types/user';

export type FollowTab = 'followers' | 'following';

export const FOLLOW_PAGE_SIZE = 20;

export const FOLLOW_TAB_LABEL: Record<FollowTab, string> = {
  following: '팔로잉',
  followers: '팔로워',
};

type TabState = {
  users: FollowUserResponse[];
  nextCursor: string | null;
  hasNext: boolean;
  totalCount: number | null;
  status: 'idle' | 'loaded' | 'loading-more' | 'error';
};

const EMPTY_TAB: TabState = {
  users: [],
  nextCursor: null,
  hasNext: false,
  totalCount: null,
  status: 'idle',
};

const fetchPage = (userId: number, tab: FollowTab, cursor: string | null) =>
  tab === 'followers'
    ? listFollowers(userId, cursor, FOLLOW_PAGE_SIZE)
    : listFollowing(userId, cursor, FOLLOW_PAGE_SIZE);

type FollowUserRowProps = {
  user: FollowUserResponse;
};

export const FollowUserRow = ({ user }: FollowUserRowProps) => (
  <li className="flex flex-wrap items-center justify-between gap-6 border-b border-neutral-200 py-5 last:border-b-0">
    <Link
      href={`/users/${user.id}`}
      className="flex min-w-0 flex-[1_1_240px] items-center gap-4 hover:opacity-80"
    >
      <PersonAvatar
        name={user.nickname}
        avatarUrl={user.profileImageUrl}
        size={56}
        decorative={false}
      />
      <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-neutral-900">
        {user.nickname}
      </p>
    </Link>
  </li>
);

type Props = {
  userId: number;
  initialTab?: FollowTab;
  /** 프로필 응답이 준 수 — 있으면 탭 배지에 쓴다(목록을 다 넘기지 않아도 총원을 보여줄 수 있다). */
  followerCount?: number;
  followingCount?: number;
  /** 제목 표기 — 마이페이지는 '팔로우 관리', 남의 프로필은 숨긴다. */
  heading?: string;
};

const FollowListPanel = ({
  userId,
  initialTab = 'following',
  followerCount,
  followingCount,
  heading,
}: Props) => {
  const [tab, setTab] = useState<FollowTab>(initialTab);
  const [byTab, setByTab] = useState<Record<FollowTab, TabState>>({
    followers: EMPTY_TAB,
    following: EMPTY_TAB,
  });

  const current = byTab[tab];

  // 두 탭의 첫 페이지를 함께 받아 비활성 탭의 총원도 처음부터 표시한다. 종전에는 현재 탭만 조회해
  // 팔로워 숫자가 그 탭을 한 번 눌러야 나타났다. 부모가 key={userId}로 재마운트하므로 userId당 1회다.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (['following', 'followers'] as const).map(async (candidate) => ({
        candidate,
        page: await fetchPage(userId, candidate, null),
      })),
    )
      .then((results) => {
        if (cancelled) return;
        setByTab((prev) => {
          const next = { ...prev };
          for (const { candidate, page } of results) {
            next[candidate] = {
              users: page.content,
              nextCursor: page.nextCursor,
              hasNext: page.hasNext,
              totalCount: page.totalCount,
              status: 'loaded',
            };
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setByTab((prev) => ({
          followers: { ...prev.followers, status: 'error' },
          following: { ...prev.following, status: 'error' },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleLoadMore = async (): Promise<void> => {
    const state = byTab[tab];
    if (!state.hasNext || state.status === 'loading-more') return;

    setByTab((prev) => ({ ...prev, [tab]: { ...prev[tab], status: 'loading-more' } }));
    try {
      const page = await fetchPage(userId, tab, state.nextCursor);
      setByTab((prev) => ({
        ...prev,
        [tab]: {
          users: [...prev[tab].users, ...page.content],
          nextCursor: page.nextCursor,
          hasNext: page.hasNext,
          totalCount: page.totalCount,
          status: 'loaded',
        },
      }));
    } catch {
      setByTab((prev) => ({ ...prev, [tab]: { ...prev[tab], status: 'error' } }));
    }
  };

  const tabTotal: Record<FollowTab, number | null> = {
    followers: followerCount ?? byTab.followers.totalCount,
    following: followingCount ?? byTab.following.totalCount,
  };

  return (
    <section aria-labelledby="follow-panel-title">
      {heading ? (
        <div className="border-b border-neutral-200 pb-5">
          <p className="text-primary-700 mb-2 max-w-full min-w-0 text-sm font-semibold tracking-[0.14em] break-all">
            FOLLOW
          </p>
          <h2
            id="follow-panel-title"
            className="max-w-full min-w-0 text-[34px] font-bold tracking-[-0.04em] break-words text-neutral-900"
          >
            {heading}
          </h2>
        </div>
      ) : (
        <h2 id="follow-panel-title" className="sr-only">
          팔로워·팔로잉 목록
        </h2>
      )}

      <div
        role="tablist"
        aria-label="팔로우 목록"
        className="flex min-w-0 flex-wrap border-b border-neutral-200"
      >
        {(['following', 'followers'] as const).map((candidate) => {
          const isActive = tab === candidate;
          const total = tabTotal[candidate];

          return (
            <button
              key={candidate}
              id={`follow-${candidate}-tab`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="follow-user-list"
              onClick={() => setTab(candidate)}
              className={`flex w-fit max-w-full min-w-0 flex-none cursor-pointer flex-wrap items-center gap-2 border-b-2 px-5 py-4 text-sm font-semibold ${
                isActive
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <span className="min-w-0 break-words">{FOLLOW_TAB_LABEL[candidate]}</span>
              {total !== null && (
                <span
                  aria-label={`${FOLLOW_TAB_LABEL[candidate]} 전체 ${total}명`}
                  className="rounded-full bg-[#FEF3D2] px-2 py-0.5 text-xs text-neutral-600"
                >
                  {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id="follow-user-list"
        role="tabpanel"
        aria-labelledby={`follow-${tab}-tab`}
        className="pt-2"
      >
        {current.status === 'idle' ? (
          <p className="py-10 text-center text-[15px] text-neutral-600">목록을 불러오는 중…</p>
        ) : current.users.length > 0 ? (
          <>
            <ul>
              {current.users.map((user) => (
                <FollowUserRow key={user.id} user={user} />
              ))}
            </ul>
            {current.hasNext && (
              <div className="pt-5 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={current.status === 'loading-more'}
                  className="cursor-pointer rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {current.status === 'loading-more' ? '불러오는 중…' : '더 보기'}
                </button>
              </div>
            )}
            {current.status === 'error' && (
              <p role="alert" className="text-danger-700 pt-4 text-center text-[13px]">
                목록을 더 불러오지 못했어요.
              </p>
            )}
          </>
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-neutral-600">
              {current.status === 'error'
                ? '목록을 불러오지 못했어요.'
                : `${FOLLOW_TAB_LABEL[tab]} 사용자가 아직 없어요.`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default FollowListPanel;
