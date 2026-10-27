'use client';
// "이 책상에 쓰인 제품" 피커 — 카탈로그 검색으로 제품을 태그로 붙이고 뗀다(≤10, ADR-0034 결정 5).
// 작성·수정 폼이 같이 쓴다.
//
// 검색은 카탈로그와 **같은 서버 검색**이다(`GET /products?q=`, ES + Nori, ADR-0019) — 받아 온 페이지를
// 클라이언트에서 다시 거르지 않는다(띄어쓰기가 다른 히트나 브랜드 매치가 도로 떨어져 나간다).
// **503 `PRODUCT_SEARCH_UNAVAILABLE`은 "0건"이 아니라 그 사실을 말해야 한다**(폴백 부재 — 결정 6).
//
// 배치를 첨부한 글은 그 배치에 놓인 제품을 그대로 불러올 수 있다 — 배치 상세의 items가 productId를
// 들고 있어 제품 조회로 이름·이미지를 채운다. **덮어쓰기가 아니라 합집합이다**: 손으로 붙인 태그를
// 버튼 한 번이 날리면 안 된다.

import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { getPlacement } from '@/api/placement';
import { getProductPage, getProductsByIds } from '@/api/product';
import RemoteImage from '@/components/common/RemoteImage';
import { DESK_FEED_MAX_PRODUCTS } from '@/constants/deskFeed';
import type { ProductDetailResponse } from '@/types/catalog';
import type { DeskFeedProductSummaryResponse } from '@/types/deskFeed';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULT_SIZE = 8;

/** 검색·배치 프리필이 주는 카탈로그 제품을 상세 응답과 같은 카드 모양으로 줄인다. */
const toPickedProduct = (product: ProductDetailResponse): DeskFeedProductSummaryResponse => ({
  id: product.id,
  name: product.name,
  priceKrw: product.priceKrw,
  imageUrl:
    product.images.find((image) => image.isPrimary)?.imageUrl ??
    product.images[0]?.imageUrl ??
    null,
});

/** 어느 질의의 결과인지 같이 들고 다닌다 — "검색 중"을 별도 상태로 두면 effect 본문에서 동기
 *  setState를 해야 하고(react-hooks/set-state-in-effect), 그건 이 저장소의 로더들이 피하는 형태다.
 *  질의가 아직 정착하지 않았다는 사실은 `query !== debouncedQuery`로 파생된다. */
type SearchState = { query: string } & (
  | { status: 'ready'; results: DeskFeedProductSummaryResponse[] }
  | { status: 'unavailable' }
  | { status: 'error' }
);

type Props = {
  selected: DeskFeedProductSummaryResponse[];
  onChange: (next: DeskFeedProductSummaryResponse[]) => void;
  /** 첨부된 배치 — 있으면 "배치에서 제품 불러오기" 버튼이 뜬다. 첨부가 없으면 null. */
  placementId?: number | null;
  /** 제목·설명 — 사진별 태그 패널(ADR-0039)이 같은 검색을 다른 문맥으로 쓴다 */
  heading?: string;
  description?: string;
  /**
   * 새 제품을 더 담을 수 있는 자리. 사진별 태그 패널은 **글 단위 목록의 남은 자리**가 천장이라
   * (ADR-0039 결정 3) 자기 목록이 비어 있어도 못 담을 수 있다 — 그때 조용히 실패하면 사용자는
   * 검색이 고장 난 줄 안다.
   */
  remainingSlots?: number;
};

