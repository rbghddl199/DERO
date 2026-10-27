// useCatalogPage의 순수 리듀서(appendPage) 단위 테스트 — 스테일 페이지 가드가 핵심이다.
// 이게 없으면 카테고리 전환 중 늦게 도착한 페이지가 두 목록을 이어 붙인다. 다중 id 그룹
// (모니터·모니터암=900+901 등)은 id별 커서 스트림을 순차 소진하므로 스트림 전환도 여기서 가드한다.
import { describe, it, expect } from 'vitest';
import { appendPage, type CatalogPage, type CatalogPageState } from '../src/hooks/useCatalogPage';
import type { ProductSpec } from '../src/three/scene/product';

const spec = (id: string): ProductSpec => ({
  id,
  name: `이름 ${id}`,
  kind: 'prop',
  widthMm: 100,
  depthMm: 100,
  heightMm: 100,
  material: { class: 'plastic', baseColor: 0xffffff, roughness: 0.6, metalness: 0 },
});

const page = (ids: string[], nextCursor: string | null, totalCount = 0): CatalogPage => ({
  specs: ids.map(spec),
  nextCursor,
  hasNext: nextCursor !== null,
  totalCount,
});

const loaded = (
  streamKey: string,
  ids: string[],
  next: { idIndex: number; cursor: string | null; hasNext: boolean },
  totalCount = 0,
): CatalogPageState => ({
  status: 'loaded',
  streamKey,
  specs: ids.map(spec),
  nextIdIndex: next.idIndex,
  nextCursor: next.cursor,
  hasNext: next.hasNext,
  totalCount,
});

const first = { idIndex: 0, cursor: null };

describe('appendPage 최초 페이지 (idIndex=0, cursor=null)', () => {
  it('loading 상태를 loaded로 바꾼다', () => {
    const next = appendPage({ status: 'loading' }, '900', first, page(['a', 'b'], 'c2'), false);
    expect(next).toEqual(loaded('900', ['a', 'b'], { idIndex: 0, cursor: 'c2', hasNext: true }));
  });

  it('failed 상태에서도 받는다 (재시도 경로)', () => {
    const next = appendPage({ status: 'failed' }, '[null,""]', first, page(['a'], null), false);
    expect(next?.status).toBe('loaded');
  });

  it('같은 카테고리가 이미 loaded면 버린다 — 중복 첫 페이지가 목록을 되감으면 안 된다', () => {
    const cur = loaded('900', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true });
    expect(appendPage(cur, '900', first, page(['a'], 'c2'), false)).toBeNull();
  });

  it('다른 카테고리가 loaded면 통째로 갈아끼운다', () => {
    const cur = loaded('900', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true });
    const next = appendPage(cur, '902', first, page(['z'], null), false);
    expect(next).toEqual(loaded('902', ['z'], { idIndex: 0, cursor: null, hasNext: false }));
  });
});

describe('appendPage 이어붙이기 (같은 스트림)', () => {
  const cur = loaded('900', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true });

  it('(idIndex, cursor)가 기대한 다음 요청과 맞으면 뒤에 붙이고 커서를 갱신한다', () => {
    const next = appendPage(cur, '900', { idIndex: 0, cursor: 'c2' }, page(['b'], 'c3'), false);
    expect(next).toEqual(loaded('900', ['a', 'b'], { idIndex: 0, cursor: 'c3', hasNext: true }));
  });

  it('마지막 페이지 + 남은 스트림 없음이면 hasNext가 false로 내려간다', () => {
    const next = appendPage(cur, '900', { idIndex: 0, cursor: 'c2' }, page(['b'], null), false);
    expect(next?.status === 'loaded' && next.hasNext).toBe(false);
  });

  it('커서가 어긋나면 버린다 — 재시도가 앞질러 도착한 경우', () => {
    const ahead = loaded('900', ['a'], { idIndex: 0, cursor: 'c9', hasNext: true });
    expect(
      appendPage(ahead, '900', { idIndex: 0, cursor: 'c2' }, page(['b'], 'c3'), false),
    ).toBeNull();
  });

  it('카테고리가 바뀐 뒤 도착한 페이지는 버린다 — 두 목록이 섞이면 안 된다', () => {
    const other = loaded('902', ['z'], { idIndex: 0, cursor: 'c2', hasNext: true });
    expect(
      appendPage(other, '900', { idIndex: 0, cursor: 'c2' }, page(['b'], 'c3'), false),
    ).toBeNull();
  });

  it('loaded가 아니면 버린다 (리셋된 뒤 도착)', () => {
    expect(
      appendPage(
        { status: 'loading' },
        '900',
        { idIndex: 0, cursor: 'c2' },
        page(['b'], 'c3'),
        false,
      ),
    ).toBeNull();
  });
});

