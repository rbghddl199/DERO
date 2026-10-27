// 제품 좋아요 상태 — 목록·상세 어디서 눌러도 같은 값을 보게 하는 공유 스토어.
// 이전엔 ProductGrid·ProductLikeControl이 각자 useState로 들고 있어 목록에서 좋아요를 누르고
// 상세로 들어가면(혹은 그 반대) 해제된 것처럼 보였다 — 두 화면이 같은 스토어를 구독해야 한다.
//
// real 모드에서는 **서버가 정본이다**(DERO-356). 토글은 PUT/DELETE /products/{id}/like로 써
// 내려가고(낙관적 갱신 후 실패하면 되돌린다), 초기값은 GET /products?liked=me로 받는다
// (PersistedInteractionsBootstrap이 로그인 확인 후 부른다). 그래서 다른 기기에서 눌러도 같은 값이
// 보인다 — 342가 배치 좋아요에 세운 계약과 같다. mock 모드에는 서버가 없어 localStorage가 정본이다.
//
// **키는 두 모드가 다르다**: mock은 로컬 카탈로그의 문자열 id('monitor-27'), real은 백엔드 숫자 id를
// 문자열로 옮긴 것('27' — catalogAdapter.toProductSpec이 String(dto.id)로 만든다). 그래서 real 모드의
// 서버 호출만 키를 Number()로 되돌리고, 숫자로 안 풀리는 키(모드를 바꾸기 전에 쌓인 localStorage
// 값)는 서버로 보내지 않는다 — 보내봐야 404다.
//
// localStorage에 저장해 새로고침해도 유지된다. skipHydration: true인 이유 — persist 기본값대로
// 스토어 생성 시점에 곧바로 복원하면, 서버 렌더(SSR엔 localStorage가 없어 항상 빈 Set)와 클라이언트
// 첫 렌더(이미 복원된 값)가 달라 하이드레이션이 어긋난다. 그래서 자동 복원을 꺼두고
// PersistedInteractionsBootstrap이 마운트 후(하이드레이션이 끝난 뒤) 수동으로 rehydrate한다.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deleteProductLike, putProductLike } from '@/api/interaction';
import { getLikedProducts } from '@/api/product';
import { isMockApi } from '@/constants/api';
import type { ProductDetailResponse } from '@/types/catalog';
import { mapSetJsonStorage } from './mapSetJsonStorage';

type ProductLikesStore = {
  likedIds: ReadonlySet<string>;
  /** 토글 후의 상태(좋아요 됨 여부)를 반환 — 호출부가 토스트 문구를 바로 정할 수 있게 */
  toggleLike: (id: string) => boolean;
  /**
   * real 모드에서 서버 값(`GET /products?liked=me`)으로 통째로 덮고 **받은 제품을 그대로 돌려준다** —
   * 찜 목록 화면이 id만으로는 카드를 못 그리기 때문이다(마이페이지는 시뮬레이터 엔진 카탈로그가
   * 적재된 적이 없어 id로 제품을 찾을 데가 없다). 돌려주지 않으면 그 화면이 같은 요청을 한 번 더
   * 쏘게 되고, 두 응답 사이에 목록이 비어 보이는 틈이 생긴다.
   * mock 모드에서는 아무것도 하지 않고 빈 배열이다. 실패는 던진다.
   */
  syncFromServer: () => Promise<ProductDetailResponse[]>;
};

const withId = (ids: ReadonlySet<string>, id: string, liked: boolean): Set<string> => {
  const next = new Set(ids);
  if (liked) next.add(id);
  else next.delete(id);
  return next;
};

export const useProductLikesStore = create<ProductLikesStore>()(
  persist(
    (set, get) => ({
      likedIds: new Set(),

      toggleLike: (id) => {
        const willLike = !get().likedIds.has(id);
        set({ likedIds: withId(get().likedIds, id, willLike) });

        const productId = Number(id);
        if (!isMockApi() && Number.isInteger(productId)) {
          const write = willLike ? putProductLike : deleteProductLike;
          // 토글은 멱등 204(본문 없음)라 성공했을 때 확정할 값이 없다. 실패하면 화면만 앞서 나가지
          // 않게 되돌리되, 그 사이 사용자가 또 눌렀으면 그쪽 의도가 이겨야 하므로 건드리지 않는다.
          void write(productId).catch(() => {
            if (get().likedIds.has(id) === willLike) {
              set({ likedIds: withId(get().likedIds, id, !willLike) });
            }
          });
        }

        return willLike;
      },

      syncFromServer: async () => {
        if (isMockApi()) return [];
        const liked = await getLikedProducts();
        set({ likedIds: new Set(liked.map((product) => String(product.id))) });
        return liked;
      },
    }),
    {
      name: 'dero-product-likes',
      storage: mapSetJsonStorage,
      skipHydration: true,
      partialize: (state) => ({ likedIds: state.likedIds }),
    },
  ),
);
