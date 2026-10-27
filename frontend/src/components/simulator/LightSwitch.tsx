'use client';
// 조명·벽 패널의 개별 토글 행 — 라벨 + iOS 스타일 on/off 스위치

type Props = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  testId: string;
};

const LightSwitch = ({ label, checked, onToggle, testId }: Props) => {
  return (
    <div className="light-item">
      <span className="light-item-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? 'active' : ''}`}
        data-testid={testId}
        onClick={onToggle}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
};

export default LightSwitch;
