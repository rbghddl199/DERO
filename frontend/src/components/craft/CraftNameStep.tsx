'use client';
// 새 데스크테리어 마법사 3단계 — 데스크테리어 이름 입력. Stepper(공용 컴포넌트)가 카드
// 테두리·완료 버튼을 대신 그리므로(완료 버튼은 이름이 비어 있으면 canProceed로 비활성화된다)
// 이 컴포넌트는 순수 컨트롤드 입력만 맡는다. 밑줄 포커스 스타일의 커스텀 입력칸 —
// 유일한 입력이라 이 스텝이 화면의 초점이 되도록 크게 키웠다.

const MAX_NAME_LENGTH = 50;

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const CraftNameStep = ({ value, onChange }: Props) => {
  const isEmpty = value.trim().length === 0;

  return (
    <div data-testid="craft-name-step">
      <label className="flex flex-col gap-2">
        <span className="text-ash text-[13px]">데스크테리어 이름</span>
        <div className="border-ash/30 focus-within:border-primary-600 flex items-center gap-3 border-b-2 pb-3 transition-colors">
          <input
            type="text"
            value={value}
            data-testid="craft-name-input"
            onChange={(e) => onChange(e.target.value)}
            placeholder="예: 나만의 미니멀 데스크"
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            className="font-swiss text-ink placeholder:text-ash/50 min-w-0 flex-1 bg-transparent text-[28px] font-medium outline-none"
          />
          {!isEmpty && (
            <button
              type="button"
              aria-label="이름 지우기"
              onClick={() => onChange('')}
              data-testid="craft-name-clear"
              className="bg-ash/15 text-ash flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] leading-none"
            >
              ×
            </button>
          )}
        </div>
      </label>
      <div className="mt-1 flex items-center justify-between">
        {isEmpty ? (
          <p className="text-ash text-[12px]" data-testid="craft-name-hint">
            완료하려면 이름을 입력하세요
          </p>
        ) : (
          <span />
        )}
        <span className="text-ash tnum text-[12px]" data-testid="craft-name-counter">
          {value.length}/{MAX_NAME_LENGTH}
        </span>
      </div>
    </div>
  );
};

export default CraftNameStep;
