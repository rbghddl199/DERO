// 마이페이지 설정 하위 화면과 로그아웃 확인·중복 실행 방지 계약을 검증한다.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  LogoutConfirmDialogContent,
  runLogoutRequest,
} from '@/components/mypage/LogoutConfirmDialog';
import { MypageMenu } from '@/components/mypage/MypageShell';
import SettingsPanel, {
  SETTINGS_SECTIONS,
  SettingsSectionContent,
} from '@/components/mypage/SettingsPanel';
import { WithdrawConfirmDialogContent } from '@/components/mypage/WithdrawConfirmDialog';

describe('mypage settings menu', () => {
  it('설정과 로그아웃을 활성화하고 설정만 현재 콘텐츠로 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(MypageMenu, {
        activeMenu: '설정',
        followEnabled: true,
        settingsEnabled: true,
        logoutEnabled: true,
        onSelect: () => undefined,
        onLogout: () => undefined,
      }),
    );

    expect(html).toMatch(/<button[^>]*aria-current="page"[^>]*>설정<\/button>/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>설정<\/button>/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>로그아웃<\/button>/);
    expect(html).not.toMatch(/aria-current="page"[^>]*>로그아웃<\/button>/);
  });

  it('하위 메뉴 4종과 기본 계정 설정을 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsPanel, { onWithdrawClick: () => undefined }),
    );

    expect(html).toContain('aria-label="설정 하위 메뉴"');
    for (const section of SETTINGS_SECTIONS) {
      expect(html).toContain(`>${section}</button>`);
    }
    expect(html).toMatch(/aria-current="page"[^>]*>계정 설정<\/button>/);
    expect(html).toContain('모든 데이터가 삭제되며 복구할 수 없습니다.');
    const withdrawalDescriptionClass = html.match(
      /<p class="([^"]*)">모든 데이터가 삭제되며 복구할 수 없습니다.<\/p>/,
    )?.[1];
    expect(withdrawalDescriptionClass).toContain('mt-3');
    expect(withdrawalDescriptionClass).toContain('mb-3');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('회원 탈퇴 기능은 준비 중입니다.');
    const withdrawalButtonClass = html.match(
      /<button type="button" class="([^"]*)">회원 탈퇴<\/button>/,
    )?.[1];
    expect(withdrawalButtonClass).toBeDefined();
    expect(withdrawalButtonClass).toContain('bg-red-600');
    expect(html).toMatch(/class="[^"]*flex-wrap[^"]*gap-8[^"]*"/);
    expect(html).toMatch(
      /<nav aria-label="설정 하위 메뉴" class="[^"]*w-44[^"]*max-w-full[^"]*min-w-0[^"]*shrink[^"]*"/,
    );
    expect(html).toContain('class="w-full max-w-full min-w-0 space-y-1"');
    expect(html.match(/<li class="w-full max-w-full min-w-0">/g)).toHaveLength(4);
    expect(html).toMatch(
      /<button[^>]*class="[^"]*w-full[^"]*max-w-full[^"]*min-w-0[^"]*break-words[^"]*whitespace-normal[^"]*"/,
    );
    expect(withdrawalButtonClass).not.toContain('mt-6');
  });

  it.each([
    ['알림 설정', '알림 설정은 준비 중입니다.'],
    [
      '보안 설정',
      '소셜 로그인 계정의 비밀번호와 보안 설정은 연결된 소셜 로그인 제공자에서 관리해 주세요.',
    ],
    ['기타 설정', '기타 설정은 준비 중입니다.'],
  ] as const)('%s 하위 화면의 확정 안내만 표시한다', (section, message) => {
    const html = renderToStaticMarkup(createElement(SettingsSectionContent, { section }));

    expect(html).toContain(message);
    expect(html).not.toMatch(/type="checkbox"|type="password"|저장하기/);
  });

  it('설정 구현은 브라우저 저장소·Cookie·API를 사용하지 않는다', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/mypage/SettingsPanel.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(
      /localStorage|sessionStorage|document\.cookie|fetch\(|axios|authRuntime/,
    );
  });

  it.each([
    ['mypage/ProfilePanel.tsx', 'PROFILE', 2],
    ['mypage/BookmarkPanel.tsx', 'BOOKMARK', 1],
    ['mypage/ProductWishlistPanel.tsx', 'WISHLIST', 1],
    // 팔로우 목록은 남의 프로필 화면과 공용이라 components/user로 옮겼다(DERO-344) —
    // mypage/FollowPanel.tsx는 그걸 감싸기만 하므로 eyebrow 마크업도 거기에 있다.
    ['user/FollowListPanel.tsx', 'FOLLOW', 1],
    ['mypage/SettingsPanel.tsx', 'SETTINGS', 1],
  ] as const)('%s의 %s eyebrow가 좁은 부모 안에서 줄바꿈된다', (file, label, count) => {
    const source = readFileSync(resolve(process.cwd(), `src/components/${file}`), 'utf8');
    const matches = source.match(
      new RegExp(`<p className="[^"]*max-w-full[^"]*min-w-0[^"]*break-all[^"]*">\\s*${label}`, 'g'),
    );

    expect(matches).toHaveLength(count);
  });
});

