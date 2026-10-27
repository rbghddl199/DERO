// 규격 DB(mm) — 배치·호환성·무드 판정의 정본, three 임포트 없음. 배치 아이템은 전부 PBR 머티리얼 스킨을 가진 제품(D5)

import type { DeskFrameType, DeskMaterialId } from '../core/deskConfig';
import type { EmitterManifest } from './emitters';
import { monitorDims, type MonitorSpec } from './monitor';

export type MaterialClass =
  'wood' | 'metal' | 'plastic' | 'fabric' | 'ceramic' | 'glass' | 'display' | 'shade' | 'foliage';

export interface MaterialSkin {
  class: MaterialClass;
  /** sRGB hex, e.g. 0xa8794f */
  baseColor: number;
  roughness: number;
  metalness: number;
}

/** Optical spec lives in the spec DB (D5/D7) — not on the mesh. Lamps only. */
export interface OpticalSpec {
  colorTempK: number;
  /**
   * Rated luminous flux (lm) — the product's real rated output, fed straight to
   * SpotLight.power (the engine converts to candela; no hand conversion, no
   * scene-specific tuning here). The display mapping is calibrated ONCE via the
   * camera exposure in renderer.ts (CAMERA_EXPOSURE), so a newly registered
   * product with its actual rated flux renders in balance automatically.
   */
  lumens: number;
  /** rated reach (mm) → SpotLight.distance cutoff (scene is 1 unit = 1 m) */
  reachMm: number;
  distribution: 'spot' | 'flood' | 'ambient';
  /**
   * 아래 4개는 **알려진 실제 제품의 조절 사양 범위**이고, **카탈로그 표시용 마커
   * 전용이라 렌더는 읽지 않는다** (DERO-287, REQ-SIM-08). 백엔드 `light` 테이블의
   * 광학 컬럼과 정확히 같은 성격이고 그 규약의 정본은
   * `backend/dero-api/src/main/java/com/brunchies/dero/product/Light.java` 클래스 주석이다.
   * 렌더가 쓰는 값은 위 `colorTempK`·`lumens`(규격 정격)와 배치 인스턴스의 배율·색온도뿐이다
   * — 여기 값이 어긋나도 화면은 안 바뀌고 어긋나는 것은 슬라이더 위 마커 표기뿐이다.
   *
   * 사양 범위를 모르는 제품은 넷 다 비운다 → 마커가 없다(REQ 명시 경로).
   */
  colorTempMinK?: number;
  colorTempMaxK?: number;
  lumensMinLm?: number;
  lumensMaxLm?: number;
}

export type ProductCategory =
  | 'desk'
  | 'monitor'
  | 'monitor-arm'
  | 'keyboard'
  | 'mouse'
  | 'speaker'
  | 'water-bottle'
  | 'lamp'
  | 'mug'
  | 'plant'
  | 'decor'
  | 'chair';

// --- articulation rig manifest (D16, ADR-0002) --------------------------------
// Joint definitions live HERE in the spec DB — never in the mesh. Geometry =
// asset (part-segmentation GLB, flat siblings, stable node names); joint axes,
// pivot points and limits = spec DB. The runtime builds pivot nodes from this
// manifest (FK chain) and clamps to the kind's own limit range.

/** 회전(revolute, 도) / 직선(prismatic, mm) — 생략 시 revolute (ADR-0002 결정 1) */
export type JointKind = 'revolute' | 'prismatic';

/** 종속 관절 — 평행사변형 링크처럼 한 관절이 다른 관절을 구동한다 (ADR-0002 결정 2) */
export interface JointCoupling {
  /** driver 관절 id. driver 자신이 종속이면 안 된다(체인 금지) */
  joint: string;
  ratio: number;
  offset?: number;
}

interface RigJointBase {
  /** stable joint id, e.g. 'elbow-pitch' */
  joint: string;
  /** 조작 UI·gizmo 툴팁이 쓰는 한글 표시명 (필수 — 옵셔널이면 안 채운 매니페스트가 생긴다) */
  label: string;
  /** logical parent segment (key of RigManifest.segments) */
  parent: string;
  /** logical child segment the joint drives */
  child: string;
  /** 축 방향 in GLB root space (unit vector) — 회전축이자 직선 이동 방향 */
  axis: [number, number, number];
  /** pivot point in GLB root space (m, pre uniform-scale) */
  point: [number, number, number];
  coupledTo?: JointCoupling;
}

