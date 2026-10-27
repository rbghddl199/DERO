// 마이페이지 목록에서 연 상세가 브라우저의 오래된 히스토리 대신 정확한 메뉴로 돌아가게 한다.

export type ReturnToQueryValue = string | string[] | undefined;
export type MypageReturnMenu = 'bookmark' | 'wishlist';

const firstValue = (value: ReturnToQueryValue): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** 외부 URL·다른 메뉴·불필요한 쿼리는 버리고 허용된 마이페이지 메뉴 경로만 반환한다. */
export const safeMypageReturnTo = (
  value: ReturnToQueryValue,
  expectedMenu: MypageReturnMenu,
): string | null => {
  const rawValue = firstValue(value);
  if (rawValue === undefined) return null;

  try {
    const parsed = new URL(rawValue, 'http://localhost');
    if (parsed.origin !== 'http://localhost' || parsed.pathname !== '/mypage') return null;
    if (parsed.searchParams.get('menu') !== expectedMenu) return null;
    return `/mypage?menu=${expectedMenu}`;
  } catch {
    return null;
  }
};
