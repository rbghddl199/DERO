// 시뮬레이터 전역 상태 — three 엔진 핸들 보관 + HUD가 구독하는 캐시 상태 + window.__sim 호환 셸
import { create } from 'zustand';
import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { backendName, CAMERA_EXPOSURE } from '@/three/render/renderer';
import {
  createCamera,
  createControls,
  tweenToPreset,
  CAMERA_PRESETS,
  type PresetName,
} from '@/three/render/camera';
import { createAssetLoader } from '@/three/render/assetLoader';
import { ROTATE_STEP_DEG } from '@/three/core/rotateSnap';
import { createProductAssets } from '@/three/core/productAssets';
import {
  createPlacement,
  type Placement,
  type MoveCommittedEvent,
  type ItemPose,
} from '@/three/render/placement';
import {
  createSimScene,
  type WallSide,
  type LightingInfo,
  type LampInfo,
  type PlacedItem,
  type SimScene,
  type JointUiState,
  type JointHandle,
  type MountEvent,
  type MountResult,
  type DetachOptions,
} from '@/three/scene/scene';
import type { Judgment } from '@/three/core/collision';
import {
  DEFAULT_ROOM_PRESET_KEY,
  roomConfigForPreset,
  type RoomPresetKey,
} from '@/three/finishes/presets';
import {
  WALL_SIDES_ALL,
  type FinishConfig,
  type RoomConfig,
  type TimeOfDay,
} from '@/three/finishes/types';
import type { WallWindowConfig } from '@/three/core/window';
import { canvasToWebpBlob } from '@/utils/admin/imageCompression';
import { mountNoticeFor, type MountNotice } from '@/utils/mountNotice';
import { toApiWallSide, toEngineWallSide } from '@/utils/wallSide';
import {
  roomConfigFromWire,
  wallDistanceFromWire,
  wallOnFromWire,
  wallSnapshotsFromRoom,
} from '@/utils/roomFinish';
import {
  deskRequestFrom,
  judgmentRequestFor,
  pickMountRow,
  serverMountNoticeFor,
} from '@/utils/serverJudgment';
import { judgeCompatibility } from '@/api/compatibility';
import { createPostFX, type PostFX } from '@/three/scene/postfx';
import { LOOK_VARIANTS, DEFAULT_LOOK_ID, findLookVariant } from '@/three/scene/lookVariants';
import {
  appendCatalog,
  getProduct,
  PRODUCTS,
  setCatalog,
  type ProductSpec,
} from '@/three/scene/product';
import { toProductSpec } from '@/three/scene/catalogAdapter';
import {
  DEFAULT_CUSTOM_DESK,
  deskSkinForTextureId,
  type DeskConfig,
  type DeskFrameType,
} from '@/three/core/deskConfig';
import { mmToM, mToMm } from '@/three/core/units';
import {
  deleteScreenPhoto,
  downscaleImage,
  getScreenPhoto,
  pruneScreenPhotos,
  putScreenPhoto,
  screenPhotoKey,
} from '@/utils/screenPhotoStore';
import { TEMP_DESK_TEXTURE_ID } from '@/constants/deskTexture';
import {
  getPlacement,
  createPlacement as createPlacementApi,
  updatePlacement,
  uploadPlacementThumbnail,
} from '@/api/placement';
import { getProductsByIds, getDeskTextures } from '@/api/product';
import { useSimulatorTourStore } from '@/store/simulatorTourStore';
import { ApiError } from '@/api/client';
import { isMockApi } from '@/constants/api';
import { trackEvent } from '@/utils/analytics';
import { PRODUCT_ID_TO_SPEC_ID, SPEC_ID_TO_PRODUCT_ID } from '@/constants/productCatalogMap';
import { useCraftProjectsStore } from '@/store/craftProjectsStore';
import type {
  DeskDetailResponse,
  DeskSnapshot,
  FrameType as BackendFrameType,
  ItemSnapshot,
  PlacementSnapshot,
  ViolationResponse,
} from '@/types/placement';
import type { DeskTexturePublicResponse } from '@/types/catalog';
import type { DeskProject } from '@/types/craft';

export type Screen = 'select' | 'sim';

export interface JointPanelState {
  itemId: string;
  title: string;
  joints: JointUiState[];
}

/** 선택 아이템의 발광 상태 미러 (REQ-SIM-21) — 정본은 엔진 PlacedItem.emitterColor.
 *  발광체가 없으면 null이고, `recolorable: false`(고정 발광)면 UI는 아무것도 그리지
 *  않는다 — 색이 제품 정체성의 일부라 사용자 선택 대상이 아니다 (ADR-0003 결정 3). */
export interface EmitterPanelState {
  itemId: string;
  recolorable: boolean;
  color: string;
  /** 발광 on/off (세션 한정) — 끄면 색 컨트롤을 감춘다. 저장에 안 실린다. */
  on: boolean;
}

/** 선택 램프의 밝기·색온도 미러 (REQ-SIM-08, DERO-287) — 정본은 엔진
 *  `PlacedItem.emitterBrightnessScale`·`emitterColorTempK`. 램프가 아니면 null이고
 *  UI는 조절 행 자체를 그리지 않는다. */
export interface LampPanelState extends LampInfo {
  itemId: string;
}

interface SimHooks {
  ready: boolean;
  backend: 'webgl' | 'webgpu';
  enterSim: (deskId?: string) => void;
  setDeskConfig: (config: DeskConfig) => void;
  deskInfo: () => {
    source: string;
    widthMm: number;
    depthMm: number;
    heightMm: number;
    topThicknessMm: number;
    materialId: string;
    frameType: string;
    surfaceTopY: number;
    frontWallZ: number;
  };
  reset: () => void;
  setRoomLight: (on: boolean) => void;
  roomLightOn: () => boolean;
  setWall: (side: WallSide, on: boolean) => void;
  wallState: () => Record<WallSide, boolean>;
  setWallDistance: (side: 'left' | 'right', distanceM: number) => number;
  wallDistance: () => Record<'left' | 'right', number>;
  setFrontWallGap: (gapM: number) => number;
  frontWallGap: () => number;
  /** 벽면 하나의 마감 교체 — 나머지 두 면은 그대로다(ADR-0030 결정 1). */
  setWallFinish: (side: WallSide, finish: FinishConfig) => void;
  setFloorFinish: (finish: FinishConfig) => void;
  /** 벽면 하나의 창문 넣기/빼기 — null이 "창문 없음"이다(ADR-0030 결정 5·6). */
  setWallWindow: (side: WallSide, window: WallWindowConfig | null) => void;
  /** 방 프리셋 프리필 — 3면+바닥을 한 번에 써넣는 버튼이다. 프리셋 자체는 저장되지 않는다. */
  applyRoomPreset: (key: RoomPresetKey) => void;
  /** 주간/야간 전환 — 방 조명이 기본값(주간 ON · 야간 OFF)으로 따라 움직인다. */
  setTimeOfDay: (time: TimeOfDay) => void;
  roomConfig: () => RoomConfig;
  /** 화면에 실제로 선 표면의 `계열/변형` 이름 — 계측기가 폴백을 잡아내는 관측점(scene.ts). */
  roomSurfaceNames: () => { walls: Record<WallSide, string>; floor: string };
  /** 마지막 프레임의 렌더 비용 — 방 테마 성능 DoD(테마별 drawcall·삼각형, ADR-0021)의 계측기.
   *  `lightingInfo().shaderProgramCount`와 짝이고, 판정과는 무관한 읽기 전용 값이다. */
  renderStats: () => { drawCalls: number; triangles: number };
  lightingInfo: () => LightingInfo;
  placeProduct: (id: string) => { id: string; collided: boolean } | null;
  placeProductAt: (id: string, x: number, z: number) => { id: string; collided: boolean } | null;
  placedCount: () => number;
  collided: () => boolean;
  boundaryViolation: () => boolean;
  /** 충돌 무시 토글 — `collided()`는 이 값과 무관하게 계속 진실을 돌려준다. */
  setCollisionIgnore: (on: boolean) => void;
  collisionIgnored: () => boolean;
  trySave: () => { ok: boolean; reason?: string };
  placedItems: () => {
    id: string;
    specId: string;
    joints: string[];
    /** 월드 좌표 — 결합된 모니터는 암 피벗의 자식이라 로컬 좌표로는 못 읽는다. */
    pos: { x: number; y: number; z: number };
    collided: boolean;
    boundary: boolean;
    mountedToId: string | null;
  }[];
  articulate: (placedId: string, jointId: string, value: number) => number | null;
  jointStates: (placedId: string) => JointUiState[];
  /** gizmo·드래그용 driver 관절 핸들 (테스트 훅, 월드 좌표·축). */
  jointHandles: (placedId: string) => JointHandle[];
  /** 회전 링 기즈모 상태 (테스트 훅, REQ-SIM-18) — `visible`·`hasRing`은 씬 그래프에서
   *  읽은 실제 표시 여부고, 반지름·높이는 선택 아이템 규격에서 나온 기하다(미선택이면 null). */
  rotateRing: () => {
    visible: boolean;
    hasRing: boolean;
    radius: number | null;
    centerY: number | null;
  };
  /** 배치 아이템 조작 (REQ-SIM-16~19) — 좌표는 책상 로컬 m, 각도는 도. */
  selectItem: (placedId: string | null) => void;
  selectedItem: () => {
    id: string;
    specId: string;
    yawDeg: number;
    /** 규격 박스 밑면의 절대 높이(mm) — 사용자가 정한 저장값 */
    liftMm: number;
    /** 앞뒤 기울기(도) — 사용자가 정한 저장값 */
    pitchDeg: number;
    /** 규격 박스 중심 높이(m) — 얹기 높이·수동 높이를 재는 e2e용 */
    centerY: number;
    /** 월드 AABB(m) — 기울기가 **어느 월드축으로** 기우는지 재는 e2e용.
     *  회전 오더가 'YXZ'가 아니면 회전된 아이템이 엉뚱한 축으로 기울어 이 값이 갈린다. */
    worldBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  } | null;
  moveItem: (placedId: string, x: number, z: number) => boolean;
  rotateItem: (placedId: string, yawDeg: number) => number | null;
  /** 규격 박스 밑면의 절대 높이(mm) — 적용값 반환, 결합 중·없는 id면 null. */
  liftItem: (placedId: string, liftMm: number) => number | null;
  /** 앞뒤 기울기(도) — 적용값 반환, 결합 중·없는 id면 null. */
  tiltItem: (placedId: string, pitchDeg: number) => number | null;
  removeItem: (placedId: string) => boolean;
  duplicateItem: (placedId: string) => { id: string; collided: boolean } | null;
  setMonitorMounted: (id: string, mounted: boolean) => boolean;
  /** 장식 발광 (REQ-SIM-21) — 가변 발광의 색 조작·조회. hex는 `'#RRGGBB'`. */
  setEmitterColor: (itemId: string, hex: string) => void;
  emitterInfo: (itemId: string) => { recolorable: boolean; color: string; on: boolean } | null;
  setLampBrightnessScale: (itemId: string, scale: number) => void;
  setLampColorTempK: (itemId: string, k: number) => void;
  lampInfo: (itemId: string) => LampInfo | null;
  /** 모니터↔암 자석 결합 (REQ-SIM-22) — 판정 ② 결과와 실제 결합 여부. */
  mountMonitor: (monitorId: string, armId: string) => MountResult | null;
  /** `at`을 주면 그 상판 좌표로 복귀한다 (드래그 재분리 경로 검증용). */
  detachMonitor: (monitorId: string, opts?: DetachOptions) => boolean;
  /** 마지막 결합·엣지 스냅 이벤트 (배지·배너 배선 확인용). */
  lastMountEvent: () => MountEvent | null;
  itemBounds: (id: string) => { width: number; height: number; depth: number; partCount: number };
  getCameraPreset: (name: PresetName) => { position: number[]; target: number[] } | undefined;
  setCameraPreset: (name: PresetName) => void;
  outlinePlaced: (placedId: string | null) => void;
  setContourLines: (on: boolean) => void;
  contourLinesOn: () => boolean;
  /** 발광 룩 변형 스위처 (DERO-162) — 아트디렉션 판정용. 미지 id면 false. */
  setLookVariant: (id: string) => boolean;
  lookVariant: () => string;
  lookVariants: () => { id: string; label: string }[];
  sampleCenter: () => Promise<{ r: number; g: number; b: number }>;
  sampleRegion: (
    fx0: number,
    fy0: number,
    fx1: number,
    fy1: number,
  ) => Promise<{ r: number; g: number; b: number }>;
}

declare global {
  interface Window {
    __sim: SimHooks;
  }
}

interface SimulatorState {
  // --- engine handles (일반 참조 — Object3D를 리액트 리렌더 트리거로 쓰지 않는다) ---
  renderer: THREE.WebGPURenderer | null;
  sim: ReturnType<typeof createSimScene> | null;
  placement: Placement | null;
  postfx: PostFX | null;
  camera: THREE.PerspectiveCamera | null;
  controls: OrbitControls | null;
  /** 책상 재질 마스터(`GET /desk-textures`) — 저장된 배치를 불러올 때 deskTextureId를 렌더 스킨으로
   *  푸는 데 쓴다(DERO-335). mock/real 모두 initEngine이 채운다(api 레이어가 분기한다). */
  deskTextures: DeskTexturePublicResponse[];

