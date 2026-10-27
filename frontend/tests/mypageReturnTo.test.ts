// 마이페이지 목록에서 연 상세 화면의 안전한 복귀 경로를 검증한다.

import { describe, expect, it } from 'vitest';
import { safeMypageReturnTo } from '@/utils/mypageReturnTo';

describe('safeMypageReturnTo', () => {
  it('찜하기와 북마크의 정확한 메뉴 경로만 허용한다', () => {
    expect(safeMypageReturnTo('/mypage?menu=wishlist', 'wishlist')).toBe('/mypage?menu=wishlist');
    expect(safeMypageReturnTo('/mypage?menu=bookmark', 'bookmark')).toBe('/mypage?menu=bookmark');
  });

  it('다른 메뉴·외부 URL·잘못된 값을 거부한다', () => {
    expect(safeMypageReturnTo('/mypage?menu=bookmark', 'wishlist')).toBeNull();
    expect(safeMypageReturnTo('https://evil.example/mypage?menu=wishlist', 'wishlist')).toBeNull();
    expect(safeMypageReturnTo('/product', 'wishlist')).toBeNull();
    expect(safeMypageReturnTo(undefined, 'wishlist')).toBeNull();
  });
});
