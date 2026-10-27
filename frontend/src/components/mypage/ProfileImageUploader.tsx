'use client';
// 프로필 이미지 교체 — 2단계 presign 업로드(api/user.ts의 uploadProfileImage).
//
// 등록 응답(UserMeResponse)에 갱신된 presigned URL이 실려 오므로 재조회 없이 바로 화면에 꽂는다.
// 두 군데를 같이 갱신한다: ① 이 화면의 아바타(onUploaded) ② 전역 세션(TopNavbar 아바타가 이걸 본다).
// 세션 쪽을 빼먹으면 마이페이지에서만 바뀌고 상단 바는 옛 사진을 계속 보여준다.

import { useRef, useState } from 'react';
import {
  isProfileImageContentType,
  PROFILE_IMAGE_CONTENT_TYPES,
  uploadProfileImage,
} from '@/api/user';
import { useAuthStore } from '@/store/authStore';

const ACCEPT = PROFILE_IMAGE_CONTENT_TYPES.join(',');

const INVALID_TYPE_MESSAGE = 'PNG·JPEG·WebP·GIF 이미지만 올릴 수 있어요.';

type Props = {
  onUploaded: (profileImageUrl: string | null) => void;
};

const ProfileImageUploader = ({ onUploaded }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyToSession = (profileImageUrl: string | null): void => {
    const { auth, setAuthenticated } = useAuthStore.getState();
    if (auth.status !== 'authenticated') return;
    setAuthenticated({ ...auth.session, avatarUrl: profileImageUrl });
  };

  const handleChange = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;

    // 서버도 400 `USER_INVALID_IMAGE_CONTENT_TYPE`으로 막지만, 왕복 전에 같은 규칙으로 걸러 준다.
    if (!isProfileImageContentType(file.type)) {
      setError(INVALID_TYPE_MESSAGE);
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const me = await uploadProfileImage(file);
      const nextUrl = me.profileImageUrl ?? null;
      applyToSession(nextUrl);
      onUploaded(nextUrl);
    } catch {
      setError('프로필 이미지를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsBusy(false);
      // 같은 파일을 다시 골라도 change가 발화하도록 값을 비운다.
      if (inputRef.current !== null) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        id="profile-image-input"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => void handleChange(event.target.files?.[0])}
      />
      <label
        htmlFor="profile-image-input"
        aria-disabled={isBusy}
        className={`rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors ${
          isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-neutral-100'
        }`}
      >
        {isBusy ? '올리는 중…' : '프로필 이미지 변경'}
      </label>
      {error && (
        <p role="alert" className="text-danger-700 text-center text-[13px] leading-5">
          {error}
        </p>
      )}
    </div>
  );
};

export default ProfileImageUploader;
