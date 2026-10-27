// 엔진의 모듈 전역 카탈로그(three/scene/product.ts)를 React 리렌더에 연결하는 구독 훅.
'use client';

import { useSyncExternalStore } from 'react';
import { getCatalogVersion, subscribeCatalog } from '@/three/scene/product';

/**
 * 렌더 중 `getProduct()`/`libraryItems()`를 호출하는 컴포넌트가 구독해야 하는 버전 카운터.
 * 그 조회 함수들은 zustand가 아니라 모듈 전역을 읽으므로(엔진이 React 비의존 vanilla TS다)
 * 커서 페이지를 이어 붙여도 이 훅 없이는 아무 컴포넌트도 다시 그리지 않는다.
 *
 * 스냅샷이 number 원시값이라 "스냅샷마다 새 참조" 무한 리렌더 함정에 안 걸린다.
 * 서버 스냅샷은 0 — SSR에는 카탈로그가 없다.
 */
export function useCatalogVersion(): number {
  return useSyncExternalStore(subscribeCatalog, getCatalogVersion, () => 0);
}
