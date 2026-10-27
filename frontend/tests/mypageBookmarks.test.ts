// 마이페이지 북마크 메뉴 활성 계약을 검증한다.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  MypageMenu,
  mypageMenuHref,
  resolveInitialMypageMenu,
  type ActiveMypageMenu,
} from '@/components/mypage/MypageShell';

const renderMenu = (activeMenu: ActiveMypageMenu) =>
  renderToStaticMarkup(
    createElement(MypageMenu, {
      activeMenu,
      onSelect: () => undefined,
    }),
  );

describe('mypage menu contract', () => {
  it('메뉴별 URL을 만들어 상세 화면 뒤로가기에 직전 메뉴를 남긴다', () => {
    expect(mypageMenuHref('내 정보')).toBe('/mypage?menu=profile');
    expect(mypageMenuHref('북마크')).toBe('/mypage?menu=bookmark');
    expect(mypageMenuHref('찜하기')).toBe('/mypage?menu=wishlist');
    expect(resolveInitialMypageMenu('bookmark')).toBe('북마크');
    expect(resolveInitialMypageMenu('settings')).toBe('설정');
  });

  it.each(['내 정보', '북마크', '찜하기'] as const)('%s만 현재 메뉴로 표시한다', (activeMenu) => {
    const html = renderMenu(activeMenu);

    expect(html).toContain('aria-label="마이페이지 메뉴"');
    expect(html).toMatch(new RegExp(`<button[^>]*aria-current="page"[^>]*>${activeMenu}</button>`));
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });

  it('내 정보와 북마크와 찜하기는 활성화하고 나머지 메뉴는 비활성화한다', () => {
    const html = renderMenu('내 정보');

    for (const label of ['내 정보', '북마크', '찜하기']) {
      expect(html).toMatch(new RegExp(`<button(?![^>]*disabled)[^>]*>${label}</button>`));
    }
    for (const label of ['팔로우', '설정', '로그아웃']) {
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`));
    }
  });
});
