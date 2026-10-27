// GLB 오브젝트 목록 — 규격 DB(product.ts PRODUCTS) 밖의 원본 GLB. 시뮬레이터는 안 읽는다(어드민 검수 카탈로그만 본다) — /dev/light 조명 저작 도구와 어드민 AssetLightProbe 전용. three 임포트 없음.

import type { EmitterManifest } from './emitters';

export interface GlbLibraryEntry {
  id: string;
  name: string;
  /** public/ 경로 (gltfpack 압축 산출물, scripts/build-library-assets.mjs) */
  url: string;
  /** 장식 발광 매니페스트 (ADR-0003). 없으면 비발광 오브젝트. */
  emitter?: EmitterManifest;
}

export const GLB_LIBRARY: GlbLibraryEntry[] = [
  { id: 'glb-0001', name: 'GLB 오브젝트 0001', url: '/assets/models/glb-0001.glb' },
  { id: 'glb-0002', name: 'GLB 오브젝트 0002', url: '/assets/models/glb-0002.glb' },
  { id: 'glb-0003', name: 'GLB 오브젝트 0003', url: '/assets/models/glb-0003.glb' },
  { id: 'glb-0004', name: 'GLB 오브젝트 0004', url: '/assets/models/glb-0004.glb' },
  { id: 'glb-0005', name: 'GLB 오브젝트 0005', url: '/assets/models/glb-0005.glb' },
  { id: 'glb-0007', name: 'GLB 오브젝트 0007', url: '/assets/models/glb-0007.glb' },
  { id: 'glb-0012', name: 'GLB 오브젝트 0012', url: '/assets/models/glb-0012.glb' },
  { id: 'glb-0013', name: 'GLB 오브젝트 0013', url: '/assets/models/glb-0013.glb' },
  { id: 'glb-0014', name: 'GLB 오브젝트 0014', url: '/assets/models/glb-0014.glb' },
  { id: 'glb-0015', name: 'GLB 오브젝트 0015', url: '/assets/models/glb-0015.glb' },
  { id: 'glb-0017', name: 'GLB 오브젝트 0017', url: '/assets/models/glb-0017.glb' },
  { id: 'glb-0021', name: 'GLB 오브젝트 0021', url: '/assets/models/glb-0021.glb' },
  // ⚠️ 커밋 금지 — dev 전용. url이 gitignore된 63.8MB 원본(dev-*.glb)이라 다른 사람 로컬엔
  // 파일이 없다 — 그 로컬에서는 /dev/light 목록에서 이 항목만 열리지 않는다.
  // ADR-0003 흰 마스크 리컬러 실기 검증용 (DERO-159).
  {
    id: 'glb-pc-0011',
    name: 'PC 본체 (발광 테스트)',
    url: '/assets/models/dev-pc-0011.glb',
    emitter: { recolorable: true, defaultColor: '#6060E0', lumens: 45, radiusMm: 500 },
  },
];
