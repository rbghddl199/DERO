// 시뮬레이터 라이브러리·/product 갤러리의 커서 페이징 — GET /products를 20개씩 받아 엔진 카탈로그에 이어 붙인다.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { getProductPage, LIBRARY_PAGE_SIZE } from '@/api/product';
import { isMockApi } from '@/constants/api';
import { toProductSpec } from '@/three/scene/catalogAdapter';
import { appendCatalog, libraryItems, type ProductSpec } from '@/three/scene/product';
import { useSimulatorStore } from '@/store/simulatorStore';

export type CatalogPageState =
  | { status: 'loading' }
  | {
      status: 'loaded';
      /** 이 목록이 속한 **스트림 정체성** — 카테고리 선택과 검색어를 함께 접은 키다. 렌더에서
       *  현재 선택과 비교해 리셋을 **파생**한다. 이펙트에서 setState로 리셋하면 캐스케이드 렌더다
       *  (react-hooks/set-state-in-effect). 검색어를 이 축에 함께 넣는 이유는 검색어가 바뀌면
       *  카테고리를 바꾼 것과 똑같이 커서를 처음으로 되감아야 하기 때문이다. */
      streamKey: string;
      specs: ProductSpec[];
      /** 다음 요청이 써야 할 (categoryIds 인덱스, 커서) — 백엔드 GET /products는 categoryId를
       *  하나만 받으므로 여러 id에 걸친 그룹은 id별 커서 스트림을 순차로 소진한다. */
      nextIdIndex: number;
      nextCursor: string | null;
      /** 모든 id 스트림 기준 — 현재 스트림이 끝나도 다음 id가 남아 있으면 true. */
      hasNext: boolean;
      /** 지금까지 도착한 **각 id 스트림 첫 페이지**의 totalCount 합 — 화면의 "N개" 표기용.
       *  목록 경로(q 없음)의 백엔드는 매 페이지 COUNT(*)를 피하려고 **첫 페이지에만** 값을 채우고
       *  이후 페이지엔 0을 싣는다. 그래서 뒤 페이지 값으로 덮으면 개수가 0으로 떨어진다 —
       *  cursor===null인 페이지만 더한다(검색 경로는 매 페이지 값이 같아 같은 규칙으로 맞는다). */
      totalCount: number;
    }
  | { status: 'failed' }
  /** 검색 전용 실패 — ES가 죽었다(503 PRODUCT_SEARCH_UNAVAILABLE). 폴백은 설계상 없으므로
   *  (ADR-0019 결정 6) 화면이 이 사실을 말해야 한다. 조용히 0건으로 보이면 "그런 제품이 없다"는
   *  거짓말이 된다. 검색어 없는 목록 자체는 멀쩡하다. `streamKey`를 들고 있는 이유는 검색어를
   *  바꾸면 이 배너가 즉시 걷히고 로딩으로 돌아가야 하기 때문이다. */
  | { status: 'search-unavailable'; streamKey: string };

export interface CatalogPage {
  specs: ProductSpec[];
  nextCursor: string | null;
  hasNext: boolean;
  /** 서버 `CursorPage.totalCount`. 목록 경로는 첫 페이지에만 실린다(위 주석). */
  totalCount: number;
}

export interface PageRequest {
  idIndex: number;
  cursor: string | null;
}

/**
 * 도착한 페이지를 현재 상태에 이어 붙인다. **스테일이면 null**을 돌려준다 — 카테고리를 바꾸거나
 * 재시도한 뒤 늦게 도착한 페이지가 두 목록을 이어 붙이는 것을 막는다(collection와 같은 가드).
 * 최초 페이지(idIndex=0, cursor=null)는 아직 이 카테고리의 loaded가 아닐 때만, 이어붙이기는
 * (idIndex, cursor)가 상태가 기대하는 다음 요청과 정확히 맞을 때만 받는다 — 다음 id 스트림의
 * 첫 페이지(idIndex>0, cursor=null)도 이 규칙 하나로 걸러진다.
 */
export function appendPage(
  current: CatalogPageState,
  streamKey: string,
  req: PageRequest,
  page: CatalogPage,
  hasMoreStreams: boolean,
): CatalogPageState | null {
  // 이 페이지를 받은 뒤 다음 요청이 가리킬 곳 — 현재 스트림 계속 > 다음 id 스트림 > 끝.
  const advance = page.hasNext
    ? { nextIdIndex: req.idIndex, nextCursor: page.nextCursor, hasNext: true }
    : hasMoreStreams
      ? { nextIdIndex: req.idIndex + 1, nextCursor: null, hasNext: true }
      : { nextIdIndex: req.idIndex, nextCursor: null, hasNext: false };
  // id 스트림의 첫 페이지만 개수를 싣는다 — 이어지는 페이지의 0으로 덮으면 개수가 떨어진다.
  const addedCount = req.cursor === null ? page.totalCount : 0;
  if (req.idIndex === 0 && req.cursor === null) {
    if (current.status === 'loaded' && current.streamKey === streamKey) return null;
    return { status: 'loaded', streamKey, specs: page.specs, totalCount: addedCount, ...advance };
  }
  if (current.status !== 'loaded') return null;
  if (current.streamKey !== streamKey) return null;
  if (current.nextIdIndex !== req.idIndex || current.nextCursor !== req.cursor) return null;
  return {
    status: 'loaded',
    streamKey,
    specs: [...current.specs, ...page.specs],
    totalCount: current.totalCount + addedCount,
    ...advance,
  };
}

