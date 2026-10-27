// 견적서 행 조립·합계 회귀 가드 — 책상(제품 규격 / 직접 입력 규격)이 목록과 합계에 들어가는지.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { deskGroup, groupBySpec, sumGroups } from '../src/components/simulator/EstimatePanel';
import { setCatalog } from '../src/three/scene/product';
import type { MaterialSkin, ProductSpec } from '../src/three/scene/product';
import type { DeskConfig } from '../src/three/core/deskConfig';
import type { PlacedItem } from '../src/three/scene/scene';

const SKIN: MaterialSkin = { class: 'plastic', baseColor: 0xffffff, roughness: 0.5, metalness: 0 };

const spec = (id: string, name: string, priceKrw?: number): ProductSpec => ({
  id,
  name,
  kind: 'prop',
  widthMm: 100,
  depthMm: 100,
  heightMm: 100,
  material: SKIN,
  priceKrw,
});

// groupBySpec은 item.spec만 읽는다 — THREE.Group·collider를 진짜로 만들 필요가 없다.
const item = (s: ProductSpec): PlacedItem => ({ spec: s }) as unknown as PlacedItem;

const DESK_SPEC: ProductSpec = { ...spec('102', '오크 책상 1200', 189000), kind: 'surface' };
const KEYBOARD = spec('1009', '키보드', 120000);
const DIY = spec('1099', '자작 선반'); // 가격 미정

const PRODUCT_DESK: DeskConfig = {
  source: 'product',
  productId: '102',
  widthMm: 1200,
  depthMm: 600,
  heightMm: 720,
  topThicknessMm: 25,
  materialId: 'oak',
  frameType: 't-frame',
};
const CUSTOM_DESK: DeskConfig = { ...PRODUCT_DESK, source: 'custom', productId: undefined };

beforeEach(() => {
  // real 모드처럼 카탈로그를 배타 전환한다 — deskGroup이 productId를 여기서 푼다.
  setCatalog([DESK_SPEC, KEYBOARD, DIY]);
});
afterAll(() => {
  setCatalog(null); // 목업 PRODUCTS로 되돌린다(모듈 전역이라 다른 스위트에 샌다)
});

describe('견적서 행 조립', () => {
  it('제품 규격 책상은 정가를 가진 링크 가능한 줄이 된다', () => {
    expect(deskGroup(PRODUCT_DESK)).toEqual({
      id: '102',
      name: '오크 책상 1200',
      imageUrl: undefined,
      priceKrw: 189000,
      qty: 1,
      linkable: true,
    });
  });

  it('직접 입력 규격 책상은 0원 줄이고 상세 페이지가 없다 (D18)', () => {
    expect(deskGroup(CUSTOM_DESK)).toEqual({
      id: 'custom-desk',
      name: '직접 입력 책상',
      priceKrw: 0,
      qty: 1,
      linkable: false,
    });
  });

  it('카탈로그에 없는 제품 책상은 줄을 만들지 않는다', () => {
    expect(deskGroup({ ...PRODUCT_DESK, productId: '999' })).toBeNull();
  });

  it('같은 spec의 배치 아이템은 수량으로 묶인다', () => {
    const groups = groupBySpec([item(KEYBOARD), item(KEYBOARD), item(DIY)]);
    expect(groups.map((g) => [g.id, g.qty])).toEqual([
      ['1009', 2],
      ['1099', 1],
    ]);
  });
});

describe('합계', () => {
  it('제품 책상 가격이 합계에 들어간다', () => {
    const groups = [deskGroup(PRODUCT_DESK)!, ...groupBySpec([item(KEYBOARD)])];
    expect(sumGroups(groups, {})).toBe(189000 + 120000);
  });

  it('직접 입력 책상은 0원이라 합계를 바꾸지 않는다', () => {
    const groups = [deskGroup(CUSTOM_DESK)!, ...groupBySpec([item(KEYBOARD)])];
    expect(sumGroups(groups, {})).toBe(120000);
  });

  it('가격 미정(자작·GLB) 제품은 합계에서 빠진다', () => {
    expect(sumGroups(groupBySpec([item(KEYBOARD), item(DIY)]), {})).toBe(120000);
  });

  it('체크를 끈 책상은 합계에서 빠진다', () => {
    const groups = [deskGroup(PRODUCT_DESK)!, ...groupBySpec([item(KEYBOARD)])];
    expect(sumGroups(groups, { '102': true })).toBe(120000);
  });
});
