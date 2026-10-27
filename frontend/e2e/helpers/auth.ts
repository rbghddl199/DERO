// 인증 스텁 헬퍼 — 스펙들이 공유한다.
//
// ADR-0016 결정 5: Playwright에는 백엔드를 붙이지 않는다. 그래서 프론트가 실제로 부르는 인증
// 엔드포인트(/auth/refresh·/users/me·/auth/logout)와 인가 리다이렉트만 네트워크 레벨(page.route)로
// 흉내내고, 그 앞뒤(상태 전이·returnTo·진입 관문)는 전부 실제 코드로 돈다.
//
// import.meta 금지 — Next의 package.json에 "type": "module"이 없어 스펙이 CJS로 로드된다.

import type { Page } from '@playwright/test';

/** 백엔드 enum 그대로(대문자) — UserMeResponse.java의 provider 필드. */
export type StubbedProvider = 'GOOGLE' | 'KAKAO';

/** 익명 상태의 POST /auth/refresh는 401로 답하는 게 정상 계약이다(AUTH_REFRESH_INVALID) —
 *  크롬은 그걸 무조건 콘솔 에러로 찍는다. 앱이 낸 오류가 아니므로 console-clean 판정에서 뺀다.
 *  실제 백엔드에 붙여도 똑같이 찍히는 줄이다. */
export const EXPECTED_401_CONSOLE_NOISE = /Failed to load resource: .*401 \(Unauthorized\)/;

export function collectConsoleErrors(page: Page, ignore: RegExp[] = []): string[] {
  const errors: string[] = [];
  const keep = (text: string): boolean => !ignore.some((pattern) => pattern.test(text));
  page.on('console', (message) => {
    if (message.type() === 'error' && keep(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (keep(error.message)) {
      errors.push(error.message);
    }
  });
  return errors;
}

export function problemJson(
  status: number,
  code: string,
  detail: string,
  instance: string,
): string {
  return JSON.stringify({ title: code, status, detail, instance, code, errors: null });
}

// OAuth2LoginSuccessHandler/OAuth2LoginFailureHandler가 실제로 하는 일과 같은 목적지로 보낸다 —
// 인가 리다이렉트만 흉내내고, /auth/callback 이후는 실제 actualAdapter가 처리한다.
export async function stubAuthorizeRedirect(page: Page, errorCode?: string): Promise<void> {
  await page.route('**/api/oauth2/authorization/**', (route) => {
    const query = errorCode ? `?error=${errorCode}` : '';
    route.fulfill({
      status: 302,
      headers: { location: `http://localhost:3000/auth/callback${query}` },
    });
  });
}

function refreshSuccessBody(): string {
  return JSON.stringify({ accessToken: 'e2e-access-token', expiresInSeconds: 1800 });
}

// AUTH_REFRESH_INVALID = "리프레시 쿠키가 없거나 만료" — actualAdapter.currentSession()이 이 코드
// 하나만 익명 신호로 받는다(다른 401은 진짜 오류로 친다).
function refreshInvalidBody(): string {
  return problemJson(
    401,
    'AUTH_REFRESH_INVALID',
    '유효하지 않은 리프레시 토큰입니다. 다시 로그인해 주세요.',
    '/api/v1/auth/refresh',
  );
}

export type RefreshOutcome = 'success' | 'revoked' | 'anonymous';

/** delayMs — 응답을 늦춰 AuthGate의 'checking' 구간을 관측 가능하게 만들 때만 쓴다. */
export async function stubRefresh(page: Page, outcome: RefreshOutcome, delayMs = 0): Promise<void> {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (outcome === 'revoked') {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: problemJson(
          401,
          'AUTH_SESSION_REVOKED',
          '세션이 만료되었습니다. 다시 로그인해 주세요.',
          '/api/v1/auth/refresh',
        ),
      });
      return;
    }
    if (outcome === 'anonymous') {
      route.fulfill({ status: 401, contentType: 'application/json', body: refreshInvalidBody() });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: refreshSuccessBody() });
  });
}