/** 가시 엔트리가 0인 페이지를 연달아 몇 번까지 자동으로 더 당길지. GET /products는 DESK 제품도
 *  돌려주는데 라이브러리는 그걸 거르므로(kind==='surface') 20개가 통째로 안 보일 수 있고, 그러면
 *  센티널이 교차할 카드가 없어 무한 스크롤이 멈춘다. 무한 자동 요청을 막으려 상한을 둔다. */
const EMPTY_PAGE_CHAIN_CAP = 5;

/**
 * 카테고리별 커서 페이징. `categoryIds`는 서버에 필터로 태울 카테고리 마스터 id 목록이다 —
 * null=전체(필터 없음), 빈 배열=백엔드에 대응 카테고리 없음(요청 없이 0건), 여러 개면 id별
 * 커서 스트림을 앞에서부터 순차 소진한다(categoryIdsOf(), constants/productCategoryGroup.ts).
 * 받은 spec은 엔진 전역 카탈로그에도 넣는다(appendCatalog) — 배치·견적·선택 패널이
 * `getProduct(id)`로 동기 조회하기 때문.
 *
 * `query`는 확정된 검색어다 — 서버 `GET /products?q=`(Elasticsearch + Nori, ADR-0019)로 그대로
 * 나가고 커서·카테고리와 공존한다. 값이 바뀌면 카테고리를 바꾼 것과 같은 축에서 커서가 처음으로
 * 되감긴다(streamKey). 로드된 페이지 안에서만 걸러 주던 호출부의 클라 이름 필터를 대체하는 것이
 * 이 파라미터의 존재 이유다.
 *
 * mock 모드는 네트워크를 안 탄다: 정적 PRODUCTS 전량을 렌더 중 파생해 돌려주고 `hasNext:false`라
 * 갤러리가 기존 클라이언트 배칭 경로로 떨어진다(e2e·목업 동작 불변). 카테고리 필터도, 검색도
 * 호출부의 클라 필터(matchesCategoryFilter / 이름 includes) 소관이다.
 */
