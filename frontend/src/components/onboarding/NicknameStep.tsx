// 온보딩 1단계 — 닉네임. 소셜 표시명을 초깃값으로 채워 두고, 중복이면 그 입력칸에 바로 알린다.

'use client';

import { useState, type FormEvent } from 'react';

import { ApiError } from '@/api/client';
import { updateNickname } from '@/api/onboarding';
import InlineNotice from '@/components/common/InlineNotice';
import { NICKNAME_DUPLICATED_CODE } from '@/utils/auth/onboarding';

export type NicknameStepProps = {
  /** 소셜 프로필에서 온 초깃값(OAuth2LoginSuccessHandler가 가입 시 넣은 값). */
  initialNickname: string;
  onSaved: (nickname: string) => void;
};

const NicknameStep = ({ initialNickname, onSaved }: NicknameStepProps) => {
  const [nickname, setNickname] = useState(initialNickname);
  // 입력칸에 붙는 오류(중복)와 화면 전체 오류(네트워크 등)를 나눈다 — 전자는 고칠 자리가 명확하다.
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = nickname.trim();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed.length === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setFieldError(null);
    setFormError(null);
    try {
      await updateNickname(trimmed);
      onSaved(trimmed);
    } catch (error) {
      // 409는 다음 단계로 넘어가기 전에 이 자리에서 잡힌다 — 약관까지 다 채운 뒤가 아니다.
      if (error instanceof ApiError && error.problem?.code === NICKNAME_DUPLICATED_CODE) {
        setFieldError('이미 쓰이는 닉네임입니다. 다른 닉네임을 입력해 주세요.');
      } else {
        setFormError(error instanceof ApiError ? error.message : '닉네임을 저장하지 못했습니다.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form data-onboarding-step="nickname" className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-[22px] font-bold">닉네임을 정해 주세요</h1>
        <p className="text-ash text-[14px] leading-6">
          커뮤니티에 표시되는 이름입니다. 소셜 계정 이름을 그대로 써도 되고, 지금 바꿔도 됩니다.
        </p>
      </header>

      <label className="flex flex-col gap-1.5">
        <span className="text-ink text-[14px] font-semibold">닉네임</span>
        <input
          name="nickname"
          value={nickname}
          maxLength={50}
          autoComplete="nickname"
          aria-invalid={fieldError !== null}
          aria-describedby={fieldError ? 'onboarding-nickname-error' : undefined}
          onChange={(event) => {
            setNickname(event.target.value);
            setFieldError(null);
          }}
          className="border-ash/40 focus:border-primary-500 rounded-xl border px-4 py-3 text-[15px] outline-none"
        />
        {fieldError ? (
          <span
            id="onboarding-nickname-error"
            role="alert"
            className="text-danger-700 text-[13px] leading-5"
          >
            {fieldError}
          </span>
        ) : null}
      </label>

      {formError ? <InlineNotice variant="error" message={formError} /> : null}

      <button
        type="submit"
        disabled={trimmed.length === 0 || isSaving}
        className="bg-primary-500 hover:bg-primary-600 rounded-xl px-4 py-3 text-[15px] font-semibold text-white transition-colors disabled:opacity-40"
      >
        {isSaving ? '저장 중…' : '다음'}
      </button>
    </form>
  );
};

export default NicknameStep;
