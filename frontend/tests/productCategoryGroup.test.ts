// 카테고리 정적 정본(10그룹+소분류, 2026-08-05) — 그룹/소분류 키 해석(resolveCategoryKey)과
// 클라 필터(matchesCategoryFilter), 그룹 판별(getCategoryGroup)의 회귀 가드.
import { describe, expect, it } from 'vitest';

import {
  categoryIdsOf,
  getCategoryGroup,
  HIDDEN_CATEGORY_NAMES,
  matchesCategoryFilter,
  PRODUCT_CATEGORY_GROUPS,
  PRODUCT_CATEGORY_NAV_GROUPS,
  resolveCategoryKey,
} from '@/constants/productCategoryGroup';
import type { ProductSpec } from '@/three/scene/product';

const mockProduct = (category: ProductSpec['category']): ProductSpec =>
  ({ category }) as ProductSpec;
const realProduct = (categoryName: string | undefined): ProductSpec =>
  ({ categoryName }) as ProductSpec;

describe('PRODUCT_CATEGORY_GROUPS', () => {
  it('내비 노출은 9그룹이고 기타가 항상 마지막이다(전체는 각 화면이 첫 칸에 합성)', () => {
    expect(PRODUCT_CATEGORY_NAV_GROUPS).toHaveLength(9);
    expect(PRODUCT_CATEGORY_NAV_GROUPS.at(-1)?.key).toBe('etc');
  });

  it("숨김은 '책상' 하나다", () => {
    expect([...HIDDEN_CATEGORY_NAMES]).toEqual(['책상']);
  });

  it('원시 ProductCategory 12종이 전부 정확히 한 그룹에 속한다', () => {
    const all = PRODUCT_CATEGORY_GROUPS.flatMap((group) => group.categories);
    expect(all.length).toBe(new Set(all).size);
    for (const raw of [
      'desk',
      'monitor',
      'monitor-arm',
      'keyboard',
      'mouse',
      'speaker',
      'water-bottle',
      'lamp',
      'mug',
      'plant',
      'decor',
      'chair',
    ] as const) {
      expect(all).toContain(raw);
    }
  });
});

describe('resolveCategoryKey', () => {
  it('그룹 key는 (그룹, sub: null)로 푼다', () => {
    const resolved = resolveCategoryKey('keyboard-mouse');
    expect(resolved?.group.key).toBe('keyboard-mouse');
    expect(resolved?.sub).toBeNull();
  });

  it('소분류 key는 부모 그룹까지 같이 푼다', () => {
    const resolved = resolveCategoryKey('sub-cup');
    expect(resolved?.group.key).toBe('decor');
    expect(resolved?.sub?.label).toBe('컵');
  });

  it("미지의 key(없앤 'accessory' 옛 링크 포함)와 숨김 'desk'는 null — 전체 보기 폴백", () => {
    expect(resolveCategoryKey('accessory')).toBeNull();
    expect(resolveCategoryKey('desk')).toBeNull();
  });
});

