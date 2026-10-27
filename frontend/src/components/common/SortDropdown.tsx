'use client';
// 정렬 드롭다운 — 클릭 시 옵션이 커튼처럼 아래로 펼쳐진다(grid-template-rows 0fr→1fr), 옵션 목록은 도메인별로 주입

import { useEffect, useRef, useState } from 'react';

export type SortDropdownOption = {
  value: string;
  label: string;
};

type Props = {
  options: SortDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  buttonClassName?: string;
  /** 목록을 아래(기본) 대신 위로 펼친다 — 트리거가 `overflow-y-auto` 스크롤 컨테이너의 아래쪽에 있어
   *  아래로 펼치면 목록이 잘리는 자리(UploadDeskModal의 카테고리)에서 쓴다. 펼침 연출·디자인은 동일. */
  openDirection?: 'down' | 'up';
};

const SortDropdown = ({
  options,
  value,
  onChange,
  buttonClassName = 'h-9 px-3 text-[14px]',
  openDirection = 'down',
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const currentLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        // hover·focus가 둘 다 없어 이 페이지에서 유일하게 반응이 없던 컨트롤이었다(2026-08-02)
        className={`border-ash/40 text-ink hover:border-ink focus-visible:outline-primary-600 flex cursor-pointer items-center gap-1 rounded-full border whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonClassName}`}
      >
        {currentLabel}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        // opacity를 같이 건다 — grid-template-rows만으로 0fr까지 접으면 하위 ul의 1px border가
        // 서브픽셀 반올림으로 완전히 안 사라지고 가는 검은 선으로 남는 경우가 있다(2026-08-02
        // 사용자 확인). 닫힌 상태에서 통째로 투명하게 만들어 그 잔상까지 같이 지운다.
        className={`absolute left-0 z-20 grid w-full min-w-[160px] transition-[grid-template-rows,opacity] duration-300 ease-out ${
          openDirection === 'up' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
        } ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        {/* 방향과 무관하게 이 래퍼는 `overflow-hidden` 하나만 — flex로 목록을 아래에 붙이면(justify-end)
            목록이 flex 아이템이 되어 0fr 구간에서 클리핑이 아니라 '찌그러짐'으로 애니메이션돼 아래로
            펼칠 때와 연출이 달라진다. 위로 펼치는 경우도 커튼이 위로 자라는 형태로 충분하다. */}
        <div className="overflow-hidden">
          <ul
            role="listbox"
            className="border-ash/40 bg-paper divide-ash/20 divide-y overflow-hidden rounded-[10px] border"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`hover:bg-fog block w-full px-3 py-2 text-left text-[14px] whitespace-nowrap transition-colors ${
                      isSelected ? 'text-ink bg-fog font-medium' : 'text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SortDropdown;
