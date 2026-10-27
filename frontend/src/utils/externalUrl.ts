// 서버가 준 외부 링크 문자열을 화면에 걸기 전에 스킴을 검사한다 (rules/nextjs/security.md).

/** http(s)만 통과시킨다 — javascript:·data: 등은 null. */
export const safeExternalUrl = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
};
