// 데스크피드 상세의 이전/다음 글 이동용 — 갤러리가 불러온 글 순서(정렬 탭·태그 필터가 반영된 순서)를
// 세션 메모리에 남긴다. GET /desk-feeds는 커서 페이징뿐이라 상세에서 이웃 글을 서버에 물을 방법이 없다.
// persist 없음: 새로고침·직접 URL 진입이면 순서를 모르므로 상세가 내비게이션을 그리지 않는 게 정직하다.

import { create } from 'zustand';

export type DeskFeedNavEntry = {
  id: string;
  /** 이웃 글 링크에 보일 이름 — 제목이 없는 도메인이라 캡션 첫 줄이고, 캡션이 없으면 폴백 문구다. */
  label: string;
};

type DeskFeedNavStore = {
  /** 갤러리에 그려진 순서 그대로 — 무한 스크롤로 페이지가 붙을 때마다 통째로 갱신된다. */
  entries: readonly DeskFeedNavEntry[];
  setEntries: (entries: readonly DeskFeedNavEntry[]) => void;
};

export const useDeskFeedNavStore = create<DeskFeedNavStore>()((set) => ({
  entries: [],
  setEntries: (entries) => set({ entries }),
}));