describe('matchesCategoryFilter', () => {
  const decor = PRODUCT_CATEGORY_GROUPS.find((g) => g.key === 'decor')!;
  const cup = decor.children!.find((c) => c.key === 'sub-cup')!;

  it('mock 제품은 category 유니온으로 매칭한다 — mug는 데코 그룹과 컵 소분류 양쪽에 잡힌다', () => {
    expect(matchesCategoryFilter(mockProduct('mug'), decor)).toBe(true);
    expect(matchesCategoryFilter(mockProduct('mug'), cup)).toBe(true);
    expect(matchesCategoryFilter(mockProduct('keyboard'), decor)).toBe(false);
  });

  it('real 제품(category 없음)은 categoryName을 라벨과 공백 무시 비교한다', () => {
    const monitor = PRODUCT_CATEGORY_GROUPS.find((g) => g.key === 'monitor')!;
    expect(matchesCategoryFilter(realProduct('모니터·모니터암'), monitor)).toBe(true);
    expect(matchesCategoryFilter(realProduct('모니터 · 모니터암'), monitor)).toBe(true);
    // 그룹 필터는 자식 라벨도 히트로 친다(백엔드가 소분류 이름으로 태깅한 제품)
    expect(matchesCategoryFilter(realProduct('모니터암'), monitor)).toBe(true);
    expect(matchesCategoryFilter(realProduct('조명'), monitor)).toBe(false);
    expect(matchesCategoryFilter(realProduct(undefined), monitor)).toBe(false);
  });

  it('원시 매핑이 없는 소분류(헤드폰 등)는 mock에서 항상 0건이다', () => {
    const sound = PRODUCT_CATEGORY_GROUPS.find((g) => g.key === 'sound')!;
    const headphone = sound.children!.find((c) => c.key === 'sub-headphone')!;
    expect(matchesCategoryFilter(mockProduct('speaker'), headphone)).toBe(false);
    expect(matchesCategoryFilter(mockProduct('speaker'), sound)).toBe(true);
  });
});

describe('categoryIdsOf — 실 DB 트리 id 하드코딩 매핑(2026-08-05, 로컬=배포 실측)', () => {
  const group = (key: string) => PRODUCT_CATEGORY_GROUPS.find((g) => g.key === key)!;

  it('그룹은 루트 id 하나다 — 서버가 하위를 롤업하므로 자식 id를 합치면 제품이 중복된다', () => {
    expect(categoryIdsOf(group('monitor'))).toEqual([52]);
    expect(categoryIdsOf(group('decor'))).toEqual([58]);
    expect(categoryIdsOf(group('organizer'))).toEqual([57]);
    expect(categoryIdsOf(group('chair'))).toEqual([59]);
  });

  it('소분류는 그 id 하나다', () => {
    const subMonitor = group('monitor').children!.find((c) => c.key === 'sub-monitor')!;
    expect(categoryIdsOf(subMonitor)).toEqual([62]);
    const subMouse = group('keyboard-mouse').children!.find((c) => c.key === 'sub-mouse')!;
    expect(categoryIdsOf(subMouse)).toEqual([65]);
    const subCup = group('decor').children!.find((c) => c.key === 'sub-cup')!;
    expect(categoryIdsOf(subCup)).toEqual([76]);
  });

  it('내비 9그룹 전부 루트 id가 있고, 그룹·소분류 id는 전체에서 중복이 없다', () => {
    for (const g of PRODUCT_CATEGORY_NAV_GROUPS) {
      expect(g.categoryId, g.key).toBeTypeOf('number');
    }
    const all = PRODUCT_CATEGORY_GROUPS.flatMap((g) => [
      ...(g.categoryId != null ? [g.categoryId] : []),
      ...(g.children ?? []).flatMap((c) => (c.categoryId != null ? [c.categoryId] : [])),
    ]);
    expect(all.length).toBe(new Set(all).size);
  });
});

describe('getCategoryGroup', () => {
  it('category 유니온이 있으면 그 그룹으로 — water-bottle은 기타, mug는 데코', () => {
    expect(getCategoryGroup(mockProduct('water-bottle')).key).toBe('etc');
    expect(getCategoryGroup(mockProduct('mug')).key).toBe('decor');
    expect(getCategoryGroup(mockProduct('chair')).key).toBe('chair');
  });

  it('category가 없으면 구조 필드로 판별하고, 그래도 모르면 기타로 떨어진다', () => {
    expect(getCategoryGroup({ kind: 'lamp' } as ProductSpec).key).toBe('lamp');
    expect(getCategoryGroup({ kind: 'surface' } as ProductSpec).key).toBe('desk');
    expect(getCategoryGroup({ monitor: {} } as unknown as ProductSpec).key).toBe('monitor');
    expect(getCategoryGroup({} as ProductSpec).key).toBe('etc');
  });
});
