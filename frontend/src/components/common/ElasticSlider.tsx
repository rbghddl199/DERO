'use client';
// 재사용 슬라이더 — React Bits ElasticSlider 이식. 드래그가 트랙 끝을 넘으면 고무줄처럼
// 늘어났다 스프링으로 복귀하는 연출이 핵심이다. 원본은 'motion/react'를 쓰지만 이 저장소는
// 이미 동등한 API의 framer-motion을 의존성으로 갖고 있어(home/ServiceFeatures.tsx 등) 그걸
// 그대로 쓴다 — 같은 라이브러리를 이름만 다르게 두 번 설치하지 않기 위함.
// 원본 대비 바뀐 것:
//  - onChange(컨트롤드 사용), valueFormatter/showValueLabel(표시 포맷터) 추가.
//  - 완전 컨트롤드로 전환(2026-07-28) — 원본은 `defaultValue`를 마운트 시 1회만 내부
//    state 시드로 쓰고 이후 prop이 바뀌어도 안 따라갔다(숫자 입력 등 슬라이더 밖에서
//    값을 바꾸는 호출부가 생기면서 드러난 문제 — 슬라이더 손잡이가 실제 값과 어긋남).
//    내부 useState를 없애고 매 렌더 `value` prop을 그대로 쓴다 — 호출부가 onChange로
//    즉시 반영해주는 한(이 저장소의 유일한 호출부 CraftBudgetStep.tsx가 그렇다) 항상
//    최신값과 일치하고, ElasticSlider.tsx CLAUDE.md 지적처럼 useEffect로 재동기화할
//    필요 자체가 없어진다.
//  - 호버/터치 시 확대되던 연출(scale 1→1.2, 트랙 두께 6→12px)을 없앴다 — 예산 슬라이더
//    호출부에서 "확대 안 하면 좋겠다"는 요청(2026-07-28). 트랙 끝을 넘겨 끄는 고무줄
//    늘어남 효과(overflow)는 확대와 다른 별개 연출이라 그대로 남겨뒀다.
//  - 항상 보이는 원형 손잡이(thumb)를 추가했다 — 원본은 채워진 트랙 바 자체가 값 표시라
//    손잡이가 없었지만, 가격 필터 UI(막대 그래프 + 손잡이) 참고 요청(2026-07-28)으로
//    필요해졌다.

import { useRef, useState, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';

const MAX_OVERFLOW = 50;

type ElasticSliderProps = {
  value?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** 값이 바뀔 때마다 호출 — 컨트롤드 사용을 위해 원본에 없던 프롭을 추가했다. */
  onChange?: (value: number) => void;
  /** 슬라이더 아래 작은 값 라벨의 포맷 — 기본은 반올림한 숫자 문자열. */
  valueFormatter?: (value: number) => string;
  /** 작은 값 라벨을 아예 감출지 — 호출부가 자체 큰 값 표시를 이미 갖고 있을 때 끈다. */
  showValueLabel?: boolean;
  dataTestId?: string;
};

const ElasticSlider = ({
  value = 50,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = <>-</>,
  rightIcon = <>+</>,
  onChange,
  valueFormatter = (v) => `${Math.round(v)}`,
  showValueLabel = true,
  dataTestId,
}: ElasticSliderProps) => {
  return (
    <div
      data-testid={dataTestId}
      className={`relative flex w-full flex-col items-center justify-center gap-4 ${className}`}
    >
      <Slider
        value={value}
        startingValue={startingValue}
        maxValue={maxValue}
        isStepped={isStepped}
        stepSize={stepSize}
        leftIcon={leftIcon}
        rightIcon={rightIcon}
        onChange={onChange}
        valueFormatter={valueFormatter}
        showValueLabel={showValueLabel}
      />
    </div>
  );
};

type SliderProps = {
  value: number;
  startingValue: number;
  maxValue: number;
  isStepped: boolean;
  stepSize: number;
  leftIcon: ReactNode;
  rightIcon: ReactNode;
  onChange?: (value: number) => void;
  valueFormatter: (value: number) => string;
  showValueLabel: boolean;
};

const Slider = ({
  value,
  startingValue,
  maxValue,
  isStepped,
  stepSize,
  leftIcon,
  rightIcon,
  onChange,
  valueFormatter,
  showValueLabel,
}: SliderProps) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle');
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);

  useMotionValueEvent(clientX, 'change', (latest: number) => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newValue: number;
      if (latest < left) {
        setRegion('left');
        newValue = left - latest;
      } else if (latest > right) {
        setRegion('right');
        newValue = latest - right;
      } else {
        setRegion('middle');
        newValue = 0;
      }
      overflow.jump(decay(newValue, MAX_OVERFLOW));
    }
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.buttons > 0 && sliderRef.current) {
      const { left, width } = sliderRef.current.getBoundingClientRect();
      let newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);
      if (isStepped) {
        newValue = Math.round(newValue / stepSize) * stepSize;
      }
      newValue = Math.min(Math.max(newValue, startingValue), maxValue);
      onChange?.(newValue);
      clientX.jump(e.clientX);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    handlePointerMove(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (): void => {
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
  };

  const getRangePercentage = (): number => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <>
      <div className="flex w-full touch-none items-center justify-center gap-4 select-none">
        <motion.div
          animate={{
            scale: region === 'left' ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{
            x: useTransform(() => (region === 'left' ? -overflow.get() : 0)),
          }}
          className="text-ash shrink-0 text-[13px] font-medium"
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          className="relative flex max-w-full flex-grow cursor-grab touch-none flex-col justify-end gap-3 py-4 select-none"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (sliderRef.current) {
                  const { width } = sliderRef.current.getBoundingClientRect();
                  return 1 + overflow.get() / width;
                }
                return 1;
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (sliderRef.current) {
                  const { left, width } = sliderRef.current.getBoundingClientRect();
                  return clientX.get() < left + width / 2 ? 'right' : 'left';
                }
                return 'center';
              }),
            }}
            className="relative h-2 w-full"
          >
            <div className="bg-fog relative h-full w-full overflow-hidden rounded-full">
              <div
                className="bg-primary-400 absolute h-full rounded-full"
                style={{ width: `${getRangePercentage()}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 h-6 w-6 rounded-full bg-white shadow-sm"
              style={{ left: `${getRangePercentage()}%`, transform: 'translate(-50%, -50%)' }}
            />
          </motion.div>
        </div>

        <motion.div
          animate={{
            scale: region === 'right' ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{
            x: useTransform(() => (region === 'right' ? overflow.get() : 0)),
          }}
          className="text-ash shrink-0 text-[13px] font-medium"
        >
          {rightIcon}
        </motion.div>
      </div>
      {showValueLabel && (
        <p className="text-ink tnum absolute -bottom-1 text-[13px] font-medium">
          {valueFormatter(value)}
        </p>
      )}
    </>
  );
};

function decay(value: number, max: number): number {
  if (max === 0) {
    return 0;
  }
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}

export default ElasticSlider;
