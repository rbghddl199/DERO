// 고정 OAuth Route를 실제 actualAdapter 경로로 검증한다 — Google·Kakao 서버만 네트워크
// 레벨(page.route)로 흉내내고, 그 앞뒤(리다이렉트·콜백·상태 전이)는 전부 실제 코드로 돈다.
// 스텁 헬퍼는 helpers/auth.ts가 소유한다 — 시뮬레이터 스펙들도 같은 것을 쓴다.

import { expect, test } from '@playwright/test';

import {
  collectConsoleErrors,
  EXPECTED_401_CONSOLE_NOISE,
  stubAuthenticatedSession,
  stubAuthorizeRedirect,
  stubLoginRoundTrip,
  stubLogoutRoundTrip,
  stubPlacementList,
  stubRefresh,
} from './helpers/auth';

const forbiddenAuthCopy = /password|비밀번호|이메일 인증|인증번호|비밀번호 재설정/i;

// data-intent는 패널(section)뿐 아니라 provider 버튼에도 붙는다(OAuthProviderButton.tsx) —
// 태그로 좁히지 않으면 strict mode 위반이다.
const panelSelector = (intent: 'login' | 'signup'): string => `section[data-intent="${intent}"]`;

test('login과 signup은 같은 Google·Kakao presentation contract만 표시한다', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page, [EXPECTED_401_CONSOLE_NOISE]);
  await stubRefresh(page, 'anonymous');

  for (const [path, intent] of [
    ['/login', 'login'],
    ['/signup', 'signup'],
  ] as const) {
    await page.goto(path);
    const panel = page.locator(panelSelector(intent));
    await expect(panel).toBeVisible();
    await expect(panel.locator('button')).toHaveCount(2);
    await expect(panel.locator('[data-provider="google"]')).toBeVisible();
    await expect(panel.locator('[data-provider="kakao"]')).toBeVisible();
    await expect(panel).not.toContainText(forbiddenAuthCopy);
  }

  expect(consoleErrors).toEqual([]);
});

test('실제 로그인 흐름이 callback processing 뒤 safe returnTo를 한 번 소비한다', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page, [EXPECTED_401_CONSOLE_NOISE]);
  await stubLoginRoundTrip(page, 'GOOGLE');
  await stubPlacementList(page);

  await page.goto('/login?returnTo=%2Fcraft');
  await page.locator('[data-provider="google"]').click();

  await expect(page).toHaveURL(/\/craft$/);
  // 프로필 버튼은 "프로필" 라벨이 아니라 아바타 + "OOO님 / 환영합니다" 2줄이다(TopNavbar.tsx) —
  // 세션 닉네임이 실렸는지로 로그인 표시를 확인한다.
  await expect(page.locator('header a[href="/mypage"]')).toContainText('E2E 사용자');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem('dero.auth.returnTo'))).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test('OAuth 실패(동의 거부 등)는 실패 화면으로 표시한다', async ({ page }) => {
  await stubRefresh(page, 'anonymous');
  await stubAuthorizeRedirect(page, 'OAUTH_FAILED');

  await page.goto('/login');
  await page.locator('[data-provider="google"]').click();

  await expect(page.locator('[data-status="failure"]')).toContainText(
    '소셜 로그인에 실패했습니다. 다시 시도해 주세요.',
  );
});

test('session revoked는 anonymous Navbar와 실패 화면을 표시한다', async ({ page }) => {
  await stubAuthorizeRedirect(page);
  await stubRefresh(page, 'revoked');

  await page.goto('/login');
  await page.locator('[data-provider="kakao"]').click();

  await expect(page.locator('[data-status="failure"]')).toContainText('세션이 종료되었습니다');
  // TopNavbar에는 상태 attribute가 없다 — 익명 표시는 "로그인 링크가 있고 프로필 링크가 없음"이다.
  await expect(page.locator('header a[href="/login"]')).toBeVisible();
  await expect(page.locator('header a[href="/mypage"]')).toHaveCount(0);
});

for (const [label, returnTo] of [
  ['외부', 'https://evil.example/path'],
  ['protocol-relative', '//evil.example/path'],
  ['재귀', '/login?returnTo=/craft'],
] as const) {
  test(`${label} returnTo를 /로 차단한다`, async ({ page }) => {
    await stubLoginRoundTrip(page, 'GOOGLE');

    await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    await page.locator('[data-provider="google"]').click();
    await expect(page).toHaveURL('http://localhost:3000/');
  });
}

test('이미 authenticated이면 안전한 returnTo로 replace한다', async ({ page }) => {
  await stubAuthenticatedSession(page, 'GOOGLE');

  await page.goto('/login?returnTo=%2Fproduct');
  await expect(page).toHaveURL(/\/product$/);
  await expect(page.locator('header a[href="/mypage"]')).toBeVisible();
});

test('logout 뒤 anonymous Navbar를 표시하고 기존 Navigation 순서를 보존한다', async ({ page }) => {
  await stubLogoutRoundTrip(page, 'KAKAO');

  await page.goto('/?returnTo=%2F');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await page.getByRole('button', { name: '로그아웃' }).click();

  await expect(page.locator('header a[href="/login"]')).toBeVisible();
  await expect(page.locator('header a[href="/mypage"]')).toHaveCount(0);
  const navLinks = page.locator('header nav a');
  await expect(navLinks.nth(0)).toHaveAttribute('href', '/');
  await expect(navLinks.nth(1)).toHaveAttribute('href', '/product');
  await expect(navLinks.nth(2)).toHaveAttribute('href', '/community');
  await expect(navLinks.nth(3)).toHaveAttribute('href', '/collection');
  // 작업실은 비로그인이면 링크가 로그인 게이트로 바뀐다(TopNavbar.tsx) — 자리는 그대로 마지막이다.
  await expect(navLinks.nth(4)).toHaveAttribute('href', '/login?returnTo=%2Fcraft');
});

// D14(시뮬레이터 진입부터 로그인 필수) — 예전엔 /simulator가 legacy public route라 로그인 없이
// 열렸고 이 스펙이 그 동작을 고정하고 있었다. 결정 8로 AuthGate가 붙으면서 그건 위반이 됐다.
test('비로그인 /simulator 진입은 /login?returnTo로 보낸다', async ({ page }) => {
  await stubRefresh(page, 'anonymous');

  await page.goto('/simulator', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveURL('http://localhost:3000/login?returnTo=%2Fsimulator');
  await expect(page.locator(panelSelector('login'))).toBeVisible();
});