export interface RigRevoluteJoint extends RigJointBase {
  kind?: 'revolute';
  minDeg: number;
  maxDeg: number;
}

export interface RigPrismaticJoint extends RigJointBase {
  kind: 'prismatic';
  /** 가동 범위(mm) — 전역 규격 단위가 mm이므로 사람이 mm로 입력하고 런타임이 /1000 한다 */
  minMm: number;
  maxMm: number;
}

export type RigJoint = RigRevoluteJoint | RigPrismaticJoint;

export interface RigManifest {
  /** logical segment -> GLB node names (stable names — renaming is breaking) */
  segments: Record<string, string[]>;
  joints: RigJoint[];
  /** 지지 세그먼트 — 이 파트 footprint만 상판 안이면 됨 (상부 캔틸리버 허용) */
  supportPart?: string;
  /** 결합 세그먼트 — 다른 제품(모니터)이 물리는 파트. 자석 결합의 부모가 된다 (D22) */
  mountPart?: string;
}

export type ProductKind = 'surface' | 'prop' | 'lamp';

/** 제품이 놓이는 면 — 규격 DB `prop.mount_surface`(erd.md)와 같은 값 집합.
 *  `kind`(렌더 파이프라인 갈래)와 **직교한다** — 같은 'prop'이라도 상판에 놓이는 것과
 *  바닥에 놓이는 것이 있다. */
export type MountSurface = 'TOP' | 'PEGBOARD' | 'WALL' | 'FLOOR';

// --- 판정 입력 규격 (REQ-CMP-01·02, docs/context/compatibility.md) -------------
// 판정 산술은 core/collision.ts, 값의 정본은 여기(규격 DB mm/g). 메쉬 치수 금지(D7).

export interface ArmSpec {
  /** 지원 VESA 규격 'WxH' (mm) 목록. 빈 배열 = 미등록 */
  vesa: string[];
  /** 허용 하중 (g 정수). ERD arm.allowed_load_g */
  loadCapacityG: number;
  /** 판정 ①(암↔책상)의 게이트. false면 판정을 아예 수행하지 않는다 — 불가가 아니다 */
  isClampMountable: boolean;
  /** 클램프 물림 범위 (mm). 미등록이면 생략 — 0·무한대로 치환 금지 */
  clampMinMm?: number;
  clampMaxMm?: number;
  /** 아래 넷은 **표시 전용**이다(제품 상세 규격표) — 판정에 쓰지 않는다. ARM 서브타입엔 박스
   *  치수 컬럼이 없어 상세의 가로/깊이/높이가 폴백 상수라, 대신 이 실규격 범위를 보여준다. */
  reachMinMm?: number;
  reachMaxMm?: number;
  heightMinMm?: number;
  heightMaxMm?: number;
}

