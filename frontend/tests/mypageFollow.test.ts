// 마이페이지 팔로우 메뉴와 실 API 팔로우 목록(탭·행·프로필 링크) 계약을 검증한다.
// 목업(followData.ts)은 DERO-344에서 삭제됐다 — 목록은 커서 페이지네이션 실 API가 채운다.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MypageMenu } from '@/components/mypage/MypageShell';
import { FOLLOW_TAB_LABEL, FollowUserRow } from '@/components/user/FollowListPanel';

describe('mypage follow menu', () => {
  it('마이페이지 메뉴 6종을 모두 활성화한다', () => {
    const html = renderToStaticMarkup(
      createElement(MypageMenu, {
        activeMenu: '팔로우',
        followEnabled: true,
        settingsEnabled: true,
        logoutEnabled: true,
        onSelect: () => undefined,
        onLogout: () => undefined,
      }),
    );

    for (const label of ['내 정보', '북마크', '찜하기', '팔로우', '설정', '로그아웃']) {
      expect(html).toMatch(new RegExp(`<button(?![^>]*disabled)[^>]*>${label}</button>`));
    }
    expect(html).toMatch(/<button[^>]*aria-current="page"[^>]*>팔로우<\/button>/);
  });
});

describe('follow list row', () => {
  it('행 전체가 그 사용자의 프로필로 가는 링크다', () => {
    const html = renderToStaticMarkup(
      createElement(FollowUserRow, {
        user: { id: 42, nickname: 'DeskMate', profileImageUrl: null },
      }),
    );

    expect(html).toContain('href="/users/42"');
    expect(html).toContain('DeskMate');
    // 사진이 없으면 공용 PersonAvatar의 사람 실루엣 경로로 렌더된다(role="img", 56px).
    expect(html).toMatch(/role="img"[^>]*style="width:56px;height:56px/);
    expect(html).toContain(
      'class="flex flex-wrap items-center justify-between gap-6 border-b border-neutral-200 py-5 last:border-b-0"',
    );
  });

  it('프로필 사진이 있으면 그 URL을 아바타 배경으로 쓴다', () => {
    const html = renderToStaticMarkup(
      createElement(FollowUserRow, {
        user: { id: 7, nickname: '모노노트', profileImageUrl: 'https://cdn.example/a.png' },
      }),
    );

    expect(html).toContain('https://cdn.example/a.png');
  });
});

describe('follow tab labels', () => {
  it('탭 라벨은 팔로잉·팔로워 두 종뿐이다', () => {
    expect(FOLLOW_TAB_LABEL).toEqual({ following: '팔로잉', followers: '팔로워' });
  });
});