  // --- HUD가 구독하는 캐시 상태 ---
  screen: Screen;
  ready: boolean;
  backend: 'webgl' | 'webgpu' | null;
  wallState: Record<WallSide, boolean>;
  /** 좌/우 벽까지 거리(mm, 책상 중심 기준) — HUD 숫자 입력 표시용, 정본은 엔진 wallDistance(). */
  wallDistanceMm: Record<'left' | 'right', number>;
  /** 전면 벽 간격(mm, 책상 뒷변 기준) — HUD 표시용, 정본은 엔진 frontWallGap(). */
  frontWallGapMm: number;
  /** 적용된 방 표면(벽면 3벌 + 바닥 + 시간대) — 판정과 무관한 순수 시각 상태이고 정본은
   *  엔진 `roomConfig()`다. 저장되는 방의 정본이 이것 하나라 "재로드 때 누가 이기나"가
   *  생기지 않는다 — 프리셋은 이 값에 써넣는 버튼일 뿐이다(ADR-0030 결정 1). */
  roomConfig: RoomConfig;
  roomLightOn: boolean;
  contourOn: boolean;
  /** 겹침 경고·저장 차단을 무시하는 세션 한정 토글 — 저장 payload에 안 실린다(새로고침 시
   *  false로 복귀). 판정 자체는 계속 돌고 경계 위반은 무시 대상이 아니다. */
  collisionIgnored: boolean;
  /** 현재 적용된 발광 룩 변형 id (DERO-162) — 정본은 lookVariants 테이블. */
  lookVariantId: string;
  activePreset: PresetName;
  warning: { on: boolean; msg: string };
  /** 마지막 저장 응답의 규격 위반 목록(ADR-0009 결정 5) — 저장 자체는 성공했고 사유만 알린다.
   *  이 목록이 비어 있지 않은 배치는 `PUT /placements/{id}/feed-entry`가 422로 막으므로, 업로드
   *  전에 무엇을 고쳐야 하는지 여기서 미리 보여준다. 저장할 때마다 서버 응답으로 통째 교체된다. */
  saveViolations: ViolationResponse[];
  toast: string | null;
  /** 라이브러리 드롭 제품의 GLB 첫 로드 대기 중 — SimHud가 로딩 칩을 띄운다. */
  assetLoading: boolean;
  jointPanel: JointPanelState | null;
  emitterPanel: EmitterPanelState | null;
  lampPanel: LampPanelState | null;
  selectedItemId: string | null;
  /** 선택 아이템 이름·회전각 캐시 — 정본은 엔진 PlacedItem, 여긴 렌더용. */
  selectedItemName: string | null;
  /** 선택 아이템의 제품 spec id(배치 인스턴스 id와 다름) — 썸네일 URL 조립용
   *  (`/assets/thumbnails/${specId}.png`, LibraryPanel·EstimatePanel과 동일 규칙). */
  selectedItemSpecId: string | null;
  selectedYawDeg: number;
  /** 선택 아이템의 밑면 절대 높이(mm) 미러 — 정본은 엔진 `PlacedItem.center.y`. 저장된다. */
  selectedLiftMm: number;
  /** 선택 아이템의 앞뒤 기울기(도) 미러 — 정본은 엔진 `PlacedItem.pitchDeg`. 저장된다
   *  (`placed_item.pitch_deg`, ADR-0023). */
  selectedPitchDeg: number;
  /** 선택 아이템의 화면 사진 상태 — 화면 메쉬가 없는 제품(비모니터)이면 null이라
   *  패널 행 자체가 안 뜬다. 정본은 엔진 `PlacedItem.screenPhoto`. */
  screenPanel: { itemId: string; hasPhoto: boolean } | null;
  hoveredItemId: string | null;
  /** 마지막 결합·엣지 스냅 이벤트 — 배지·배너(3단계)와 테스트 훅이 읽는다. */
  lastMountEvent: MountEvent | null;
  /** 지금 떠 있는 판정 배너 — 몇 초 뒤 자동 소멸하거나 다음 이벤트로 대체된다. */
  mountNotice: MountNotice | null;
  /** 결합 중인 모니터의 판정 (monitorId 키) — 조건부 배지를 결합 내내 유지한다. */
  mountJudgments: Record<string, Judgment>;
  /** 선택 아이템이 매달린 암의 이름 — 미결합이면 null. 정본은 엔진, 여긴 렌더용. */
  selectedMountArmName: string | null;
  /** 실행 취소 스택 — 누를 때마다 마지막 항목을 pop해 그 목표 상태로 되돌린다(포즈 또는
   *  존재 자체, `HistoryRecord` 참고). MOVE_HISTORY_CAP개를 넘으면 가장 오래된 항목부터 버린다. */
  moveHistory: HistoryRecord[];
  /** 다시 실행 스택 — 실행 취소가 pop할 때마다 취소 직전 상태를 여기 쌓는다.
   *  새 드래그 이동·추가·삭제가 커밋되면(표준 undo/redo 규약) 통째로 비운다. */
  redoHistory: HistoryRecord[];
  /** Ctrl+C/X로 담아 둔 클립보드 (2026-08-06) — 복사는 원본 id 참조, 잘라내기는 스냅샷
   *  (`SimClipboard` 참고). 선택이 바뀌어도 살아있어 "복사 → 다른 곳 클릭 → 붙여넣기"가 된다.
   *  ref가 가리키는 원본이 그새 지워졌으면 붙여넣기는 조용히 아무 일도 안 한다. */
  clipboard: SimClipboard | null;
  /** 전체 화면 여부 — 전체 화면 중에는 HUD(툴바·레일·선택 패널)를 전부 숨긴다.
   *  `document.fullscreenElement`를 정본으로 `fullscreenchange` 이벤트로만 갱신한다
   *  (ESC 등 브라우저 자체 동작으로도 풀릴 수 있어 버튼 클릭만으로 뒤집으면 어긋난다). */
  isFullscreen: boolean;
  /** 편집 잠금(2026-07-27) — 켜지면 캔버스 픽·드래그·라이브러리 드롭이 막힌다(오빗·줌은
   *  유지). placement.setEditLocked로 그대로 전달, 삭제/복제/회전/분리 액션도 방어적으로
   *  가드한다(단축키 등 캔버스 제스처를 안 거치는 경로 대비). */
  editLocked: boolean;
  placedVersion: number; // items 배열은 store에 직접 안 담고, 변경될 때마다 이 카운터만 올려 리렌더 트리거
  /** 저장 대상 상태가 바뀔 때 증가하는 리비전. 저장 요청이 성공한 시점의 리비전과 비교해
   *  나가기 확인 필요 여부를 판단한다. 저장 중 추가 수정도 놓치지 않는다. */
  changeVersion: number;
  savedChangeVersion: number;
  /** 데스크테리어 제목 — 상단 네비바 로고 옆, 수정 버튼으로 인라인 편집(2026-07-27).
   *  백엔드 저장(REQ-SIM-06) 전이라 세션 로컬 상태일 뿐, 새로고침하면 기본값으로 되돌아간다. */
  projectTitle: string;
  /** /craft/new 마법사 2단계(예산 입력, REQ-ENV-02)에서 넘어온 값 — 아직 견적(REQ-REC-01)에
   *  연결되지 않은 세션 로컬 상태. 파라미터 없이 들어온 경로(직접 /simulator 진입)면 null. */
  budgetKrw: number | null;
  /** 현재 열려 있는 배치의 서버 id — 마법사 직후 진입(REQ-ENV-01)과 "이어서 편집"
   *  (`loadPlacement`, REQ-SIM-06) 둘 다 채운다. 신규 배치라 아직 한 번도 저장 안 했으면 null —
   *  이 경우 `trySave`가 PUT이 아니라 POST(createPlacement)를 부른다. */
  placementId: number | null;
  /** `placementId`가 아직 없는(한 번도 저장 안 한) 배치가 `trySave`로 처음 저장될 때 생성되는
   *  세션 로컬 id — /craft 로컬 낙관적 목록(craftProjectsStore)의 카드 id로 쓴다. 같은 세션에서
   *  여러 번 저장해도 이 값을 재사용해 중복 카드가 생기지 않는다. 서버가 실제 id를 내려주면
   *  (`response.id`) 그걸로 교체하고 이 값은 그대로 둔다(재저장 때 재사용 안 함 — placementId가
   *  채워졌으니). */
  localCraftId: string | null;
  /** 배치 낙관적 락 버전(ADR-0009) — `loadPlacement`가 서버값으로 세팅하고, `trySave` 성공마다
   *  응답값으로 갱신한다. 신규 배치는 0에서 시작(CraftNewWizard와 동일 규약). */
  version: number;
  /** 마지막 저장 성공 시각(epoch ms) — 상단 툴바 "마지막 저장" 표시용. 저장 전이면 null. */
  lastSavedAt: number | null;
  /** 저장 요청 진행 중 — 응답 오기 전 재클릭이 같은 버전으로 두 번 나가 두 번째가
   *  409 PLACEMENT_STALE로 튕기는 경로를 막는다(`trySave`가 이 값이 true면 새 요청을 안 만든다,
   *  `EditorSidebar`가 저장 버튼 비활성화에 구독). */
  saving: boolean;
  /** 견적서에서 합계 제외 체크한 제품 spec id (인스턴스 단위가 아니라 제품 단위 —
   *  견적서는 같은 제품을 수량으로 묶어 보여준다). REQ-REC-01 사용자 제외 — 자동 제외와는 별개. */
  excludedEstimateProductIds: Record<string, boolean>;

  // --- actions ---
  /** R3F Canvas의 gl prop이 이미 만든 renderer를 받아 나머지 엔진(assets~postfx)을 조립한다. */
  initEngine: (renderer: THREE.WebGPURenderer, aspect: number) => Promise<void>;
  /** SimulatorCanvas 재마운트 시 새로고침과 동일한 초기 상태로 되돌린다 — 스토어는 모듈 싱글턴이라 안 하면 이전 ready/screen이 남는다. */
  resetForMount: () => void;
  enterSim: (deskId?: string) => void;
  setDeskConfig: (config: DeskConfig) => void;
  setProjectTitle: (title: string) => void;
  setBudgetKrw: (budgetKrw: number | null) => void;
  setPlacementId: (id: number | null) => void;
  /** 저장된 배치를 불러와 책상·벽·조명·아이템을 전부 씬에 복원한다(REQ-SIM-06 "불러오기").
   *  `enterSim`/`setDeskConfig`와 달리 `populateHeroOnce` 데모 아이템을 채우지 않는다 —
   *  항상 서버가 준 실제 아이템만 배치한다. 실패(404 등)하면 콘솔 에러만 남기고
   *  `enterSim()`으로 기본 책상에 진입시켜 빈 화면에 멈추지 않게 한다. */
  loadPlacement: (id: number) => Promise<void>;
  /** 캔버스 현재 프레임을 PNG Blob으로 캡처 — 배치 썸네일 자동/수동 캡처가 공유. 렌더러가
   *  아직 없으면 null. */
  captureThumbnail: () => Promise<Blob | null>;
  reset: () => void;
  setRoomLight: (on: boolean) => void;
  setWall: (side: WallSide, on: boolean) => void;
  setWallDistance: (side: 'left' | 'right', distanceMm: number) => void;
  /** 전면 벽 간격(mm, 책상 뒷변 기준) 설정 — 좌/우와 달리 중심 기준이 아니다. */
  setFrontWallGap: (gapMm: number) => void;
  /** 벽면 하나의 마감 교체 — 편집 잠금(REQ-SIM-26) 대상이다. */
  setWallFinish: (side: WallSide, finish: FinishConfig) => void;
  setFloorFinish: (finish: FinishConfig) => void;
  /** 벽면 하나의 창문 넣기/빼기 — 마감·시간대와 같은 창구(applyRoomConfig)를 탄다. */
  setWallWindow: (side: WallSide, window: WallWindowConfig | null) => void;
  /** 주간/야간 전환 — 방 조명을 기본값(주간 ON · 야간 OFF)으로 함께 움직인다. 그 뒤
   *  사용자가 방 조명만 따로 토글할 수 있어 조합 4개가 전부 만들어진다. */
  setTimeOfDay: (time: TimeOfDay) => void;
  /** 방 프리셋으로 3면+바닥을 한 번에 채운다. 그 뒤 한 면만 고쳐도 그 수정이 유지된다. */
  applyRoomPreset: (key: RoomPresetKey) => void;
  /** 방 한 벌 적용 — 위 셋이 공유하는 단일 창구이자 **편집 잠금 게이트가 걸린 유일한 자리**다
   *  (엔진 반영 + 미러 + 변경 카운트). 저장된 배치를 여는 경로는 사용자 편집이 아니라
   *  잠금 대상도 아니므로 이 창구가 아니라 `sim.applyRoom`을 직접 부른다. */
  applyRoomConfig: (config: RoomConfig) => void;
  setContourLines: (on: boolean) => void;
  /** 충돌 무시 토글 — sim.setCollisionIgnored(틴트) + refreshWarning(배너)를 같이 태운다. */
  setCollisionIgnore: (on: boolean) => void;
  /** 전체 화면 진입/해제 토글 — 실제 상태 반영은 initEngine이 구독한 fullscreenchange가 한다. */
  toggleFullscreen: () => void;
  /** 편집 잠금 토글 — placement.setEditLocked로 그대로 반영. */
  toggleEditLock: () => void;
  /** 카메라 확대/축소 — OrbitControls.dollyIn/Out 한 스텝(내부에서 update()까지 호출). */
  zoomIn: () => void;
  zoomOut: () => void;
  /** 발광 룩 변형 적용 (DERO-162) — postfx가 없거나 미지 id면 false. */
  setLookVariant: (id: string) => boolean;
  setCameraPreset: (name: PresetName) => void;
  placeProduct: (id: string) => { id: string; collided: boolean } | null;
  articulate: (placedId: string, jointId: string, angleDeg: number) => number | null;
  trySave: () => { ok: boolean; reason?: string };
  showToast: (msg: string) => void;
  /** 선택 상태 갱신 — 캔버스 픽·복제·삭제·테스트 훅이 공유하는 단일 경로. */
  selectItem: (placedId: string | null) => void;
  /** 선택 아이템 조작 (REQ-SIM-17~19) — 선택이 없으면 아무 일도 하지 않는다. */
  rotateSelected: (yawDeg: number) => void;
  /** R 키 45° 회전 (REQ-SIM-18, ADR-0022 결정 7) — 대상 우선순위는 **드래그 중인 것 먼저**다:
   *  라이브러리 드래그 중이면 고스트, 배치 아이템을 끌고 있으면 그 아이템, 아니면 선택 아이템. */
  rotateSelectedByStep: () => void;
  /** 선택 아이템의 밑면 절대 높이(mm, 0~LIFT_MAX_MM) — 적용값은 엔진에서 되읽는다. */
  liftSelected: (liftMm: number) => void;
  /** 선택 아이템의 앞뒤 기울기(도) — 적용값은 엔진에서 되읽는다. */
  tiltSelected: (pitchDeg: number) => void;
  /** 선택 아이템의 가변 발광 색 변경 (REQ-SIM-21) — 적용 결과는 엔진에서 다시 읽는다. */
  recolorSelected: (hex: string) => void;
  /** 선택 아이템의 발광 on/off (세션 한정) — 발광체가 없으면 no-op. */
  toggleEmitterSelected: (on: boolean) => void;
  /** 선택한 모니터 화면에 사진을 올리거나(`file`) 지운다(`null`). 사진은 서버로 안 나가고
   *  브라우저 IndexedDB에만 남는다 — 저장된 배치를 다시 열 때 복원된다. */
  setScreenPhotoSelected: (file: File | null) => Promise<void>;
  /** 선택 램프의 밝기 배율 변경 (REQ-SIM-08) — 적용 결과는 엔진에서 다시 읽는다. */
  setLampBrightness: (scale: number) => void;
  /** 선택 램프의 색온도(K) 변경 (REQ-SIM-08) — 적용 결과는 엔진에서 다시 읽는다. */
  setLampColorTemp: (k: number) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  /** Ctrl+C — 선택 아이템 id를 클립보드에 기억해 둔다(선택이 없으면 no-op). */
  copySelected: () => void;
  /** Ctrl+X — 선택 아이템의 스냅샷을 클립보드에 담고 삭제한다(잘라내기). 삭제는
   *  deleteSelected를 그대로 타므로 Ctrl+Z로 되돌릴 수 있고 편집 잠금도 같은 가드를 받는다. */
  cutSelected: () => void;
  /** Ctrl+V — 클립보드 아이템을 duplicateSelected와 같은 방식으로 복제한다(잘라낸 것은
   *  스냅샷에서 재생성). */
  pasteClipboard: () => void;
  /** 선택 모니터를 암에서 분리한다 (D22 — 분리는 사용자 조작으로만). */
  detachSelected: () => void;
  /** 실행 취소 스택에서 마지막 항목을 pop해 되돌린다 — 누를 때마다 한 단계씩 계속
   *  거슬러 올라간다. 스택이 비어 있으면 아무 일도 하지 않는다. */
  undoLastMove: () => void;
  /** 다시 실행 스택에서 마지막 항목을 pop해 복원한다. 스택이 비어 있으면 아무 일도 하지 않는다. */
  redoMove: () => void;
  /** undoLastMove·redoMove 내부 공용 뒷정리 — 외부에서 직접 부를 일은 없다. */
  afterHistoryStep: (applied: HistoryRecord) => void;
  /** 판정 배너 교체 — null이면 즉시 지운다. */
  showMountNotice: (notice: MountNotice | null) => void;
  /** 결합 시도를 서버 정본 판정으로 확정한다 — 미러와 다르면 서버가 이긴다(ADR-0009 결정 6). */
  confirmMountWithServer: (event: MountEvent) => Promise<void>;
  /** 견적서 체크박스 — 켜져 있으면(기본) 합계 포함, 끄면 그 제품(전체 수량)을 합계에서 뺀다. */
  toggleEstimateExclusion: (specId: string) => void;
  /** selectedMountArmName 재계산 — 선택 변경·결합 이벤트마다 공유. */
  refreshSelectedMount: () => void;
  /** gizmo·선택·패널을 전부 지운다 — clearPlaced() 계열(reset·setDeskConfig·enterSim의
   *  chooseDesk) 뒤에 공유. 안 부르면 dispose된 아이템의 gizmo·아웃라인이 남는다. */
  clearSelectionState: () => void;
  /** initEngine이 채우는 내부 갱신 훅 — 액션들이 아웃라인·경고를 다시 그리는 데 쓴다. */
  refreshOutline: (() => void) | null;
  refreshWarning: (() => void) | null;
}

const WARN_COLLIDE = '⚠ 오브젝트가 겹칩니다 — 배치를 조정하세요';
/** 상판 경계 위반 문구 — 어느 제품이 걸렸는지 말해 준다(배너 하나로는 못 찾는다).
 *  "벽"은 넣지 않는다: 벽 소프트 판정은 2026-08-03에 삭제됐고 하드 클램프만 남았다. */
function boundaryWarn(name: string | null, extra: number): string {
  const who = name ? `'${name}'${extra > 0 ? ` 외 ${extra}개` : ''}가 ` : '배치가 ';
  return `⚠ ${who}상판 경계를 벗어났습니다 — 배치를 조정하세요`;
}
/** 램프가 광원 슬롯 수를 넘었다 (DERO-235) — 초과 램프는 형상만 남고 빛을 못 낸다.
 *  조용히 안 켜지는 것이 스파이크에서 확인된 유일한 사용자 대면 결함이라 배너로 알린다. */
const WARN_LAMP_SLOTS = '⚠ 조명 상한 초과 — 일부 램프가 빛을 내지 않습니다';
const WARN_SAVE_BLOCKED = '⚠ 겹침·경계 위반 상태에서는 저장할 수 없습니다 — 배치를 조정하세요';

/** 판정 배너 노출 시간 (ms) — 수치 사유를 읽을 시간이 필요해 토스트(2s)보다 길다. */
const MOUNT_NOTICE_MS = 5000;

/** 되돌리기 히스토리 스택 상한 — 무한정 쌓이지 않게 오래된 항목부터 버린다. */
const MOVE_HISTORY_CAP = 50;

/** 아이템의 밑면 절대 높이(mm) — 수동 높이 축의 값이다(엔진 `liftItem`과 같은 규약,
 *  ADR-0023 결정 3). `center.y`는 규격 박스 **중심**이라 반높이를 뺀다. */
