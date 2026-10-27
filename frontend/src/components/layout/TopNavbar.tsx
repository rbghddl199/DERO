'use client';
// 전역 상단 내비게이션 — 홈/제품/커뮤니티/작업실 링크 + canonical Auth 상태에 따른
// 로그인/프로필/로그아웃 표시. /simulator에서는 몰입형 캔버스를 가리지 않도록 숨김.
// sm 미만에서는 링크 메뉴·벨·공지 아이콘이 모두 햄버거 드롭다운 패널로 접힌다(2026-08-10 사용자 요청).
// 제품/커뮤니티 소메뉴는 더 이상 여기(호버 드롭다운)에 없다 — 각 목록 페이지 안의
// 아이콘 pill 내비(ProductGrid/CommunityGallery)로 옮겼다.

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { authRuntime } from '@/components/auth/authRuntime';
import PersonAvatar from '@/components/common/PersonAvatar';
import DeroLogo from '@/assets/dero_logo.svg';
import UploadNotificationBell from '@/components/layout/UploadNotificationBell';
import { useAuthStore } from '@/store/authStore';

const NAV_LINKS = [
  { href: '/', label: '홈' },
  { href: '/product', label: '제품' },
  { href: '/community', label: '커뮤니티' },
  { href: '/collection', label: '컬렉션' },
  { href: '/desk-feed', label: '데스크피드' },
  { href: '/craft', label: '작업실' },
];

/** 로그인해야 열리는 라우트 — 비로그인이면 /login?returnTo=로 먼저 보낸다(AuthGate와 같은 게이트). */
const AUTH_REQUIRED_HREFS: readonly string[] = ['/craft'];

