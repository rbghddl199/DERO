// 커뮤니티 좋아요 상태 — communityBookmarksStore.ts와 같은 이유·같은 구조의 공유 스토어
// (목록·상세가 서로 다른 데이터 소스라 오버라이드만 여기 두고, 표시값은 항상
// "오버라이드 ?? 게시물 기본값"으로 계산한다). localStorage 저장·skipHydration 이유도 동일.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mapSetJsonStorage } from './mapSetJsonStorage';

type CommunityLikesStore = {
  overrides: ReadonlyMap<string, boolean>;
  /** initialValue는 아직 오버라이드가 없을 때 기준이 되는 게시물의 원래 mock 값 */
  toggle: (id: string, initialValue: boolean) => boolean;
};

export const useCommunityLikesStore = create<CommunityLikesStore>()(
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
      name: 'dero-community-likes',
      storage: mapSetJsonStorage,
      skipHydration: true,
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);
