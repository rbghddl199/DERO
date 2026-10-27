// 로그인 복귀 목적지를 same-origin 상대 경로로 제한하고 재귀 Auth 경로를 차단한다.

const SAFE_ORIGIN = 'https://return-to.invalid';
// /onboarding도 Auth 흐름의 일부다 — 여기로 되돌아오는 returnTo를 허용하면 온보딩 완료 후
// 자기 자신으로 replace하는 왕복이 생긴다(2026-08-01, DERO-337).
const RECURSIVE_AUTH_PATHS = ['/auth/callback', '/login', '/signup', '/onboarding'] as const;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function decodePathname(pathname: string): string | null {
  let decoded = pathname;
  try {
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    }
    return decoded;
  } catch {
    return null;
  }
}

function isRecursiveAuthPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+/g, '/').toLowerCase();
  return RECURSIVE_AUTH_PATHS.some(
    (authPath) =>
      normalized === authPath ||
      normalized.startsWith(`${authPath}/`) ||
      normalized.startsWith(`${authPath};`),
  );
}

export function sanitizeReturnTo(candidate: string | null | undefined): string {
  if (typeof candidate !== 'string') {
    return '/';
  }

  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(trimmed)
  ) {
    return '/';
  }

  try {
    const url = new URL(trimmed, SAFE_ORIGIN);
    const decodedPathname = decodePathname(url.pathname);
    if (
      url.origin !== SAFE_ORIGIN ||
      decodedPathname === null ||
      decodedPathname.startsWith('//') ||
      decodedPathname.includes('\\') ||
      isRecursiveAuthPath(decodedPathname)
    ) {
      return '/';
    }

    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return '/';
  }
}
