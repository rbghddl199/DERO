'use client';
// 내부 링크 클릭을 가로채 스크롤 위치만 제어한다 — 렌더 결과 없음(사이드이펙트 전용).
// 예전엔 화면 전환에 페이드·슬라이드 연출과 클론 오버레이(crossfade)가 있었는데, 화면·이미지가
// 느리게 나타난다는 피드백으로 전부 삭제하고 즉시 전환으로 되돌렸다(2026-08-02 사용자 확인 — 상단
// 메뉴바뿐 아니라 제품/커뮤니티 상세 진입, 소메뉴 이동 등 비슷한 연출 전부 포함). 지금 이 컴포넌트가
// 하는 일은 하나뿐이다 — 쿼리만 바뀌는 이동에서 스크롤 위치를 유지할지 맨 위로 보낼지 결정하는 것.
// framer-motion AnimatePresence(exit 미재생)·children 동결(라우팅 컨텍스트가 강제 리렌더)·
// View Transitions API(사용 환경 오류)로 화면 전환 자체를 구현하려던 시도들의 실패 이력은 이 폴더
// CLAUDE.md 참고.

import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { PRODUCT_CATEGORY_CHANGE_EVENT } from '@/constants/productCategoryGroup';
import { confirmNavigationIfDraft } from '@/hooks/useUnsavedDraftGuard';

const TransitionNavigator = () => {
  const router = useRouter();
  // real 카테고리 전환은 매 클릭마다 서버 컴포넌트(page.tsx)가 카탈로그를 다시 조회한다 — 그동안
  // Next 라우팅은 이미 startTransition으로 감싸져 있어 React가 화면이 멈춘 것처럼 이전 콘텐츠를
  // 그대로 보여준 채 대기한다(2026-08-03 제보: "카테고리 클릭 시 약간의 공백"). 직접
  // useTransition으로 감싸 isPending을 얻어야 그 대기 구간에 피드백을 줄 수 있다.
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const explicitlyScrollToTop = anchor.dataset.scrollTop === 'true';
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        if (explicitlyScrollToTop) {
          event.preventDefault();
          window.scrollTo({ top: 0 });
        }
        return;
      }

      if (!confirmNavigationIfDraft()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      const to = url.pathname + url.search;
      const isQueryOnlyNavigation = url.pathname === window.location.pathname;
      const isProductCategoryNavigation =
        isQueryOnlyNavigation && url.pathname === '/product' && url.searchParams.has('category');

      // 커뮤니티 보기 소메뉴는 맨 위로 스크롤한다. 제품 카테고리는 ProductGrid가 결과 제목 위치로
      // 부드럽게 이동시키므로 여기서 문서 최상단으로 보내지 않는다.
      const shouldScrollToTop =
        (!isProductCategoryNavigation && explicitlyScrollToTop) ||
        (isQueryOnlyNavigation &&
          url.pathname === '/community' &&
          !url.searchParams.has('category') &&
          !url.searchParams.has('tag'));
      if (shouldScrollToTop) window.scrollTo({ top: 0 });

      const currentParams = new URLSearchParams(window.location.search);

      // 카테고리→카테고리 전환(제품 좌측 사이드바)은 history를 쌓지 않고 교체한다 — 그래야 여러
      // 카테고리를 눌러본 뒤 뒤로가기를 눌렀을 때 방문했던 카테고리를 하나씩 거치지 않고 곧장
      // 카테고리 없는 "전체 제품"으로 돌아간다(2026-08-03 사용자 요청). 무카테고리 → 카테고리의
      // 첫 진입은 그대로 push해야 뒤로가기가 돌아갈 "전체 제품" 엔트리 자체가 history에 남는다.
      const isProductCategoryToCategory =
        url.pathname === '/product' &&
        url.searchParams.has('category') &&
        window.location.pathname === '/product' &&
        currentParams.has('category');

      // 사이드바 카테고리 전환은 tag/view는 그대로인 채 category만 바뀌는 이동이다 — 그 필터링은
      // 이미 ProductGrid.tsx가 전부 클라이언트에서 계산해서 보여주므로, 서버(page.tsx)가 카탈로그를
      // 다시 조회할 이유가 없다. router.push/replace(=Next 서버 재렌더, ProductGrid 전체 리마운트)
      // 대신 History API로 URL만 바꾸고 커스텀 이벤트로 ProductGrid에 알려 오른쪽 목록만 갱신한다 —
      // "카테고리를 누르면 페이지가 이동하는 것처럼 보인다"는 제보의 원인이 이 서버 왕복이었다
      // (2026-08-03).
      const isProductCategoryOnlyChange =
        isQueryOnlyNavigation &&
        url.pathname === '/product' &&
        url.searchParams.get('tag') === currentParams.get('tag') &&
        url.searchParams.get('view') === currentParams.get('view');

      if (isProductCategoryOnlyChange) {
        if (isProductCategoryToCategory) {
          window.history.replaceState(null, '', to);
        } else {
          window.history.pushState(null, '', to);
        }
        window.dispatchEvent(
          new CustomEvent(PRODUCT_CATEGORY_CHANGE_EVENT, {
            detail: { category: url.searchParams.get('category') },
          }),
        );
        return;
      }

      const scroll = !isQueryOnlyNavigation || shouldScrollToTop;
      startTransition(() => {
        if (isProductCategoryToCategory) {
          router.replace(to, { scroll });
        } else {
          router.push(to, { scroll });
        }
      });
    };

    // capture 단계 필수 — React 19 루트 컨테이너의 버블 리스너(Link 라우팅)가 document 버블
    // 리스너보다 먼저 실행돼, 버블 단계에서는 preventDefault가 이미 시작된 라우팅을 못 막는다.
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [router]);

  // body 바로 아래(layout.tsx)에 형제로 마운트돼 있어 조상에 transform이 없다 — ScrollProgress와
  // 달리 BodyPortal 없이도 fixed가 뷰포트 기준으로 정확히 붙는다.
  return isPending ? (
    <div
      aria-hidden="true"
      className="bg-primary-500 fixed inset-x-0 top-0 z-50 h-[3px] animate-pulse"
    />
  ) : null;
};

export default TransitionNavigator;