export interface ProductSpec {
  id: string;
  name: string;
  /** 목업 카탈로그 전용 닫힌 유니온 — 실 카탈로그는 categoryId/categoryName을 쓴다
   *  (표시·필터 전용으로 격하, DERO-325 ADR-0017 결정 4). */
  category?: ProductCategory;
  /** 실 카탈로그 category 마스터(자유 증가 트리)의 id·이름 — 표시·필터 전용, 절차 생성 판별에
   *  쓰지 않는다(그건 specType/kind가 한다). */
  categoryId?: number;
  categoryName?: string;
  kind: ProductKind;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** true면 위 세 치수가 아직 자리표시자다 — 규격 DB에 박스 컬럼이 없어 GLB Box3로만 알 수 있는
   *  제품(GLB 라이브러리 소품, ARM 서브타입)에 붙는다. 배치·판정 전에 ProductAssets.ensureTemplate을
   *  통과시켜 실측으로 확정할 것. **이 플래그가 켜진 spec의 mm를 직접 읽지 말 것.** */
  meshDerivedDims?: boolean;
  /** desks only: top-panel thickness (mm) */
  topThicknessMm?: number;
  /** desks only: 엣지 마감 두께 (mm). 클램프 물림 두께 = max(상판, 엣지) (D21) */
  edgeThicknessMm?: number;
  /** desks only: 재질 정본 (렌더용 MaterialSkin은 deskMaterialSkin으로 파생) */
  deskMaterialId?: DeskMaterialId;
  /** desks only: 프레임 유형 */
  frameType?: DeskFrameType;
  material: MaterialSkin;
  /** lamps only */
  optical?: OpticalSpec;
  /** dedicated GLB asset (public/ path) — parametric mesh fallback when absent */
  glbUrl?: string;
  /** true = GLB ships without textures (part-segmentation) -> apply the
   *  material skin above to every mesh at load */
  glbUntextured?: boolean;
  /** true = 상단에 다른 아이템을 얹을 수 있는 낮은 표면 (매트·라이저·코스터) */
  stackable?: boolean;
  /** 놓이는 면 (규격 DB `prop.mount_surface`). **생략 = 'TOP'** — 목업 카탈로그와
   *  PROP이 아닌 서브타입(책상·모니터·암·조명)은 이 컬럼이 없어 비어 있다.
   *  `'FLOOR'`만 엔진이 실제로 다르게 다룬다(월드 바닥 y=0에 놓고 상판 경계 판정에서
   *  뺀다, core/snap.ts). `'WALL'`은 벽 메쉬에, `'PEGBOARD'`는 **다른 아이템(타공판)의
   *  앞면**에 붙는다 — 둘 다 전용 인터랙션이 있다 (2026-08-03 / 2026-08-08). */
  mountSurface?: MountSurface;
  /** monitors only: 규격 정본. widthMm/heightMm/depthMm은 여기서 파생한다 */
  monitor?: MonitorSpec;
  /** articulated products only: FK rig manifest (D16) */
  rig?: RigManifest;
  /** 장식 발광체가 있는 제품만 — `spec_type`(kind)과 직교한다. 램프의 `optical`과
   *  겹치지 않는다: 저쪽은 규격의 정격 광속, 이쪽은 저작 추정 광속 (ADR-0003) */
  emitter?: EmitterManifest;
  /** monitor-arm only: 판정 ①·② 입력 규격 */
  arm?: ArmSpec;
  /** 원화 정가 — 없으면(자작/GLB 라이브러리 제품) 견적 합산에서 제외 (REQ-REC-01, GLOSSARY "견적") */
  priceKrw?: number;
  /** 제조·판매 브랜드명 — 백엔드 brand 테이블 연동 전 프론트 placeholder 문자열(GLOSSARY "브랜드").
   *  없으면(자작/GLB 라이브러리 제품) 선택 패널에서 그 줄만 생략 */
  brand?: string;
  /** 실 카탈로그 대표 실사 이미지(presigned GET URL) — 있으면 카드 썸네일이 정적
   *  `/assets/thumbnails/{id}.png` 대신 이 URL을 우선한다(DERO-325). */
  imageUrl?: string;
  /** 실 카탈로그 실사 이미지 전체(displayOrder 순, 대표 포함) — 상세 갤러리용.
   *  목록 응답은 대표 1장만 담으므로 상세(`GET /products/{id}`)에서만 2장 이상이 된다. */
  imageUrls?: string[];
  /** 실 카탈로그 제품 설명문 — 목업 마케팅 문구(`PRODUCT_CONTENT`)와 별개다.
   *  표시 정본은 `components/product/productContent.ts`의 `getDisplayDescription`. */
  description?: string;
  /** 실 카탈로그 외부 구매 링크(제휴 URL 등). 없으면 구매 버튼을 렌더하지 않는다 */
  productUrl?: string;
}

// --- monitor 규격 정본 (설계 §4.3) ------------------------------------------
// 외형 치수는 monitorDims()가 규격에서 파생한다 (monitor.ts).

const MONITOR_27: MonitorSpec = {
  diagonalInch: 27,
  aspectRatio: '16:9',
  panelShape: 'flat',
  bezelMm: 8,
  standDepthMm: 130,
  vesa: ['100x100'],
  weightG: 4200,
  ports: ['HDMI 2.0', 'DP 1.4', 'USB-C'],
  resolution: [2560, 1440],
};

const MONITOR_34_CURVED: MonitorSpec = {
  diagonalInch: 34,
  aspectRatio: '43:18',
  panelShape: 'curved',
  curvatureRadiusMm: 1800,
  bezelMm: 9,
  standDepthMm: 230,
  vesa: ['100x100'],
  weightG: 7100,
  ports: ['HDMI 2.1', 'DP 1.4', 'USB-C'],
  resolution: [3440, 1440],
};