const DeskFeedProductPicker = ({
  selected,
  onChange,
  placementId = null,
  heading,
  description,
  remainingSlots = Number.POSITIVE_INFINITY,
}: Props) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [search, setSearch] = useState<SearchState | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // 자기 목록이 상한이거나, 글 단위 목록에 자리가 없거나 — 어느 쪽이든 더 담지 못한다.
  const isOwnListFull = selected.length >= DESK_FEED_MAX_PRODUCTS;
  const isFull = isOwnListFull || remainingSlots <= 0;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // setState는 전부 then/catch 콜백 안에서만 부른다 — effect 본문에서 동기로 부르면
  // react-hooks/set-state-in-effect에 걸린다(로더들과 같은 형태).
  useEffect(() => {
    if (debouncedQuery === '') return;
    let cancelled = false;
    getProductPage({ q: debouncedQuery, size: SEARCH_RESULT_SIZE })
      .then((page) => {
        if (cancelled) return;
        setSearch({
          query: debouncedQuery,
          status: 'ready',
          results: page.content.map(toPickedProduct),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSearch(
          error instanceof ApiError &&
            error.status === 503 &&
            error.problem?.code === 'PRODUCT_SEARCH_UNAVAILABLE'
            ? { query: debouncedQuery, status: 'unavailable' }
            : { query: debouncedQuery, status: 'error' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // 지금 입력에 대한 결과인지 — 아니면 아직 오는 중이다(옛 질의 결과를 새 질의 답으로 보여주지 않는다).
  const settled = search !== null && search.query === debouncedQuery ? search : null;
  const isSearching = debouncedQuery !== '' && settled === null;

  const addProduct = (product: DeskFeedProductSummaryResponse) => {
    if (isFull || selected.some((it) => it.id === product.id)) return;
    onChange([...selected, product]);
  };

  const importFromPlacement = async (): Promise<void> => {
    if (placementId === null || isImporting) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const placement = await getPlacement(placementId);
      const knownIds = new Set(selected.map((it) => it.id));
      // 책상도 제품이다 — 다만 직접 입력 책상(specSource: CUSTOM)에는 참조할 제품이 없어 null이다.
      const placedIds = [
        ...(placement.desk.productId !== null ? [placement.desk.productId] : []),
        ...placement.items.map((item) => item.productId),
      ];
      const newIds = [...new Set(placedIds)].filter((id) => !knownIds.has(id));
      if (newIds.length === 0) {
        setImportMessage('배치에 있는 제품이 이미 전부 붙어 있어요.');
        return;
      }
      // 상한을 넘는 만큼은 조용히 버리지 않고 아래 문구가 이유를 말한다.
      const room = DESK_FEED_MAX_PRODUCTS - selected.length;
      const products = await getProductsByIds(newIds.slice(0, room));
      onChange([...selected, ...products.map(toPickedProduct)]);
      if (newIds.length > room) {
        setImportMessage(
          `제품은 ${DESK_FEED_MAX_PRODUCTS}개까지만 붙일 수 있어 ${room}개만 불러왔어요.`,
        );
      }
    } catch (error) {
      console.error('[DeskFeedProductPicker] 배치 제품을 불러오지 못했습니다', error);
      setImportMessage('배치 제품을 불러오지 못했어요. 다시 시도해주세요.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[18px] font-semibold">
        {heading ?? (
          <>
            사용된 제품 <span className="text-ash text-[14px] font-normal">(선택)</span>
          </>
        )}
      </span>
      <p className="text-ash text-[13px]">
        {description ??
          `이 책상에 쓴 제품을 붙이면 글 아래에 카드로 걸립니다. 최대 ${DESK_FEED_MAX_PRODUCTS}개.`}
      </p>

      {selected.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {selected.map((product) => (
            <li
              key={product.id}
              className="border-ash/40 bg-paper flex items-center gap-2 rounded-full border py-1 pr-2 pl-1"
            >
              {product.imageUrl !== null ? (
                <RemoteImage
                  src={product.imageUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="bg-fog h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="bg-fog h-6 w-6 rounded-full" />
              )}
              <span className="text-ink max-w-[220px] truncate text-[13px]">{product.name}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((it) => it.id !== product.id))}
                aria-label={`${product.name} 제품 태그 삭제`}
                className="text-ash hover:text-ink cursor-pointer text-[14px] leading-none"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={isFull}
          placeholder="제품 이름으로 검색 (예: 모니터암)"
          className="border-ash/40 bg-paper text-ink placeholder:text-ash min-w-[220px] flex-1 rounded-[10px] border px-3 py-2 text-[15px] outline-none disabled:cursor-not-allowed"
        />
        {placementId !== null && (
          <button
            type="button"
            onClick={() => void importFromPlacement()}
            disabled={isImporting || isFull}
            className="border-ash/40 text-ink hover:bg-fog shrink-0 cursor-pointer rounded-[10px] border px-3 py-2 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? '불러오는 중...' : '배치에서 제품 불러오기'}
          </button>
        )}
      </div>

      {/* disabled만 걸면 끝인지 고장인지 구분이 안 된다 — 이유를 글로 알린다. */}
      {isFull && (
        <p className="text-ash text-[13px]">
          {isOwnListFull
            ? `제품은 ${DESK_FEED_MAX_PRODUCTS}개까지 붙일 수 있어요.`
            : `이 글에 붙은 제품이 이미 ${DESK_FEED_MAX_PRODUCTS}개라 새 제품을 더 붙일 수 없어요.`}
        </p>
      )}
      {importMessage !== null && <p className="text-ash text-[13px]">{importMessage}</p>}

      {isSearching && <p className="text-ash text-[13px]">검색 중...</p>}
      {/* 검색만 골라 죽는 503 — 폴백이 없으므로 "제품이 없다"로 보이면 안 된다(ADR-0019 결정 6). */}
      {settled?.status === 'unavailable' && (
        <p className="text-ash text-[13px]">
          지금은 제품 검색을 쓸 수 없어요. 잠시 뒤 다시 시도해주세요.
        </p>
      )}
      {settled?.status === 'error' && (
        <p className="text-ash text-[13px]">제품을 불러오지 못했어요. 다시 시도해주세요.</p>
      )}
      {settled?.status === 'ready' &&
        (settled.results.length === 0 ? (
          <p className="text-ash text-[13px]">검색 결과가 없어요.</p>
        ) : (
          <ul className="border-ash/30 mt-1 flex flex-col overflow-hidden rounded-[10px] border">
            {settled.results.map((product) => {
              const isPicked = selected.some((it) => it.id === product.id);
              return (
                <li key={product.id} className="border-ash/20 border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => addProduct(product)}
                    disabled={isPicked}
                    className="hover:bg-fog flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {product.imageUrl !== null ? (
                      <RemoteImage
                        src={product.imageUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="bg-fog h-10 w-10 shrink-0 rounded-[8px] object-cover"
                      />
                    ) : (
                      <span className="bg-fog h-10 w-10 shrink-0 rounded-[8px]" />
                    )}
                    <span className="text-ink min-w-0 flex-1 truncate text-[14px]">
                      {product.name}
                    </span>
                    <span className="text-ash shrink-0 text-[13px] tabular-nums">
                      {isPicked
                        ? '추가됨'
                        : product.priceKrw !== null
                          ? `${product.priceKrw.toLocaleString('ko-KR')}원`
                          : '가격 미정'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
};

export default DeskFeedProductPicker;