function baseLiftMm(it: PlacedItem): number {
  return mToMm(it.center.y) - it.spec.heightMm / 2;
}

/** 배치 아이템 하나를 다시 만들 수 있을 만큼만 담은 값 — spec·자리·회전·기울기·높이.
 *  `duplicateItem`(scene.ts)과 정확히 같은 정도의 정확도다: 벽 부착·관절·발광 오버라이드·
 *  화면 사진 같은 부가 상태는 복제와 마찬가지로 재현하지 않는다(2026-08-06, Ctrl+Z가
 *  추가·삭제까지 되돌리도록 확장하며 신설). */
interface HistorySnapshot {
  spec: ProductSpec;
  x: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
  liftMm: number;
}

function snapshotOf(it: PlacedItem): HistorySnapshot {
  return {
    spec: it.spec,
    x: it.center.x,
    z: it.center.z,
    yawDeg: it.yawDeg,
    pitchDeg: it.pitchDeg,
    liftMm: baseLiftMm(it),
  };
}

function recreateFromSnapshot(
  sim: SimScene,
  snapshot: HistorySnapshot,
): { id: string; collided: boolean } {
  const made = sim.placeAt(snapshot.spec, snapshot.x, snapshot.z, {
    yawDeg: snapshot.yawDeg,
    drop: true,
  });
  if (snapshot.pitchDeg) sim.tiltItem(made.id, snapshot.pitchDeg);
  sim.liftItem(made.id, snapshot.liftMm);
  return made;
}

/** Ctrl+C/X 클립보드 내용물. 복사(`ref`)는 원본 id만 기억해 붙여넣기 시점에 살아 있으면
 *  복제한다(원본이 지워졌으면 no-op — 기존 계약 그대로). 잘라내기(`snapshot`)는 원본이
 *  삭제되므로 id 참조가 성립하지 않아, 지우기 직전 스냅샷을 통째로 들고 있다가 붙여넣기
 *  때 재생성한다(정확도는 undo의 presence 복원과 동일 — `HistorySnapshot` 참고). */
type SimClipboard =
  { kind: 'ref'; itemId: string } | { kind: 'snapshot'; snapshot: HistorySnapshot };

/** 실행 취소/다시 실행 스택 항목. 'move'는 포즈만 되돌리고, 'presence'는 아이템의 존재
 *  자체를 되돌린다(추가 취소 = 삭제, 삭제 취소 = 재생성 — `HistorySnapshot`의 정확도로).
 *  두 스택 모두 "이 항목을 적용하면 도달하는 목표 상태"를 담는다는 점이 같아서, 하나의
 *  `applyHistoryRecord`가 되돌리기·다시 실행 양쪽에 그대로 쓰인다. */
type HistoryRecord =
  | { kind: 'move'; id: string; pose: ItemPose }
  | { kind: 'presence'; exists: true; snapshot: HistorySnapshot }
  | { kind: 'presence'; exists: false; id: string };

/** 스택에서 꺼낸 항목 하나를 실제로 적용하고, 반대쪽 스택에 쌓을 반전 항목을 돌려준다.
 *  적용 대상이 이미 사라졌으면(다른 경로로 지워진 아이템 등) null — 호출부가 이미
 *  pop했으므로 그냥 버려진다(기존 undoLastMove의 "성공·실패와 무관하게 소비" 관례 그대로). */
function applyHistoryRecord(sim: SimScene, record: HistoryRecord): HistoryRecord | null {
  if (record.kind === 'move') {
    const current = sim.placed().find((i) => i.id === record.id);
    if (!current) return null;
    const inverse: HistoryRecord = {
      kind: 'move',
      id: record.id,
      pose: {
        x: current.center.x,
        y: current.center.y,
        z: current.center.z,
        yawDeg: current.yawDeg,
      },
    };
    const ok = sim.restorePose(
      record.id,
      record.pose.x,
      record.pose.z,
      record.pose.yawDeg,
      mToMm(record.pose.y),
    );
    return ok ? inverse : null;
  }
  if (record.exists) {
    const made = recreateFromSnapshot(sim, record.snapshot);
    return { kind: 'presence', exists: false, id: made.id };
  }
  const it = sim.placed().find((i) => i.id === record.id);
  if (!it) return null;
  const snapshot = snapshotOf(it);
  if (!sim.removeItem(record.id)) return null;
  return { kind: 'presence', exists: true, snapshot };
}

/** 새 데스크테리어 진입 시 기본 제목 — 사용자가 수정 버튼으로 바꾸기 전까지. */
const DEFAULT_PROJECT_TITLE = '제목 없는 데스크테리어';

/** 아직 저장 전이라 배치 아이템 id가 없는 화면 사진 — 엔진 배치 id로 들고 있다가
 *  저장 응답이 id를 내려주면 IndexedDB로 옮긴다. 렌더에 안 쓰이므로 스토어 밖에 둔다. */
const pendingScreenPhotos = new Map<string, Blob>();

/** 저장 응답 직후 화면 사진을 IndexedDB에 정착시킨다 — 대기표(엔진 배치 id 기준)를 방금
 *  받은 배치 아이템 id로 옮기고, 이 배치에 남지 않은 키(삭제된 모니터)는 회수한다. */
async function flushScreenPhotos(
  sim: SimScene,
  placementId: number,
  mappings: { ref: string; id: number }[],
): Promise<void> {
  const keep: string[] = [];
  for (const { ref, id } of mappings) {
    const key = screenPhotoKey(placementId, id);
    const pending = pendingScreenPhotos.get(ref);
    if (pending) {
      pendingScreenPhotos.delete(ref);
      await putScreenPhoto(key, pending);
    }
    if (sim.placed().find((i: PlacedItem) => i.id === ref)?.screenPhoto) keep.push(key);
  }
  await pruneScreenPhotos(placementId, keep);
}

/** 배치 스크린샷 고정 해상도·비율 — 16:9인 이유는 이 이미지를 보여주는 자리가 전부
 *  `aspect-video`이기 때문이다(CollectionGeneratedImages.tsx·DeskProjectCard.tsx).
 *  자세한 배경은 아래 captureFullCanvas 주석 참고. */
const SCREENSHOT_WIDTH = 1600;
const SCREENSHOT_HEIGHT = 900;
const SCREENSHOT_ASPECT = 16 / 9;

const BACKEND_FRAME_TYPE_TO_LOCAL: Record<BackendFrameType, DeskFrameType> = {
  T_FRAME: 't-frame',
  FOUR_LEG: 'four-leg',
  TOP_ONLY: 'top-only',
};
const FRAME_TYPE_TO_BACKEND: Record<DeskFrameType, BackendFrameType> = {
  't-frame': 'T_FRAME',
  'four-leg': 'FOUR_LEG',
  'top-only': 'TOP_ONLY',
};

/** 재질은 `GET /desk-textures` 마스터에서 스킨으로 푼다 — 시딩 2행 밖의 재질도 저장한 그대로
 *  복원된다(DERO-335, 옛 DESK_TEXTURE_ID_TO_MATERIAL 임시표를 대체). materialId는 스킨이
 *  있으면 무시되는 폴백 자리라 기본값을 그대로 둔다. */
function deskConfigFromDetail(
  d: DeskDetailResponse,
  deskTextures: DeskTexturePublicResponse[],
): DeskConfig {
  return {
    source: d.specSource === 'PRODUCT' ? 'product' : 'custom',
    productId: d.productId != null ? String(d.productId) : undefined,
    widthMm: d.widthMm,
    depthMm: d.depthMm,
    heightMm: d.heightMm,
    topThicknessMm: d.topThicknessMm,
    edgeThicknessMm: d.edgeThicknessMm ?? undefined,
    materialId: DEFAULT_CUSTOM_DESK.materialId,
    deskTextureId: d.deskTextureId,
    materialSkin: deskSkinForTextureId(deskTextures, d.deskTextureId),
    frameType: BACKEND_FRAME_TYPE_TO_LOCAL[d.frameType],
  };
}

function deskSnapshotFromConfig(config: DeskConfig): DeskSnapshot {
  if (config.source === 'product') {
    return {
      specSource: 'PRODUCT',
      productId: config.productId ? Number(config.productId) : null,
      widthMm: null,
      depthMm: null,
      heightMm: null,
      topThicknessMm: null,
      edgeThicknessMm: null,
      deskTextureId: null,
      frameType: null,
    };
  }
  return {
    specSource: 'CUSTOM',
    productId: null,
    widthMm: config.widthMm,
    depthMm: config.depthMm,
    heightMm: config.heightMm,
    topThicknessMm: config.topThicknessMm,
    edgeThicknessMm: config.edgeThicknessMm ?? null,
    // 사용자가 고른 desk_texture 마스터 id(DERO-335) — 재질 목록을 못 받았을 때만
    // 시딩 기본값으로 떨어진다.
    deskTextureId: config.deskTextureId ?? TEMP_DESK_TEXTURE_ID,
    frameType: FRAME_TYPE_TO_BACKEND[config.frameType],
  };
}

/** 마운트마다 반드시 비어 있어야 하는 세션 스코프 상태 — 스토어 초기값과 `resetForMount()`가
 *  **같은 목록**을 봐야 한다. 손으로 관리하는 목록이 둘로 갈린 것이 이 결함의 원인이었다:
 *  `resetForMount`가 `warning`을 빼먹어 이전 데스크의 경고 배너가 새 데스크로 넘어왔다
 *  (스토어는 모듈 싱글턴이라 라우트를 떠나도 살아 있다). `moveHistory`·`saveViolations` 등
 *  형제 필드도 같은 누락이었고, 새 세션 필드를 추가할 때 이제 여기 한 곳만 고치면 된다.
 *
 *  여기 넣지 않는 것: 엔진 미러(`wallState`·`roomConfig`·`roomLightOn`…)는 `enterSim`·
 *  `setDeskConfig`·`loadPlacement`가 새 엔진 값으로 덮으므로 리셋 대상이 아니고, 카탈로그
 *  캐시(`categories`·`deskTextures`)는 마운트를 넘겨 재사용하는 것이 맞다.
 *
 *  **매번 새 객체를 만드는 함수다** — 상수 하나를 두 곳에 펴 넣으면 배열·객체 필드
 *  (`moveHistory`·`mountJudgments`…)가 참조를 공유해 한쪽 변경이 다른 쪽으로 번진다. */
type SessionScopedState = Pick<
  SimulatorState,
  | 'warning'
  | 'saveViolations'
  | 'toast'
  | 'assetLoading'
  | 'jointPanel'
  | 'emitterPanel'
  | 'lampPanel'
  | 'screenPanel'
  | 'selectedItemId'
  | 'selectedItemName'
  | 'selectedItemSpecId'
  | 'selectedYawDeg'
  | 'selectedLiftMm'
  | 'selectedPitchDeg'
  | 'hoveredItemId'
  | 'lastMountEvent'
  | 'mountNotice'
  | 'mountJudgments'
  | 'selectedMountArmName'
  | 'moveHistory'
  | 'redoHistory'
  | 'isFullscreen'
  | 'editLocked'
  | 'placedVersion'
  | 'lastSavedAt'
  | 'saving'
  | 'excludedEstimateProductIds'
>;