export const PRODUCTS: ProductSpec[] = [
  {
    id: 'desk-oak-1200',
    name: '오크 데스크 1200',
    category: 'desk',
    kind: 'surface',
    widthMm: 1200,
    depthMm: 600,
    heightMm: 740,
    topThicknessMm: 25,
    // 평범한 PVC 밴딩 — 엣지가 상판과 같아 물림 두께도 25 (D21에서 결과가 종전과 같은 쪽)
    edgeThicknessMm: 25,
    deskMaterialId: 'oak',
    frameType: 'four-leg',
    material: { class: 'wood', baseColor: 0xb8895a, roughness: 0.55, metalness: 0 },
    priceKrw: 189000,
    brand: '데로퍼니처',
  },
  {
    id: 'desk-walnut-1400',
    name: '월넛 데스크 1400',
    category: 'desk',
    kind: 'surface',
    widthMm: 1400,
    depthMm: 700,
    heightMm: 745,
    topThicknessMm: 30,
    // 두꺼운 엣지 몰딩 — 상판(30)만 보면 적합인데 물림 두께는 45라 데모 암(최대 40)에 불가.
    // D21 max 규칙이 잡아내는 거짓 "적합"을 카탈로그에서 실제로 시연하는 세팅이다.
    edgeThicknessMm: 45,
    deskMaterialId: 'walnut',
    frameType: 't-frame',
    material: { class: 'wood', baseColor: 0x6f4a30, roughness: 0.5, metalness: 0 },
    priceKrw: 259000,
    brand: '데로퍼니처',
  },
  {
    id: 'monitor-27',
    name: '27인치 모니터',
    category: 'monitor',
    kind: 'prop',
    monitor: MONITOR_27,
    ...monitorDims(MONITOR_27),
    material: { class: 'display', baseColor: 0x14161a, roughness: 0.35, metalness: 0.1 },
    priceKrw: 259000,
    brand: '뷰텍',
  },
  {
    id: 'monitor-34-curved',
    name: '34인치 커브드 울트라와이드',
    category: 'monitor',
    kind: 'prop',
    monitor: MONITOR_34_CURVED,
    ...monitorDims(MONITOR_34_CURVED),
    material: { class: 'display', baseColor: 0x14161a, roughness: 0.35, metalness: 0.1 },
    priceKrw: 890000,
    brand: '뷰텍',
  },
  {
    id: 'keyboard-tkl',
    name: 'TKL 키보드',
    category: 'keyboard',
    kind: 'prop',
    widthMm: 360,
    depthMm: 140,
    heightMm: 38,
    material: { class: 'plastic', baseColor: 0x30333a, roughness: 0.55, metalness: 0 },
    // 가변 발광(백라이트) — 조명 제품이 아닌데 빛을 낸다. 발광 ⊥ 제품분류의 실례
    // (ADR-0003). 발광면은 상판 플레이트지만 point는 생략(=bbox 중심, 19mm)한다:
    // 38mm 슬래브라 스필 웅덩이가 어차피 플레이트 바로 아래에 맺힌다. 플레이트
    // 위(42mm)로 올려 보면 광원이 자기 발광면을 비춰 한가운데 핫스팟이 생긴다
    // (2026-07-25 실측, qa-artifacts/look-159/point-01-kb-default-zoom.png).
    emitter: { recolorable: true, defaultColor: '#6060E0', lumens: 30, radiusMm: 400 },
    priceKrw: 89000,
    brand: '키보이드',
  },
  {
    id: 'speaker-book',
    name: '북셸프 스피커',
    category: 'speaker',
    kind: 'prop',
    widthMm: 120,
    depthMm: 160,
    heightMm: 200,
    material: { class: 'fabric', baseColor: 0x3c3a38, roughness: 0.85, metalness: 0 },
    priceKrw: 129000,
    brand: '사운드웨이브',
  },
  {
    id: 'bottle-steel',
    name: '스테인리스 보틀',
    category: 'water-bottle',
    kind: 'prop',
    widthMm: 72,
    depthMm: 72,
    heightMm: 255,
    material: { class: 'metal', baseColor: 0xc9ccd1, roughness: 0.28, metalness: 0.9 },
    priceKrw: 25000,
    brand: '스틸웨어',
  },
  {
    id: 'mug-ceramic',
    name: '세라믹 머그',
    category: 'mug',
    kind: 'prop',
    widthMm: 90,
    depthMm: 90,
    heightMm: 98,
    material: { class: 'ceramic', baseColor: 0xdad3c6, roughness: 0.4, metalness: 0 },
    priceKrw: 12000,
    brand: '테이블웨어',
  },
  {
    id: 'plant-pot',
    name: '데스크 플랜트',
    category: 'plant',
    kind: 'prop',
    widthMm: 130,
    depthMm: 130,
    heightMm: 270,
    material: { class: 'ceramic', baseColor: 0xcfc7ba, roughness: 0.55, metalness: 0 },
    priceKrw: 18000,
    brand: '그린데스크',
  },
  {
    // Meshy part-segmentation asset (no textures) + authored rig manifest.
    // Mesh file is ~1/3.33 of real size (Meshy auto_size untrusted) — the
    // loader uniform-scales onto these mm dims (height 400 = reference axis).
    id: 'monitor-arm-white',
    name: '화이트 모니터암',
    category: 'monitor-arm',
    kind: 'prop',
    widthMm: 100,
    depthMm: 385,
    heightMm: 400,
    material: { class: 'plastic', baseColor: 0xf0f1f3, roughness: 0.42, metalness: 0.08 },
    priceKrw: 69000,
    brand: '암스탠드',
    glbUrl: '/assets/monitor-arm.glb',
    glbUntextured: true,
    // 데모 규격 — 34" 커브드(7.1kg)가 허용 하중 5kg를 넘고, 월넛(엣지 45)이 물림 최대 40을
    // 넘는다. 판정 ①·② 양쪽의 불가 경로가 카탈로그만으로 재현된다.
    arm: {
      vesa: ['75x75', '100x100'],
      loadCapacityG: 5000,
      isClampMountable: true,
      clampMinMm: 10,
      clampMaxMm: 40,
    },
    rig: {
      supportPart: 'clamp-base',
      mountPart: 'head-mount',
      segments: {
        'clamp-base': ['mesh_1'],
        'arm-lower': ['mesh_4', 'mesh_7'],
        'arm-upper': ['mesh_2', 'mesh_5', 'mesh_6', 'mesh_9'],
        'head-bracket': ['mesh_3', 'mesh_8'],
        'head-mount': ['mesh_0'],
      },
      joints: [
        {
          joint: 'base-yaw',
          label: '베이스 회전',
          parent: 'clamp-base',
          child: 'arm-lower',
          axis: [0, 1, 0],
          point: [0, 0.0229, -0.0473],
          minDeg: -90,
          maxDeg: 90,
        },
        {
          joint: 'elbow-pitch',
          label: '팔꿈치 각도',
          parent: 'arm-lower',
          child: 'arm-upper',
          axis: [1, 0, 0],
          point: [0, 0.0765, -0.0065],
          minDeg: -35,
          maxDeg: 35,
        },
        {
          joint: 'head-tilt',
          label: '헤드 틸트',
          parent: 'arm-upper',
          child: 'head-bracket',
          axis: [1, 0, 0],
          point: [0, 0.1055, 0.0354],
          minDeg: -30,
          maxDeg: 30,
        },
        {
          joint: 'head-swivel',
          label: '헤드 좌우',
          parent: 'head-bracket',
          child: 'head-mount',
          axis: [0, 1, 0],
          point: [0, 0.1076, 0.053],
          minDeg: -90,
          maxDeg: 90,
        },
        {
          joint: 'head-pivot',
          label: '헤드 세로회전',
          parent: 'head-bracket',
          child: 'head-mount',
          axis: [0, 0, 1],
          point: [0, 0.1076, 0.053],
          minDeg: -90,
          maxDeg: 90,
        },
      ],
    },
  },
  {
    // Meshy texture export (fused mesh + KTX2 PBR textures) — static decor.
    // Spec mm authored to the mesh proportions (1.9:1.44:0.52) at desk scale.
    id: 'decor-waves',
    name: '블루 웨이브 오브제',
    category: 'decor',
    kind: 'prop',
    widthMm: 290,
    depthMm: 80,
    heightMm: 220,
    material: { class: 'ceramic', baseColor: 0x3f6ec2, roughness: 0.45, metalness: 0 },
    priceKrw: 45000,
    brand: '오브제랩',
    glbUrl: '/assets/waves-decor.glb',
    // 고정 발광 — 파랑이 제품 정체성이라 사용자가 바꿀 대상이 아니다.
    // recolorable:false라 배치 인스턴스 색(emitter_color)을 무시한다 (ADR-0003 결정 3).
    emitter: { recolorable: false, defaultColor: '#3F6EC2', lumens: 45, radiusMm: 450 },
  },
  // --- 타공판 부착 검증용 3종 (DERO-518) -------------------------------
  // 실 카탈로그의 타공판·후크는 운영 DB + S3 GLB에만 있어 로컬에서 재현할 수 없다.
  // 부착 규칙(`core/snap.ts`)은 규격 mm만 보므로 절차 생성 박스로도 그대로 검증된다 —
  // 화면에 뜨는 것이 실제 제품 모델이 아닐 뿐이다. 실물이 등록되면 이 셋은 지운다.
  {
    id: 'pegboard-600',
    name: '타공판 600',
    category: 'decor',
    // `isPegboardProduct`가 실 카탈로그에선 categoryId(69)로, mock에선 이 라벨로 판별한다.
    categoryName: '타공판',
    kind: 'prop',
    widthMm: 600,
    depthMm: 15,
    heightMm: 600,
    mountSurface: 'WALL',
    material: { class: 'wood', baseColor: 0xd9cbb4, roughness: 0.7, metalness: 0 },
    priceKrw: 39000,
    brand: '까사마루',
  },
  {
    id: 'pegboard-hook-s',
    name: '매직 타공판 후크 소',
    category: 'decor',
    categoryName: '타공판',
    kind: 'prop',
    widthMm: 30,
    depthMm: 45,
    heightMm: 60,
    mountSurface: 'PEGBOARD',
    material: { class: 'metal', baseColor: 0x9aa0a6, roughness: 0.35, metalness: 0.8 },
    priceKrw: 2500,
    brand: '까사마루',
  },
  {
    id: 'wallclock-round',
    name: '무소음 원형 벽시계',
    category: 'decor',
    kind: 'prop',
    widthMm: 300,
    depthMm: 42,
    heightMm: 300,
    // 후크에 걸리는 쪽 — 판에 직접 붙이지 않고 후크 위에 떨어뜨리면 걸린다.
    // 제품당 표면 1개 규약(백엔드 `MountSurface`)이라 이 값이면 벽에는 못 붙는다.
    mountSurface: 'PEGBOARD',
    material: { class: 'ceramic', baseColor: 0xf2f0eb, roughness: 0.5, metalness: 0 },
    priceKrw: 28000,
    brand: '루아즈 인테리어',
  },
  {
    id: 'deskmat-900',
    name: '데스크 매트 900',
    category: 'decor',
    kind: 'prop',
    widthMm: 900,
    depthMm: 400,
    heightMm: 4,
    stackable: true,
    material: { class: 'fabric', baseColor: 0x2e3138, roughness: 0.9, metalness: 0 },
    priceKrw: 22000,
    brand: '매트하우스',
  },
  {
    id: 'lamp-warm',
    name: '웜 데스크 램프 2700K',
    category: 'lamp',
    kind: 'lamp',
    widthMm: 160,
    depthMm: 160,
    heightMm: 430,
    material: { class: 'shade', baseColor: 0xe8e2d6, roughness: 0.6, metalness: 0.05 },
    // **고정형 사양**(min == max) — 조절 불가 제품은 min에 고정값을 넣고 max를 min과 같게
    // 채운다는 백엔드 `Light` 규약을 그대로 따른다(값을 알면 둘 다 같은 값, 모르면 둘 다
    // NULL). 이 램프가 고정형 경로의 화면 검수 대상이다 — 종전엔 사양을 일부러 안 저작해
    // 마커가 통째로 안 그려졌고 "UI가 깨진 느낌"으로 부결됐다 (2026-07-31 DERO-287).
    // **미제공(둘 다 NULL) 경로는 이제 저작 제품이 0개다** — 코드 경로만 남아 있고
    // `tests/lighting.test.ts`가 지킨다.
    optical: {
      colorTempK: 2700,
      lumens: 400,
      reachMm: 1200,
      distribution: 'spot',
      colorTempMinK: 2700,
      colorTempMaxK: 2700,
      lumensMinLm: 400,
      lumensMaxLm: 400,
    },
    priceKrw: 39000,
    brand: '라이트크래프트',
  },
  {
    id: 'lamp-task',
    name: '태스크 램프 5000K',
    category: 'lamp',
    kind: 'lamp',
    widthMm: 150,
    depthMm: 150,
    heightMm: 460,
    material: { class: 'metal', baseColor: 0x2b2d31, roughness: 0.35, metalness: 0.7 },
    // 실제 제품 사양 범위를 저작한 유일한 램프 — 백엔드 `light` 테이블이 램프를 아직
    // 미시딩이라 마커 데이터는 이 로컬 카탈로그가 정본이다 (DERO-287).
    optical: {
      colorTempK: 5000,
      lumens: 560,
      reachMm: 1500,
      distribution: 'flood',
      colorTempMinK: 3000,
      colorTempMaxK: 5700,
      lumensMinLm: 200,
      lumensMaxLm: 560,
    },
    priceKrw: 49000,
    brand: '라이트크래프트',
  },
];

