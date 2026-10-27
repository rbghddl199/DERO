// 책상 재질·썸네일 임시 상수.
//
// 재질 id를 닫힌 4종(DeskMaterialId)으로 되돌리던 임시표(DESK_TEXTURE_ID_TO_MATERIAL과 그 역방향
// MATERIAL_TO_DESK_TEXTURE_ID)는 DERO-335에서 삭제했다 — 시딩된 2행(오크 id=1, 월넛 id=51)
// 밖의 재질을 전부 'oak'로 뭉개던 표다. 이제 재질을 쓰는 모든 경로가 `GET /desk-textures`
// (api/product.ts의 getDeskTextures) 응답을 받아 deskConfig.ts의 deskSkinForTextureId로 스킨을
// 만든다: 시뮬레이터 카탈로그(three/scene/catalogAdapter.ts) · 책상 고르기 마법사
// (components/craft/CraftDeskPicker.tsx) · 배치 불러오기/저장(store/simulatorStore.ts).

// imageUrl이 아직 전부 null(시딩 시 안 채움)이라 기존 정적 썸네일을 제품 id로 임시 대응시킨다.
export const PRODUCT_ID_TO_THUMBNAIL: Record<number, string> = {
  51: '/assets/thumbnails/desk-oak-1200.png',
  101: '/assets/thumbnails/desk-walnut-1400.png',
};

// 재질 목록을 못 받았을 때(`GET /desk-textures` 실패) 직접 입력 책상 저장이 쓰는 최후 기본값 —
// 시딩된 오크 행. 정상 경로에서는 사용자가 고른 DeskConfig.deskTextureId가 쓰이므로 이 값에
// 닿지 않는다. desk_texture 행 id가 바뀌면 여기도 같이 고칠 것.
export const TEMP_DESK_TEXTURE_ID = 1;
