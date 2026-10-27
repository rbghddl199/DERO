'use client';
// 좌측 카테고리 사이드바 — 대분류(3D-icon+라벨) 목록. 카테고리는 정적 정본
// (constants/productCategoryGroup.ts, 2026-08-05 API 소비 제거)이라 mock/real 구분이 없다.
// 소분류는 이 사이드바가 아니라 ProductGrid의 태그(칩) 행이 담당한다 — `children` 아코디언
// 코드는 남겨 두지만 현재 내비 항목은 children을 채우지 않는다.
//
// **`children`에 루트 자신을 가리키는 '전체' 항목을 넣지 않는다** — 대분류 행 자체가 이미 그 루트의
// 전체 보기 링크라, 펼친 목록 안에 또 '전체'를 넣으면 같은 목적지가 두 번 보인다(2026-08-03 사용자
// 지적으로 제거). 셰브런은 펼침/접힘만 토글하고 내비게이션은 하지 않는다 — 대분류 라벨(Link)과 별개
// 클릭 타깃이다.
//
// md 미만에서 쓸 가로 칩 레일(ProductCategoryChipRail)도 이 파일에 같이 둔다 — 같은 groups prop과
// 같은 Link 목적지를 쓰는 같은 내비라 파일을 쪼갤 이유가 없다(2026-08-02 추가. 그전엔 사이드바가
// hidden md:block인데 대체 UI가 없어 768px 미만에서 카테고리를 바꿀 수단이 아예 없었다). 칩 레일은
// 아코디언을 얹지 않는다 — 가로 스크롤 레일에서의 펼침은 별개의 UI 문제라 스코프 밖.

import Link from 'next/link';
import { useState } from 'react';
import ProductCategoryIcon, { type CategoryIconKey } from './ProductCategoryIcon';

/** 포커스 링 — ErrorState.tsx가 쓰는 조합을 그대로 재사용한다(레포 유일 선례) */
const FOCUS_RING_CLASS =
  'focus-visible:outline-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2';

/** 사이드바·칩 레일이 렌더하는 내비 항목 — mock의 ProductCategoryGroup과 real의 카테고리 마스터
 *  루트를 같은 모양으로 정규화해서 받는다(정규화는 ProductGrid.tsx 책임, 이 컴포넌트는 출처를 모른다).
 *  `children`이 있으면(real 모드, 자식 있는 루트만) 사이드바가 그 행에 셰브런을 붙여 아코디언으로
 *  펼친다. */
export type ProductCategoryNavItem = {
  key: string;
  label: string;
  iconCategory: CategoryIconKey;
  /** 소분류(leaf) 목록 — 루트 자신은 포함하지 않는다(대분류 행 자체가 이미 전체 보기 링크).
   *  비어 있거나 undefined면 셰브런·아코디언을 렌더하지 않는다. */
  children?: { key: string; label: string }[];
};

type Props = {
  groups: ProductCategoryNavItem[];
  activeCategory: string | null;
  onSelectAllProducts?: () => void;
};

/** 대분류 한 행 — 라벨(Link, 그 루트의 전체 보기로 이동)과 셰브런(펼침/접힘 토글, 내비게이션 없음)이
 *  분리된 두 클릭 타깃이다. 자식이 있으면 셰브런이 붙고, 누르면 그 밑에 소분류 Link 목록이 펼쳐진다
 *  — 옵션이 <Link>라 클릭이 TransitionNavigator의 캡처 단계 인터셉트를 그대로 탄다(router.push를
 *  직접 부르지 않는다). 소분류 중 하나가 이미 선택된 상태로 마운트되면 처음부터 펼쳐서 보여준다. */
