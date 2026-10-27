'use client';
// 관리자 마스터 6종의 offset 목록 조회 상태(현재 페이지·항목·페이지 정보·재조회)를 한 곳에 모은다.
// 6개 화면이 완전히 같은 흐름이라 화면마다 useEffect를 복제하지 않게 뽑았다.
//
// fetchPage는 참조가 안정적이어야 한다 — 렌더마다 새 함수를 넘기면 이펙트가 매번 다시 돈다.
// 호출부는 모듈 최상위 함수(listBrands 등)를 그대로 넘기거나 useCallback으로 감싼다.

import { useCallback, useEffect, useState } from 'react';

import type { OffsetPageParams, PageInfo } from '@/api/admin/masters';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import { MASTER_PAGE_SIZE } from '@/constants/admin/masters';

interface OffsetPageLike<T> {
  content?: T[];
  page?: PageInfo;
}

export interface MasterListState<T> {
  items: T[];
  pageInfo: PageInfo | null;
  page: number;
  isLoading: boolean;
  loadErrorMessage: string | null;
  goToPage: (nextPage: number) => void;
  reload: () => void;
}

export function useMasterList<T>(
  fetchPage: (params: OffsetPageParams) => Promise<OffsetPageLike<T>>,
): MasterListState<T> {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<T[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  // 삭제·등록 뒤 같은 페이지를 다시 읽기 위한 트리거 — page가 안 바뀌어도 이펙트를 한 번 더 돌린다.
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);

  // 로딩 여부는 파생 값이다 — 이펙트 본문에서 setIsLoading(true)를 부르면 React Compiler 린트
  // (react-hooks/set-state-in-effect)가 연쇄 렌더로 막는다. "요청한 키 ≠ 끝난 키"면 로딩 중이다.
  const requestKey = `${page}:${reloadToken}`;
  const isLoading = loadedRequestKey !== requestKey;

  useEffect(() => {
    let isCurrent = true;

    fetchPage({ page, size: MASTER_PAGE_SIZE })
      .then((response) => {
        if (!isCurrent) return;
        setItems(response.content ?? []);
        setPageInfo(response.page ?? null);
        setLoadErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setItems([]);
        setPageInfo(null);
        setLoadErrorMessage(toMasterErrorMessage(error, '목록을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (!isCurrent) return;
        setLoadedRequestKey(requestKey);
      });

    return () => {
      isCurrent = false;
    };
  }, [fetchPage, page, reloadToken, requestKey]);

  const goToPage = useCallback((nextPage: number) => {
    setPage(Math.max(0, nextPage));
  }, []);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { items, pageInfo, page, isLoading, loadErrorMessage, goToPage, reload };
}
