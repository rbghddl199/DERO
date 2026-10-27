'use client';
// 일정 시간마다 옆으로 넘어가는 가로 캐러셀 — 오늘의집 배너 캐러셀 참고. 이미지 위에 겹치는 버튼 대신
// 하단에 [이전 버튼][진행 바][다음 버튼] 한 줄을 둔다(버튼을 바 양끝에 하나씩). 목록을 세 벌 이어 붙여
// 가운데 벌에서 시작하고, 중앙 대역을 벗어나면 트랜지션을 끈 채 되감아 앞뒤 어느 방향으로도 끊김
// 없이 순환한다. 커서를 올리면 자동 재생만 멈춘다(수동 버튼은 그대로 눌린다). 수동 버튼을 누르면
// 자동 재생 타이머를 리셋해 곧바로 또 넘어가지 않게 한다.
//
// transform은 state가 아니라 ref로 직접 쓴다 — 아이템 폭을 실측해야 반응형(브레이크포인트별로
// 보이는 개수가 달라짐)에서도 한 칸 이동 거리가 맞고, 이펙트 본문 setState(리액트 컴파일러 린트가
// 막는다)도 피할 수 있다.
//
// 아이템 수가 한 화면에 보이는 개수(visibleCount) 이하면 넘길 게 없다 — 3벌 복제(무한 순환용)도,
// 자동/수동 넘기기도 끄고 있는 개수만 정적으로 나열한다(나머지 칸은 빈 채로, flex 기본 정렬).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** 트랙의 gap-3(0.75rem)과 반드시 같아야 한다 — 한 칸 이동 거리 = 아이템 폭 + 이 값 */
const GAP_PX = 12;
const SLIDE_MS = 600;
/** 목록을 몇 벌 이어 붙일지 — 가운데 벌에서 시작해 앞뒤 어느 방향 수동 이동도 여유 공간을 둔다 */
const REPEAT = 3;

type Props<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** 한 번에 넘어가는 개수 */
  step: number;
  /** 아이템 하나의 flex-basis 클래스 — 보이는 개수를 호출부에서 반응형으로 정한다 */
  itemBasisClassName: string;
  /** 진행 바 두께 계산용 — sm 이상 기준 한 화면에 보이는 개수(itemBasisClassName의 sm: 값과 맞출 것).
   *  아이템 수가 이 값 이하면 캐러셀(복제·자동/수동 넘기기)을 끄고 정적으로 나열한다. */
  visibleCount: number;
  intervalMs?: number;
  /** false면 자동 넘김을 끈다 — 수동 버튼으로만 넘긴다('많이 팔린 상품', 2026-08-03 사용자 요청) */
  autoPlay?: boolean;
  /** 'bottom'(기본): 하단 [이전][진행 바][다음] 한 줄. 'overlay': 하단 UI 없이 아이템 이미지 위
   *  좌우 가장자리에 떠 있는 원형 버튼(세로 위치는 정사각 이미지의 중앙 — 아래 applyOverlayTop). */
  controls?: 'bottom' | 'overlay';
  /** 아이템 수가 visibleCount와 같아도 순환을 켠다 — 광고 배너(3장이 다 보이지만 계속 순환)용 */
  forceLoop?: boolean;
};

/** 포커스 링 — ErrorState.tsx가 쓰는 조합을 그대로 재사용한다(레포 유일 선례) */
const FOCUS_RING_CLASS =
  'focus-visible:outline-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2';

/** 둥근 흰 배경 — 2026-08-02 사용자 요청(종전엔 노란 primary-100 사각 버튼이었다).
 *  overlay 모드의 원형 버튼과 같은 톤이다. */
