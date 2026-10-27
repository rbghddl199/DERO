'use client';
// 리그 저작 도구 숫자 입력 — 키보드 화살표(step)로 미세 조정하면서 '0.' '-' 같은 미완성 입력에도 커서가 튀지 않는 필드

import { useState } from 'react';

interface NumFieldProps {
  label: string;
  value: number;
  step: number;
  onCommit: (value: number) => void;
}

/**
 * 정본은 스토어의 `value`다. 여기 `text`는 표시 버퍼일 뿐이며 —
 * `type="number"`를 값으로 완전 제어하면 "0.0"을 타이핑하는 순간 React가 "0"으로 되돌려
 * 소수를 못 찍는다(피벗은 소수 4자리까지 손봐야 하는 값이다).
 * `badInput`(예: "0.", "-")일 때는 아무것도 하지 않아 브라우저 버퍼를 그대로 살려둔다.
 */
const NumField = ({ label, value, step, onCommit }: NumFieldProps) => {
  const [text, setText] = useState(() => String(value));
  const [seen, setSeen] = useState(value);

  // 바깥(관절 종류 토글·다른 관절 선택 등)이 값을 바꾸면 버퍼를 다시 맞춘다.
  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }

  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      <span className="shrink-0 text-[11px] text-neutral-600">{label}</span>
      <input
        type="number"
        step={step}
        value={text}
        className="w-full min-w-0 rounded border border-neutral-300 bg-white px-1 py-0.5 text-right font-mono text-[11px]"
        onChange={(e) => {
          if (e.target.validity.badInput) return;
          const raw = e.target.value;
          setText(raw);
          const n = e.target.valueAsNumber;
          if (raw === '' || !Number.isFinite(n)) return;
          setSeen(n);
          onCommit(n);
        }}
      />
    </label>
  );
};

export default NumField;
