// HUD 공용 숫자 입력 — Enter/blur에서만 커밋하고, 편집 중에는 씬을 건드리지 않는다.
'use client';

import { useState } from 'react';

import { commitDraft } from '@/utils/numericInput';

interface CommitNumberInputProps {
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
  label: string;
  testId: string;
  className: string;
  step?: number;
  disabled?: boolean;
  /** 편집 중 툴바 좌표를 동결하는 쪽(SelectionToolbar)만 쓴다 — 타이핑 중에 따라 움직이면 조작 불가. */
  onEditStart?: () => void;
  onEditEnd?: () => void;
}

/**
 * 매 keystroke마다 커밋하면 값을 지우는 순간 `Number('')===0`이 통과해 값이 최소로 튀고,
 * 340을 치는 동안 3·34·340이 전부 씬에 반영된다(선택 툴바 2026-08-03, 벽 거리
 * DERO-552 — 같은 함정을 두 번 밟아 여기로 합쳤다).
 *
 * ⚠ **반드시 모듈 최상위 컴포넌트로 둔다** — 쓰는 쪽 본문 안에 정의하면 매 렌더 새 컴포넌트
 * 타입이 되어 입력이 포커스를 잃는다.
 */
const CommitNumberInput = ({
  value,
  min,
  max,
  onCommit,
  label,
  testId,
  className,
  step = 1,
  disabled = false,
  onEditStart,
  onEditEnd,
}: CommitNumberInputProps) => {
  // null이면 편집 중이 아니라는 뜻 — 스토어 값을 그대로 보여준다(± 버튼·최소/최대 버튼·링
  // 드래그가 즉시 반영된다).
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (): void => {
    onEditEnd?.();
    if (draft === null) return;
    const next = commitDraft(draft, min, max);
    if (next !== null) onCommit(next);
    setDraft(null);
  };

  return (
    <input
      type="number"
      className={className}
      data-testid={testId}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft ?? String(Math.round(value))}
      onFocus={onEditStart}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // blur가 커밋 경로 하나를 담당하도록 Enter도 blur로 흘려보낸다.
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          // 편집 취소는 이 입력의 몫 — 스토어의 Esc(선택 해제)까지 가면 안 된다.
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
};

export default CommitNumberInput;