const BOTTOM_BUTTON_CLASS = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${FOCUS_RING_CLASS}`;
const BOTTOM_BUTTON_ENABLED_CLASS = 'bg-paper text-ink hover:bg-fog border-ash/30 cursor-pointer';
const BOTTOM_BUTTON_DISABLED_CLASS = 'bg-paper text-ash/40 border-ash/20 cursor-not-allowed';

const ChevronIcon = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d={direction === 'right' ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8 10 12.5'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AutoCarousel = <T,>({
  items,
  getKey,
  renderItem,
  step,
  itemBasisClassName,
  visibleCount,
  intervalMs = 4000,
  autoPlay = true,
  controls = 'bottom',
  forceLoop = false,
}: Props<T>) => {
  const count = items.length;
  const isCarouselNeeded = count > visibleCount || (forceLoop && count > 1);
  const [index, setIndex] = useState(count);
  // 처음 마운트될 때는 애니메이션 없이 즉시 가운데 벌 위치로 스냅해야 한다 — true로 시작하면 마운트
  // 직후 위치 적용 이펙트가 "translateX(0) → 가운데 벌"을 600ms에 걸쳐 애니메이션해버려, 페이지를
  // 열자마자 이미지가 옆으로 밀렸다 제자리로 돌아오는 것처럼 보인다(2026-08-03 사용자 제보 —
  // "방문하면 순간 이미지가 끊겼다가 다시 정상이 된다"). false로 시작 → 아래 "되감기 후 재활성화"
  // 이펙트가 50ms 뒤 true로 되돌리므로 이후의 자동/수동 넘김은 정상적으로 애니메이션된다.
  const [isAnimated, setIsAnimated] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const overlayNavRef = useRef<HTMLDivElement>(null);

  const repeatedItems = useMemo(
    () => (isCarouselNeeded ? Array.from({ length: REPEAT }, () => items).flat() : items),
    [items, isCarouselNeeded],
  );

  const applyTransform = useCallback((nextIndex: number, withAnimation: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    const first = track.firstElementChild;
    // offsetWidth는 정수로 반올림된다 — basis calc((100%-36px)/4)가 소수 폭(예: 211.5px)을 만들면
    // 칸당 0.5px 오차가 index만큼 누적돼 첫 카드 왼쪽이 몇 px씩 잘려 보인다(2026-08-02 제품 페이지에
    // 좌측 사이드바가 생기며 트랙 폭이 소수가 되어 실제 발생). 소수 폭 그대로 재는 rect를 쓴다.
    const stepPx = first instanceof HTMLElement ? first.getBoundingClientRect().width + GAP_PX : 0;
    track.style.transition = withAnimation ? `transform ${SLIDE_MS}ms ease-out` : 'none';
    track.style.transform = `translateX(-${nextIndex * stepPx}px)`;
  }, []);

  // useLayoutEffect — 페인트 전에 위치를 잡아야 한다. useEffect(페인트 후)로 두면 마운트 직후
  // 잠깐 미적용 상태(translateX(0), 첫 벌)가 그대로 화면에 그려졌다가 한 프레임 늦게 가운데 벌로
  // 튀는 게 보일 수 있다.
  useLayoutEffect(() => {
    if (!isCarouselNeeded) return;
    applyTransform(index, isAnimated);
  }, [index, isAnimated, applyTransform, isCarouselNeeded]);

  /** overlay 버튼의 세로 위치 — 카드 상단 이미지가 정사각(aspect-square)이라는 전제로, 이미지의
   *  세로 중앙(= 아이템 폭의 절반)에 버튼 중심을 둔다. transform과 같은 이유로 state 대신 DOM 직접 쓰기. */
  const applyOverlayTop = useCallback(() => {
    const track = trackRef.current;
    const nav = overlayNavRef.current;
    if (!track || !nav) return;
    const first = track.firstElementChild;
    if (!(first instanceof HTMLElement)) return;
    nav.style.top = `${first.getBoundingClientRect().width / 2}px`;
  }, []);

  // 이것도 useLayoutEffect — 안 그러면 오버레이 버튼이 잠깐 top:0(CSS 기본값)에 보였다가 이미지
  // 세로 중앙으로 튀어 내려오는 게 보인다.
  useLayoutEffect(() => {
    if (!isCarouselNeeded) return;
    applyOverlayTop();
    const handleResize = () => {
      applyTransform(index, false);
      applyOverlayTop();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [index, applyTransform, applyOverlayTop, isCarouselNeeded]);

  // 목록 길이가 바뀌면(필터링 등) 가운데 벌 기준 위치로 무전환 재정렬 — setTimeout으로 감싸는 이유:
  // effect 본문에서 곧장 setState하면 React Compiler 린트(react-hooks/set-state-in-effect)가 막는다.
  useEffect(() => {
    if (!isCarouselNeeded) return;
    const timer = setTimeout(() => {
      setIsAnimated(false);
      setIndex(count);
    }, 0);
    return () => clearTimeout(timer);
  }, [count, isCarouselNeeded]);

  useEffect(() => {
    if (!autoPlay || isPaused || count === 0 || !isCarouselNeeded) return;
    const timer = setInterval(() => setIndex((prev) => prev + step), intervalMs);
    return () => clearInterval(timer);
    // resetSignal은 값 자체를 쓰지 않고 수동 이동 시 이 effect를 재구독시켜 자동 재생 타이머를
    // 리셋하는 용도다 — deps에는 넣어야 하지만 본문에서 읽지는 않는다.
  }, [autoPlay, isPaused, count, step, intervalMs, resetSignal, isCarouselNeeded]);

  // 중앙 대역(가운데 벌)을 벗어나면 슬라이드가 끝난 직후 무전환으로 되감는다 — 앞뒤 어느 방향이든
  useEffect(() => {
    if (count === 0 || !isCarouselNeeded) return;
    if (index >= count * 2) {
      const timer = setTimeout(() => {
        setIsAnimated(false);
        setIndex((prev) => prev - count);
      }, SLIDE_MS);
      return () => clearTimeout(timer);
    }
    if (index < 0) {
      const timer = setTimeout(() => {
        setIsAnimated(false);
        setIndex((prev) => prev + count);
      }, SLIDE_MS);
      return () => clearTimeout(timer);
    }
  }, [index, count, isCarouselNeeded]);

  // 되감기가 반영된 뒤 다시 트랜지션을 켠다
  useEffect(() => {
    if (isAnimated) return;
    const timer = setTimeout(() => setIsAnimated(true), 50);
    return () => clearTimeout(timer);
  }, [isAnimated]);

  if (count === 0) return null;

  const goTo = (direction: 1 | -1) => {
    setIndex((prev) => prev + direction * step);
    setResetSignal((n) => n + 1);
  };

  // 진행 바 — 무한 순환이라 정확한 스크롤바는 아니고, "한 바퀴 중 어디쯤"을 보여주는 장식적 지표.
  // displayIndex/count 비율을 그대로 좌표에 쓰면(예: count=8, step=2) 정지 위치가 0,2,4,6이라
  // 마지막 두 자리(4, 6)가 나란히 클램프 상한(100-width%)에 겹쳐, 오른쪽 끝에서 한 번 더 멈췄다
  // 왼쪽으로 되감기는 것처럼 보인다. "한 바퀴에 정지하는 횟수(period)" 기준으로 균등 배분해야
  // 마지막 정지가 곧바로 클램프 상한이 되고 그다음 클릭에서 자연스럽게 처음으로 되감긴다.
  const displayIndex = ((index % count) + count) % count;
  const period = Math.max(1, Math.round(count / step));
  const stopIndex = Math.round(displayIndex / step) % period;
  // forceLoop로 count === visibleCount인 채 순환할 때는 visibleCount/count가 100%라 바가 움직일 수
  // 없다 — 그 경우엔 "한 바퀴 정지 횟수" 기준(1/period)으로 두께를 잡아 진행이 보이게 한다.
  const rawThumbPercent = Math.min(100, (visibleCount / count) * 100);
  const thumbWidthPercent =
    isCarouselNeeded && rawThumbPercent >= 100 ? 100 / period : rawThumbPercent;
  const travelPercent = Math.max(0, 100 - thumbWidthPercent);
  const thumbLeftPercent = period > 1 ? (stopIndex / (period - 1)) * travelPercent : 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 카드 hover 시 살짝 떠오르는 모션과 그림자가 잘리지 않도록 위아래 여백을 주고 margin으로 상쇄 */}
      <div className="-my-2 overflow-hidden py-2">
        <div ref={trackRef} className="flex gap-3 will-change-transform">
          {repeatedItems.map((item, position) => (
            <div
              key={isCarouselNeeded ? `${getKey(item)}-${position}` : getKey(item)}
              className={`shrink-0 grow-0 ${itemBasisClassName}`}
              aria-hidden={
                isCarouselNeeded && (position < count || position >= count * 2) ? true : undefined
              }
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>

      {/* overlay 모드 — 하단 UI 없이 이미지 위 좌우 가장자리에 원형 버튼만 띄운다. 세로 위치(top)는
          applyOverlayTop이 아이템 폭 실측으로 넣는다(정사각 이미지의 세로 중앙). */}
      {controls === 'overlay' && isCarouselNeeded && (
        <div ref={overlayNavRef} className="pointer-events-none absolute inset-x-0 top-0">
          <button
            type="button"
            onClick={() => goTo(-1)}
            aria-label="이전 항목"
            className={`bg-paper/95 border-ash/30 text-ink hover:bg-paper pointer-events-auto absolute left-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border shadow-md transition-colors ${FOCUS_RING_CLASS}`}
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={() => goTo(1)}
            aria-label="다음 항목"
            className={`bg-paper/95 border-ash/30 text-ink hover:bg-paper pointer-events-auto absolute right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border shadow-md transition-colors ${FOCUS_RING_CLASS}`}
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      )}

      {/* bottom 모드 — 넘길 게 없어도(isCarouselNeeded===false) 바 자체는 계속 보여주되, 채워진
          막대는 회색으로, 버튼은 회색 배경의 비활성 상태로 바꿔 "더 볼 게 없다"는 느낌만 남긴다.
          버튼은 바 양끝에 하나씩 둔다(2026-08-02 사용자 요청 — 종전엔 둘 다 바 오른쪽에 붙어 있었다). */}
      {controls === 'bottom' && (
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => goTo(-1)}
            disabled={!isCarouselNeeded}
            aria-label="이전 항목"
            className={`${BOTTOM_BUTTON_CLASS} ${
              isCarouselNeeded ? BOTTOM_BUTTON_ENABLED_CLASS : BOTTOM_BUTTON_DISABLED_CLASS
            }`}
          >
            <ChevronIcon direction="left" />
          </button>
          <div className="bg-fog relative h-[2px] flex-1 overflow-hidden rounded-full">
            <div
              className={`absolute top-0 h-full rounded-full transition-[left] duration-500 ease-out ${
                isCarouselNeeded ? 'bg-ink' : 'bg-ash'
              }`}
              style={{
                width: `${isCarouselNeeded ? thumbWidthPercent : 100}%`,
                left: `${isCarouselNeeded ? thumbLeftPercent : 0}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => goTo(1)}
            disabled={!isCarouselNeeded}
            aria-label="다음 항목"
            className={`${BOTTOM_BUTTON_CLASS} ${
              isCarouselNeeded ? BOTTOM_BUTTON_ENABLED_CLASS : BOTTOM_BUTTON_DISABLED_CLASS
            }`}
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AutoCarousel;