const TopNavbar = () => {
  const pathname = usePathname();
  const auth = useAuthStore((state) => state.auth);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // sm 미만 햄버거 드롭다운 — 데스크톱 nav가 sm 미만에서 통째로 숨어 이동 수단이 없던 문제의
  // 최소 해결. fixed 헤더는 라우팅 후에도 남으므로 패널 안 링크 클릭 시 직접 닫는다.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (pathname?.startsWith('/simulator')) {
    return null;
  }

  // 세션 확인 중(unknown/loading)에도 로딩 스켈레톤 없이 곧장 로그인/회원가입을 보여준다 — 확인이
  // 끝나면 이 자리에서 프로필로 교체된다. 스켈레톤이 세션 조회가 끝날 때까지(네트워크 상황에 따라
  // 수 초) 버튼 자체를 가려 "로그인 버튼이 안 보인다"는 제보로 이어졌다(2026-08-02 사용자 확인).
  const authenticatedSession =
    auth.status === 'authenticated' || (auth.status === 'error' && auth.session !== null)
      ? auth.session
      : null;

  // 비로그인 상태로 로그인 필수 라우트를 누르면 로그인 화면(returnTo=)으로 먼저 보낸다 —
  // 홈 히어로 '작업실 바로가기'(HomeWorkspaceLink.tsx)와 같은 게이트(2026-08-02 사용자 확인).
  // 데스크톱 nav와 모바일 패널이 공유한다.
  const resolveHref = (href: string): string =>
    AUTH_REQUIRED_HREFS.includes(href) && authenticatedSession === null
      ? `/login?returnTo=${encodeURIComponent(href)}`
      : href;

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    await authRuntime.logout();
    // 로그아웃 직후 클라이언트 상태만 anonymous로 바꾸면 화면이 그 자리에서 즉시(새로고침 없이)
    // 바뀐다 — 실제 로그아웃처럼 한 번 새로고침되는 느낌을 주기 위해 전체 페이지를 리로드한다
    // (2026-07-31 사용자 확인). 리로드가 곧 마운트를 지우므로 setIsLoggingOut(false)는 불필요.
    window.location.reload();
  };

  return (
    // fixed — 스크롤 컨테이너나 긴 페이지의 레이아웃 변화와 무관하게 뷰포트 상단에 고정한다. z-40은 본문 위로 올라오게 하려는 것(본문이 DOM상 뒤라
    // z-index 없이는 덮인다). 모달·토스트는 body 포털의 z-50이라 여전히 이 위에 뜬다.
    // border-b — 상단바와 본문 사이 경계선(본문 배경이 흰색 계열이라 선이 없으면 구분이 안 된다).
    <>
      <header className="bg-paper font-swiss border-ash/40 fixed inset-x-0 top-0 z-40 border-b tracking-[-0.03em]">
        {/* 우측 트랙을 좌측보다 넓게(1fr:1.5fr) — 메뉴가 6개로 늘며 오른쪽 묶음과 닿아서, 정중앙
            대신 살짝 왼쪽에 두어 오른쪽 공백을 확보한다(2026-08-10 사용자 요청). */}
        <div className="mx-auto grid h-16 max-w-[1200px] grid-cols-[1fr_auto_1.5fr] items-center px-6 lg:px-[48px]">
          <Link
            href="/"
            data-scroll-top="true"
            className="flex w-fit items-center justify-self-start"
          >
            <Image src={DeroLogo} alt="DERO" className="h-6 w-auto" priority />
          </Link>

          <nav aria-label="주요 메뉴" className="hidden items-center gap-6 sm:flex">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === '/' ? pathname === '/' : pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={resolveHref(link.href)}
                  data-scroll-top="true"
                  className={`group block border-b pb-1 text-[16px] transition-colors ${
                    isActive
                      ? 'border-primary-700 text-primary-700 font-bold'
                      : 'hover:border-ink text-ink border-transparent font-semibold'
                  }`}
                >
                  {/* Meeko 템플릿 내비 참고 — 라벨을 두 벌 겹쳐두고 클리핑 박스 안에서 위로 밀어 올려 교체되는 것처럼 보이게 한다 */}
                  <span className="relative block h-[1.2em] overflow-hidden">
                    <span className="block transition-transform duration-300 ease-out group-hover:-translate-y-[1.2em]">
                      <span className="block leading-[1.2]">{link.label}</span>
                      <span className="text-primary-700 block leading-[1.2]">{link.label}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* 겉 컨테이너는 항상 flex — sm 미만에선 햄버거 버튼만 남고, 프로필·로그아웃·벨·공지는
            모두 햄버거 패널로 접힌다(2026-08-10 사용자 요청).
            justify-end는 그대로라 로그아웃은 계속 오른쪽 끝에 고정된다. */}
          {/* col-start-3 — sm 미만에서 가운데 nav가 display:none이 되면 grid 자동 배치가 이 묶음을
              2번째(auto) 칸으로 당겨 햄버거가 중앙에 떠 보였다. 칸을 명시해 항상 오른쪽 트랙에 둔다. */}
          <div className="col-start-3 flex min-h-10 items-center justify-end gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              {authenticatedSession !== null ? (
                <>
                  {/* 프로필 버튼 — 아바타(좌) + "OOO님 / 환영합니다"(우) 2줄(2026-08-01 사용자 요청,
                  기존엔 "프로필" 라벨 텍스트뿐이었다). 아바타는 공용 PersonAvatar(2026-08-01
                  갱신) — 사진 미지정이면 닉네임 첫 글자 대신 커뮤니티 작성자와 같은 사람 실루엣
                  아이콘 + 이름 해시 기반 3색 팔레트를 쓴다.
                  버튼이 커진 만큼은 이 컨테이너(justify-end)가 왼쪽으로만 밀어낸다 — 로그아웃
                  버튼은 DOM상 뒤에 있어 오른쪽 끝에 그대로 고정된다(레이아웃 변경 없이 justify-end의
                  기본 동작만으로 "로그아웃 위치 유지 + 왼쪽으로 확장" 요구사항이 충족된다). */}
                  <Link
                    href="/mypage"
                    data-scroll-top="true"
                    className="text-ink hover:bg-fog flex items-center gap-2 rounded-lg py-1.5 pr-4 pl-1.5 transition-colors"
                  >
                    <PersonAvatar
                      name={authenticatedSession.name}
                      avatarUrl={authenticatedSession.avatarUrl}
                      size={36}
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-[14px] font-semibold whitespace-nowrap">
                        {authenticatedSession.name}님
                      </span>
                      <span className="text-[12px] whitespace-nowrap text-neutral-500">
                        환영합니다
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    disabled={isLoggingOut}
                    onClick={() => {
                      void handleLogout();
                    }}
                    className="text-ink hover:bg-primary-100 rounded-lg px-4 py-2 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoggingOut ? '로그아웃 중' : '로그아웃'}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  data-scroll-top="true"
                  className="text-ink hover:bg-fog rounded-lg px-4 py-2 text-[15px] font-medium transition-colors"
                >
                  로그인
                </Link>
              )}
            </div>
            {/* 세로 구분선 — 텍스트 묶음(프로필·로그아웃/로그인)과 아이콘 묶음(벨·공지)을 가른다.
              sm 미만에선 텍스트 묶음이 숨으므로 선도 같이 숨긴다. */}
            <div aria-hidden="true" className="bg-ash/40 hidden h-5 w-px sm:block" />
            {/* 아이콘 묶음 — 벨은 공지 바로 왼쪽, 공지가 오른쪽 끝(둘 다 사용자 요청 2026-08-10).
              같은 40px 버튼 두 개를 gap-1로 붙여 한 덩어리로 읽히게 한다. sm 미만에선 둘 다 숨고
              햄버거 패널 안 항목이 대신한다(2026-08-10 사용자 요청).
              공지 아이콘 색을 활성 상태에 따라 바꿔야 해서 인라인 SVG + currentColor를 쓴다
              (벨 파일 상단 주석의 next/image 한계 그대로). */}
            <div className="flex items-center gap-1">
              <div className="hidden sm:block">
                <UploadNotificationBell />
              </div>
              <Link
                href="/notice"
                data-scroll-top="true"
                aria-label="공지사항"
                className={`hover:bg-fog hidden size-10 shrink-0 items-center justify-center rounded-lg transition-colors sm:flex ${
                  pathname?.startsWith('/notice') ? 'text-primary-700' : 'text-ink'
                }`}
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3 11 18-5v12L3 14v-3z" />
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
              </Link>
              {/* 햄버거 — sm 미만 전용. 데스크톱 nav·로그인 묶음이 숨는 자리를 드롭다운 패널로 대신한다. */}
              <button
                type="button"
                aria-label={isMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen((open) => !open)}
                className="text-ink hover:bg-fog flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors sm:hidden"
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {isMenuOpen ? (
                    <>
                      <path d="M6 6l12 12" />
                      <path d="M18 6 6 18" />
                    </>
                  ) : (
                    <>
                      <path d="M4 6h16" />
                      <path d="M4 12h16" />
                      <path d="M4 18h16" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
        {/* 모바일 드롭다운 패널 — fixed 헤더 안에 두어 함께 고정된다. sm 이상에선 항상 숨김이라
            열린 채 뷰포트를 키워도 데스크톱 레이아웃을 해치지 않는다. */}
        {isMenuOpen && (
          <nav aria-label="모바일 메뉴" className="border-ash/40 border-t px-6 pt-2 pb-4 sm:hidden">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === '/' ? pathname === '/' : pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={resolveHref(link.href)}
                  data-scroll-top="true"
                  onClick={() => setIsMenuOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 text-[16px] transition-colors ${
                    isActive ? 'text-primary-700 font-bold' : 'text-ink hover:bg-fog font-semibold'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {/* 공지·알림 — sm 미만에선 상단바 아이콘이 숨으므로 패널 항목이 유일한 진입점.
                알림 벨은 팝업이 right-0 앵커라 행 오른쪽 끝에 두어야 팝업이 화면 안으로 열린다. */}
            <Link
              href="/notice"
              data-scroll-top="true"
              onClick={() => setIsMenuOpen(false)}
              className={`block rounded-lg px-3 py-2.5 text-[16px] transition-colors ${
                pathname?.startsWith('/notice')
                  ? 'text-primary-700 font-bold'
                  : 'text-ink hover:bg-fog font-semibold'
              }`}
            >
              공지사항
            </Link>
            {authenticatedSession !== null && (
              <div className="flex items-center justify-between rounded-lg px-3 py-1">
                <span className="text-ink text-[16px] font-semibold">알림</span>
                <UploadNotificationBell onNavigate={() => setIsMenuOpen(false)} />
              </div>
            )}
            <div aria-hidden="true" className="bg-ash/40 my-2 h-px" />
            {authenticatedSession !== null ? (
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/mypage"
                  data-scroll-top="true"
                  onClick={() => setIsMenuOpen(false)}
                  className="text-ink hover:bg-fog flex min-w-0 items-center gap-2 rounded-lg py-1.5 pr-4 pl-1.5 transition-colors"
                >
                  <PersonAvatar
                    name={authenticatedSession.name}
                    avatarUrl={authenticatedSession.avatarUrl}
                    size={36}
                  />
                  <span className="truncate text-[14px] font-semibold">
                    {authenticatedSession.name}님
                  </span>
                </Link>
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="text-ink hover:bg-primary-100 shrink-0 rounded-lg px-4 py-2 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoggingOut ? '로그아웃 중' : '로그아웃'}
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                data-scroll-top="true"
                onClick={() => setIsMenuOpen(false)}
                className="text-ink hover:bg-fog block rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors"
              >
                로그인
              </Link>
            )}
          </nav>
        )}
      </header>
      <div aria-hidden="true" className="h-16 shrink-0" />
    </>
  );
};

export default TopNavbar;
