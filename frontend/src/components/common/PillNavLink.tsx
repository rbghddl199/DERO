'use client';
// 아이콘 + 라벨을 가진 타원형 내비게이션 pill — 실제 페이지 이동(Link)용 + 커서를 올리면 원이
// 바닥에서 차오르며 라벨이 교체되는 GSAP 호버 모션(구 PillFilter.tsx/PillHoverLink.tsx와 같은 원
// 확대 수학, React Bits PillNav 참고). 선택된 항목(isActive)은 원이 채워진 상태로 상시 유지된다.
// 로컬 필터링만 하던 PillFilter.tsx와 달리 href로 실제 라우팅한다(TransitionNavigator의 크로스페이드
// 전환이 실제 <a> 클릭을 가로채는 방식이라 그대로 유지된다). 상단 메뉴바 드롭다운이 삭제되며
// 제품/커뮤니티 목록 페이지 안으로 옮겨온 소메뉴가 이 컴포넌트를 쓴다.

import { gsap } from 'gsap';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type Props = {
  href: string;
  label: string;
  icon: ReactNode;
  isActive: boolean;
  ease?: string;
};

const DEFAULT_EASE = 'power3.out';

const PillNavLink = ({ href, label, icon, isActive, ease = DEFAULT_EASE }: Props) => {
  const circleRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const activeTweenRef = useRef<gsap.core.Tween | null>(null);
  // 레이아웃 이펙트가 재실행되지 않고도 최신 isActive를 읽기 위한 ref(불필요한 리레이아웃 방지) —
  // PillFilter.tsx의 activeValueRef와 같은 이유.
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const circle = circleRef.current;
    const pill = circle?.parentElement;
    if (!circle || !pill) return;

    const layout = () => {
      const { width: w, height: h } = pill.getBoundingClientRect();
      const radius = (w * w) / 4 / h / 2 + h / 2;
      const diameter = Math.ceil(2 * radius) + 2;
      const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (w * w) / 4))) + 1;
      const originY = diameter - delta;

      circle.style.width = `${diameter}px`;
      circle.style.height = `${diameter}px`;
      circle.style.bottom = `-${delta}px`;
      gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: `50% ${originY}px` });

      const labelEl = pill.querySelector<HTMLElement>('.pill-label');
      const hoverLabelEl = pill.querySelector<HTMLElement>('.pill-label-hover');
      if (labelEl) gsap.set(labelEl, { y: 0 });
      if (hoverLabelEl) gsap.set(hoverLabelEl, { y: h + 12, opacity: 0 });

      tlRef.current?.kill();
      const tl = gsap.timeline({ paused: true });
      tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: 'auto' }, 0);
      if (labelEl) tl.to(labelEl, { y: -(h + 8), duration: 2, ease, overwrite: 'auto' }, 0);
      if (hoverLabelEl) {
        gsap.set(hoverLabelEl, { y: Math.ceil(h + 100), opacity: 0 });
        tl.to(hoverLabelEl, { y: 0, opacity: 1, duration: 2, ease, overwrite: 'auto' }, 0);
      }
      tlRef.current = tl;

      if (isActiveRef.current) tl.progress(1);
    };

    layout();
    window.addEventListener('resize', layout);
    document.fonts?.ready.then(layout).catch(() => {});
    return () => window.removeEventListener('resize', layout);
  }, [ease]);

  // isActive가 바뀌면(리마운트 없이) 원을 채우거나 비운다 — 지금은 카테고리·보기 변경이 전부 URL
  // 쿼리 변경 → 컴포넌트 리마운트라 위 mount-time progress(1)로도 충분하지만, 리마운트 없이 재사용될
  // 가능성에 대비한 방어 로직(PillFilter.tsx의 activeValue 이펙트와 같은 역할).
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    activeTweenRef.current?.kill();
    activeTweenRef.current = tl.tweenTo(isActive ? tl.duration() : 0, {
      duration: 0.3,
      ease,
      overwrite: 'auto',
    });
  }, [isActive, ease]);

  const handleEnter = () => {
    const tl = tlRef.current;
    if (!tl) return;
    activeTweenRef.current?.kill();
    activeTweenRef.current = tl.tweenTo(tl.duration(), { duration: 0.3, ease, overwrite: 'auto' });
  };

  const handleLeave = () => {
    if (isActive) return;
    const tl = tlRef.current;
    if (!tl) return;
    activeTweenRef.current?.kill();
    activeTweenRef.current = tl.tweenTo(0, { duration: 0.2, ease, overwrite: 'auto' });
  };

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className="text-ink bg-primary-100 relative inline-flex h-9 items-center overflow-hidden rounded-full px-4 text-[14px] font-medium whitespace-nowrap"
    >
      <span
        aria-hidden="true"
        className="bg-ink pointer-events-none absolute bottom-0 left-1/2 z-0 block rounded-full"
        style={{ willChange: 'transform' }}
        ref={circleRef}
      />
      <span className="relative z-[2] inline-flex items-center gap-1.5 leading-[1]">
        <span className="pill-label relative z-[1] inline-flex items-center gap-1.5 leading-[1]">
          {icon}
          {label}
        </span>
        <span
          aria-hidden="true"
          className="pill-label-hover text-paper absolute top-0 left-0 z-[2] inline-flex items-center gap-1.5 leading-[1]"
        >
          {icon}
          {label}
        </span>
      </span>
    </Link>
  );
};

export default PillNavLink;
