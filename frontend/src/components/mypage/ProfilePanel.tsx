// 마이페이지 프로필 조회 화면과 저장 없는 메모리 draft 수정 화면을 제공한다.

'use client';

import { useReducer, useState } from 'react';

import ImageQuotaNotice from '@/components/common/ImageQuotaNotice';
import PersonAvatar from '@/components/common/PersonAvatar';
import ProfileImageUploader from '@/components/mypage/ProfileImageUploader';
import { useImageQuota } from '@/hooks/useImageQuota';
import type { ProfileDraft, ProfileInfo } from '@/types/profile';
import { createProfileEditorState, profileEditorReducer } from '@/types/profile';
import { formatDate } from '@/utils/formatDate';

type ProfileAvatarProps = {
  avatarUrl: string | null;
  nickname: string;
  editable?: boolean;
  onAvatarUploaded?: (profileImageUrl: string | null) => void;
};

/** 사진 미지정이면 닉네임 첫 글자 대신 공용 PersonAvatar(커뮤니티 작성자와 같은 사람 실루엣
 *  아이콘 + 이름 해시 기반 3색 팔레트)를 쓴다(2026-08-01 갱신). */
const ProfileAvatar = ({
  avatarUrl,
  nickname,
  editable = false,
  onAvatarUploaded,
}: ProfileAvatarProps) => (
  <div className="flex flex-col items-center gap-3">
    <PersonAvatar
      name={nickname}
      avatarUrl={avatarUrl}
      size={112}
      decorative={false}
      className="border border-neutral-200 shadow-sm"
    />
    {editable ? <ProfileImageUploader onUploaded={onAvatarUploaded ?? (() => undefined)} /> : null}
  </div>
);

type JoinedDateProps = {
  joinedAt: string;
};

const JoinedDate = ({ joinedAt }: JoinedDateProps) => (
  <span className="inline-flex items-center text-[13px] leading-5 whitespace-nowrap text-neutral-700">
    {formatDate(joinedAt)}
  </span>
);

/** 오늘 쓴 이미지 장수·상한·리셋 시각 — 남은 횟수를 모르면 아껴 쓸 수가 없다(REQ-IMG-03). */
const ProfileImageQuota = () => {
  const { quota, isLoading } = useImageQuota();

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="mb-1 text-sm font-semibold text-neutral-700">AI 이미지 사용량</p>
      <ImageQuotaNotice quota={quota} isLoading={isLoading} />
    </div>
  );
};

type ProfileViewProps = {
  profile: ProfileInfo;
  onEdit: () => void;
};

export const ProfileView = ({ profile, onEdit }: ProfileViewProps) => (
  <section aria-labelledby="profile-view-title">
    <div className="flex items-center justify-between border-b border-neutral-200 pb-5">
      <div className="max-w-full min-w-0">
        <p className="text-primary-700 mb-2 max-w-full min-w-0 text-sm font-semibold tracking-[0.14em] break-all">
          PROFILE
        </p>
        <h1
          id="profile-view-title"
          className="text-[34px] font-bold tracking-[-0.04em] text-neutral-900"
        >
          내 정보
        </h1>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
      >
        수정하기
      </button>
    </div>

    <div className="grid min-w-0 grid-cols-[160px_minmax(0,1fr)] gap-10 pt-5">
      <div className="flex flex-col items-center gap-4">
        <ProfileAvatar avatarUrl={profile.avatarUrl} nickname={profile.nickname} />
        <dl className="flex items-center justify-center gap-1 text-[13px] leading-5 whitespace-nowrap">
          <dt className="font-semibold text-neutral-500">가입일</dt>
          <dd className="flex items-center">
            <JoinedDate joinedAt={profile.joinedAt} />
          </dd>
        </dl>
      </div>

      <dl className="min-w-0 divide-y divide-neutral-200">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center py-5 first:pt-0 max-[935px]:grid-cols-1 max-[935px]:gap-2">
          <dt className="text-sm font-semibold text-neutral-500">닉네임</dt>
          <dd className="min-w-0 text-[15px] font-medium break-words text-neutral-900">
            {profile.nickname}
          </dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center py-5 max-[935px]:grid-cols-1 max-[935px]:gap-2">
          <dt className="text-sm font-semibold text-neutral-500">이메일</dt>
          <dd className="min-w-0 text-[15px] break-words text-neutral-700">{profile.email}</dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start py-5 max-[935px]:grid-cols-1 max-[935px]:gap-2">
          <dt className="text-sm font-semibold text-neutral-500">소개</dt>
          <dd className="min-h-6 min-w-0 text-[15px] leading-6 break-words whitespace-pre-wrap text-neutral-700">
            {profile.introduction}
          </dd>
        </div>
      </dl>
    </div>

    <ProfileImageQuota />
  </section>
);