describe('mypage logout confirmation', () => {
  const renderDialog = (isLoggingOut: boolean) =>
    renderToStaticMarkup(
      createElement(LogoutConfirmDialogContent, {
        isLoggingOut,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

  it('접근 가능한 alertdialog와 확정 문구·버튼을 표시한다', () => {
    const html = renderDialog(false);

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="logout-confirm-title"');
    expect(html).toContain('aria-describedby="logout-confirm-description"');
    expect(html).toContain('로그아웃하시겠습니까?');
    expect(html).toContain('저장하지 않은 변경 사항은 사라집니다.');
    expect(html).toMatch(/<button[^>]*>취소<\/button>/);
    expect(html).toMatch(/<button[^>]*>로그아웃<\/button>/);
  });

  it('처리 중 두 버튼을 비활성화하고 처리 문구를 표시한다', () => {
    const html = renderDialog(true);

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('로그아웃 중');
  });

  it('동시에 확인해도 로그아웃 요청을 한 번만 실행하고 완료 후 잠금을 해제한다', async () => {
    let finishLogout: () => void = () => undefined;
    const logout = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLogout = resolve;
        }),
    );
    const lock = { current: false };

    const first = runLogoutRequest(lock, logout);
    const duplicate = runLogoutRequest(lock, logout);

    expect(logout).toHaveBeenCalledOnce();
    expect(lock.current).toBe(true);
    await expect(duplicate).resolves.toBe(false);

    finishLogout();
    await expect(first).resolves.toBe(true);
    expect(lock.current).toBe(false);
  });

  it('로그아웃은 canonical authRuntime.logout만 호출하고 임의 redirect를 추가하지 않는다', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/mypage/MypageShell.tsx'),
      'utf8',
    );
    // 탈퇴(handleWithdraw)는 성공 뒤 명시적으로 /login으로 이동한다 — 이 규칙은 로그아웃
    // 핸들러에만 적용된다. 파일 전체가 아니라 handleLogout 함수 본문만 잘라서 검사한다.
    const handleLogoutBody = source.match(/const handleLogout = async[\s\S]*?\n  };/)?.[0];

    expect(source).toContain('await authRuntime.logout();');
    expect(handleLogoutBody).toBeDefined();
    expect(handleLogoutBody).not.toMatch(
      /router\.(push|replace)|location\.(assign|replace)|setAnonymous/,
    );
  });

  it('회원 탈퇴는 성공 뒤 authRuntime.logout을 이어 부르고 로그인 화면으로 이동한다', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/mypage/MypageShell.tsx'),
      'utf8',
    );
    const handleWithdrawBody = source.match(/const handleWithdraw = async[\s\S]*?\n  };/)?.[0];

    expect(handleWithdrawBody).toBeDefined();
    expect(handleWithdrawBody).toContain('await withdrawAccount();');
    expect(handleWithdrawBody).toContain('await authRuntime.logout();');
    expect(handleWithdrawBody).toContain("router.push('/login');");
  });
});

describe('mypage withdrawal confirmation', () => {
  const renderDialog = (isWithdrawing: boolean) =>
    renderToStaticMarkup(
      createElement(WithdrawConfirmDialogContent, {
        isWithdrawing,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

  it('접근 가능한 alertdialog와 필수 확정 문구·버튼을 표시한다', () => {
    const html = renderDialog(false);

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="withdraw-confirm-title"');
    expect(html).toContain('aria-describedby="withdraw-confirm-description"');
    expect(html).toContain('탈퇴 시에는 모든 정보가 사라지게 됩니다. 정말 탈퇴하시겠어요?');
    expect(html).toMatch(/<button[^>]*>아니요<\/button>/);
    expect(html).toMatch(/<button[^>]*>예<\/button>/);
  });

  it('처리 중 두 버튼을 비활성화하고 처리 문구를 표시한다', () => {
    const html = renderDialog(true);

    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('탈퇴 처리 중');
  });
});