// --- 실 카탈로그 캐시 (DERO-325, ADR-0017 결정 3) --------------------------
// isMockApi() 배타 전환 — real 모드에서 시뮬레이터 부팅(simulatorStore.ts initEngine)이
// setCatalog()으로 채우면 아래 조회 함수 전부가 그 순간부터 PRODUCTS 대신 이 캐시를 원본으로
// 쓴다. 이 함수들은 앱 전역에서 동기 호출되므로(getProduct 등) 캐시도 동기 모듈 상태다 —
// zustand는 못 쓴다(scene.ts·placement.ts·productAssets.ts가 전부 React 비의존 vanilla TS).
let CATALOG: ProductSpec[] | null = null;

let catalogVersion = 0;
const catalogSubs = new Set<() => void>();

function bumpCatalog(): void {
  catalogVersion++;
  for (const cb of catalogSubs) cb();
}

/** real 카탈로그를 적재한다(리셋). null이면 목업 모드로 되돌아가 PRODUCTS를 원본으로 쓴다.
 *  real 모드 부팅은 `setCatalog([])`로 시작하고 페이지가 도착할 때마다 appendCatalog가 이어 붙인다. */
export function setCatalog(specs: ProductSpec[] | null): void {
  CATALOG = specs;
  bumpCatalog();
}

