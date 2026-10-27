'use client';
// 새로고침해도 좋아요·북마크가 유지되도록, localStorage에 저장된 값을 마운트 후에 불러온다.
// 두 스토어 모두 persist의 자동 복원을 skipHydration: true로 꺼뒀다 — 스토어 생성 시점에 곧바로
// 복원하면 서버 렌더(SSR엔 localStorage가 없어 항상 빈 상태)와 클라이언트 첫 렌더(이미 복원된 상태)가
// 달라 하이드레이션이 어긋난다. 하이드레이션이 끝난 뒤(이 effect)에만 수동으로 불러오면 안전하다.
// AuthBootstrap과 같은 자리(루트 레이아웃)에서 한 번만 마운트한다.

import { useEffect } from 'react';
import { isMockApi } from '@/constants/api';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { useCommunityBookmarksStore } from '@/store/communityBookmarksStore';
import { useCommunityLikesStore } from '@/store/communityLikesStore';
import { useCookieConsentStore } from '@/store/cookieConsentStore';
import { useProductLikesStore } from '@/store/productLikesStore';
import { useSimulatorTourStore } from '@/store/simulatorTourStore';
import { useUploadNotificationsStore } from '@/store/uploadNotificationsStore';

const PersistedInteractionsBootstrap = () => {
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    void useProductLikesStore.persist.rehydrate();
    void useCommunityBookmarksStore.persist.rehydrate();
    void useCommunityLikesStore.persist.rehydrate();
    void useUploadNotificationsStore.persist.rehydrate();
    void useSimulatorTourStore.persist.rehydrate();
    void useCookieConsentStore.persist.rehydrate();
  }, []);

  // 제품 좋아요만 real 모드에서 서버가 정본이다(DERO-356) — 로그인이 확정되면 localStorage
  // 값을 GET /products?liked=me로 덮는다. 비로그인일 때는 부르지 않는다(그 경로는 401이고, 화면도
  // 이미 useIsAuthenticated로 하트를 꺼둔다). 실패하면 직전 localStorage 값을 그대로 쓴다 —
  // 여기서 화면에 띄울 자리가 없고(루트 레이아웃), 찜 목록 화면은 자기 요청으로 다시 확정한다.
  useEffect(() => {
    if (isMockApi() || !isAuthenticated) return;
    void useProductLikesStore.getState().syncFromServer().catch(noop);
  }, [isAuthenticated]);

  return null;
};

/** 부트스트랩엔 에러를 보여줄 UI가 없다 — 무시하는 자리를 이름으로 남긴다(무음 실패 의도). */
const noop = (): void => {};

export default PersistedInteractionsBootstrap;
