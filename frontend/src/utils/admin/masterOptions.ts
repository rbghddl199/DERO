// 마스터 목록(브랜드·카테고리·상판 재질·VESA 규격) → 셀렉트 옵션 변환. 카테고리는 parentId로 트리를
// 만들어 들여쓰기 라벨로 펼친다 — 셀렉트 하나에 계층을 보이려는 최소 표현이다.

import type { CategoryResponse, VesaSpecResponse } from '@/api/admin/masters';
import type { SelectOption } from '@/types/admin/productForm';

type NamedMaster = {
  id?: number;
  name?: string;
};

/** id·name이 없는 행은 고를 수 없으니 버린다(openapi 스키마상 둘 다 선택 필드다). */
export const toNameOptions = (items: readonly NamedMaster[]): SelectOption[] =>
  items
    .filter((item): item is { id: number; name: string } => {
      return typeof item.id === 'number' && typeof item.name === 'string';
    })
    .map((item) => ({ value: String(item.id), label: item.name }));

const KOREAN_NAME_COLLATOR = new Intl.Collator('ko-KR', {
  numeric: true,
  sensitivity: 'base',
});

/** 제품 브랜드 선택지용 이름 내림차순 정렬. 원본 마스터 배열은 변경하지 않는다. */
export const toDescendingNameOptions = (items: readonly NamedMaster[]): SelectOption[] =>
  toNameOptions(items).sort((left, right) => KOREAN_NAME_COLLATOR.compare(right.label, left.label));

/** VESA 규격 표기 — 마스터 화면(VesaSpecsAdmin)·제품 상세 요약과 같은 문구를 쓴다. */
export const vesaSpecLabel = (widthMm: number, heightMm: number): string =>
  `${widthMm} × ${heightMm} mm`;

/** name이 없는 마스터라 가로·세로로 라벨을 만든다. 셋 중 하나라도 없으면 고를 수 없으니 버리고,
 *  가로 → 세로 순으로 정렬해 목록 순서를 고정한다. */
export const toVesaSpecOptions = (specs: readonly VesaSpecResponse[]): SelectOption[] =>
  specs
    .filter((spec): spec is { id: number; widthMm: number; heightMm: number } => {
      return (
        typeof spec.id === 'number' &&
        typeof spec.widthMm === 'number' &&
        typeof spec.heightMm === 'number'
      );
    })
    .sort((left, right) => left.widthMm - right.widthMm || left.heightMm - right.heightMm)
    .map((spec) => ({
      value: String(spec.id),
      label: vesaSpecLabel(spec.widthMm, spec.heightMm),
    }));

const DEPTH_PREFIX = '— ';

export const toCategoryTreeOptions = (categories: readonly CategoryResponse[]): SelectOption[] => {
  const childrenByParent = new Map<number | null, CategoryResponse[]>();

  for (const category of categories) {
    const parentKey = category.parentId ?? null;
    const siblings = childrenByParent.get(parentKey) ?? [];
    childrenByParent.set(parentKey, [...siblings, category]);
  }

  const options: SelectOption[] = [];

  const walk = (parentKey: number | null, depth: number): void => {
    const children = childrenByParent.get(parentKey) ?? [];
    const sorted = [...children].sort(
      (left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0),
    );

    for (const child of sorted) {
      if (typeof child.id !== 'number' || typeof child.name !== 'string') continue;
      options.push({
        value: String(child.id),
        label: `${DEPTH_PREFIX.repeat(depth)}${child.name}`,
      });
      walk(child.id, depth + 1);
    }
  };

  walk(null, 0);

  // 부모가 이번 페이지에 안 실려 트리에서 빠진 행은 뒤에 평평하게 붙인다 — 조용히 사라지면
  // 그 카테고리를 영원히 고를 수 없다.
  const placed = new Set(options.map((option) => option.value));
  for (const category of categories) {
    if (typeof category.id !== 'number' || typeof category.name !== 'string') continue;
    if (placed.has(String(category.id))) continue;
    options.push({ value: String(category.id), label: category.name });
  }

  return options;
};
