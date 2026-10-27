// 진입 게이트(AuthGate, 결정 8 / D14) 자체를 검증한다 — /simulator·/craft·/craft/new는 로그인이
// 있어야 열린다. 관문이 아직 안 열렸다는 유일한 DOM 신호는 data-auth-gate이고, 통과하면 그 노드가
// 통째로 사라진다(AuthGate.tsx).

import { expect, test } from '@playwright/test';

import {
  stubAuthenticatedSession,
  stubLoginRoundTrip,
  stubPlacementList,
  stubRefresh,
} from './helpers/auth';

const GATED_ROUTES = ['/simulator', '/craft', '/craft/new'] as const;

for (const route of GATED_ROUTES) {
  test(`비로그인 ${route} 진입은 returnTo를 보존한 채 /login으로 보낸다`, async ({ page }) => {
    await stubRefresh(page, 'anonymous');

    await page.goto(route, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(
      `http://localhost:3000/login?returnTo=${encodeURIComponent(route)}`,
    );
    await expect(page.locator('section[data-intent="login"]')).toBeVisible();
  });
}

test('게이트에 막힌 뒤 로그인하면 원래 목적지로 돌아온다', async ({ page }) => {
  await stubLoginRoundTrip(page, 'GOOGLE');
  await stubPlacementList(page);

  // 1) 비로그인으로 관문에 막혀 /login으로 밀려난다.
  await page.goto('/craft', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL('http://localhost:3000/login?returnTo=%2Fcraft');

  // 2) 로그인하면 관문이 열리고 원래 목적지로 복귀한다 — returnTo는 한 번만 소비된다.
  await page.locator('[data-provider="google"]').click();
  await expect(page).toHaveURL(/\/craft$/);
  await expect(page.locator('[data-auth-gate]')).toHaveCount(0);
  expect(await page.evaluate(() => window.sessionStorage.getItem('dero.auth.returnTo'))).toBeNull();
});

test('세션 확인 중에는 checking을 그리고 비로그인 화면을 깜빡이지 않는다', async ({ page }) => {
  // 세션 확인을 늦춰 checking 구간을 관측 가능하게 만든다 — 이 구간을 anonymous로 뭉개면
  // 이미 로그인한 사용자에게 "로그인이 필요합니다"가 한 번 번쩍이고 로그인 화면으로 튕긴다.
  await stubAuthenticatedSession(page, 'GOOGLE', 1_500);
  await stubPlacementList(page);

  await page.goto('/craft', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('[data-auth-gate="checking"]')).toBeVisible();
  await expect(page.locator('[data-auth-gate="anonymous"]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/craft$/);

  // 확인이 끝나면 관문 노드 자체가 사라지고 본문이 뜬다.
  await expect(page.locator('[data-auth-gate]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/craft$/);
});