function sessionScopedInitial(): SessionScopedState {
  return {
    warning: { on: false, msg: '' },
    saveViolations: [],
    toast: null,
    assetLoading: false,
    jointPanel: null,
    emitterPanel: null,
    lampPanel: null,
    screenPanel: null,
    selectedItemId: null,
    selectedItemName: null,
    selectedItemSpecId: null,
    selectedYawDeg: 0,
    selectedLiftMm: 0,
    selectedPitchDeg: 0,
    hoveredItemId: null,
    lastMountEvent: null,
    mountNotice: null,
    mountJudgments: {},
    selectedMountArmName: null,
    moveHistory: [],
    redoHistory: [],
    isFullscreen: false,
    editLocked: false,
    placedVersion: 0,
    lastSavedAt: null,
    saving: false,
    excludedEstimateProductIds: {},
  };
}

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  renderer: null,
  sim: null,
  placement: null,
  postfx: null,
  camera: null,
  controls: null,
  deskTextures: [],

  // 세션 스코프 초기값은 sessionScopedInitial() 하나가 정본이다 — 여기에 손으로 다시
  // 나열하면 필드가 늘 때마다 두 목록이 어긋난다(2026-08-06 실측: lastSavedAt·saving·
  // excludedEstimateProductIds 3개가 타입에는 있고 여기에는 없어 develop이 컴파일 에러였다).
  ...sessionScopedInitial(),

  screen: 'select',
  ready: false,
  backend: null,
  wallState: { left: true, front: true, right: false },
  wallDistanceMm: { left: 1550, right: 1550 },
  // 엔진 FRONT_WALL_GAP_DEFAULT_M(scene.ts)의 mm 표시값 — 진입 시 엔진 값으로 다시 읽으므로
  // 표시 초기값일 뿐이지만, 어긋나면 첫 렌더 한 프레임 동안 HUD가 거짓말을 한다.
  frontWallGapMm: 50,
  roomConfig: roomConfigForPreset(DEFAULT_ROOM_PRESET_KEY),
  roomLightOn: true,
  contourOn: false,
  collisionIgnored: false,
  lookVariantId: DEFAULT_LOOK_ID,
  activePreset: 'hero',
  warning: { on: false, msg: '' },
  saveViolations: [],
  toast: null,
  assetLoading: false,
  jointPanel: null,
  emitterPanel: null,
  lampPanel: null,
  screenPanel: null,
  selectedItemId: null,
  selectedItemName: null,
  selectedItemSpecId: null,
  selectedYawDeg: 0,
  selectedLiftMm: 0,
  selectedPitchDeg: 0,
  hoveredItemId: null,
  lastMountEvent: null,
  mountNotice: null,
  mountJudgments: {},
  selectedMountArmName: null,
  moveHistory: [],
  redoHistory: [],
  clipboard: null,
  isFullscreen: false,
  editLocked: false,
  placedVersion: 0,
  // develop 머지(2026-08-06)로 SessionScopedState에 추가된 세 필드가 이 초기 리터럴에는
  // 빠져 있어 typecheck가 깨졌다 — sessionScopedInitial()의 값과 동일하게 채운다.
  lastSavedAt: null,
  saving: false,
  excludedEstimateProductIds: {},
  changeVersion: 0,
  savedChangeVersion: -1,
  projectTitle: DEFAULT_PROJECT_TITLE,
  budgetKrw: null,
  placementId: null,
  localCraftId: null,
  version: 0,
  refreshOutline: null,
  refreshWarning: null,

  async initEngine(renderer, aspect) {
    const canvas = renderer.domElement as HTMLCanvasElement;
    const loader = await createAssetLoader(renderer);
    const assets = createProductAssets(loader);
    // 실 모드면 백엔드 카탈로그로 배타 전환한다(ADR-0017 결정 3) — product.ts의 setCatalog()가
    // getProduct()/libraryItems() 등 조회 함수 전부의 원본을 PRODUCTS에서 이 캐시로 바꾼다.
    // mock 모드(기본값)는 이 분기 자체를 안 타 기존 동작이 완전히 그대로다.
    // 카테고리 마스터(GET /categories)는 더 안 받는다 — 정적 고정(2026-08-05,
    // constants/productCategoryGroup.ts). **제품 본문도 부팅에서 안 받는다**: 카탈로그는
    // 라이브러리 패널이 스크롤하며 20개씩 커서 페이징하고(useCatalogPage), GLB는 배치 직전에야
    // 로드된다. 부팅이 전 카탈로그를 프리페치하던 시절엔 진입할 때마다 4.6MB GLB가 두 번씩
    // 파싱됐다. ARM 실측(박스 치수 컬럼 없음)도 같은 이유로 배치 시점(ensureTemplate)으로 미뤘다.
    let catalogSpecs: ProductSpec[] = PRODUCTS;
    // 책상 재질 마스터는 mock/real 양쪽 다 필요하다 — 저장된 배치를 불러올 때 deskTextureId를
    // 렌더 스킨으로 푸는 데 쓴다(DERO-335). 분기는 api 레이어(getDeskTextures)가 한다.
    // 실패해도 부팅은 계속한다 — 재질만 기본 오크로 떨어진다(카탈로그 전반의 "씬을 죽이지
    // 않는다" 원칙).
    const deskTextures = await getDeskTextures().catch((error: unknown) => {
      console.error('[simulatorStore] 책상 재질 목록을 불러오지 못했습니다', error);
      return [] as DeskTexturePublicResponse[];
    });
    if (!isMockApi()) {
      // 빈 배열이지 null이 아니다 — null은 "mock PRODUCTS로 폴백"이라는 뜻이라 배타 전환이
      // 깨진다. 페이지가 도착할 때마다 appendCatalog가 여기에 이어 붙인다.
      catalogSpecs = [];
      setCatalog(catalogSpecs);
    } else {
      // mock 전용 양보: e2e 25곳이 window.__sim.placeProductAt으로 **동기** 배치하고
      // 그중 12곳이 rig를 가진 monitor-arm-white다 — 템플릿이 콜드면 파라메트릭 폴백이라
      // 관절이 없어진다. mock 카탈로그의 GLB는 2개뿐이라 부팅 비용이 무시할 수준이다.
      await assets.preload(catalogSpecs);
    }
    const sim = createSimScene(renderer, assets);
    const camera = createCamera(aspect);
    const controls = createControls(camera, canvas);
    const placement = createPlacement(sim, camera, renderer, controls);
    const postfx = createPostFX(renderer, sim.scene, camera);

    const refreshWarning = (): void => {
      // 충돌 무시 토글은 판정을 끄지 않고 경고만 삼킨다 — 경계 위반은 무시 대상이 아니라
      // 게이트를 안 건다 (trySave의 게이트와 같은 규약).
      const c = sim.anyCollision() && !get().collisionIgnored;
      const b = sim.anyBoundaryViolation();
      // 배치를 못 하게 막는 위반(겹침·경계)이 우선이고, 무광 램프는 저장을 막지 않는
      // 알림이라 마지막이다. 셋 다 아니면 배너가 숨으므로 msg는 표시되지 않는다.
      const unlit = sim.lightingInfo().unlitLampCount > 0;
      // 위반 아이템 이름은 경계 경고에만 쓴다 — 겹침은 최소 두 개라 한 쪽만 대면 오해를 준다.
      const viol = b ? sim.placed().filter((i: PlacedItem) => i.boundary) : [];
      const msg = c
        ? WARN_COLLIDE
        : b
          ? boundaryWarn(viol[0]?.spec.name ?? null, viol.length - 1)
          : WARN_LAMP_SLOTS;
      set({ warning: { on: c || b || unlit, msg } });
    };

    const refreshOutline = (): void => {
      const { selectedItemId, hoveredItemId } = get();
      const groups: THREE.Object3D[] = [];
      const items = sim.placed();
      const sel = items.find((i) => i.id === selectedItemId);
      const hov = items.find((i) => i.id === hoveredItemId);
      if (sel) groups.push(sel.group);
      if (hov && hov !== sel) groups.push(hov.group);
      postfx.setOutline(groups);
    };

    placement.onChange(() => {
      refreshWarning();
      set((s) => ({
        placedVersion: s.placedVersion + 1,
        changeVersion: s.changeVersion + 1,
      }));
    });
    // 결합·엣지 스냅은 배치 변경이기도 하다 — 경고·리렌더를 onChange와 같게 갱신한다.
    // 3단계 UX(배너·조건부 배지·거절 틴트)도 전부 이 한 지점에서 배선한다.
    placement.onMountEvent((e: MountEvent) => {
      refreshWarning();
      set((s) => ({
        lastMountEvent: e,
        placedVersion: s.placedVersion + 1,
        changeVersion:
          e.kind === 'mounted' || e.kind === 'detached' ? s.changeVersion + 1 : s.changeVersion,
      }));
      if (e.kind === 'mounted') {
        set((s) => ({ mountJudgments: { ...s.mountJudgments, [e.monitorId]: e.judgment } }));
      } else if (e.kind === 'detached') {
        set((s) => {
          const next = { ...s.mountJudgments };
          delete next[e.monitorId];
          return { mountJudgments: next };
        });
      } else if (e.kind === 'rejected') {
        // 거절은 씬을 한 글자도 안 바꾼다 — 틴트가 유일한 씬 피드백이다.
        sim.flashReject(e.monitorId);
      } else if (e.kind === 'edge-rejected') {
        // 암↔책상도 같은 결합 층(D22 ①)이라 거절 피드백 3종이 똑같이 붙는다.
        sim.flashReject(e.armId);
      }
      get().showMountNotice(mountNoticeFor(e));
      get().refreshSelectedMount();
      // 미러 배너를 먼저 띄운 뒤 서버 정본 판정을 뒤따라 받는다 — 도착하면 서버가 이긴다
      // (ADR-0004·ADR-0009 결정 6). 실패해도 미러 배너가 그대로 남으므로 await하지 않는다.
      void get().confirmMountWithServer(e);
    });
    // 실제로 옮긴 드래그 릴리스마다 시작 포즈를 실행취소 스택에 쌓는다 — 누를 때마다
    // 한 단계씩 계속 거슬러 올라간다(MOVE_HISTORY_CAP 초과 시 가장 오래된 항목부터 버림).
    // 새 이동은 표준 undo/redo 규약대로 다시 실행 스택을 비운다.
    placement.onMoveCommitted((e: MoveCommittedEvent) =>
      set((s) => ({
        moveHistory: [
          ...s.moveHistory,
          { kind: 'move', id: e.id, pose: e.from } as HistoryRecord,
        ].slice(-MOVE_HISTORY_CAP),
        redoHistory: [],
      })),
    );
    // 라이브러리 드래그로 새 아이템이 놓일 때마다 되돌리기 스택에 쌓는다 — Ctrl+Z가
    // 이동뿐 아니라 추가도 되돌리게 한다(2026-08-06). 클릭 배치(e2e 훅)와 복제·붙여넣기는
    // 각자 자리에서 직접 쌓으므로 여기서 다시 안 낸다.
    placement.onItemAdded((id: string) => {
      set((s) => ({
        moveHistory: [
          ...s.moveHistory,
          { kind: 'presence', exists: false, id } as HistoryRecord,
        ].slice(-MOVE_HISTORY_CAP),
        redoHistory: [],
      }));
    });
    placement.onSelect((item: PlacedItem | null) => get().selectItem(item?.id ?? null));
    placement.onPlaceError((spec: ProductSpec) =>
      get().showToast(`⚠ ${spec.name} 모델을 불러오지 못했습니다`),
    );
    placement.onAssetLoading((loading: boolean) => set({ assetLoading: loading }));
    placement.onHover((item: PlacedItem | null) => {
      set({ hoveredItemId: item?.id ?? null });
      refreshOutline();
    });
    // gizmo 드래그로 관절이 바뀌면 슬라이더 패널도 같은 값을 반영한다(ADR 결정 5).
    placement.onJointChange(() => {
      const id = get().selectedItemId;
      if (id) {
        set({
          jointPanel: {
            itemId: id,
            title: get().selectedItemName ?? '',
            joints: sim.jointStates(id),
          },
          changeVersion: get().changeVersion + 1,
        });
      }
    });

    // 링 드래그로 yaw가 바뀌면 선택 패널의 각도 표시도 같은 값을 반영한다(관절과 같은 규약).
    placement.onRotateChange((itemId: string, yawDeg: number) => {
      if (get().selectedItemId !== itemId) return;
      get().refreshWarning?.();
      set((s) => ({
        selectedYawDeg: yawDeg,
        placedVersion: s.placedVersion + 1,
        changeVersion: s.changeVersion + 1,
      }));
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ESC 등 브라우저 자체 동작으로도 전체 화면이 풀릴 수 있어 정본은 항상 이 이벤트로만 갱신한다.
    document.addEventListener('fullscreenchange', () => {
      set({ isFullscreen: !!document.fullscreenElement });
    });

    const keyMap: Record<string, PresetName> = {
      '1': 'first-person',
      '2': 'front',
      '3': 'back',
      '4': 'side',
      '5': 'top',
      h: 'hero',
    };
    window.addEventListener('keydown', (e) => {
      // 입력 중에는 단축키를 먹지 않는다 — 책상 규격 입력창에서 Backspace가
      // 소품을 지워버리면 안 된다.
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if (typing) return;
      // 진입 로딩 중(기본 책상만 서 있는 구간)엔 카메라 프리셋 단축키가 오버레이를 통과해
      // 화면을 움직인다 — 실제 책상이 얹혀 screen이 'sim'이 된 뒤에만 단축키를 받는다.
      if (get().screen !== 'sim') return;
      // 코치마크 투어 중에도 마찬가지다 — 오버레이는 포인터만 막고 window keydown은 그대로
      // 통과해서 Delete가 선택 아이템을 지우고 1~5/h가 카메라를 옮긴다.
      if (useSimulatorTourStore.getState().active) return;
      if (e.key === 'Escape') {
        // 전체 화면에선 Esc가 유일한 탈출 경로라 가로채지 않는다. 나가기 확인 모달이 떠
        // 있을 때도 그쪽 Esc가 우선 — 뒤에서 선택이 조용히 풀리면 안 된다(모달 열림 상태는
        // EditorTopBar의 로컬 state라 스토어에서 볼 수 없어 DOM으로 확인한다).
        if (get().isFullscreen || document.querySelector('.modal-overlay')) return;
        if (!get().selectedItemId) return;
        get().selectItem(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!get().selectedItemId) return;
        e.preventDefault(); // Backspace의 브라우저 뒤로가기 기본동작 차단
        get().deleteSelected();
        return;
      }
      // Ctrl/Cmd+Z(다시 실행은 +Shift) — 브라우저 자체 되돌리기(입력창 등)와 겹치지 않게
      // 항상 preventDefault한다. Ctrl/Cmd+Y도 다시 실행의 흔한 대체 단축키라 같이 받는다
      // (2026-08-06 REQ-SIM-XX, 추가·이동·삭제 전부 이 스택 하나로 되돌린다).
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) get().redoMove();
        else get().undoLastMove();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        get().redoMove();
        return;
      }
      // Ctrl/Cmd+C·+X·+V — 시스템 클립보드가 아니라 스토어 안의 clipboard 하나만
      // 기억한다(복제와 같은 정확도). 선택 없이 C/X를 눌러도, 담은 적 없이 V를 눌러도 no-op.
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        get().copySelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        get().cutSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        get().pasteClipboard();
        return;
      }
      // R = 45° 회전 (REQ-SIM-18). 드래그 중인 고스트·아이템이 우선이라 선택이 없어도 받는다.
      if (e.key.toLowerCase() === 'r') {
        get().rotateSelectedByStep();
        return;
      }
      const n = keyMap[e.key.toLowerCase()];
      if (n) get().setCameraPreset(n);
    });

    set({
      renderer,
      sim,
      placement,
      postfx,
      camera,
      controls,
      deskTextures,
      ready: true,
      backend: backendName(renderer),
      refreshOutline,
      refreshWarning,
    });

    // 룩 테이블을 튜닝 값의 단일 정본으로 만든다 — postfx 핸들이 set()으로 저장된 뒤에
    // 불러야 한다(저장 전이면 get().postfx가 null이라 조용히 무시된다).
    get().setLookVariant(DEFAULT_LOOK_ID);

    installSimTestHooks();
  },

  resetForMount() {
    populated = false;
    set({
      // 세션 스코프 상태는 목록을 손으로 두 번 쓰지 않는다 — 초기값과 같은 팩토리를 쓴다
      // (경고 배너가 이전 데스크에서 새 데스크로 넘어온 결함의 뿌리, DERO-452).
      ...sessionScopedInitial(),
      ready: false,
      screen: 'select',
      // 새 postfx는 항상 컨투어 OFF로 태어난다 — 여기서 안 되돌리면 이전 세션의 ON이
      // 남아 버튼은 ON인데 엔진은 OFF인 상태로 갈린다.
      contourOn: false,
      projectTitle: DEFAULT_PROJECT_TITLE,
      budgetKrw: null,
      placementId: null,
      localCraftId: null,
      version: 0,
      changeVersion: 0,
      savedChangeVersion: -1,
      sim: null,
      renderer: null,
      placement: null,
      postfx: null,
      camera: null,
      controls: null,
      refreshOutline: null,
      refreshWarning: null,
    });
  },

  enterSim(deskId) {
    const { sim } = get();
    if (!sim) return;
    if (deskId) {
      sim.chooseDesk(deskId); // 내부에서 clearPlaced() — 지운 아이템의 핸들이 남으면 안 된다
      get().clearSelectionState();
    }
    populateHeroOnce(sim);
    set((s) => {
      const changeVersion = s.changeVersion + 1;
      return {
        screen: 'sim',
        wallState: sim.wallState(),
        wallDistanceMm: {
          left: mToMm(sim.wallDistance().left),
          right: mToMm(sim.wallDistance().right),
        },
        frontWallGapMm: mToMm(sim.frontWallGap()),
        roomConfig: sim.roomConfig(),
        roomLightOn: sim.roomLightOn(),
        placedVersion: s.placedVersion + 1,
        // 데모 배치는 사용자가 만든 변경이 아니라 초기 구성이다 — loadPlacement처럼
        // 진입 완료 시점을 "저장된 상태"로 삼아야 hasUnsavedChanges가 입장 직후부터
        // true로 오판되지 않는다(2026-08-06, EditorTopBar 나가기 확인창 버그).
        changeVersion,
        savedChangeVersion: changeVersion,
      };
    });
  },

  setDeskConfig(config) {
    // 직접 입력 책상은 빈 씬으로 진입한다(populateHeroOnce 호출 안 함) — 좌표가
    // 1200×600 상판 기준 하드코딩이라 최소 규격에서는 소품이 상판 밖으로 나간다.
    const { sim } = get();
    if (!sim) return;
    sim.setDesk(config); // 내부에서 clearPlaced() — 지운 아이템의 핸들이 남으면 안 된다
    get().clearSelectionState();
    set((s) => {
      const changeVersion = s.changeVersion + 1;
      return {
        screen: 'sim',
        wallState: sim.wallState(),
        wallDistanceMm: {
          left: mToMm(sim.wallDistance().left),
          right: mToMm(sim.wallDistance().right),
        },
        frontWallGapMm: mToMm(sim.frontWallGap()),
        roomConfig: sim.roomConfig(),
        roomLightOn: sim.roomLightOn(),
        placedVersion: s.placedVersion + 1,
        // enterSim과 같은 이유: 책상 설정 자체는 진입 구성이지 사용자의 "저장 안 한 변경"이 아니다.
        changeVersion,
        savedChangeVersion: changeVersion,
      };
    });
  },

  setProjectTitle(title) {
    const trimmed = title.trim();
    if (!trimmed || trimmed === get().projectTitle) return;
    set((s) => ({ projectTitle: trimmed, changeVersion: s.changeVersion + 1 }));
  },

  setBudgetKrw(budgetKrw) {
    if (budgetKrw === get().budgetKrw) return;
    set((s) => ({ budgetKrw, changeVersion: s.changeVersion + 1 }));
  },

  setPlacementId(id) {
    set({ placementId: id });
  },

  async loadPlacement(id) {
    const { sim } = get();
    if (!sim) return;

    let detail;
    try {
      detail = await getPlacement(id);
    } catch (error) {
      console.error('[simulatorStore] 배치를 불러오지 못했습니다', error);
      // 책상 선택 팝업(DeskSelectScreen)이 없어져 더 이상 수동 복구 화면으로 안 빠진다 —
      // 기본 책상으로라도 진입시켜 빈 화면에 멈추지 않게 한다.
      get().enterSim();
      return;
    }

    // setDeskConfig/enterSim은 populateHeroOnce로 데모 아이템을 채운다 — 여긴 항상 실제
    // 서버 아이템만 채워야 하므로 sim.setDesk를 직접 부른다(내부에서 clearPlaced()).
    sim.setDesk(deskConfigFromDetail(detail.desk, get().deskTextures));
    get().clearSelectionState();

    // 벽 표시 여부의 정본은 `walls[].isOn`이다(ADR-0030). 마감·바닥·시간대도 같은 규칙 —
    // 빠지면 기본 마감이지 에러가 아니다(계열 코드를 지웠다고 옛 배치가 안 열리면 안 된다,
    // 결정 3).
    const wallOn = wallOnFromWire(detail.walls);
    for (const side of WALL_SIDES_ALL) sim.setWall(side, wallOn[side]);
    // 거리는 setDesk 뒤에 건다 — setDesk가 새 책상 반폭으로 벽을 재클램프하므로 먼저 걸면 덮인다.
    // 엔진이 적용 시점에 클램프하니 좁은 저장값도 안전하다(WAS는 상한만 본다).
    const wallDistance = wallDistanceFromWire(detail.walls);
    sim.setWallDistance('left', mmToM(wallDistance.left));
    sim.setWallDistance('right', mmToM(wallDistance.right));
    sim.setFrontWallGap(mmToM(wallDistance.front));
    sim.setRoomLight(detail.isRoomLightOn);
    sim.applyRoom(roomConfigFromWire(detail.walls, detail.floor, detail.timeOfDay));

    set({
      screen: 'sim',
      wallState: sim.wallState(),
      wallDistanceMm: {
        left: mToMm(sim.wallDistance().left),
        right: mToMm(sim.wallDistance().right),
      },
      frontWallGapMm: mToMm(sim.frontWallGap()),
      roomConfig: sim.roomConfig(),
      roomLightOn: sim.roomLightOn(),
      projectTitle: detail.title || DEFAULT_PROJECT_TITLE,
      budgetKrw: detail.budgetKrw,
      placementId: detail.id,
      version: detail.version,
      // screen을 'sim'으로 바꾸는 바로 이 시점에 savedChangeVersion도 같이 맞춘다 —
      // EditorTopBar(나가기 확인 가드)는 screen==='sim'이 되는 순간 마운트되는데, 이 최초
      // 마운트 시점의 changeVersion과 여기서 맞추지 않으면 아래 아이템 배치 루프(GLB 로딩
      // 등으로 몇 프레임~몇 초 걸릴 수 있다)가 끝날 때까지 "저장 안 한 변경사항 있음"으로
      // 잘못 보이는 창이 생긴다 — 그 창 안에 useHistoryBackGuard가 이미 활성화돼 sentinel을
      // 심어 버려서, 잠시 후 changeVersion을 다시 맞추는 순간(가드가 꺼지며) 그 sentinel을
      // 스스로 소비해 원치 않는 뒤로가기가 발생한다(2026-08-06, 마법사로 막 만든 배치에
      // 처음 들어가자마자 나가기 확인창이 뜨는 버그의 진짜 원인 — enterSim/setDeskConfig는
      // 동기 함수라 이 창이 없어서 그때 고친 수정으로는 이 경로가 안 잡혔다). 아래 루프가
      // 끝난 뒤의 최종 동기화는 안전망으로 그대로 둔다.
      savedChangeVersion: get().changeVersion,
    });

    // 결합 대상(암)을 먼저 배치해야 2차 패스에서 tryMountMonitor가 대상을 찾을 수 있다.
    const ordered = [...detail.items].sort(
      (a, b) => (a.mountedToItemId ? 1 : 0) - (b.mountedToItemId ? 1 : 0),
    );
    const engineIdByBackendId = new Map<number, string>();

    // real 모드는 spec.id가 이미 String(product.id)라 매핑표가 불필요하다 — mock 모드만
    // PRODUCT_ID_TO_SPEC_ID(수동 24개 표)를 거친다 (DERO-325).
    const specIdOf = (productId: number): string | undefined =>
      isMockApi() ? PRODUCT_ID_TO_SPEC_ID[productId] : String(productId);
    // getProduct는 카탈로그(mock PRODUCTS 또는 real 캐시)만 본다 — 시뮬레이터의 유일한 소스다.

    // ── 배치 전 사전 확보 ────────────────────────────────────────────────────────
    // 아래 배치 루프는 **동기여야 한다**: placeAt -> restorePose -> articulate -> setEmitterColor
    // 순서가 곧 계약이고, 2차 패스의 tryMountMonitor도 1차 패스가 끝난 상태를 전제한다. 그래서
    // 부팅이 미뤄 둔 것(제품 조회 · GLB 템플릿 · 메쉬 실측)을 여기서 한 번에 끝낸다.
    const neededSpecIds = [
      ...new Set(ordered.map((i) => specIdOf(i.productId)).filter((id): id is string => !!id)),
    ];
    if (!isMockApi()) {
      // 책상도 같이 받는다 — 견적서가 책상 가격을 읽는 유일한 경로가
      // getProduct(deskConfig.productId)라(EstimatePanel) 아이템만 프리페치하면 책상 줄이
      // 조용히 빠진다. 책상은 절차 생성이라 GLB·ensureTemplate은 필요 없고 spec(이름·정가·
      // 이미지)만 있으면 되므로 배치 루프용 neededSpecIds에는 넣지 않는다.
      const deskSpecId =
        detail.desk.specSource === 'PRODUCT' && detail.desk.productId != null
          ? String(detail.desk.productId)
          : null;
      const missing = [...neededSpecIds, ...(deskSpecId ? [deskSpecId] : [])]
        .filter((id) => !getProduct(id))
        .map(Number)
        .filter(Number.isFinite);
      if (missing.length > 0) {
        const dtos = await getProductsByIds(missing);
        const fetched = (
          await Promise.all(dtos.map((dto) => toProductSpec(dto, get().deskTextures)))
        ).filter((s): s is ProductSpec => s !== null);
        appendCatalog(fetched);
      }
    }
    const specById = new Map<string, ProductSpec>();
    await Promise.all(
      neededSpecIds.map(async (specId) => {
        const base = getProduct(specId);
        if (!base) return;
        try {
          specById.set(specId, await sim.ensureTemplate(base));
        } catch (error: unknown) {
          console.error(`[simulatorStore] ${specId} GLB 로드 실패`, error);
          // 규격 DB에 치수가 있는 제품은 예전처럼 파라메트릭 박스로 떨어진다. 메쉬로만 치수를
          // 알 수 있는 제품(ARM 등)은 자리표시자 상자를 놓느니 건너뛴다.
          if (!base.meshDerivedDims) specById.set(specId, base);
        }
      }),
    );

    for (const item of ordered) {
      const specId = specIdOf(item.productId);
      const spec = specId ? specById.get(specId) : undefined;
      if (!spec) {
        console.warn(
          `[simulatorStore] productId=${item.productId}에 매핑된 로컬 카탈로그가 없어 건너뜁니다`,
        );
        continue;
      }

      const x = mmToM(item.positionXMm);
      const z = mmToM(item.positionZMm);
      // y는 **모든 아이템에서** 저장값이 정본이다 — 자세를 사용자가 정하므로 로드 시
      // 재계산이 없다 (ADR-0023 결정 2·4). 벽 상태는 위에서 이미 복원했다.
      const wallSide = item.wallSide ? toEngineWallSide(item.wallSide) : null;
      const { id: engineId } = sim.placeAt(spec, x, z, {
        yawDeg: item.rotationDeg,
        backendId: item.id,
        ...(wallSide ? { wall: { side: wallSide, centerY: mmToM(item.positionYMm) } } : {}),
      });
      // placeAt 자체의 엣지스냅·벽클램프를 걷어내고 저장된 좌표를 정확히 재현한다.
      // 벽 아이템은 placeAt이 이미 벽면 기준으로 붙였으니 상판 재스냅을 태우지 않는다.
      if (!wallSide) sim.restorePose(engineId, x, z, item.rotationDeg, item.positionYMm);
      // 기울기도 저장값이다 (ADR-0023) — 뮤테이터를 재사용해 클램프 정본을 엔진에 둔다.
      if (item.pitchDeg) sim.tiltItem(engineId, item.pitchDeg);
      engineIdByBackendId.set(item.id, engineId);

      if (item.jointValues) {
        for (const [jointId, value] of Object.entries(item.jointValues)) {
          sim.articulate(engineId, jointId, value);
        }
      }
      if (item.emitterColor) {
        sim.setEmitterColor(engineId, item.emitterColor);
      }
      // 화면 사진은 서버가 아니라 이 브라우저의 IndexedDB에 있다 — 없으면 기본 화면이다.
      // 배치 루프를 막지 않게 흘려보낸다(장식이라 한 박자 늦게 떠도 된다).
      void (async () => {
        const blob = await getScreenPhoto(screenPhotoKey(detail.id, item.id));
        if (!blob) return;
        const tex = new THREE.Texture(await createImageBitmap(blob));
        sim.setScreenPhoto(engineId, tex);
        if (get().selectedItemId === engineId) {
          set({ screenPanel: { itemId: engineId, hasPhoto: true } });
        }
      })();
    }

    for (const item of ordered) {
      if (!item.isVesaMounted || item.mountedToItemId == null) continue;
      const monitorEngineId = engineIdByBackendId.get(item.id);
      const armEngineId = engineIdByBackendId.get(item.mountedToItemId);
      if (monitorEngineId && armEngineId) sim.tryMountMonitor(monitorEngineId, armEngineId);
    }

    set((s) => ({
      placedVersion: s.placedVersion + 1,
      savedChangeVersion: s.changeVersion,
    }));

    // 썸네일이 한 번도 안 찍힌 배치는 열리는 순간 스스로 한 장 찍어 올린다(2026-08-06) —
    // 컬렉션 "가져오기" 사본과 마법사가 막 만든 배치가 여기에 해당하고, 과거에 업로드가
    // 실패했던 배치도 다음 열람에서 회복된다. 게이트는 **상세 응답의 thumbnailUrl === null**
    // 하나다: 목록 응답과 달리 상세는 key가 비면 null을 줘서(craft/CLAUDE.md) "진짜 없음"을
    // 구분할 수 있는 유일한 신호다. 이미 있는 배치는 건드리지 않는다 — 아무 것도 안 바꾼
    // 열람마다 다시 찍으면 S3 덮어쓰기만 쌓인다. 진입 쿼리 파라미터로 판별하던 종전 방식
    // (SimulatorCanvas의 1회 자동 캡처 effect, customDesk+placementId 게이트)은 이 게이트로
    // 대체돼 삭제됐다 — 파라미터는 "누가 보냈나"만 알지 "썸네일이 있나"를 모른다.
    // 이 시점엔 위 사전 확보 패스가 GLB 템플릿까지 끝냈고 captureFullCanvas가 3프레임을
    // 더 기다리므로 아이템이 씬에 실려 있다.
    if (detail.thumbnailUrl === null) {
      void uploadCapturedThumbnail(
        detail.id,
        get()
          .captureThumbnail()
          .catch(() => null),
      );
    }
  },

  captureThumbnail: () => captureFullCanvas(),

  reset() {
    const { sim } = get();
    if (!sim) return;
    sim.clearPlaced();
    pendingScreenPhotos.clear(); // 아이템이 통째로 사라졌으니 미정착 사진도 주인이 없다
    get().clearSelectionState();
    set((s) => ({
      warning: { on: false, msg: '' },
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  setRoomLight(on) {
    const { sim } = get();
    if (!sim) return;
    sim.setRoomLight(on);
    set((s) => ({ roomLightOn: on, changeVersion: s.changeVersion + 1 }));
  },

  setWall(side, on) {
    const { sim } = get();
    if (!sim) return;
    // 붙은 아이템이 있는 벽은 끌 수 없다 (CONTEXT.md D4, 2026-08-03 확정) — 엔진이
    // 거부하면 실제 상태가 요청과 갈린다. 조용히 넘기면 "토글이 안 먹는다"로 읽히므로
    // 사유를 띄우고 스토어 미러는 건드리지 않는다(스위치가 제자리로 돌아온다).
    if (sim.setWall(side, on) !== on) {
      const n = sim.placed().filter((i) => i.wallSide === side).length;
      get().showToast(`⚠ 이 벽에 배치된 아이템 ${n}개를 먼저 옮기세요`);
      return;
    }
    set((s) => ({
      wallState: { ...s.wallState, [side]: on },
      changeVersion: s.changeVersion + 1,
    }));
    // 벽을 다시 켜면 밖에 있던 아이템이 경계 위반이 된다 — 경고를 즉시 갱신한다.
    get().refreshWarning?.();
  },

  setWallDistance(side, distanceMm) {
    const { sim } = get();
    if (!sim) return;
    const appliedM = sim.setWallDistance(side, mmToM(distanceMm));
    // 저장 대상이라 changeVersion을 올린다 — 안 올리면 벽 거리만 바꾸고 나갈 때 미저장 경고가
    // 안 뜬다(EditorTopBar가 changeVersion !== savedChangeVersion만 본다).
    set((s) => ({
      wallDistanceMm: { ...s.wallDistanceMm, [side]: mToMm(appliedM) },
      changeVersion: s.changeVersion + 1,
    }));
    // 거리를 좁히면 그 밖에 있던 아이템이 경계 위반이 된다 — 경고를 즉시 갱신한다.
    get().refreshWarning?.();
  },

  setFrontWallGap(gapMm) {
    const { sim } = get();
    if (!sim) return;
    const appliedM = sim.setFrontWallGap(mmToM(gapMm));
    // changeVersion을 올리는 사유는 setWallDistance와 같다.
    set((s) => ({ frontWallGapMm: mToMm(appliedM), changeVersion: s.changeVersion + 1 }));
    // 간격을 좁히면 그 밖에 있던 아이템이 경계 위반이 된다 — 좌/우와 같은 순서.
    get().refreshWarning?.();
  },

  // 마감을 바꾸는 길은 셋이지만 씬에 쓰는 곳은 applyRoomConfig 하나다 — 편집 잠금 게이트 ②도
  // 거기 하나뿐이라야 한다(UI의 disabled만 걸면 절반만 잠긴다, simulator/CLAUDE.md).
  setWallFinish(side, finish) {
    // 한 면만 갈아 끼운다 — 나머지 두 면이 그대로여야 조합을 만들 수 있다.
    // 그 면의 창문은 직교 축이라 마감 교체가 덮어쓰면 안 된다(스프레드로 보존).
    const { roomConfig } = get();
    get().applyRoomConfig({
      ...roomConfig,
      walls: { ...roomConfig.walls, [side]: { ...roomConfig.walls[side], ...finish } },
    });
  },

  setFloorFinish(finish) {
    const { roomConfig } = get();
    get().applyRoomConfig({ ...roomConfig, floor: finish });
  },

  setTimeOfDay(next) {
    const { roomConfig } = get();
    // 이미 그 시간대면 아무것도 안 한다 — 안 그러면 활성 탭을 다시 눌렀을 때 사용자가
    // 따로 켜(꺼) 둔 방 조명이 기본값으로 되돌아간다.
    if (next === roomConfig.timeOfDay) return;
    get().applyRoomConfig({ ...roomConfig, timeOfDay: next });
    // 시간대 → 방 조명은 **기본값 연동**이다(ADR-0030 결정 4). 잠겨 있으면 위 창구가
    // 아무것도 안 쓰므로 미러도 안 바뀐다 — 그때는 조명도 따라가면 안 된다.
    if (get().roomConfig.timeOfDay === next) get().setRoomLight(next === 'DAY');
  },

  applyRoomPreset(key) {
    // 프리셋은 값을 써넣기만 한다 — 저장되는 정본은 벽면 값 하나뿐이라, 누른 뒤 한 면만
    // 고쳐도 프리셋이 그 수정을 되돌리지 않는다(ADR-0030 결정 1). 시간대·창문은 별도
    // 축이라 프리셋이 덮지 않는다(프리셋 표는 마감만 정의한다 — 창문 있는 프리셋이
    // 생기면 그때 프리셋이 창문도 쓰게 넓힌다).
    const { roomConfig } = get();
    const preset = roomConfigForPreset(key);
    const walls = { ...preset.walls };
    for (const side of WALL_SIDES_ALL) {
      const { window } = roomConfig.walls[side];
      if (window) walls[side] = { ...preset.walls[side], window };
    }
    get().applyRoomConfig({ ...preset, walls, timeOfDay: roomConfig.timeOfDay });
  },

  setWallWindow(side, window) {
    const { roomConfig } = get();
    const wall = { ...roomConfig.walls[side], window: window ?? undefined };
    get().applyRoomConfig({ ...roomConfig, walls: { ...roomConfig.walls, [side]: wall } });
  },

  applyRoomConfig(config) {
    const { sim, editLocked } = get();
    if (!sim || editLocked) return;
    sim.applyRoom(config);
    set((s) => ({ roomConfig: sim.roomConfig(), changeVersion: s.changeVersion + 1 }));
    // 마감이 바뀌면 부조 두께가 바뀌어 벽 아이템이 재스냅된다(엔진 applyRoom) — 그 결과가
    // 경계 위반일 수 있다.
    get().refreshWarning?.();
  },

  setContourLines(on) {
    const { postfx } = get();
    if (!postfx) return;
    postfx.setContour(on);
    set({ contourOn: on });
  },

  setCollisionIgnore(on) {
    const { sim } = get();
    sim?.setCollisionIgnored(on);
    // 플래그를 먼저 심어야 refreshWarning이 새 값을 읽는다 (setWall과 같은 순서).
    set({ collisionIgnored: on });
    get().refreshWarning?.();
  },

  toggleFullscreen() {
    // isFullscreen 자체는 안 건드린다 — fullscreenchange 리스너(initEngine)가 실제
    // 전환 결과로 갱신하는 게 정본이다. 여기서 낙관적으로 뒤집으면 요청이 거부됐을 때
    // (권한 정책 등) 실제 상태와 어긋난다.
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  },

  toggleEditLock() {
    const { placement, editLocked } = get();
    const next = !editLocked;
    placement?.setEditLocked(next);
    set({ editLocked: next });
  },

  zoomIn() {
    // dollyScale은 1보다 작은 배율이어야 방향이 맞는다 — OrbitControls 내부가
    // radius *= scale로 적용해서(this.object.isPerspectiveCamera 분기), 1.2처럼
    // 1보다 큰 값을 dollyIn에 주면 radius가 오히려 늘어 확대/축소가 반대로 동작한다.
    get().controls?.dollyIn(1 / 1.2);
  },

  zoomOut() {
    get().controls?.dollyOut(1 / 1.2);
  },

  setLookVariant(id) {
    const { postfx } = get();
    const v = findLookVariant(id);
    if (!postfx || !v) return false;
    postfx.setBloom(v.bloom.strength, v.bloom.radius);
    postfx.setGlare(v.glare.strength, v.glare.threshold);
    set({ lookVariantId: v.id });
    return true;
  },

  setCameraPreset(name) {
    const { camera, controls } = get();
    if (!camera || !controls) return;
    tweenToPreset(camera, controls, name);
    set({ activePreset: name });
  },

  placeProduct(id) {
    const { placement } = get();
    if (!placement) return null;
    const res = placement.placeProduct(id);
    set((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
    return res;
  },

  articulate(placedId, jointId, angleDeg) {
    const { sim, editLocked } = get();
    if (!sim || editLocked) return null;
    const applied = sim.articulate(placedId, jointId, angleDeg);
    // gizmo 메쉬 키가 관절 id라 다른 인스턴스끼리 겹친다 — 지금 선택된 아이템일
    // 때만 sync한다(코드리뷰 지적: 아니면 A 선택 중 B를 조작하면 A의 링이 B로
    // 순간이동한다). 슬라이더 패널도 같은 가드로 갱신 — gizmo 드래그 경로
    // (onJointChange)와 같은 갱신을 타야 ADR 결정 5(양방향 반영)가 산다.
    const isSelected = applied !== null && placedId === get().selectedItemId;
    if (isSelected) sim.jointGizmo.sync(sim.jointHandles(placedId));
    get().refreshWarning?.();
    set((s) => ({
      jointPanel: isSelected
        ? { itemId: placedId, title: s.selectedItemName ?? '', joints: sim.jointStates(placedId) }
        : s.jointPanel,
      placedVersion: s.placedVersion + 1,
      changeVersion: applied === null ? s.changeVersion : s.changeVersion + 1,
    }));
    return applied;
  },

  trySave() {
    const {
      sim,
      placementId,
      projectTitle,
      budgetKrw,
      wallState,
      wallDistanceMm,
      frontWallGapMm,
      roomLightOn,
      roomConfig,
      version,
      localCraftId,
      collisionIgnored,
      changeVersion,
    } = get();
    if (!sim) return { ok: false, reason: 'no-engine' };
    // 충돌 무시 토글이 켜져 있으면 겹침만 통과시킨다 — 경계 위반(상판 밖·벽 관통)은
    // 무시 대상이 아니라 계속 저장을 막는다.
    if ((sim.anyCollision() && !collisionIgnored) || sim.anyBoundaryViolation()) {
      set({ warning: { on: true, msg: WARN_SAVE_BLOCKED } });
      return { ok: false, reason: 'violation' };
    }

    const desk = deskSnapshotFromConfig(sim.deskConfig());
    const items: ItemSnapshot[] = [];
    for (const item of sim.placed()) {
      // real 모드는 spec.id가 이미 String(product.id)라 매핑표가 불필요하다 — mock 모드만
      // SPEC_ID_TO_PRODUCT_ID를 거친다 (DERO-325). id가 숫자가 아닌 spec은 Number()가
      // NaN을 내므로 isFinite로 같이 걸러 건너뛴다 — mock 모드는 기존과 동일하게 표에 없으면 null이다.
      const productId = isMockApi() ? SPEC_ID_TO_PRODUCT_ID[item.spec.id] : Number(item.spec.id);
      if (productId == null || !Number.isFinite(productId)) {
        console.warn(
          `[simulatorStore] spec.id=${item.spec.id}에 매핑된 backend productId가 없어 저장에서 건너뜁니다`,
        );
        continue;
      }
      const joints = sim.jointStates(item.id);
      const jointValues = joints.length
        ? Object.fromEntries(joints.map((j) => [j.id, j.value]))
        : null;
      const emitter = sim.emitterInfo(item.id);
      items.push({
        ref: item.id,
        id: item.backendId ?? null,
        productId,
        positionXMm: mToMm(item.center.x),
        positionYMm: mToMm(item.center.y),
        positionZMm: mToMm(item.center.z),
        rotationDeg: item.yawDeg,
        // 앞뒤 기울기 — 사용자가 정한 자세라 저장한다 (ADR-0023 결정 2).
        pitchDeg: item.pitchDeg,
        // 규격 DB의 배치면(`prop.mount_surface`)을 그대로 싣는다. 값이 없는 규격
        // (PROP이 아닌 서브타입·목업 카탈로그)은 상판이다.
        surfaceType: item.spec.mountSurface ?? 'TOP',
        // 벽에 붙어 있으면 어느 벽인지 (2026-08-03 DERO-375). 상판·바닥 아이템은
        // null이다. 엔진은 소문자, 저장은 대문자라 변환이 필수다(utils/wallSide.ts).
        wallSide: item.wallSide ? toApiWallSide(item.wallSide) : null,
        // isVesaMounted를 안 싣는다 — 결합 여부는 mountedToRef의 유무가 답한다(ADR-0009 결정 3).
        mountedToRef: item.mountedToId ?? null,
        jointValues,
        emitterColor: emitter?.recolorable ? emitter.color : null,
      });
    }

    const snapshot: PlacementSnapshot = {
      title: projectTitle,
      description: null,
      version,
      isRoomLightOn: roomLightOn,
      // 방 표면의 정본은 walls[]·floor·timeOfDay다(ADR-0030) — 벽 표시 여부도 walls[].isOn이다.
      // 세 면을 전부 실어야 한다: 일부만 보내면 서버가 400이다.
      walls: wallSnapshotsFromRoom(roomConfig, wallState, {
        left: wallDistanceMm.left,
        // 전면만 기준이 다르다(책상 뒷변 간격) — 저장 자리는 같은 컬럼이다(erd.md placement_wall).
        front: frontWallGapMm,
        right: wallDistanceMm.right,
      }),
      floor: { material: roomConfig.floor.material, variant: roomConfig.floor.variant },
      timeOfDay: roomConfig.timeOfDay,
      budgetKrw,
      desk,
      items,
    };

    // /craft 목록(craftProjectsStore)에 낙관적으로 반영 — 아래 showToast와 같은 시점, 서버 응답을
    // 기다리지 않는다(2026-07-31 사용자 확인 — 시뮬레이터에서 저장하면 /craft에 바로 보여야 함).
    // id는 이미 저장된 배치면 서버 id(placementId) 그대로, 신규 배치면 세션 동안 고정되는 로컬 id
    // (localCraftId, 없으면 여기서 생성해 store에 박아둔다) — 같은 세션에서 여러 번 저장해도
    // /craft에 카드가 중복되지 않는다. 서버가 실제 id를 내려주면(.then 콜백) 그 id로 교체한다.
    const craftId =
      placementId != null ? String(placementId) : (localCraftId ?? crypto.randomUUID());
    if (placementId == null && localCraftId == null) {
      set({ localCraftId: craftId });
    }
    const existingThumbnail =
      useCraftProjectsStore.getState().projects.find((p) => p.id === craftId)?.thumbnailUrl ?? null;
    const localProject: DeskProject = {
      id: craftId,
      name: projectTitle,
      thumbnailUrl: existingThumbnail,
      updatedAt: new Date().toISOString(),
      budgetKrw: budgetKrw ?? 0,
      // 저장은 게시 상태를 바꾸지 않는다(스냅샷에 publishStatus가 없다 — ADR-0015 결정 10). 이미
      // 공개된 배치를 여기서 덮어쓰지 않도록, /craft 병합(CraftDeskCollection)이 서버 값이 있으면
      // 그쪽을 남긴다.
      publishStatus: 'PRIVATE',
    };
    useCraftProjectsStore.getState().upsertProject(localProject);
    // 썸네일은 캔버스 캡처가 몇 프레임 걸려 별도로 비동기 반영한다(captureFullCanvas와 같은
    // fire-and-forget 패턴). **캡처는 저장 1회당 한 번만 한다** — 아래 서버 업로드가 같은 blob을
    // 재사용한다. 두 번 찍으면 렌더러 크기를 두 번 흔들고 두 이미지가 미묘하게 갈린다.
    const captured = get()
      .captureThumbnail()
      .catch(() => null);
    captured
      .then((blob) => {
        if (!blob) return;
        // object URL이라 새로고침엔 무효하지만 이 세션 안 /craft 카드에는 충분하다.
        useCraftProjectsStore.getState().upsertProject({
          ...localProject,
          id: get().placementId != null ? String(get().placementId) : craftId,
          thumbnailUrl: URL.createObjectURL(blob),
        });
      })
      .catch(() => {
        // 썸네일은 부가 기능 — 캡처 실패해도 저장 자체는 이미 끝난 상태라 별도 에러 처리 안 함
      });

    // 전체 스냅샷 PUT/POST는 네트워크 왕복이 필요하지만 trySave 자체는 기존처럼 동기
    // 반환값({ ok, reason })을 유지한다 — e2e가 이 즉시 반환값으로 저장 게이트를 검증한다
    // (collision-overhaul/desk-config/wall-boundary.spec.ts). 실제 영속 결과는 비동기로
    // 토스트에 반영한다(썸네일 업로드와 같은 fire-and-forget 패턴, SimulatorCanvas.tsx).
    const request = placementId
      ? updatePlacement(placementId, snapshot)
      : createPlacementApi(snapshot);
    request
      .then((response) => {
        set({
          version: response.version,
          lastSavedAt: Date.now(),
          savedChangeVersion: changeVersion,
        });
        trackEvent('craft_saved', { mode: placementId ? 'update' : 'create' });
        if (!placementId) {
          get().setPlacementId(response.id);
          useCraftProjectsStore.getState().replaceProjectId(craftId, {
            ...localProject,
            id: String(response.id),
          });
        }
        for (const mapping of response.items) {
          sim.setBackendId(mapping.ref, mapping.id);
        }
        // 화면 사진 정착 — 저장 전까지는 배치 아이템 id가 없어 키를 만들 수 없으므로
        // 대기표에 있던 것을 여기서 IndexedDB로 옮기고, 이 배치에 더 이상 없는 아이템의
        // 사진(삭제된 모니터)은 같이 회수한다. 사진은 서버로 나가지 않는다.
        void flushScreenPhotos(sim, response.id, response.items);
        // 서버 썸네일도 저장마다 다시 올린다(DERO-362). 예전엔 마법사가 배치를 막 만든
        // 직후(SimulatorCanvas의 1회 자동 캡처)와 수동 카메라 버튼에만 업로드가 걸려 있어서,
        // 아이템을 올리고 다시 저장해도 S3의 그림은 "빈 책상" 그대로 굳었다 — 피커·카드·컬렉션
        // 표지가 전부 그 이미지를 쓴다. key는 배치마다 결정론적이라 덮어쓰기만 하면 된다.
        // 신규 저장이면 id를 지금 막 받았으므로 response.id를 쓴다(placementId는 아직 null).
        void uploadCapturedThumbnail(response.id, captured);
        // 위반은 토스트로 개수만 알리고 사유는 HUD 배너에 남긴다 — 토스트는 몇 초 뒤 사라져
        // "무엇을 고쳐야 업로드가 되는지"를 읽을 시간이 없다.
        set({ saveViolations: response.violations });
        if (response.violations.length > 0) {
          get().showToast(`저장됨 — 검증 경고 ${response.violations.length}건`);
        }
      })
      .catch((error) => {
        console.error('[simulatorStore] 배치 저장에 실패했습니다', error);
        // 409 PLACEMENT_STALE — 다른 탭·기기가 먼저 저장했다. 조용히 덮으면 어느 쪽 작업이 사라졌는지
        // 모르는 상태가 되므로(ADR-0009 결정 4) 일반 실패와 다른 문구로 재로드를 안내한다.
        if (error instanceof ApiError && error.problem?.code === 'PLACEMENT_STALE') {
          get().showToast('⚠ 다른 곳에서 먼저 저장됐습니다. 새로고침 후 다시 시도해 주세요.');
          return;
        }
        get().showToast('⚠ 배치 저장에 실패했습니다');
      });

    get().showToast('배치가 저장되었습니다');
    return { ok: true };
  },

  selectItem(placedId) {
    const { sim } = get();
    if (!sim) return;
    const item = placedId ? (sim.placed().find((i) => i.id === placedId) ?? null) : null;
    // 발광 상태는 엔진이 정본 — 선택 시점에 한 번 읽어 미러한다(발광체 없으면 null).
    const emitter = item ? sim.emitterInfo(item.id) : null;
    // 램프 밝기·색온도도 같은 규약 — 램프가 아니면 null이다 (287).
    const lamp = item ? sim.lampInfo(item.id) : null;
    const screen = item ? sim.screenInfo(item.id) : null;
    set({
      selectedItemId: item?.id ?? null,
      selectedItemName: item?.spec.name ?? null,
      selectedItemSpecId: item?.spec.id ?? null,
      selectedYawDeg: item?.yawDeg ?? 0,
      selectedLiftMm: item ? baseLiftMm(item) : 0,
      selectedPitchDeg: item?.pitchDeg ?? 0,
      jointPanel: item?.joints?.size
        ? { itemId: item.id, title: item.spec.name, joints: sim.jointStates(item.id) }
        : null,
      emitterPanel: item && emitter ? { itemId: item.id, ...emitter } : null,
      lampPanel: item && lamp ? { itemId: item.id, ...lamp } : null,
      // 화면 메쉬가 없는 제품은 아예 null — 패널에서 행이 안 뜬다.
      screenPanel:
        item && screen?.supported ? { itemId: item.id, hasPhoto: screen.hasPhoto } : null,
    });
    get().placement?.setSelected(item?.id ?? null);
    if (item?.joints?.size) sim.jointGizmo.show(sim.jointHandles(item.id));
    else sim.jointGizmo.hide();
    // 회전 링 (ADR-0022 결정 7) — 회전이 사용자 소관이 아닌 아이템(벽·결합)은 handle이 null이다.
    const rh = item ? sim.rotateHandle(item.id) : null;
    if (rh) sim.rotateGizmo.show(rh);
    else sim.rotateGizmo.hide();
    get().refreshOutline?.();
    get().refreshSelectedMount();
  },

  rotateSelected(yawDeg) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    const applied = sim.rotateItem(selectedItemId, yawDeg);
    if (applied === null) return;
    // 링 기즈모는 아이템 발밑에 있어 회전 자체로는 안 움직이지만, 회전이 요람 안착을
    // 다시 풀어 밑면 높이·중심이 바뀔 수 있다 — 매 프레임 sync가 있어도 즉시 맞춰둔다.
    sim.rotateGizmo.sync(sim.rotateHandle(selectedItemId));
    get().refreshWarning?.();
    set((s) => ({
      selectedYawDeg: applied,
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  rotateSelectedByStep() {
    const { sim, placement, editLocked } = get();
    if (!sim || editLocked) return;
    // 드래그 중이면 그 대상이 우선이다 — 라이브러리에서 끌고 오는 고스트를 돌리려 눌렀는데
    // 뒤에 남아 있던 선택 아이템이 도는 일이 없어야 한다.
    const dragged = placement?.rotateDragged(ROTATE_STEP_DEG) ?? null;
    if (dragged) {
      // 고스트(id=null)는 아직 배치 아이템이 아니라 패널에 비칠 값이 없다.
      if (dragged.id && dragged.id === get().selectedItemId) {
        set((s) => ({ selectedYawDeg: dragged.yawDeg, placedVersion: s.placedVersion + 1 }));
      }
      return;
    }
    if (!get().selectedItemId) return;
    get().rotateSelected(get().selectedYawDeg + ROTATE_STEP_DEG);
  },

  liftSelected(liftMm) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    // 엔진이 [0, LIFT_MAX_MM]로 클램프하고 결합 아이템은 null로 흘린다 — 요청값을 믿지
    // 않고 적용값을 되받는다(rotateSelected와 같은 규약).
    const applied = sim.liftItem(selectedItemId, liftMm);
    if (applied === null) return;
    get().refreshWarning?.();
    set((s) => ({ selectedLiftMm: applied, placedVersion: s.placedVersion + 1 }));
  },

  tiltSelected(pitchDeg) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    const applied = sim.tiltItem(selectedItemId, pitchDeg);
    if (applied === null) return;
    get().refreshWarning?.();
    set((s) => ({ selectedPitchDeg: applied, placedVersion: s.placedVersion + 1 }));
  },

  recolorSelected(hex) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    sim.setEmitterColor(selectedItemId, hex);
    // 엔진이 no-op으로 흘릴 수 있는 입력(고정 발광·잘못된 hex)이 있어 요청값을 그대로
    // 믿지 않고 적용 결과를 되읽는다 — 미러가 정본과 갈리면 스와치가 거짓말을 한다.
    const emitter = sim.emitterInfo(selectedItemId);
    set((s) => ({
      emitterPanel: emitter ? { itemId: selectedItemId, ...emitter } : null,
      changeVersion: emitter?.recolorable ? s.changeVersion + 1 : s.changeVersion,
    }));
  },

  toggleEmitterSelected(on) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    sim.setEmitterOn(selectedItemId, on);
    // recolorSelected와 같은 규약 — 엔진이 no-op으로 흘릴 수 있으므로 되읽는다.
    const emitter = sim.emitterInfo(selectedItemId);
    set({ emitterPanel: emitter ? { itemId: selectedItemId, ...emitter } : null });
  },

  async setScreenPhotoSelected(file) {
    const { sim, selectedItemId, editLocked, placementId } = get();
    if (!sim || !selectedItemId || editLocked) return;

    let blob: Blob | null = null;
    let tex: THREE.Texture | null = null;
    if (file) {
      blob = await downscaleImage(file);
      tex = new THREE.Texture(await createImageBitmap(blob));
    }
    // 비동기 사이에 선택이 바뀌었으면 엉뚱한 모니터에 붙는다.
    if (get().selectedItemId !== selectedItemId) {
      tex?.dispose();
      return;
    }
    sim.setScreenPhoto(selectedItemId, tex);

    // 저장된 아이템이면 곧바로 IndexedDB에, 아직 저장 전이면 대기표에 — 저장 응답이
    // 배치 아이템 id를 내려줄 때 trySave가 옮긴다(그 id가 있어야 키를 만들 수 있다).
    const backendId = sim.placed().find((i) => i.id === selectedItemId)?.backendId;
    if (placementId != null && backendId != null) {
      const key = screenPhotoKey(placementId, backendId);
      void (blob ? putScreenPhoto(key, blob) : deleteScreenPhoto(key));
      pendingScreenPhotos.delete(selectedItemId);
    } else if (blob) {
      pendingScreenPhotos.set(selectedItemId, blob);
    } else {
      pendingScreenPhotos.delete(selectedItemId);
    }

    // recolorSelected와 같은 규약 — 엔진이 no-op으로 흘릴 수 있으므로 되읽는다.
    const screen = sim.screenInfo(selectedItemId);
    set({
      screenPanel: screen?.supported ? { itemId: selectedItemId, hasPhoto: screen.hasPhoto } : null,
    });
  },

  setLampBrightness(scale) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    sim.setLampBrightnessScale(selectedItemId, scale);
    // 엔진이 no-op으로 흘리거나 클램프할 수 있으므로 요청값을 믿지 않고 되읽는다
    // (recolorSelected와 같은 규약) — 미러가 정본과 갈리면 슬라이더가 거짓말을 한다.
    const lamp = sim.lampInfo(selectedItemId);
    set({ lampPanel: lamp ? { itemId: selectedItemId, ...lamp } : null });
  },

  setLampColorTemp(k) {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    sim.setLampColorTempK(selectedItemId, k);
    const lamp = sim.lampInfo(selectedItemId);
    set({ lampPanel: lamp ? { itemId: selectedItemId, ...lamp } : null });
  },

  deleteSelected() {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    // removeItem이 그룹을 dispose하므로 지우기 전에 되돌리기용 스냅샷을 떠 둔다.
    const target = sim.placed().find((i) => i.id === selectedItemId);
    if (!target) return;
    const snapshot = snapshotOf(target);
    if (!sim.removeItem(selectedItemId)) return;
    // 지운 그룹이 아웃라인 배열에 남으면 씬에서 빠진 오브젝트를 계속 그린다.
    sim.jointGizmo.hide(); // 지운 아이템의 핸들이 남으면 안 된다
    sim.rotateGizmo.hide(); // 링도 마찬가지 — 아이템 없이 링만 떠 있으면 안 된다
    set({
      selectedItemId: null,
      selectedItemName: null,
      selectedItemSpecId: null,
      selectedYawDeg: 0,
      selectedLiftMm: 0,
      selectedPitchDeg: 0,
      jointPanel: null,
      emitterPanel: null,
      lampPanel: null,
      screenPanel: null,
    });
    // 삭제도 Ctrl+Z 대상이다(2026-08-06) — 새 액션은 표준 규약대로 다시 실행 스택을 비운다.
    set((s) => ({
      moveHistory: [
        ...s.moveHistory,
        { kind: 'presence', exists: true, snapshot } as HistoryRecord,
      ].slice(-MOVE_HISTORY_CAP),
      redoHistory: [],
    }));
    get().refreshOutline?.();
    get().refreshWarning?.();
    set((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  duplicateSelected() {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    const res = sim.duplicateItem(selectedItemId);
    if (!res) return;
    // 복제도 Ctrl+Z 대상이다(2026-08-06, 라이브러리 드래그 추가와 같은 규약).
    set((s) => ({
      moveHistory: [
        ...s.moveHistory,
        { kind: 'presence', exists: false, id: res.id } as HistoryRecord,
      ].slice(-MOVE_HISTORY_CAP),
      redoHistory: [],
    }));
    // 복제 직후 선택은 복사본으로 옮긴다 — 연달아 복제하면 옆으로 늘어선다.
    // selectItem 단일 경로를 태워 setSelected·gizmo show/hide·jointPanel·아웃라인이 함께 간다
    // (수동으로 필드를 흩어 set하면 gizmo가 원본에 남는 갭이 생긴다 — 코드리뷰 지적).
    get().selectItem(res.id);
    get().refreshWarning?.();
    set((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  copySelected() {
    const { selectedItemId } = get();
    if (!selectedItemId) return;
    set({ clipboard: { kind: 'ref', itemId: selectedItemId } });
  },

  cutSelected() {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    // 삭제되면 id 참조가 성립하지 않으므로 지우기 전에 스냅샷을 떠서 담는다.
    const target = sim.placed().find((i) => i.id === selectedItemId);
    if (!target) return;
    const snapshot = snapshotOf(target);
    get().deleteSelected();
    // deleteSelected가 자체 가드로 no-op했을 수 있다 — 실제로 지워졌을 때만 클립보드를 채운다
    // (지워지지 않았는데 담으면 원본과 스냅샷이 이중으로 존재하게 된다).
    if (sim.placed().some((i) => i.id === selectedItemId)) return;
    set({ clipboard: { kind: 'snapshot', snapshot } });
  },

  pasteClipboard() {
    const { sim, clipboard, editLocked } = get();
    if (!sim || !clipboard || editLocked) return;

    let madeId: string | null = null;
    if (clipboard.kind === 'ref') {
      // 복사해 둔 아이템이 그새 지워졌을 수 있다 — 그러면 조용히 아무 일도 안 한다.
      if (!sim.placed().some((i) => i.id === clipboard.itemId)) return;
      madeId = sim.duplicateItem(clipboard.itemId)?.id ?? null;
    } else {
      // 잘라낸 아이템은 원본이 없으므로 스냅샷에서 재생성한다 — undo의 삭제 복원과 같은 경로,
      // 같은 정확도(HistorySnapshot). 여러 번 붙여넣으면 그때마다 한 개씩 다시 만들어진다.
      madeId = recreateFromSnapshot(sim, clipboard.snapshot).id;
    }
    if (!madeId) return;

    set((s) => ({
      moveHistory: [
        ...s.moveHistory,
        { kind: 'presence', exists: false, id: madeId } as HistoryRecord,
      ].slice(-MOVE_HISTORY_CAP),
      redoHistory: [],
    }));
    get().selectItem(madeId);
    get().refreshWarning?.();
    set((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  detachSelected() {
    const { sim, selectedItemId, editLocked } = get();
    if (!sim || !selectedItemId || editLocked) return;
    // detachMonitor가 'detached' 이벤트를 낸다 — 판정 기록 삭제·배너·결합 상태 갱신은
    // 그 구독자(onMountEvent)가 하므로 여기서 중복으로 만지지 않는다.
    if (!sim.detachMonitor(selectedItemId)) return;
    set((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  undoLastMove() {
    const { sim, moveHistory, editLocked } = get();
    if (!sim || moveHistory.length === 0 || editLocked) return;
    const last = moveHistory[moveHistory.length - 1];
    set((s) => ({ moveHistory: s.moveHistory.slice(0, -1) })); // pop — 성공·실패와 무관하게 소비한다
    const inverse = applyHistoryRecord(sim, last);
    if (!inverse) return;
    set((s) => ({ redoHistory: [...s.redoHistory, inverse].slice(-MOVE_HISTORY_CAP) }));
    get().afterHistoryStep(last);
  },

  redoMove() {
    const { sim, redoHistory, editLocked } = get();
    if (!sim || redoHistory.length === 0 || editLocked) return;
    const last = redoHistory[redoHistory.length - 1];
    set((s) => ({ redoHistory: s.redoHistory.slice(0, -1) })); // pop — 성공·실패와 무관하게 소비한다
    const inverse = applyHistoryRecord(sim, last);
    if (!inverse) return;
    set((s) => ({ moveHistory: [...s.moveHistory, inverse].slice(-MOVE_HISTORY_CAP) }));
    get().afterHistoryStep(last);
  },

  /** undoLastMove·redoMove 공용 뒷정리 — 적용된(반대쪽 스택으로 넘어간) 항목 하나를 받아
   *  선택 상태·gizmo·아웃라인·경고·리비전을 맞춘다. 'move'는 선택 중이던 아이템의 각도 표시만
   *  맞추면 되고, 'presence'는 방금 아이템이 사라졌을 때(exists:false — 추가 취소 또는 삭제
   *  다시 실행) 그 아이템이 선택돼 있었으면 deleteSelected와 같은 정리가 필요하다. */
  afterHistoryStep(applied) {
    const { sim, selectedItemId } = get();
    if (applied.kind === 'move') {
      if (selectedItemId === applied.id) set({ selectedYawDeg: applied.pose.yawDeg });
    } else if (!applied.exists && selectedItemId === applied.id) {
      sim?.jointGizmo.hide();
      sim?.rotateGizmo.hide();
      set({
        selectedItemId: null,
        selectedItemName: null,
        selectedItemSpecId: null,
        selectedYawDeg: 0,
        selectedLiftMm: 0,
        selectedPitchDeg: 0,
        jointPanel: null,
        emitterPanel: null,
        lampPanel: null,
        screenPanel: null,
      });
    }
    get().refreshWarning?.();
    get().refreshOutline?.();
    set((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  },

  /**
   * 결합 시도를 서버 정본 판정으로 확정한다(ADR-0004). 미러(`collision.ts`)는 이미 0ms에 배너를
   * 띄웠고, 이 응답이 오면 **서버 값으로 덮는다** — 두 판정이 갈리는 지점이 곧 드리프트 감지점이다
   * (ADR-0009 결정 6).
   *
   * 안 부르는 경우 셋: ① mock 모드(목업 spec id는 백엔드 `product.id`가 아니라 서버가 못 푼다)
   * ② 분리 이벤트(알릴 것이 없다) ③ 제품 id를 못 푸는 아이템(GLB 라이브러리 등).
   *
   * **응답이 늦게 와도 지금 화면을 덮지 않는다** — 그 사이 다음 결합이 일어났으면
   * `lastMountEvent`가 이미 바뀌어 있고, 옛 응답으로 새 배너를 갈아치우면 사용자는 방금 한 조작과
   * 무관한 사유를 읽게 된다.
   */
  async confirmMountWithServer(event) {
    const { sim } = get();
    if (!sim || isMockApi()) return;

    const request = judgmentRequestFor(event, deskRequestFrom(sim.deskConfig()), (itemId) => {
      const spec = sim.placed().find((item) => item.id === itemId)?.spec;
      if (!spec) return null;
      const productId = Number(spec.id);
      return Number.isFinite(productId) ? productId : null;
    });
    if (!request) return;

    let rows;
    try {
      rows = (await judgeCompatibility(request)).judgments;
    } catch (error) {
      // 서버 판정이 실패해도 미러 배너는 이미 떠 있다 — 화면을 비우지 말고 그대로 둔다.
      // 저장 시점 재판정이 정본 게이트라 여기서 못 받은 것이 최종 판정을 바꾸지는 않는다.
      console.warn('[simulatorStore] 서버 호환성 판정을 받지 못했습니다', error);
      return;
    }
    if (get().lastMountEvent !== event) return;

    const row = pickMountRow(rows, event);
    // 행이 없으면 "서버가 그 판정을 수행하지 않았다"다(클램프 대상이 아닌 암) — 불가가 아니므로
    // 배너를 지운다. 불가로 읽어 배너를 남기면 판정 대상이 아닌 암이 계속 거절당한 것처럼 보인다.
    get().showMountNotice(row ? serverMountNoticeFor(row) : null);
    if (row) trackEvent('compatibility_checked', { result: row.result });

    // 조건부 배지는 **실제로 결합된** 모니터에만 붙는다 — 거절된 결합은 씬을 한 글자도 안 바꿔서
    // 붙일 대상이 없다(미러 쪽 배선과 같은 규약).
    if (event.kind === 'mounted' && row) {
      const monitorId = event.monitorId;
      set((s) => ({
        mountJudgments: {
          ...s.mountJudgments,
          [monitorId]: { result: row.result, reasons: row.reasons },
        },
      }));
    }
  },

  showMountNotice(notice) {
    set({ mountNotice: notice });
    if (!notice) return;
    // 객체 동일성 비교 — 그 사이 다음 이벤트가 배너를 갈아치웠으면 지우지 않는다.
    window.setTimeout(() => {
      if (get().mountNotice === notice) set({ mountNotice: null });
    }, MOUNT_NOTICE_MS);
  },

  toggleEstimateExclusion(specId) {
    set((s) => ({
      excludedEstimateProductIds: {
        ...s.excludedEstimateProductIds,
        [specId]: !s.excludedEstimateProductIds[specId],
      },
    }));
  },

  refreshSelectedMount() {
    const { sim, selectedItemId } = get();
    const item = sim && selectedItemId ? sim.placed().find((i) => i.id === selectedItemId) : null;
    const arm = item?.mountedToId
      ? sim!.placed().find((i) => i.id === item.mountedToId)
      : undefined;
    set({ selectedMountArmName: arm?.spec.name ?? null });
  },

  clearSelectionState() {
    const { sim } = get();
    if (!sim) return;
    sim.jointGizmo.hide();
    sim.rotateGizmo.hide();
    get().placement?.setSelected(null);
    set({
      selectedItemId: null,
      selectedItemName: null,
      selectedItemSpecId: null,
      selectedYawDeg: 0,
      selectedLiftMm: 0,
      selectedPitchDeg: 0,
      jointPanel: null,
      emitterPanel: null,
      lampPanel: null,
      screenPanel: null,
    });
    // clearPlaced() 계열 뒤에 온다 — 사라진 아이템의 결합 판정이 남으면 안 된다.
    set({ mountJudgments: {}, selectedMountArmName: null, mountNotice: null });
    get().refreshOutline?.();
  },

  showToast(msg) {
    set({ toast: msg });
    window.setTimeout(() => {
      if (get().toast === msg) set({ toast: null });
    }, 2000);
  },
}));

/** enterSim(deskId) 첫 진입 시 데모 배치 — 기존 main.ts populateHero()와 동일 좌표.
 *  모듈 전역 플래그로 평생 1회만 실행(데스크 재선택마다 다시 채우지 않음). */
let populated = false;
function populateHeroOnce(sim: ReturnType<typeof createSimScene>): void {
  if (populated) return;
  populated = true;
  const place = (id: string, x: number, z: number): void => {
    const s = getProduct(id);
    if (s) sim.placeAt(s, x, z);
  };
  place('monitor-27', 0, -0.12);
  place('keyboard-tkl', 0, 0.15);
  place('mug-ceramic', 0.34, 0.11);
  place('plant-pot', -0.42, -0.05);
  place('lamp-warm', 0.46, -0.13);
  place('bottle-steel', -0.26, 0.04);
}

/** drawImage readback of the live canvas -> avg RGB of a rectangular region.
 *  main.ts의 sampleRegion 로직을 이식하되, 수동 postfx.render() 호출은 뺐다 — R3F의
 *  RenderLoop(useFrame priority=1)가 이미 매 프레임 postfx.render()를 돌리고 있어
 *  같은 프레임에 중복 호출하면 SwiftShader에서 렌더 루프가 사실상 멈추는 문제를 겪었다
 *  (outline 활성 상태에서 재현, R3F 전환 중 발견). rAF만 기다려 최신 프레임을 읽는다. */
async function sampleRegion(
  fx0: number,
  fy0: number,
  fx1: number,
  fy1: number,
): Promise<{ r: number; g: number; b: number }> {
  const { renderer, postfx } = useSimulatorStore.getState();
  if (!renderer || !postfx) return { r: 0, g: 0, b: 0 };
  let out = { r: 0, g: 0, b: 0 };
  for (let pass = 0; pass < 2; pass++) {
    await new Promise<void>((res) => requestAnimationFrame(() => res()));
    const src = renderer.domElement as HTMLCanvasElement;
    const c2d = document.createElement('canvas');
    c2d.width = src.width;
    c2d.height = src.height;
    const ctx = c2d.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const x0 = Math.floor(src.width * fx0);
    const x1 = Math.floor(src.width * fx1);
    const y0 = Math.floor(src.height * fy0);
    const y1 = Math.floor(src.height * fy1);
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    out = { r: r / n, g: g / n, b: b / n };
  }
  return out;
}
const sampleCenter = (): Promise<{ r: number; g: number; b: number }> =>
  sampleRegion(0.38, 0.5, 0.54, 0.58);

/** 배치 스크린샷 캡처 — 뷰포트 비율과 무관하게 **항상 16:9로 다시 렌더해서** 뽑는다.
 *
 *  이 PNG는 AI 상상도 생성의 입력 이미지이기도 하다: 백엔드가 그대로 GMS
 *  (`POST /v1/images/edits`)에 보내고, `app.image.generation.size: auto`면 **입력 이미지의
 *  실제 픽셀 크기에서 출력 해상도를 계산한다**(긴 변 1536, 16 배수). 즉 상상도의 비율이
 *  정해지는 곳이 여기이고, 입력이 16:9면 출력도 16:9(1536x864)라 상류가 재구도·크롭할
 *  이유가 없어진다. 예전처럼 캔버스를 뷰포트 비율 그대로 뽑으면 창이 21:9인 사용자는
 *  상상도도 21:9로 받고, 표시(`aspect-video` + `object-cover`)에서 좌우가 잘렸다.
 *  받은 이미지를 사후 리사이즈·크롭하는 방식은 기각됐다 — 3D는 어떤 비율로든 다시 그릴 수
 *  있으므로 소스에서 16:9로 렌더하면 화질 손실이 0이고 잘려나가는 물건도 없다.
 *
 *  postfx는 여기서 따로 손대지 않는다 — PassNode가 매 프레임 `renderer.getDrawingBufferSize`를
 *  읽어 자기 렌더타깃을 맞추므로 렌더러 크기만 바꾸면 파이프라인이 따라온다(window resize
 *  핸들러도 같은 이유로 camera·renderer만 갱신한다).
 *
 *  sampleRegion과 같은 rAF 대기 + drawImage 패턴이고, 씬 전환 직후 첫 프레임(그림자
 *  재계산·첫 GPU 제출 등 1회성 비용 포함)까지 안전하게 덮도록 3프레임을 기다린다. */
async function captureFullCanvas(): Promise<Blob | null> {
  const { renderer, camera, postfx, sim } = useSimulatorStore.getState();
  if (!renderer || !camera) return null;
  const prevSize = renderer.getSize(new THREE.Vector2());
  const prevAspect = camera.aspect;
  // 선택 표시(아웃라인·회전 링·관절 기즈모)는 편집 UI라 미리보기에 남으면 안 된다.
  // 스토어의 selectedItemId는 건드리지 않는다 — 상태를 비우면 우측 선택 패널이 캡처 몇
  // 프레임 동안 사라졌다 돌아오며 깜빡인다. renderContactShadows와 같은
  // visible 저장 → 끄기 → 복구 패턴으로 보이는 것만 끈다.
  const gizmoGroups = sim
    ? [sim.rotateGizmo.group, sim.jointGizmo.group, sim.boundaryGuide.group]
    : [];
  const prevGizmoVisible = gizmoGroups.map((g) => g.visible);
  try {
    postfx?.setOutline([]);
    for (const g of gizmoGroups) g.visible = false;
    camera.aspect = SCREENSHOT_ASPECT;
    camera.updateProjectionMatrix();
    // 세 번째 인자 false가 핵심 — 캔버스 CSS 크기는 그대로 두고 드로잉 버퍼만 바꿔서
    // 캡처 동안 화면 레이아웃이 흔들리지 않게 한다.
    renderer.setSize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, false);
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((res) => requestAnimationFrame(() => res()));
    }
    const src = renderer.domElement as HTMLCanvasElement;
    const c2d = document.createElement('canvas');
    c2d.width = src.width;
    c2d.height = src.height;
    const ctx = c2d.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    // 캡처도 webp다(ADR-0035) — 서버 presign이 image/webp로만 서명한다. Safari 폴백 포함.
    try {
      return await canvasToWebpBlob(c2d);
    } catch {
      return null;
    }
  } finally {
    // 예외가 나도 반드시 원래 비율·크기로 돌아간다. 원복 뒤에도 한 프레임 더 그려야
    // 16:9로 찌그러진 프레임이 화면에 남지 않는다.
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(prevSize.x, prevSize.y, false);
    // 선택 표시도 같이 원복 — 기즈모는 저장한 visible 그대로(show()는 핸들을 다시
    // 계산하므로 불필요하다), 아웃라인은 현재 선택·호버 상태로 다시 세운다.
    gizmoGroups.forEach((g, i) => {
      g.visible = prevGizmoVisible[i];
    });
    useSimulatorStore.getState().refreshOutline?.();
    await new Promise<void>((res) => requestAnimationFrame(() => res()));
  }
}

/** 저장 직후 서버 썸네일 갱신 — `trySave`가 이미 찍어 둔 캡처를 2단계 presign으로 올린다.
 *  저장 자체는 이 시점에 이미 끝났으므로 실패해도 토스트를 띄우지 않는다 — "저장되었습니다"를
 *  실패 문구로 덮으면 사용자가 배치가 날아간 줄 안다. */
async function uploadCapturedThumbnail(
  placementId: number,
  captured: Promise<Blob | null>,
): Promise<void> {
  try {
    const blob = await captured;
    if (!blob) return;
    await uploadPlacementThumbnail(placementId, blob);
  } catch (error) {
    console.error('[simulatorStore] 미리보기 갱신에 실패했습니다', error);
  }
}

/** window.__sim 호환 셸 — 기존 main.ts와 동일 시그니처, e2e 40여 개가 이 API에 의존한다. */
function installSimTestHooks(): void {
  const bumpPlaced = (): void =>
    useSimulatorStore.setState((s) => ({
      placedVersion: s.placedVersion + 1,
      changeVersion: s.changeVersion + 1,
    }));
  const api: SimHooks = {
    get ready() {
      return useSimulatorStore.getState().ready;
    },
    get backend() {
      return useSimulatorStore.getState().backend ?? 'webgl';
    },
    enterSim: (deskId) => useSimulatorStore.getState().enterSim(deskId),
    setDeskConfig: (config) => useSimulatorStore.getState().setDeskConfig(config),
    deskInfo: () => {
      const { sim } = useSimulatorStore.getState();
      const c = sim!.deskConfig();
      return {
        source: c.source,
        widthMm: c.widthMm,
        depthMm: c.depthMm,
        heightMm: c.heightMm,
        topThicknessMm: c.topThicknessMm,
        materialId: c.materialId,
        frameType: c.frameType,
        surfaceTopY: sim!.surfaceInfo().topY,
        frontWallZ: sim!.frontWallZ(),
      };
    },
    reset: () => useSimulatorStore.getState().reset(),
    setRoomLight: (on) => useSimulatorStore.getState().setRoomLight(on),
    roomLightOn: () => useSimulatorStore.getState().sim!.roomLightOn(),
    setWall: (side, on) => useSimulatorStore.getState().setWall(side, on),
    wallState: () => useSimulatorStore.getState().sim!.wallState(),
    setWallDistance: (side, distanceM) =>
      useSimulatorStore.getState().sim!.setWallDistance(side, distanceM),
    wallDistance: () => useSimulatorStore.getState().sim!.wallDistance(),
    setFrontWallGap: (gapM) => useSimulatorStore.getState().sim!.setFrontWallGap(gapM),
    frontWallGap: () => useSimulatorStore.getState().sim!.frontWallGap(),
    setWallFinish: (side, finish) => useSimulatorStore.getState().setWallFinish(side, finish),
    setFloorFinish: (finish) => useSimulatorStore.getState().setFloorFinish(finish),
    setWallWindow: (side, window) => useSimulatorStore.getState().setWallWindow(side, window),
    applyRoomPreset: (key) => useSimulatorStore.getState().applyRoomPreset(key),
    setTimeOfDay: (time) => useSimulatorStore.getState().setTimeOfDay(time),
    roomConfig: () => useSimulatorStore.getState().sim!.roomConfig(),
    roomSurfaceNames: () => useSimulatorStore.getState().sim!.roomSurfaceNames(),
    renderStats: () => {
      const { render } = useSimulatorStore.getState().renderer!.info;
      return { drawCalls: render.drawCalls, triangles: render.triangles };
    },
    lightingInfo: () => useSimulatorStore.getState().sim!.lightingInfo(),
    placeProduct: (id) => useSimulatorStore.getState().placeProduct(id),
    placeProductAt: (id, x, z) => {
      const { placement } = useSimulatorStore.getState();
      const res = placement!.placeProductAt(id, x, z);
      useSimulatorStore.setState((s) => ({
        placedVersion: s.placedVersion + 1,
        changeVersion: s.changeVersion + 1,
      }));
      return res;
    },
    selectItem: (placedId) => useSimulatorStore.getState().selectItem(placedId),
    selectedItem: () => {
      const { sim, selectedItemId } = useSimulatorStore.getState();
      const it = sim?.placed().find((i) => i.id === selectedItemId);
      if (!it) return null;
      const box = new THREE.Box3().setFromObject(it.group);
      return {
        id: it.id,
        specId: it.spec.id,
        yawDeg: it.yawDeg,
        liftMm: baseLiftMm(it),
        pitchDeg: it.pitchDeg,
        centerY: it.center.y,
        worldBox: {
          min: { x: box.min.x, y: box.min.y, z: box.min.z },
          max: { x: box.max.x, y: box.max.y, z: box.max.z },
        },
      };
    },
    moveItem: (placedId, x, z) => {
      const ok = useSimulatorStore.getState().sim!.moveItem(placedId, x, z);
      if (ok) bumpPlaced();
      return ok;
    },
    rotateItem: (placedId, yawDeg) => {
      const applied = useSimulatorStore.getState().sim!.rotateItem(placedId, yawDeg);
      if (applied !== null) bumpPlaced();
      return applied;
    },
    // 높이·기울기는 규격 박스 관입을 만들 수 있다 — 스토어 뮤테이터(liftSelected·
    // tiltSelected)가 refreshWarning을 태우므로 훅도 같이 태운다. 안 태우면 판정은 바뀌었는데
    // 배너만 옛 값으로 남아 e2e가 "경고가 안 뜬다"로 오진한다 (2026-08-04 실측).
    liftItem: (placedId, liftMm) => {
      const applied = useSimulatorStore.getState().sim!.liftItem(placedId, liftMm);
      if (applied !== null) {
        useSimulatorStore.getState().refreshWarning?.();
        bumpPlaced();
      }
      return applied;
    },
    tiltItem: (placedId, pitchDeg) => {
      const applied = useSimulatorStore.getState().sim!.tiltItem(placedId, pitchDeg);
      if (applied !== null) {
        useSimulatorStore.getState().refreshWarning?.();
        bumpPlaced();
      }
      return applied;
    },
    removeItem: (placedId) => {
      const { sim, selectedItemId } = useSimulatorStore.getState();
      // 선택된 아이템을 지우는 경우는 선택 해제·아웃라인 정리가 붙은 액션으로 간다.
      if (placedId === selectedItemId) {
        useSimulatorStore.getState().deleteSelected();
        return true;
      }
      const ok = sim!.removeItem(placedId);
      if (ok) bumpPlaced();
      return ok;
    },
    duplicateItem: (placedId) => {
      const res = useSimulatorStore.getState().sim!.duplicateItem(placedId);
      if (res) bumpPlaced();
      return res;
    },
    placedCount: () => useSimulatorStore.getState().placement!.placedCount(),
    collided: () => useSimulatorStore.getState().sim!.anyCollision(),
    boundaryViolation: () => useSimulatorStore.getState().sim!.anyBoundaryViolation(),
    setCollisionIgnore: (on) => useSimulatorStore.getState().setCollisionIgnore(on),
    collisionIgnored: () => useSimulatorStore.getState().collisionIgnored,
    trySave: () => useSimulatorStore.getState().trySave(),
    placedItems: () =>
      useSimulatorStore
        .getState()
        .sim!.placed()
        .map((i) => {
          // 결합된 모니터는 암 피벗의 자식이라 group.position이 로컬 좌표다 — 월드로 읽는다
          // (미결합 아이템은 placedRoot가 항등이라 값이 종전과 같다).
          const p = i.group.getWorldPosition(new THREE.Vector3());
          return {
            id: i.id,
            specId: i.spec.id,
            joints: i.joints ? [...i.joints.keys()] : [],
            pos: { x: p.x, y: p.y, z: p.z },
            collided: i.collided,
            boundary: i.boundary,
            mountedToId: i.mountedToId ?? null,
          };
        }),
    articulate: (placedId, jointId, angleDeg) =>
      useSimulatorStore.getState().articulate(placedId, jointId, angleDeg),
    jointStates: (placedId) => useSimulatorStore.getState().sim!.jointStates(placedId),
    jointHandles: (placedId) => useSimulatorStore.getState().sim!.jointHandles(placedId),
    rotateRing: () => {
      const { sim, selectedItemId } = useSimulatorStore.getState();
      const group = sim?.scene.getObjectByName('rotate-gizmo') ?? null;
      const handle = sim && selectedItemId ? sim.rotateHandle(selectedItemId) : null;
      return {
        visible: !!group?.visible,
        hasRing: !!group?.getObjectByName('rotate-ring'),
        radius: handle?.radius ?? null,
        centerY: handle?.center[1] ?? null,
      };
    },
    setMonitorMounted: (id, mounted) =>
      useSimulatorStore.getState().sim!.setMonitorMounted(id, mounted),
    setEmitterColor: (itemId, hex) => {
      const { sim, selectedItemId } = useSimulatorStore.getState();
      // 선택된 아이템이면 스와치 미러까지 갱신되는 액션으로 간다(removeItem과 같은 이유).
      if (itemId === selectedItemId) {
        useSimulatorStore.getState().recolorSelected(hex);
        return;
      }
      sim!.setEmitterColor(itemId, hex);
    },
    emitterInfo: (itemId) => useSimulatorStore.getState().sim!.emitterInfo(itemId),
    setLampBrightnessScale: (itemId, scale) => {
      const { sim, selectedItemId } = useSimulatorStore.getState();
      // 선택된 램프면 패널 미러까지 갱신되는 액션으로 간다(setEmitterColor와 같은 이유).
      if (itemId === selectedItemId) {
        useSimulatorStore.getState().setLampBrightness(scale);
        return;
      }
      sim!.setLampBrightnessScale(itemId, scale);
    },
    setLampColorTempK: (itemId, k) => {
      const { sim, selectedItemId } = useSimulatorStore.getState();
      if (itemId === selectedItemId) {
        useSimulatorStore.getState().setLampColorTemp(k);
        return;
      }
      sim!.setLampColorTempK(itemId, k);
    },
    lampInfo: (itemId) => useSimulatorStore.getState().sim!.lampInfo(itemId),
    mountMonitor: (monitorId, armId) => {
      const res = useSimulatorStore.getState().sim!.tryMountMonitor(monitorId, armId);
      if (res?.mounted) bumpPlaced();
      return res;
    },
    detachMonitor: (monitorId, opts) => {
      const ok = useSimulatorStore.getState().sim!.detachMonitor(monitorId, opts);
      if (ok) bumpPlaced();
      return ok;
    },
    lastMountEvent: () => useSimulatorStore.getState().lastMountEvent,
    itemBounds: (id) => {
      const { sim } = useSimulatorStore.getState();
      const it = sim!.placed().find((i) => i.id === id);
      if (!it) return { width: 0, height: 0, depth: 0, partCount: 0 };
      const size = new THREE.Box3().setFromObject(it.group).getSize(new THREE.Vector3());
      return { width: size.x, height: size.y, depth: size.z, partCount: it.collider.parts.length };
    },
    getCameraPreset: (name) => CAMERA_PRESETS[name],
    setCameraPreset: (name) => useSimulatorStore.getState().setCameraPreset(name),
    outlinePlaced: (placedId) => {
      useSimulatorStore.setState({ selectedItemId: placedId });
      const { sim, postfx } = useSimulatorStore.getState();
      const item = placedId ? sim!.placed().find((p) => p.id === placedId) : null;
      postfx!.setOutline(item ? [item.group] : []);
    },
    setContourLines: (on) => useSimulatorStore.getState().setContourLines(on),
    contourLinesOn: () => useSimulatorStore.getState().postfx!.contourOn(),
    setLookVariant: (id) => useSimulatorStore.getState().setLookVariant(id),
    lookVariant: () => useSimulatorStore.getState().lookVariantId,
    lookVariants: () => LOOK_VARIANTS.map((v) => ({ id: v.id, label: v.label })),
    sampleCenter,
    sampleRegion,
  };
  window.__sim = api;
}

// renderer 노출 상수 재사용(캔버스 셸에서 exposure 재설정 없이 그대로 참조)
export { CAMERA_EXPOSURE };
