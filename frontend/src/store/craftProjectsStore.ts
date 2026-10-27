// 시뮬레이터에서 저장한 데스크테리어를 세션 동안 로컬에 유지 — /craft 목록(CraftDeskCollection)이
// 서버 목록과 이 스토어를 병합해 보여준다. userPostsStore.ts와 같은 이유·같은 구조: 백엔드가 항상
// 떠 있지 않은 로컬 개발 환경에서, simulatorStore의 저장 API 호출이 실패해도 "방금 저장한 결과"가
// 화면에 보여야 한다(2026-07-31 사용자 확인 — 저장 후 /craft에 안 나타나던 문제).
//
// persist를 쓰지 않는다: 썸네일이 캔버스 캡처로 만든 blob: object URL이라 localStorage에 저장해도
// 새 문서(새로고침)에서는 무효한 주소다 — communityBookmarksStore 등과 달리 이 데이터는 저장할 값이
// 아니다. 클라이언트 내비게이션(시뮬레이터 → /craft) 동안만 유지되면 충분하다.

import { create } from 'zustand';
import type { DeskProject } from '@/types/craft';

type CraftProjectsStore = {
  /** id가 같으면 덮어쓰는 맵 방식이 아니라 배열로 둔다 — DeskProject[]를 그대로 쓰는 곳(CraftDeskCollection)이
   *  배열을 기대하고, 항목 수가 세션당 많아야 한두 개라 배열 선형 탐색 비용이 무의미하다. */
  projects: readonly DeskProject[];
  /** 같은 id가 있으면 그 자리를 새 값으로 교체(최신 정보 유지), 없으면 맨 앞에 추가 */
  upsertProject: (project: DeskProject) => void;
  /** 로컬 임시 id를 서버가 내려준 진짜 id로 교체할 때 — 임시 항목을 지우고 새 id로 다시 넣는다 */
  replaceProjectId: (oldId: string, project: DeskProject) => void;
  /** 삭제 — 서버에 없는(한 번도 저장 API가 성공하지 않은) 로컬 전용 프로젝트는 deletePlacement API가
   *  의미 없으므로(CraftDeskCollection.tsx가 이 경우만 호출) 로컬 목록에서 직접 제거한다. */
  removeProject: (id: string) => void;
};

export const useCraftProjectsStore = create<CraftProjectsStore>()((set) => ({
  projects: [],

  upsertProject: (project) => {
    set((state) => ({
      projects: [project, ...state.projects.filter((p) => p.id !== project.id)],
    }));
  },

  replaceProjectId: (oldId, project) => {
    set((state) => ({
      projects: [project, ...state.projects.filter((p) => p.id !== oldId && p.id !== project.id)],
    }));
  },

  removeProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },
}));