export function useCatalogPage(
  categoryIds: readonly number[] | null,
  query = '',
): {
  state: CatalogPageState;
  isLoadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
} {
  const deskTextures = useSimulatorStore((s) => s.deskTextures);
  const ready = useSimulatorStore((s) => s.ready);
  // 배열 prop은 렌더마다 새 참조일 수 있다 — 문자열 키로 접어 이펙트·콜백 dep을 안정시킨다.
  const categoryKey = categoryIds === null ? null : categoryIds.join(',');
  const trimmedQuery = query.trim();
  // 카테고리 선택과 검색어를 한 축으로 접는다 — 둘 중 하나만 바뀌어도 목록을 처음부터 다시 받는다.
  // JSON 배열로 접는 이유는 두 조각의 경계가 모호해지지 않게 하기 위해서다 — 그냥 이어붙이면
  // 카테고리 '900'+검색어 '1'과 카테고리 '9001'+빈 검색어가 같은 키가 된다.
  const streamKey = JSON.stringify([categoryKey, trimmedQuery]);
  const ids = useMemo(
    () =>
      categoryKey === null ? null : categoryKey === '' ? [] : categoryKey.split(',').map(Number),
    [categoryKey],
  );
  const [state, setState] = useState<CatalogPageState>({ status: 'loading' });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // 커서 진행 상황(다음 요청의 idIndex·cursor) — 렌더 중엔 절대 읽거나 쓰지 않는다(콜백·이펙트 전용).
  const cursorRef = useRef<PageRequest & { hasNext: boolean }>({
    idIndex: 0,
    cursor: null,
    hasNext: false,
  });
  const inFlight = useRef(false);
  const mock = isMockApi();

  const runFetch = useCallback(
    async (start: PageRequest): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      // setState는 전부 첫 await 뒤에서만 부른다 — 이펙트 본문에서 동기로 도달하면
      // react-hooks/set-state-in-effect에 걸린다(collection 로더와 같은 규약).
      try {
        let req = start;
        // DESK만 든 페이지는 갤러리에 카드를 하나도 안 남겨 센티널을 굶긴다 — 상한까지 이어 당긴다.
        // 스트림이 빈 채로 끝나고 다음 id가 남은 경우(다중 id 그룹)도 같은 체인으로 이어 간다.
        for (let chain = 0; chain < EMPTY_PAGE_CHAIN_CAP; chain++) {
          const page = await getProductPage({
            categoryId: ids?.[req.idIndex],
            cursor: req.cursor,
            size: LIBRARY_PAGE_SIZE,
            q: trimmedQuery,
          });
          const mapped = (
            await Promise.all(page.content.map((dto) => toProductSpec(dto, deskTextures)))
          ).filter((s): s is ProductSpec => s !== null);
          appendCatalog(mapped);
          const specs = mapped.filter((s) => s.kind !== 'surface');
          const hasMoreStreams = ids !== null && req.idIndex < ids.length - 1;
          const requested = req;
          let stale = false;
          setState((prev) => {
            const next = appendPage(
              prev,
              streamKey,
              requested,
              {
                specs,
                nextCursor: page.nextCursor,
                hasNext: page.hasNext,
                totalCount: page.totalCount,
              },
              hasMoreStreams,
            );
            stale = next === null;
            return next ?? prev;
          });
          if (stale) return; // 카테고리가 바뀌었거나 재시도가 앞질렀다
          const advance =
            page.hasNext || hasMoreStreams
              ? {
                  idIndex: page.hasNext ? req.idIndex : req.idIndex + 1,
                  cursor: page.hasNext ? page.nextCursor : null,
                  hasNext: true,
                }
              : { idIndex: req.idIndex, cursor: null, hasNext: false };
          cursorRef.current = advance;
          if (specs.length > 0 || !advance.hasNext) return;
          req = { idIndex: advance.idIndex, cursor: advance.cursor };
        }
        console.warn(
          `[useCatalogPage] 가시 제품 없는 페이지가 ${EMPTY_PAGE_CHAIN_CAP}장 연속 — 자동 요청을 멈춥니다`,
        );
      } catch (error: unknown) {
        // 검색 요청만 골라 죽는 503 — 목록 전체 실패와 화면 문구가 달라야 한다. 폴백은 설계상
        // 없으므로(ADR-0019 결정 6) "제품이 없다"로 보이지 않게 상태를 갈라 둔다.
        if (
          error instanceof ApiError &&
          error.status === 503 &&
          error.problem?.code === 'PRODUCT_SEARCH_UNAVAILABLE'
        ) {
          console.error('[useCatalogPage] 검색 서버를 사용할 수 없습니다', error);
          setState({ status: 'search-unavailable', streamKey });
          return;
        }
        console.error('[useCatalogPage] 제품 목록을 불러오지 못했습니다', error);
        setState((prev) => (prev.status === 'loaded' ? prev : { status: 'failed' }));
      } finally {
        inFlight.current = false;
        setIsLoadingMore(false);
      }
    },
    [streamKey, trimmedQuery, ids, deskTextures],
  );

  useEffect(() => {
    if (mock) return;
    if (ids !== null && ids.length === 0) return; // 대응 백엔드 카테고리 없음 — 요청 자체를 안 한다
    inFlight.current = false;
    cursorRef.current = { idIndex: 0, cursor: null, hasNext: false };
    // 첫 페이지 요청은 마이크로태스크로 미룬다 — 이펙트 본문에서 setState가 **동기로 도달 가능한**
    // 함수를 부르면 react-hooks/set-state-in-effect에 걸린다(collection 로더가 .then 안에서만
    // setState를 부르는 것과 같은 규약).
    void Promise.resolve().then(() => runFetch({ idIndex: 0, cursor: null }));
  }, [mock, ids, runFetch, reloadToken]);

  const loadMore = useCallback(() => {
    const { idIndex, cursor, hasNext } = cursorRef.current;
    // cursor=null이어도 다음 id 스트림의 첫 페이지일 수 있다 — hasNext만 본다.
    if (!hasNext || inFlight.current) return;
    setIsLoadingMore(true);
    void runFetch({ idIndex, cursor });
  }, [runFetch]);

  const retry = useCallback(() => setReloadToken((t) => t + 1), []);

  // 카테고리가 바뀌면 새 페이지가 도착하기 전까지 이전 목록을 보여주지 않는다 — 상태를 갈아엎는
  // 대신 렌더에서 파생한다. mock·빈 id 목록도 같은 자리에서 파생한다(네트워크·이펙트 없음).
  if (mock) {
    const mockSpecs = libraryItems();
    const mockState: CatalogPageState = ready
      ? {
          status: 'loaded',
          streamKey,
          specs: mockSpecs,
          nextIdIndex: 0,
          nextCursor: null,
          hasNext: false,
          totalCount: mockSpecs.length,
        }
      : { status: 'loading' };
    return { state: mockState, isLoadingMore: false, loadMore, retry };
  }
  if (ids !== null && ids.length === 0) {
    const emptyState: CatalogPageState = {
      status: 'loaded',
      streamKey,
      specs: [],
      nextIdIndex: 0,
      nextCursor: null,
      hasNext: false,
      totalCount: 0,
    };
    return { state: emptyState, isLoadingMore: false, loadMore, retry };
  }
  // 카테고리·검색어가 바뀌면 새 페이지가 도착하기 전까지 이전 목록도, 이전 검색 실패 배너도
  // 보여주지 않는다.
  const effective: CatalogPageState =
    (state.status === 'loaded' || state.status === 'search-unavailable') &&
    state.streamKey !== streamKey
      ? { status: 'loading' }
      : state;
  return { state: effective, isLoadingMore, loadMore, retry };
}