const CategoryNavRow = ({
  group,
  activeCategory,
}: {
  group: ProductCategoryNavItem;
  activeCategory: string | null;
}) => {
  const hasChildren = (group.children?.length ?? 0) > 0;
  const isChildActive =
    hasChildren && group.children!.some((child) => child.key === activeCategory);
  const [isExpanded, setIsExpanded] = useState(isChildActive);
  // 소분류(자식) 중 하나가 선택돼 있어도 대분류 행은 활성(볼드)으로 표시한다 — 롤업 관계.
  const isActive = group.key === activeCategory || isChildActive;

  return (
    <li>
      <div className="hover:bg-fog flex items-center gap-1 rounded-lg transition-colors">
        <Link
          href={`/product?category=${encodeURIComponent(group.key)}`}
          aria-current={isActive ? 'page' : undefined}
          className={`flex flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 ${FOCUS_RING_CLASS}`}
        >
          <span className="text-ash flex h-8 w-8 shrink-0 items-center justify-center">
            <ProductCategoryIcon category={group.iconCategory} width={20} height={20} />
          </span>
          <span
            className={`text-ink truncate text-[15px] ${isActive ? 'font-bold' : 'font-medium'}`}
          >
            {group.label}
          </span>
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={`${group.label} 하위 카테고리 ${isExpanded ? '접기' : '펼치기'}`}
            className={`text-ash hover:text-ink flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 mb-1 ml-8 space-y-0.5">
          {group.children!.map((child) => {
            const isSelected = child.key === activeCategory;
            return (
              <li key={child.key}>
                <Link
                  href={`/product?category=${encodeURIComponent(child.key)}`}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`hover:bg-fog block rounded-lg px-2 py-1.5 text-[13px] transition-colors ${FOCUS_RING_CLASS} ${
                    isSelected ? 'text-ink font-bold' : 'text-ash'
                  }`}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
};

/** md 미만 전용 가로 스크롤 칩 레일. 네이티브 스크롤바는 html.hide-scrollbar가 이미 지운다.
 *  목적지가 사이드바와 같은 `<Link href="/product?category=…">`라 카테고리 간 이동은
 *  TransitionNavigator가 자동으로 router.replace로 처리한다 — router.push를 직접 부르지 말 것. */
export const ProductCategoryChipRail = ({ groups, activeCategory }: Props) => {
  const chipClass = (isActive: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-[14px] transition-colors ${FOCUS_RING_CLASS} ${
      isActive ? 'bg-ink text-paper font-medium' : 'border-ash/40 text-ink hover:bg-fog border'
    }`;

  return (
    <nav aria-label="제품 카테고리" className="mb-6 flex gap-2 overflow-x-auto md:hidden">
      <Link
        href="/product"
        aria-current={activeCategory === null ? 'page' : undefined}
        className={chipClass(activeCategory === null)}
      >
        전체 제품
      </Link>
      {groups.map((group) => (
        <Link
          key={group.key}
          href={`/product?category=${encodeURIComponent(group.key)}`}
          aria-current={group.key === activeCategory ? 'page' : undefined}
          className={chipClass(group.key === activeCategory)}
        >
          {group.label}
        </Link>
      ))}
    </nav>
  );
};

const ProductCategorySidebar = ({ groups, activeCategory, onSelectAllProducts }: Props) => (
  <aside className="product-category-scrollbar sticky top-24 hidden max-h-[calc(100vh-8rem)] w-[190px] shrink-0 overflow-y-auto md:block">
    <nav aria-label="제품 카테고리">
      {/* 활성 표시는 볼드 텍스트만 — 회색 배경을 활성 상태로도 남겨두면 마우스를 떼도 hover가
          잔류한 것처럼 보인다는 제보가 있었다(2026-08-02). 배경은 hover에서만 뜬다.
          scroll 기본값(true) 그대로 — 분류를 바꾸면 새 목록을 맨 위에서부터 보여준다(2026-08-03
          사용자 확인). 실제 스크롤 처리는 TransitionNavigator가 클릭을 가로채 담당한다. */}
      <Link
        href="/product"
        onClick={onSelectAllProducts}
        aria-current={activeCategory === null ? 'page' : undefined}
        className={`text-ink hover:bg-fog block cursor-pointer rounded-lg px-2 py-2 text-[15px] transition-colors ${FOCUS_RING_CLASS} ${
          activeCategory === null ? 'font-bold' : 'font-semibold'
        }`}
      >
        전체 제품
      </Link>

      <ul className="mt-1 space-y-0.5">
        {groups.map((group) => (
          <CategoryNavRow key={group.key} group={group} activeCategory={activeCategory} />
        ))}
      </ul>
    </nav>
  </aside>
);

export default ProductCategorySidebar;
