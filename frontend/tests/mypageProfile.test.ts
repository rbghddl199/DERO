// 마이페이지 조회·수정·취소 상태와 수정 폼의 비활성 계약을 검증한다.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProfileEditForm, ProfileView } from '@/components/mypage/ProfilePanel';
import { createProfileEditorState, profileEditorReducer, type ProfileInfo } from '@/types/profile';

const PROFILE: ProfileInfo = {
  nickname: '데로',
  email: 'dero@example.com',
  avatarUrl: null,
  introduction: '',
  joinedAt: '2026-07-01T00:00:00+09:00',
};

describe('mypage profile state', () => {
  it('조회에서 수정으로 전환하고 취소하면 draft를 폐기한다', () => {
    const viewing = createProfileEditorState(PROFILE);
    const editing = profileEditorReducer(viewing, { type: 'start-editing' });
    const changed = profileEditorReducer(editing, {
      type: 'change-nickname',
      value: '수정 중인 닉네임',
    });
    const cancelled = profileEditorReducer(changed, { type: 'cancel-editing' });

    expect(viewing.mode).toBe('view');
    expect(editing).toMatchObject({
      mode: 'edit',
      draft: { nickname: '데로', introduction: '' },
    });
    expect(changed).toMatchObject({
      mode: 'edit',
      draft: { nickname: '수정 중인 닉네임', introduction: '' },
    });
    expect(cancelled).toEqual({
      mode: 'view',
      profile: PROFILE,
      draft: null,
    });
  });
});

describe('mypage profile UI', () => {
  it('조회 화면의 가입일을 프로필 이미지 아래에 표시하고 이메일 라벨을 사용한다', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileView, {
        profile: PROFILE,
        onEdit: () => undefined,
      }),
    );

    expect(html).toContain('내 정보');
    expect(html).toContain('2026년 7월 1일');
    const avatarIndex = html.indexOf('role="img"');
    const joinedDateIndex = html.indexOf('2026년 7월 1일');
    const detailsIndex = html.indexOf('divide-y divide-neutral-200');
    expect(avatarIndex).toBeGreaterThan(-1);
    expect(joinedDateIndex).toBeGreaterThan(avatarIndex);
    expect(detailsIndex).toBeGreaterThan(joinedDateIndex);
    expect(html.slice(detailsIndex)).not.toContain('가입일');
    expect(html).toMatch(
      /<dl class="[^"]*text-\[13px\][^"]*leading-5[^"]*whitespace-nowrap[^"]*"><dt[^>]*>가입일<\/dt><dd class="flex items-center"><span[^>]*text-\[13px\][^>]*leading-5/,
    );
    expect(html).toContain('>이메일</dt>');
    expect(html).not.toContain('OAuth 이메일');
    expect(html).not.toContain('프로필 이미지 변경');
    expect(html).toMatch(/class="[^"]*min-w-0[^"]*break-words[^"]*"/);
    expect(html).toContain('gap-10 pt-5');
    expect(html.match(/max-\[935px\]:grid-cols-1/g)).toHaveLength(3);
    expect(html.match(/grid-cols-\[120px_minmax\(0,1fr\)\]/g)).toHaveLength(3);
  });

  it('수정 화면의 이메일은 readonly이고 저장은 disabled이며 이미지 변경은 파일 입력이다', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileEditForm, {
        profile: PROFILE,
        draft: { nickname: PROFILE.nickname, introduction: PROFILE.introduction },
        onNicknameChange: () => undefined,
        onIntroductionChange: () => undefined,
        onCancel: () => undefined,
      }),
    );

    expect(html).toContain('정보 수정');
    expect(html).toContain('>이메일</label>');
    expect(html).not.toContain('OAuth 이메일');
    expect(html).toMatch(/id="profile-email"[^>]*readOnly=""/);
    // 프로필 이미지 변경은 DERO-344에서 실제 2단계 presign 업로드로 열렸다 — 종전 disabled
    // 버튼 대신 파일 input과 그걸 가리키는 label이다(허용 MIME 4종은 백엔드 계약과 같다).
    expect(html).toMatch(/<label[^>]*for="profile-image-input"[^>]*>프로필 이미지 변경<\/label>/);
    expect(html).toMatch(
      /<input[^>]*id="profile-image-input"[^>]*accept="image\/png,image\/jpeg,image\/webp,image\/gif"/,
    );
    expect(html).not.toContain('disabled=""&gt;프로필 이미지 변경');
    expect(html).toMatch(/disabled=""[^>]*>저장하기<\/button>/);
    expect(html).toContain('저장 기능은 준비 중입니다.');
    expect(html).not.toContain('border-t');
    expect(html).toContain('max-[935px]:flex-col');
    expect(html).toContain('max-[935px]:items-stretch');
    expect(html).toContain('max-[935px]:self-end');
    expect(html).not.toContain('justify-between pt-6');
    expect(html).toContain('class="min-w-0 space-y-6"');
    expect(html).toContain('gap-10 pt-5');
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2);
  });
});