/** 커서 페이지를 이어 붙인다 — id 중복은 새 값으로 덮고 순서는 보존한다. mock 모드(CATALOG=null)
 *  에서는 아무 일도 하지 않는다(PRODUCTS는 정적 목록이다). */
export function appendCatalog(specs: ProductSpec[]): void {
  if (CATALOG === null || specs.length === 0) return;
  const byId = new Map(CATALOG.map((s) => [s.id, s]));
  for (const s of specs) byId.set(s.id, s);
  CATALOG = [...byId.values()];
  bumpCatalog();
}

/** useSyncExternalStore용 스냅샷 — 원시값이라 스냅샷마다 새 참조가 생기는 함정이 없다. */
export function getCatalogVersion(): number {
  return catalogVersion;
}

/** 카탈로그가 바뀔 때 알림. 렌더 중 getProduct()/libraryItems()를 부르는 React 컴포넌트는
 *  이걸 구독해야 페이지 도착이 화면에 반영된다(모듈 전역이라 그 자체로는 리액티브가 아니다). */
export function subscribeCatalog(cb: () => void): () => void {
  catalogSubs.add(cb);
  return () => catalogSubs.delete(cb);
}

function catalog(): ProductSpec[] {
  return CATALOG ?? PRODUCTS;
}

export function getProduct(id: string): ProductSpec | undefined {
  return catalog().find((p) => p.id === id);
}

export function desks(): ProductSpec[] {
  return catalog().filter((p) => p.kind === 'surface');
}

export function props(): ProductSpec[] {
  return catalog().filter((p) => p.kind === 'prop');
}

export function lamps(): ProductSpec[] {
  return catalog().filter((p) => p.kind === 'lamp');
}

/** Library = everything a user can drag onto the scene (props + lamps). */
export function libraryItems(): ProductSpec[] {
  return catalog().filter((p) => p.kind !== 'surface');
}
