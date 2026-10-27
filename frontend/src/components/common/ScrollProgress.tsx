// 문서 스크롤 페이지 공통 커스텀 스크롤바 — 브라우저 기본 스크롤바를 숨기고 우측에 자체 표시.
// 상단 헤더(TopNavbar, 64px) 바로 아래에서 화면 하단까지 쭉 이어지고, 뷰포트에 고정돼 스크롤 위치와
// 무관하게 항상 같은 자리에 보인다(ohou.se 콘텐츠 페이지 참고).
'use client';

import { useEffect, useRef, useState } from 'react';
import BodyPortal from './BodyPortal';

/** 썸 최소 길이(트랙 대비 %) — 문서가 아주 길어도 이보다 짧아지지 않게 해 잡기 쉽게 만든다 */
const MIN_THUMB_PERCENT = 12;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const ScrollProgress = () => {
  // 진행률·썸 크기는 **state가 아니다** — 스크롤 이벤트마다 setState하면 이벤트마다 리렌더가 돌고,
  // 그 리렌더가 스크롤(컴포지터)보다 늦게 도착해 사이트 전체 스크롤이 끈적하게 느껴졌다
  // (DERO-630). 값은 ref에 두고 rAF에서 썸의 style에 직접 쓴다.
  const progressRef = useRef(0);
  const thumbPercentRef = useRef(MIN_THUMB_PERCENT);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  /** 드래그 시작 시점의 포인터 y와 썸 위치(px) — 이 차이만큼 상대 이동시켜야 썸을 잡은 지점이 유지된다 */
  const dragOriginRef = useRef<{ pointerY: number; thumbTopPx: number } | null>(null);
  // BodyPortal은 SSR에서 null을 반환하므로, 마운트 전에 렌더하면 서버 출력과 클라이언트 첫 렌더가
  // 어긋난다(다른 포털 소비자들은 전부 사용자 상호작용 뒤에 열려 이 문제가 없었다). 이 컴포넌트는
  // 페이지 로드와 함께 렌더되므로 마운트 가드가 필요하다.
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('hide-scrollbar');
    return () => document.documentElement.classList.remove('hide-scrollbar');
  }, []);

  useEffect(() => {
    let raf = 0;
    const updateScroll = () => {
      raf = 0;
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const scrollable = scrollHeight - clientHeight;

      // 트랙 높이를 실측하지 않고 %로 계산한다 — 트랙이 뷰포트 높이에 붙어 있어(inset-y-2) 창 크기가
      // 바뀌어도 비율만 맞으면 자동으로 따라간다.
      thumbPercentRef.current = Math.max((clientHeight / scrollHeight) * 100, MIN_THUMB_PERCENT);
      progressRef.current = scrollable > 0 ? scrollTop / scrollable : 0;
      const thumb = thumbRef.current;
      if (thumb !== null) {
        thumb.style.height = `${thumbPercentRef.current}%`;
        thumb.style.top = `${(100 - thumbPercentRef.current) * progressRef.current}%`;
      }
      setIsMounted(true);
    };
    // 스크롤 이벤트는 프레임보다 자주 온다 — rAF로 한 프레임 한 번으로 접는다(레이아웃 읽기도 1회).
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(updateScroll);
    };

    updateScroll();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // 무한 스크롤로 하단에 새 항목이 이어 붙으면 스크롤·리사이즈 없이도 scrollHeight가 바뀐다 —
    // ResizeObserver로 body 높이 변화 자체를 감지해야 썸 크기·위치가 새 콘텐츠 로드 직후 갱신된다.
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizeObserver.disconnect();
    };
  }, [isMounted]);

  /** 썸의 위치(px)를 실제 문서 스크롤로 옮긴다 — 화면 표시는 scroll 이벤트가 돌려주는 값으로 갱신된다 */
  const scrollToThumbTop = (thumbTopPx: number, trackHeight: number, thumbHeight: number) => {
    const movableRange = trackHeight - thumbHeight;
    const ratio = movableRange > 0 ? clamp(thumbTopPx / movableRange, 0, 1) : 0;
    const { scrollHeight, clientHeight } = document.documentElement;
    // behavior 기본값(instant) — smooth를 주면 드래그가 커서를 못 따라와 끈적하게 느껴진다
    window.scrollTo({ top: ratio * (scrollHeight - clientHeight) });
  };

  /** 트랙 기준 기하 — 드래그 계산은 %가 아니라 실측 px로 해야 커서와 어긋나지 않는다 */
  const measureTrack = () => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const thumbHeight = (thumbPercentRef.current / 100) * rect.height;
    return {
      top: rect.top,
      height: rect.height,
      thumbHeight,
      thumbTopPx: (rect.height - thumbHeight) * progressRef.current,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = measureTrack();
    if (!track) return;

    const pointerYInTrack = event.clientY - track.top;
    const isOnThumb =
      pointerYInTrack >= track.thumbTopPx &&
      pointerYInTrack <= track.thumbTopPx + track.thumbHeight;

    // 썸을 직접 잡으면 잡은 지점을 유지한 채 상대 이동, 빈 트랙을 누르면 그 지점으로 썸 중앙을
    // 점프시킨 뒤 이어서 드래그한다(네이티브 스크롤바와 같은 관례).
    let originThumbTopPx = track.thumbTopPx;
    if (!isOnThumb) {
      originThumbTopPx = clamp(
        pointerYInTrack - track.thumbHeight / 2,
        0,
        track.height - track.thumbHeight,
      );
      scrollToThumbTop(originThumbTopPx, track.height, track.thumbHeight);
    }

    dragOriginRef.current = { pointerY: event.clientY, thumbTopPx: originThumbTopPx };
    setIsDragging(true);
    // 포인터 캡처 — 커서가 4px 폭 트랙을 벗어나도 계속 추적된다(스크롤바 드래그엔 사실상 필수)
    event.currentTarget.setPointerCapture(event.pointerId);
    // 드래그하는 동안 페이지 텍스트가 선택되는 것을 막는다
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    const track = measureTrack();
    if (!origin || !track) return;
    scrollToThumbTop(
      origin.thumbTopPx + (event.clientY - origin.pointerY),
      track.height,
      track.thumbHeight,
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current) return;
    dragOriginRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!isMounted) return null;

  return (
    // BodyPortal 필수 — 원인이었던 옛 PageTransition 래퍼는 2026-08-02 제거됐지만(느리게 나타나는
    // 연출 삭제 요청), transform/filter 있는 조상이 생기면 같은 문제가 재발하므로 포털은 유지한다.
    // 당시 실측: 뷰포트 720px인데 top이 1708px로 나와 스크롤바가 문서 중간에만 있고 스크롤하면
    // 사라졌다(2026-07-29). 자세한 내막은 이 폴더 CLAUDE.md의 fixed 오버레이 항목.
    <BodyPortal>
      {/* top-[72px] — 헤더 높이(h-16=64px) + 8px 여백. 이 컴포넌트를 쓰는 5개 페이지(홈·제품
          목록/상세·커뮤니티 목록/상세)는 전부 TopNavbar가 렌더되므로 64px를 일관되게 가정할 수 있다
          (같은 값이 목록 헤딩의 scroll-mt-24에도 쓰인다). 헤더 높이를 바꾸면 여기도 같이 잰다. */}
      {/* aria-hidden 유지 — 네이티브 스크롤바(html.hide-scrollbar로 숨김)와 같은 성격의 컨트롤이라
          스크린리더에 노출하거나 탭 포커스를 주지 않는다. 키보드·휠 스크롤은 문서 자체에서 그대로
          동작하므로 이 바를 못 써도 기능 손실이 없다.
          클릭 영역만 20px(w-5)로 넓히고 바는 원래 자리에 그대로 둔다 — 실제 바는 4px라 마우스로
          잡기가 사실상 불가능했다. pr-2 + justify-end로 바의 시각적 위치(오른쪽에서 8~12px)는
          기존 right-2 + w-1과 동일하게 유지된다. 20px는 오른쪽 하단 ScrollToTopButton(right-6=24px
          부터)과 겹치지 않는 최대 폭이다 — 더 넓히면 그 버튼 클릭을 가로챈다. */}
      <div
        aria-hidden
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`fixed top-[72px] right-0 bottom-2 z-[45] hidden w-5 justify-end pr-2 sm:flex ${
          isDragging ? 'cursor-grabbing' : 'cursor-pointer'
        }`}
      >
        <div
          ref={trackRef}
          className="relative h-full w-1 rounded-full bg-neutral-200/60 backdrop-blur-sm"
        >
          {/* 트랜지션 없음 — 스크롤에 물린 값에 트랜지션을 걸면 바가 늘 문서보다 늦게 도착해
              사이트 전체가 끈적하게 느껴진다(드래그 중 75ms가 눌린 느낌을 준 것과 같은 이유,
              DERO-630). 높이·위치는 rAF가 style에 직접 쓴다 — 초기값만 여기서 준다. */}
          <div
            ref={thumbRef}
            className="bg-primary-300 absolute w-1 rounded-full"
            style={{ height: `${MIN_THUMB_PERCENT}%`, top: '0%' }}
          />
        </div>
      </div>
    </BodyPortal>
  );
};

export default ScrollProgress;