describe('appendPage 다중 id 스트림 전환 (900,901 같은 그룹)', () => {
  it('스트림이 끝나도 다음 id가 남아 있으면 hasNext를 유지하고 다음 요청을 (idIndex+1, null)로 가리킨다', () => {
    const cur = loaded('900,901', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true });
    const next = appendPage(cur, '900,901', { idIndex: 0, cursor: 'c2' }, page(['b'], null), true);
    expect(next).toEqual(
      loaded('900,901', ['a', 'b'], { idIndex: 1, cursor: null, hasNext: true }),
    );
  });

  it('다음 스트림의 첫 페이지(idIndex=1, cursor=null)는 기대한 요청일 때만 이어 붙인다', () => {
    const cur = loaded('900,901', ['a', 'b'], { idIndex: 1, cursor: null, hasNext: true });
    const next = appendPage(cur, '900,901', { idIndex: 1, cursor: null }, page(['c'], null), false);
    expect(next).toEqual(
      loaded('900,901', ['a', 'b', 'c'], { idIndex: 1, cursor: null, hasNext: false }),
    );
  });

  it('idIndex가 어긋난 늦은 페이지는 버린다 — 스트림을 건너뛰거나 되감으면 안 된다', () => {
    const cur = loaded('900,901', ['a', 'b'], { idIndex: 1, cursor: null, hasNext: true });
    expect(
      appendPage(cur, '900,901', { idIndex: 0, cursor: 'c2' }, page(['x'], null), true),
    ).toBeNull();
  });
});

describe('appendPage 불변성', () => {
  it('이전 상태의 배열을 변형하지 않는다', () => {
    const prev = loaded('900', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true });
    const before = prev.status === 'loaded' ? prev.specs : [];
    appendPage(prev, '900', { idIndex: 0, cursor: 'c2' }, page(['b'], null), false);
    expect(before).toHaveLength(1);
  });
});

// 화면의 "N개" 표기는 서버 totalCount다. 목록 경로(q 없음)의 백엔드는 매 페이지 COUNT(*)를 피하려고
// **첫 페이지에만** 값을 채우고 이후 페이지엔 0을 싣는다 — 뒤 페이지 값으로 덮으면 개수가 0으로
// 떨어진다. 다중 id 그룹은 스트림마다 첫 페이지가 있으므로 합산해야 전체가 된다.
describe('appendPage totalCount', () => {
  it('첫 페이지 값을 그대로 싣는다', () => {
    const next = appendPage({ status: 'loading' }, 'k', first, page(['a'], 'c2', 167), false);
    expect(next?.status === 'loaded' && next.totalCount).toBe(167);
  });

  it('같은 스트림의 두 번째 페이지가 0을 실어 와도 개수가 떨어지지 않는다', () => {
    const cur = loaded('k', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true }, 167);
    const next = appendPage(cur, 'k', { idIndex: 0, cursor: 'c2' }, page(['b'], null, 0), false);
    expect(next?.status === 'loaded' && next.totalCount).toBe(167);
  });

  it('다음 id 스트림의 첫 페이지는 더한다 — 소분류 다중 선택의 전체 개수', () => {
    const cur = loaded('k', ['a'], { idIndex: 1, cursor: null, hasNext: true }, 12);
    const next = appendPage(cur, 'k', { idIndex: 1, cursor: null }, page(['b'], null, 30), false);
    expect(next?.status === 'loaded' && next.totalCount).toBe(42);
  });

  it('스트림이 바뀌면(검색어·카테고리 변경) 첫 페이지에서 다시 센다', () => {
    const cur = loaded('k', ['a'], { idIndex: 0, cursor: 'c2', hasNext: true }, 167);
    const next = appendPage(cur, 'k2', first, page(['z'], null, 3), false);
    expect(next).toEqual(loaded('k2', ['z'], { idIndex: 0, cursor: null, hasNext: false }, 3));
  });
});
