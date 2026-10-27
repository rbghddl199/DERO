// 백엔드 product.id(Long) ↔ 로컬 3D 카탈로그 spec.id(string) 임시 수동 매핑 — mock 모드
// 전용이다(DERO-325). real 모드는 카탈로그 조회 API(GET /products)가 생겨 spec.id가
// 이미 String(product.id)이므로 이 표가 필요 없다(simulatorStore.ts loadPlacement/trySave가
// isMockApi()로 분기) — "카탈로그 조회 API가 생기면 지운다"던 옛 계획과 달리, mock 모드
// 자체가 남아 있는 한 이 표도 같이 남는다. id는 backend/dero-api/db/seed/
// product-catalog-seed.sql(REQ-SIM-06)이 심은 값과 반드시 짝을 맞춘다 — 시딩 스크립트를
// 다시 쓰면 이 표도 같이 갱신할 것.

export const PRODUCT_ID_TO_SPEC_ID: Record<number, string> = {
  1000: 'monitor-27',
  1001: 'monitor-34-curved',
  1002: 'monitor-arm-white',
  1003: 'lamp-warm',
  1004: 'lamp-task',
  1005: 'keyboard-tkl',
  1006: 'speaker-book',
  1007: 'bottle-steel',
  1008: 'mug-ceramic',
  1009: 'plant-pot',
  1010: 'decor-waves',
  1011: 'deskmat-900',
  1012: 'glb-0001',
  1013: 'glb-0002',
  1014: 'glb-0003',
  1015: 'glb-0004',
  1016: 'glb-0005',
  1017: 'glb-0007',
  1018: 'glb-0012',
  1019: 'glb-0013',
  1020: 'glb-0014',
  1021: 'glb-0015',
  1022: 'glb-0017',
  1023: 'glb-0021',
};

export const SPEC_ID_TO_PRODUCT_ID: Record<string, number> = Object.fromEntries(
  Object.entries(PRODUCT_ID_TO_SPEC_ID).map(([productId, specId]) => [specId, Number(productId)]),
);
