// canonical Auth 세션과 선택 메뉴를 마이페이지 Desktop shell 콘텐츠에 연결한다.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { withdrawAccount } from '@/api/user';
import AuthBoundary from '@/components/auth/AuthBoundary';
import { authRuntime } from '@/components/auth/authRuntime';
import Toast from '@/components/common/Toast';
import BookmarkPanel from '@/components/mypage/BookmarkPanel';
import FollowPanel from '@/components/mypage/FollowPanel';
import LogoutConfirmDialog from '@/components/mypage/LogoutConfirmDialog';
import ProductWishlistPanel from '@/components/mypage/ProductWishlistPanel';
import ProfilePanel from '@/components/mypage/ProfilePanel';
import SettingsPanel from '@/components/mypage/SettingsPanel';
import WithdrawConfirmDialog from '@/components/mypage/WithdrawConfirmDialog';
import { useAuthStore } from '@/store/authStore';
import type { AuthBoundaryStatus } from '@/types/auth-ui';
import type { ProfileInfo } from '@/types/profile';

const MYPAGE_MENU = ['내 정보', '북마크', '찜하기', '팔로우', '설정', '로그아웃'] as const;
export type MypageMenuLabel = (typeof MYPAGE_MENU)[number];
export type ActiveMypageMenu = Extract<
  MypageMenuLabel,
  '내 정보' | '북마크' | '찜하기' | '팔로우' | '설정'
>;

/** `/mypage?menu=` 값 → 열릴 메뉴. 좋아요·북마크 토스트의 '목록 보기'가 이 쿼리로 바로 들어온다.
 *  한글 라벨을 URL에 넣지 않으려고 영문 키를 따로 둔다(인코딩된 한글 쿼리는 읽기 어렵다). */
const MENU_QUERY_TO_LABEL: Record<string, ActiveMypageMenu> = {
  profile: '내 정보',
  bookmark: '북마크',
  wishlist: '찜하기',
  follow: '팔로우',
  settings: '설정',
};

const MYPAGE_LABEL_TO_QUERY: Record<ActiveMypageMenu, string> = {
  '내 정보': 'profile',
  북마크: 'bookmark',
  찜하기: 'wishlist',
  팔로우: 'follow',
  설정: 'settings',
};

export const mypageMenuHref = (menu: ActiveMypageMenu): string =>
  `/mypage?menu=${MYPAGE_LABEL_TO_QUERY[menu]}`;

export const resolveInitialMypageMenu = (menuQuery: string | null | undefined): ActiveMypageMenu =>
  (menuQuery && MENU_QUERY_TO_LABEL[menuQuery]) || '내 정보';

type MypageMenuProps = {
  activeMenu: ActiveMypageMenu;
  followEnabled?: boolean;
  settingsEnabled?: boolean;
  logoutEnabled?: boolean;
  onSelect: (menu: ActiveMypageMenu) => void;
  onLogout?: () => void;
};

const isActiveMypageMenu = (
  label: MypageMenuLabel,
  followEnabled: boolean,
  settingsEnabled: boolean,
): label is ActiveMypageMenu =>
  label === '내 정보' ||
  label === '북마크' ||
  label === '찜하기' ||
  (label === '팔로우' && followEnabled) ||
  (label === '설정' && settingsEnabled);