export async function stubUsersMe(page: Page, provider: StubbedProvider): Promise<void> {
  await page.route('**/api/v1/users/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        email: `${provider.toLowerCase()}.user@dero.invalid`,
        nickname: 'E2E 사용자',
        profileImageUrl: null,
        provider,
        role: 'USER',
      }),
    });
  });
}

// GET /placements — /craft의 목록 로더(CraftDeskCollectionLoader)가 부른다. 안 막으면 백엔드가
// 없는 이 환경에서 ERR_CONNECTION_REFUSED가 콘솔 에러로 남아 console-clean 단언을 깨뜨린다.
export async function stubPlacementList(page: Page): Promise<void> {
  await page.route('**/api/v1/placements?**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [], nextCursor: null, hasNext: false }),
    });
  });
}

/** 이미 로그인된 세션으로 페이지를 띄운다 — 진입 관문(AuthGate, 결정 8)이 있는 라우트를 여는 전제.
 *  AuthBootstrap이 부팅 때 /auth/refresh → /users/me 순으로 부르므로 둘 다 막아야 authenticated가 된다. */
export async function stubAuthenticatedSession(
  page: Page,
  provider: StubbedProvider = 'GOOGLE',
  refreshDelayMs = 0,
): Promise<void> {
  await stubRefresh(page, 'success', refreshDelayMs);
  await stubUsersMe(page, provider);
}

/** 로그아웃 왕복 한 벌 — POST /auth/logout이 불린 뒤부터 refresh가 익명으로 답한다.
 *
 *  TopNavbar가 로그아웃 직후 window.location.reload()를 부르기 때문에(2026-07-31) 리로드 후
 *  AuthBootstrap이 refresh를 다시 친다. 스텁이 계속 성공을 돌려주면 방금 로그아웃한 사용자가
 *  다시 로그인 상태로 돌아와 화면 단언이 성립하지 않는다. 실제 백엔드는 revokeAll + 쿠키 삭제로
 *  그 다음 refresh를 무효화하므로 스텁도 같은 상태 전이를 흉내낸다. */
export async function stubLogoutRoundTrip(
  page: Page,
  provider: StubbedProvider = 'GOOGLE',
): Promise<void> {
  let loggedOut = false;
  await page.route('**/api/v1/auth/refresh', (route) => {
    if (loggedOut) {
      route.fulfill({ status: 401, contentType: 'application/json', body: refreshInvalidBody() });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: refreshSuccessBody() });
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    loggedOut = true;
    route.fulfill({ status: 204 });
  });
  await stubUsersMe(page, provider);
}

/** 로그인 왕복 한 벌 — 첫 세션 확인만 익명으로 답하고 그 뒤로는 성공을 돌려준다.
 *
 *  refresh를 처음부터 성공으로 답하면 AuthBootstrap이 /login 화면이 그려지기도 전에 세션을 세워버려
 *  AuthEntryRoute가 곧장 returnTo로 replace한다 — OAuth 버튼이 DOM에 뜨지 않아 클릭 대기가
 *  타임아웃난다(실측 60s). 실제 사용자는 "쿠키 없음 → 로그인 → 쿠키 생김" 순서를 밟으므로
 *  스텁도 그 순서를 따른다. */
export async function stubLoginRoundTrip(
  page: Page,
  provider: StubbedProvider = 'GOOGLE',
  errorCode?: string,
): Promise<void> {
  let refreshCalls = 0;
  await page.route('**/api/v1/auth/refresh', (route) => {
    refreshCalls += 1;
    if (refreshCalls === 1) {
      route.fulfill({ status: 401, contentType: 'application/json', body: refreshInvalidBody() });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: refreshSuccessBody() });
  });
  await stubUsersMe(page, provider);
  await stubAuthorizeRedirect(page, errorCode);
}
