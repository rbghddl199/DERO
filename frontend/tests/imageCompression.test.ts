// 업로드 이미지 압축의 치수 계산 — 캔버스가 없는 node 환경에서 검증 가능한 순수 함수만 다룬다.
// prepareImageForUpload은 createImageBitmap·canvas가 필요해 여기서 다루지 않는다(브라우저 QA 대상).

import { describe, expect, it } from 'vitest';

import {
  COMPRESSED_LONG_EDGE,
  COMPRESSED_QUALITY,
  fitWithinLongEdge,
} from '@/utils/admin/imageCompression';

describe('fitWithinLongEdge', () => {
  it('상한보다 작으면 그대로 둔다 — 확대하지 않는다', () => {
    expect(fitWithinLongEdge(342, 269, 1280)).toEqual({ width: 342, height: 269 });
  });

  it('상한과 같으면 그대로 둔다', () => {
    expect(fitWithinLongEdge(1280, 720, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('가로가 길면 가로를 상한에 맞추고 비율을 지킨다', () => {
    // 실측 표본: AI 상상도 1536x864 → 1280x720
    expect(fitWithinLongEdge(1536, 864, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('세로가 길면 세로를 상한에 맞춘다', () => {
    expect(fitWithinLongEdge(864, 1536, 1280)).toEqual({ width: 720, height: 1280 });
  });

  it('정사각형도 비율을 지킨다', () => {
    // 실측 표본: 상품 이미지 최대 2078x2048
    expect(fitWithinLongEdge(2048, 2048, 1280)).toEqual({ width: 1280, height: 1280 });
    expect(fitWithinLongEdge(2078, 2048, 1280)).toEqual({ width: 1280, height: 1262 });
  });

  it('극단적인 비율에서도 짧은 변이 0이 되지 않는다 — 0px 캔버스는 toBlob이 null을 준다', () => {
    const result = fitWithinLongEdge(10000, 3, 1280);
    expect(result.width).toBe(1280);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });
});

describe('압축 상수', () => {
  it('백필 스크립트와 같은 값이다 — 갈리면 배치본과 신규 업로드의 화질이 달라진다', () => {
    // scripts/webp-backfill.mjs: EDGE = 1280, QUALITY = 82
    expect(COMPRESSED_LONG_EDGE).toBe(1280);
    expect(COMPRESSED_QUALITY).toBe(0.82);
  });
});