export const MypageMenu = ({
  activeMenu,
  followEnabled = false,
  settingsEnabled = false,
  logoutEnabled = false,
  onSelect,
  onLogout,
}: MypageMenuProps) => (
  <nav aria-label="마이페이지 메뉴">
    <ul className="space-y-1">
      {MYPAGE_MENU.map((label) => {
        const isContentMenu = isActiveMypageMenu(label, followEnabled, settingsEnabled);
        const isEnabled = isContentMenu || (label === '로그아웃' && logoutEnabled);
        const isActive = label === activeMenu;

        let handleClick: (() => void) | undefined;
        if (isContentMenu) {
          handleClick = () => onSelect(label);
        } else if (label === '로그아웃' && logoutEnabled) {
          handleClick = onLogout;
        }

        return (
          <li key={label}>
            <button
              type="button"
              disabled={!isEnabled}
              onClick={handleClick}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full rounded-xl py-3 pr-3 pl-8 text-left text-[15px] font-semibold ${
                isActive
                  ? 'bg-primary-100 text-primary-800'
                  : isEnabled
                    ? 'cursor-pointer text-neutral-700 transition-colors hover:bg-neutral-100'
                    : 'cursor-default text-neutral-500'
              }`}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);

type MypageContentProps = {
  activeMenu: ActiveMypageMenu;
  profile: ProfileInfo;
  profileKey: string | undefined;
  /** 세션의 userId(문자열)를 숫자로 바꾼 값 — 팔로우 API 경로가 숫자 id를 받는다. */
  userId: number | null;
  onWithdrawClick: () => void;
};

const MypageContent = ({
  activeMenu,
  profile,
  profileKey,
  userId,
  onWithdrawClick,
}: MypageContentProps) => {
  if (activeMenu === '내 정보') {
    return <ProfilePanel key={profileKey} profile={profile} />;
  }

  if (activeMenu === '북마크') {
    return <BookmarkPanel />;
  }

  if (activeMenu === '찜하기') {
    return <ProductWishlistPanel />;
  }

  if (activeMenu === '설정') {
    return <SettingsPanel onWithdrawClick={onWithdrawClick} />;
  }

  // userId는 authenticated 세션에서만 온다 — 이 자리는 AuthBoundary 안이라 항상 채워져 있지만,
  // 숫자로 못 바꾸는 값이면 목록을 못 부르므로 안내로 대신한다.
  if (userId === null) {
    return (
      <p className="py-10 text-center text-[15px] text-neutral-600">
        팔로우 정보를 불러올 수 없어요.
      </p>
    );
  }

  return <FollowPanel userId={userId} />;
};

type MypageShellProps = {
  /** `?menu=` 쿼리 값 — 서버 page.tsx가 읽어 내려준다. useSearchParams()는 이 dev 환경에서
   *  하이드레이션을 깨뜨려 쓰지 않는다(community/page.tsx·product/page.tsx와 같은 이유). */
  initialMenuQuery?: string | null;
};

const MypageShell = ({ initialMenuQuery = null }: MypageShellProps) => {
  const router = useRouter();
  const auth = useAuthStore((state) => state.auth);
  const [activeMenu, setActiveMenu] = useState<ActiveMypageMenu>(() =>
    resolveInitialMypageMenu(initialMenuQuery),
  );
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [withdrawErrorMessage, setWithdrawErrorMessage] = useState<string | null>(null);
  const session = auth.status === 'authenticated' || auth.status === 'error' ? auth.session : null;

  // 메뉴 이동도 브라우저 히스토리에 남긴다. 그래야 북마크 → 상세 → 뒤로가기에서 `/mypage`
  // 기본값(내 정보)이 아니라 직전에 보던 `?menu=bookmark`가 복원된다. popstate는 마이페이지 내부
  // 메뉴 사이의 뒤로/앞으로 가기도 화면 상태와 URL이 어긋나지 않게 맞춘다.
  useEffect(() => {
    const handlePopState = (): void => {
      const menuQuery = new URLSearchParams(window.location.search).get('menu');
      setActiveMenu(resolveInitialMypageMenu(menuQuery));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectMenu = (menu: ActiveMypageMenu): void => {
    if (menu === activeMenu) return;
    setActiveMenu(menu);
    window.history.pushState(null, '', mypageMenuHref(menu));
  };

  let boundaryStatus: AuthBoundaryStatus = 'authenticated';
  if (auth.status === 'unknown' || auth.status === 'loading') {
    boundaryStatus = 'checking';
  } else if (auth.status === 'anonymous') {
    boundaryStatus = 'anonymous';
  } else if (auth.status === 'error' && session === null) {
    boundaryStatus = 'error';
  }

  const parsedUserId = session === null ? Number.NaN : Number(session.userId);
  const numericUserId = Number.isInteger(parsedUserId) ? parsedUserId : null;

  const profile: ProfileInfo | null = session
    ? {
        nickname: session.name,
        email: session.email,
        avatarUrl: session.avatarUrl,
        introduction: '',
        joinedAt: session.joinedAt,
      }
    : null;

  const handleLogout = async (): Promise<void> => {
    await authRuntime.logout();
    if (useAuthStore.getState().auth.status === 'anonymous') {
      setIsLogoutDialogOpen(false);
    }
  };

  // 백엔드는 소프트 삭제만 한다(user는 auth를 모른다, ADR-0007) — 세션 정리는 여기서
  // authRuntime.logout()을 이어 불러 마저 끝내고, 로그인 화면으로 직접 이동한다.
  const handleWithdraw = async (): Promise<void> => {
    try {
      await withdrawAccount();
    } catch {
      setWithdrawErrorMessage('회원 탈퇴에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    await authRuntime.logout();
    setIsWithdrawDialogOpen(false);
    router.push('/login');
  };

  return (
    <div className="bg-paper min-h-full">
      <div className="mx-auto max-w-[1200px] px-[clamp(24px,4.6875vw,48px)] pt-12 pb-24">
        <AuthBoundary
          status={boundaryStatus}
          checkingLabel="내 정보 확인 중"
          checkingDescription="프로필 정보를 불러오고 있습니다."
          anonymousDescription="내 정보를 확인하려면 먼저 로그인해 주세요."
          anonymousAction={
            <Link
              href="/login"
              className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white"
            >
              로그인 화면으로
            </Link>
          }
        >
          {profile ? (
            <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-8">
              <aside className="self-start rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_36px_rgba(63,53,40,0.06)]">
                <p className="px-3 pt-2 pb-5 text-xl font-bold tracking-[-0.03em] text-neutral-900">
                  마이페이지
                </p>
                <MypageMenu
                  activeMenu={activeMenu}
                  followEnabled
                  settingsEnabled
                  logoutEnabled
                  onSelect={handleSelectMenu}
                  onLogout={() => setIsLogoutDialogOpen(true)}
                />
              </aside>

              <section
                aria-label={`${activeMenu} 콘텐츠`}
                className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-10 shadow-[0_12px_36px_rgba(63,53,40,0.06)]"
              >
                <MypageContent
                  activeMenu={activeMenu}
                  profile={profile}
                  profileKey={session?.userId}
                  userId={numericUserId}
                  onWithdrawClick={() => setIsWithdrawDialogOpen(true)}
                />
              </section>
            </div>
          ) : null}
        </AuthBoundary>
      </div>
      {isLogoutDialogOpen ? (
        <LogoutConfirmDialog
          onCancel={() => setIsLogoutDialogOpen(false)}
          onConfirm={handleLogout}
        />
      ) : null}
      {isWithdrawDialogOpen ? (
        <WithdrawConfirmDialog
          onCancel={() => setIsWithdrawDialogOpen(false)}
          onConfirm={handleWithdraw}
        />
      ) : null}
      {withdrawErrorMessage ? (
        <Toast message={withdrawErrorMessage} onDismiss={() => setWithdrawErrorMessage(null)} />
      ) : null}
    </div>
  );
};

export default MypageShell;
