// VESA 태깅의 순수 함수 2종 — 마스터 목록 → 셀렉트 옵션 변환과 PATCH 차분("유지" vs "전부 해제")을 검증한다.

import { describe, expect, it } from 'vitest';
import type { VesaSpecResponse } from '@/api/admin/masters';
import { toVesaSpecOptions } from '@/utils/admin/masterOptions';
import { vesaSpecIdsPatch } from '@/utils/admin/productSpecDraft';

describe('toVesaSpecOptions', () => {
  it('가로 → 세로 순으로 정렬해 mm 라벨을 만든다', () => {
    const specs: VesaSpecResponse[] = [
      { id: 3, widthMm: 200, heightMm: 100 },
      { id: 1, widthMm: 100, heightMm: 200 },
      { id: 2, widthMm: 100, heightMm: 100 },
    ];

    const options = toVesaSpecOptions(specs);

    expect(options).toEqual([
      { value: '2', label: '100 × 100 mm' },
      { value: '1', label: '100 × 200 mm' },
      { value: '3', label: '200 × 100 mm' },
    ]);
  });

  it('id·가로·세로 중 하나라도 비면 고를 수 없으니 버린다', () => {
    const specs: VesaSpecResponse[] = [
      { id: 1, widthMm: 75, heightMm: 75 },
      { widthMm: 100, heightMm: 100 },
      { id: 2, heightMm: 100 },
      { id: 3, widthMm: 100 },
    ];

    const options = toVesaSpecOptions(specs);

    expect(options).toEqual([{ value: '1', label: '75 × 75 mm' }]);
  });

  it('입력 배열을 정렬로 뒤집지 않는다', () => {
    const specs: VesaSpecResponse[] = [
      { id: 1, widthMm: 200, heightMm: 200 },
      { id: 2, widthMm: 100, heightMm: 100 },
    ];

    toVesaSpecOptions(specs);

    expect(specs[0].id).toBe(1);
  });
});

describe('vesaSpecIdsPatch', () => {
  it('같은 집합이면 순서가 달라도 보내지 않는다(= 유지)', () => {
    expect(vesaSpecIdsPatch(['2', '1'], ['1', '2'])).toBeUndefined();
  });

  it('둘 다 비어 있으면 보내지 않는다', () => {
    expect(vesaSpecIdsPatch([], [])).toBeUndefined();
  });

  it('전부 해제했으면 빈 배열을 보낸다', () => {
    expect(vesaSpecIdsPatch([], ['1', '2'])).toEqual([]);
  });

  it('바뀌었으면 지금 고른 id들을 숫자로 보낸다', () => {
    expect(vesaSpecIdsPatch(['3', '1'], ['1'])).toEqual([3, 1]);
  });

  it('개수가 같아도 구성이 다르면 보낸다', () => {
    expect(vesaSpecIdsPatch(['2'], ['1'])).toEqual([2]);
  });
});
