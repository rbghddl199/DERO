// 카테고리 목록(평면 배열)을 트리 순서·깊이로 펴고, 상위로 고를 수 없는 id를 걸러 내는 순수 함수들.
// 서버도 사이클을 막지만(CATALOG_CATEGORY_PARENT_INVALID = 422) 화면에서 먼저 못 고르게 한다.

import type { CategoryResponse } from '@/api/admin/masters';

export interface CategoryTreeNode {
  category: CategoryResponse;
  /** 루트가 0 — 표·셀렉트 들여쓰기 단계 */
  depth: number;
}

/** 부모가 목록에 없는 항목(다른 페이지·삭제된 부모)은 루트로 취급한다 — 트리에서 통째로 사라지지 않게. */
function groupByParent(categories: CategoryResponse[]): Map<number | null, CategoryResponse[]> {
  const presentIds = new Set(categories.map((category) => category.id));
  const grouped = new Map<number | null, CategoryResponse[]>();

  for (const category of categories) {
    const parentId =
      category.parentId !== undefined && presentIds.has(category.parentId)
        ? category.parentId
        : null;
    const siblings = grouped.get(parentId) ?? [];
    grouped.set(parentId, [...siblings, category]);
  }

  return grouped;
}

function compareSiblings(left: CategoryResponse, right: CategoryResponse): number {
  const orderGap = (left.displayOrder ?? 0) - (right.displayOrder ?? 0);
  if (orderGap !== 0) return orderGap;
  return (left.name ?? '').localeCompare(right.name ?? '', 'ko-KR');
}

/** 루트부터 깊이 우선으로 펴서 화면이 그대로 순서대로 그릴 수 있게 만든다. */
export function buildCategoryTree(categories: CategoryResponse[]): CategoryTreeNode[] {
  const grouped = groupByParent(categories);
  const nodes: CategoryTreeNode[] = [];

  const visit = (parentId: number | null, depth: number): void => {
    const children = [...(grouped.get(parentId) ?? [])].sort(compareSiblings);
    for (const category of children) {
      nodes.push({ category, depth });
      if (category.id !== undefined) {
        visit(category.id, depth + 1);
      }
    }
  };

  visit(null, 0);
  return nodes;
}

/**
 * 상위로 고를 수 없는 id 집합 — 자기 자신과 자기 하위 트리 전부.
 * 자기 하위로 옮기면 사이클이 생겨 트리 순회가 무한 루프에 빠진다(AdminCategoryService.requireAcyclic).
 */
export function collectSelfAndDescendantIds(
  categories: CategoryResponse[],
  categoryId: number,
): Set<number> {
  const blocked = new Set<number>([categoryId]);

  // 부모가 이미 막힌 집합에 있으면 자식도 막는다 — 목록이 트리 순서가 아닐 수 있어 변화가 없을 때까지 돈다.
  let hasChanged = true;
  while (hasChanged) {
    hasChanged = false;
    for (const category of categories) {
      if (category.id === undefined || category.parentId === undefined) continue;
      if (blocked.has(category.id) || !blocked.has(category.parentId)) continue;
      blocked.add(category.id);
      hasChanged = true;
    }
  }

  return blocked;
}
