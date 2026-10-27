'use client';
// 텍스트를 글자/단어 단위로 쪼개 스크롤 진입 시 아래→위로 살아나게 하는 GSAP 연출(React Bits
// SplitText를 이 프로젝트 컨벤션에 맞게 옮김) — 랜딩 클로징 CTA 헤딩·부제(page.tsx)가 사용.
// 렌더는 항상 인라인 <span> 하나뿐이라 호출부가 원하는 태그(h2·p 등)로 감싸 쓴다.

import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText as GsapSplitText } from 'gsap/SplitText';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(GsapSplitText, ScrollTrigger, useGSAP);

type SplitType = 'chars' | 'words' | 'lines';

type Props = {
  text: string;
  className?: string;
  /** 아이템 사이 등장 간격(ms) — gsap stagger로 변환된다 */
  delay?: number;
  /** 아이템 하나의 등장 애니메이션 길이(초) */
  duration?: number;
  ease?: string;
  splitType?: SplitType;
  from?: gsap.TweenVars;
  to?: gsap.TweenVars;
  /** 뷰포트 하단에서 얼마나 일찍 트리거할지(0~1, ScrollTrigger start 문자열로 변환) */
  threshold?: number;
  onLetterAnimationComplete?: () => void;
};

const DEFAULT_FROM: gsap.TweenVars = { opacity: 0, y: 32 };
const DEFAULT_TO: gsap.TweenVars = { opacity: 1, y: 0 };

const SplitText = ({
  text,
  className = '',
  delay = 30,
  duration = 0.6,
  ease = 'power3.out',
  splitType = 'chars',
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  threshold = 0.1,
  onLetterAnimationComplete,
}: Props) => {
  const ref = useRef<HTMLSpanElement>(null);
  // 웹폰트 로드 전에 쪼개면 글자 폭이 나중에 바뀌어 줄바꿈이 어긋난다 — 폰트 준비 후에만 스플릿한다.
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    // document.fonts.ready는 이미 로드된 상태여도 항상 마이크로태스크로 resolve된다 — 이펙트 본문에서
    // 곧바로 setState하는 동기 분기를 두지 않기 위해 무조건 .then을 거친다(react-hooks
    // set-state-in-effect 린트, PillNavLink.tsx의 document.fonts.ready.then과 같은 관용구).
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !text || !fontsReady) return undefined;

      const split = GsapSplitText.create(el, {
        type: splitType,
        linesClass: 'split-line',
        wordsClass: 'split-word',
        charsClass: 'split-char',
      });
      const targets =
        splitType === 'lines' ? split.lines : splitType === 'words' ? split.words : split.chars;

      gsap.set(targets, from);
      const tween = gsap.to(targets, {
        ...to,
        duration,
        ease,
        stagger: delay / 1000,
        scrollTrigger: {
          trigger: el,
          start: `top bottom-=${Math.round(threshold * 100)}%`,
          once: true,
        },
        onComplete: onLetterAnimationComplete,
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        split.revert();
      };
    },
    { dependencies: [text, delay, duration, ease, splitType, threshold, fontsReady], scope: ref },
  );

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
};

export default SplitText;