type ProfileEditFormProps = {
  profile: ProfileInfo;
  draft: ProfileDraft;
  onNicknameChange: (value: string) => void;
  onIntroductionChange: (value: string) => void;
  onCancel: () => void;
  onAvatarUploaded?: (profileImageUrl: string | null) => void;
};

export const ProfileEditForm = ({
  profile,
  draft,
  onNicknameChange,
  onIntroductionChange,
  onCancel,
  onAvatarUploaded,
}: ProfileEditFormProps) => (
  <section aria-labelledby="profile-edit-title">
    <div className="max-w-full min-w-0 border-b border-neutral-200 pb-5">
      <p className="text-primary-700 mb-2 max-w-full min-w-0 text-sm font-semibold tracking-[0.14em] break-all">
        PROFILE
      </p>
      <h1
        id="profile-edit-title"
        className="text-[34px] font-bold tracking-[-0.04em] text-neutral-900"
      >
        정보 수정
      </h1>
    </div>

    <div className="grid min-w-0 grid-cols-[160px_minmax(0,1fr)] gap-10 pt-5">
      <ProfileAvatar
        avatarUrl={profile.avatarUrl}
        nickname={profile.nickname}
        editable
        onAvatarUploaded={onAvatarUploaded}
      />

      <form
        onSubmit={(event) => event.preventDefault()}
        className="min-w-0 space-y-6"
        aria-describedby="profile-save-notice"
      >
        <div>
          <label
            htmlFor="profile-nickname"
            className="mb-2 block text-sm font-semibold text-neutral-700"
          >
            닉네임
          </label>
          <input
            id="profile-nickname"
            name="nickname"
            value={draft.nickname}
            onChange={(event) => onNicknameChange(event.target.value)}
            className="focus:border-primary-500 focus:ring-primary-100 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-[15px] text-neutral-900 transition outline-none focus:ring-2"
          />
        </div>

        <div>
          <label
            htmlFor="profile-email"
            className="mb-2 block text-sm font-semibold text-neutral-700"
          >
            이메일
          </label>
          <input
            id="profile-email"
            name="email"
            value={profile.email}
            readOnly
            className="w-full min-w-0 cursor-default rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-[15px] text-neutral-500 outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="profile-introduction"
            className="mb-2 block text-sm font-semibold text-neutral-700"
          >
            소개
          </label>
          <textarea
            id="profile-introduction"
            name="introduction"
            rows={5}
            value={draft.introduction}
            onChange={(event) => onIntroductionChange(event.target.value)}
            className="focus:border-primary-500 focus:ring-primary-100 w-full min-w-0 resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-[15px] leading-6 text-neutral-900 transition outline-none focus:ring-2"
          />
        </div>

        <div className="flex items-center justify-between max-[935px]:flex-col max-[935px]:items-stretch max-[935px]:gap-4">
          <p id="profile-save-notice" className="text-sm text-neutral-500">
            저장 기능은 준비 중입니다.
          </p>
          <div className="flex gap-3 max-[935px]:self-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold whitespace-nowrap text-neutral-700 transition-colors hover:bg-neutral-100"
            >
              취소하기
            </button>
            <button
              type="submit"
              disabled
              className="cursor-not-allowed rounded-xl bg-neutral-200 px-5 py-3 text-sm font-semibold whitespace-nowrap text-neutral-400"
            >
              저장하기
            </button>
          </div>
        </div>
      </form>
    </div>
  </section>
);

type ProfilePanelProps = {
  profile: ProfileInfo;
};

const ProfilePanel = ({ profile }: ProfilePanelProps) => {
  const [state, dispatch] = useReducer(profileEditorReducer, profile, createProfileEditorState);
  // reducer의 profile은 마운트 시점에 굳는다 — 업로드 결과를 여기 따로 들고 있지 않으면 세션을
  // 갱신해도 이 화면의 아바타만 옛 사진으로 남는다.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const shownProfile: ProfileInfo = { ...state.profile, avatarUrl };

  if (state.mode === 'edit') {
    return (
      <ProfileEditForm
        profile={shownProfile}
        draft={state.draft}
        onNicknameChange={(value) => dispatch({ type: 'change-nickname', value })}
        onIntroductionChange={(value) => dispatch({ type: 'change-introduction', value })}
        onCancel={() => dispatch({ type: 'cancel-editing' })}
        onAvatarUploaded={setAvatarUrl}
      />
    );
  }

  return <ProfileView profile={shownProfile} onEdit={() => dispatch({ type: 'start-editing' })} />;
};

export default ProfilePanel;
