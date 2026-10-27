// 커뮤니티 북마크 상태 — 목록·상세 어디서 눌러도 같은 값을 보게 하는 공유 스토어.
// CommunityGallery의 posts 배열과 CommunityDetail의 post prop은 서로 다른 소스(전자는 클라이언트
// 상태, 후자는 매 내비게이션마다 getCommunityPost()가 새로 만든 서버 데이터)라 각자 useState로
// isBookmarked를 들면 한쪽에서 누른 게 다른 화면엔 반영되지 않는다 — 오버라이드만 여기 두고,
// 실제 표시값은 항상 "오버라이드 ?? 게시물 기본값(mock의 index%5===0)"으로 계산한다.
//
// localStorage에 저장해 새로고침해도 유지된다. skipHydration 이유는 productLikesStore.ts 주석 참고
// (서버 렌더와 클라이언트 첫 렌더가 어긋나는 하이드레이션 문제를 막기 위해 자동 복원을 끄고
// PersistedInteractionsBootstrap이 마운트 후 수동으로 rehydrate한다).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mapSetJsonStorage } from './mapSetJsonStorage';

type CommunityBookmarksStore = {
  overrides: ReadonlyMap<string, boolean>;
  /** initialValue는 아직 오버라이드가 없을 때 기준이 되는 게시물의 원래 mock 값 */
  toggle: (id: string, initialValue: boolean) => boolean;
};

export const useCommunityBookmarksStore = create<CommunityBookmarksStore>()(
  persist(
    (set, get) => ({
      overrides: new Map(),

      toggle: (id, initialValue) => {
        const overrides = get().overrides;
        const current = overrides.has(id) ? (overrides.get(id) as boolean) : initialValue;
        const next = !current;
        const nextOverrides = new Map(overrides);
        nextOverrides.set(id, next);
        set({ overrides: nextOverrides });
        return next;
      },
    }),
    {
      name: 'dero-community-bookmarks',
      storage: mapSetJsonStorage,
      skipHydration: true,
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);
