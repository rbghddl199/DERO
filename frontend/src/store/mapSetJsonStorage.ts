// zustand persist가 Map·Set을 담은 상태를 localStorage에 저장할 때 쓰는 공용 스토리지 설정.
// JSON.stringify는 Map·Set을 그냥 "{}"로 뭉개버리므로(순회 가능한 값인데 자체 toJSON이 없다),
// 원본 타입을 표시하는 래퍼 객체로 감쌌다가 읽을 때 복원한다. productLikesStore(Set)와
// communityBookmarksStore(Map) 둘 다 쓴다.
//
// getItem/setItem/removeItem을 서버에서 그냥 호출하면 `localStorage is not defined`로 죽는다 —
// 이 프로젝트 컴포넌트들은 'use client'라도 Next.js가 SSR 시 한 번 실행하기 때문이다. window가
// 없을 때는 아무 것도 하지 않는 스토리지로 대체해 스토어 생성 자체는 서버에서도 안전하게 만든다.
// (실제 값 복원은 store 쪽에서 skipHydration + 마운트 후 수동 rehydrate로 처리 — SSR 결과와
// 클라이언트 첫 렌더가 어긋나 하이드레이션이 깨지는 것을 막기 위해서다.)

import { createJSONStorage } from 'zustand/middleware';

type TaggedMap = { __type: 'Map'; entries: [string, unknown][] };
type TaggedSet = { __type: 'Set'; values: unknown[] };
type Tagged = TaggedMap | TaggedSet;

const replacer = (_key: string, value: unknown) => {
  if (value instanceof Map) return { __type: 'Map', entries: Array.from(value.entries()) };
  if (value instanceof Set) return { __type: 'Set', values: Array.from(value) };
  return value;
};

const reviver = (_key: string, value: unknown) => {
  if (value && typeof value === 'object' && '__type' in value) {
    const tagged = value as Tagged;
    if (tagged.__type === 'Map') return new Map(tagged.entries);
    if (tagged.__type === 'Set') return new Set(tagged.values);
  }
  return value;
};

const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export const mapSetJsonStorage = createJSONStorage(
  () => (typeof window === 'undefined' ? noopStorage : window.localStorage),
  { replacer, reviver },
);
