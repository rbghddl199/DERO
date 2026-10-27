// 마스터 폼의 입력 한 칸 — 라벨 + 입력(children) + 필드별 도움말 + 오류 문구를 한 묶음으로 낸다.
// 도움말은 등록 규칙의 근거(erd.md 비고·asset-pipeline.md)를 초보 등록자용으로 옮긴 문장이라 필수다.

import type { ReactNode } from 'react';

type Props = {
  label: string;
  /** 이 칸을 처음 채우는 사람이 읽고 바로 입력할 수 있게 쓴 한 줄 안내 */
  help: string;
  isRequired?: boolean;
  errorMessage?: string;
  children: ReactNode;
};

const MasterField = ({ label, help, isRequired = false, errorMessage, children }: Props) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-ink text-[14px] font-semibold">
      {label}
      {isRequired ? (
        <span className="text-danger-500" aria-hidden="true">
          {' '}
          *
        </span>
      ) : (
        <span className="text-ash font-normal"> (선택)</span>
      )}
    </span>
    {children}
    <span className="text-ash text-[13px] leading-5">{help}</span>
    {errorMessage ? (
      <span role="alert" className="text-danger-700 text-[13px] leading-5">
        {errorMessage}
      </span>
    ) : null}
  </label>
);

export default MasterField;
