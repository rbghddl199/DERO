// 씬 조립기 — 환경 + 3면 토글 벽 + 절차형 책상 + 중립 룸 조명 + 램프별 로컬 무드 조명 + 배치 아이템(OBB 충돌·컨택트 섀도우) 관리
import * as THREE from 'three/webgpu';
import { vec3, float, texture, depth, nodeObject } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { buildDesk } from './desk';
import { buildProp, LAMP_SHADE_EMISSIVE_INTENSITY } from './props';
import { applyScreenPhoto, findScreenMesh } from './screenTexture';
import { setupEnvironment, GROUND_SIZE_M } from '../render/environment';
import { buildFloorMaterial, buildWallSurface } from '@/three/finishes';
import type { FinishConfig, FinishContext, RoomConfig, WallConfig } from '@/three/finishes/types';
import { DEFAULT_ROOM_PRESET_KEY, roomConfigForPreset } from '@/three/finishes/presets';
import { SHADE_MESH_NAME } from '../render/cookieBake';
import {
  beamHalfAngleRad,
  clampBrightnessScale,
  clampColorTempK,
  colorTempMarkerSpan,
  colorTempToRGB,
  brightnessMarkerSpan,
  specSpan,
  type MarkerSpan,
} from './lighting';
import { createLightSlots, type SlotEmitter, type CookieSlotInfo } from './lightSlots';
import { resolveEmitterColor, emitterLightFlags, EMITTER_LIGHT_CAP } from './emitters';
import { applyEmitterEmissive, pokeEmissive, EMITTER_EMISSIVE_INTENSITY } from './emitterEmissive';
import { createRoomRig } from './roomRig';
import { MONITOR_STAND_HEIGHT_MM } from './monitor';
import { backendName } from '../render/renderer';
import {
  buildItemCollider,
  collideItems,
  footprintRectXZ,
  type ItemCollider,
  type ColliderPart,
} from '../core/collider';
import {
  snapCenterY,
  clampDropM,
  rotatedFootprintRect,
  rectsOverlapXZ,
  isWallMounted,
  isFloorMounted,
  isPegboardMounted,
  isPegboardProduct,
  resolvePegboardPose,
  resolveHookHangPose,
  resolveMonitorTopPose,
  restsOnMonitorTop,
  canRestOnMonitor,
  sharesMountPlane,
  baseSupportY,
  supportTopY,
  supportSurfaces,
  restsOnSurface,
  resolveWallPose,
  violatesDeskBoundary,
  DESK_BOUNDARY_EPS_M,
  RIG_BOUNDARY_EPS_M,
  clampAlongEdgeToDesk,
  clampCenterToWalls,
  clampCenterToWallsAlongEdge,
  WALL_HEIGHT_M,
  WALL_YAW_DEG,
  type MountHostBox,
  type PinnedAxis,
  type RectXZ,
  type WallPlanes,
  type WallPose,
  type WallSide,
} from '../core/snap';
import {
  buildWallGeometry,
  evictAlongCandidates,
  evictAlongFromWindow,
  primaryWindowSide,
  windowRectM,
  type WallWindowConfig,
  type WindowRectM,
} from '../core/window';
import { advanceWindowTime, setWindowNight } from '../render/windowNodes';
import { buildWindowView } from './windowView';
import { buildWindowTrim } from './windowTrim';
import { buildBlind } from './blind';
import { dropOffsetY, dropDone } from '../core/dropTween';
import { mountProgress, mountDone } from '../core/mountTween';
import { mountFaceAnchorLocal } from '../core/mountAnchor';
import { mmToM } from '../core/units';
import {
  judgeArmDesk,
  judgeMonitorArm,
  clampGripMm,
  type DeskGripSpec,
  type Judgment,
} from '../core/collision';
import { getProduct, type ProductSpec, type JointKind } from './product';
import { deskConfigFromProduct, DEFAULT_CUSTOM_DESK, type DeskConfig } from '../core/deskConfig';
import type { ProductAssets, JointState } from '../core/productAssets';
import { setJointValue } from '../core/productAssets';
import { coupledValue, isDriver, jointKind, jointLimits, segmentPivotIndex } from '../core/rig';
import type { Vec3 } from '../core/gizmoMath';
import { createJointGizmo, type JointGizmo } from './jointGizmo';
import { createRotateGizmo, type RotateGizmo } from './rotateGizmo';
import { createBoundaryGuide, type BoundaryGuide } from './boundaryGuide';

export interface JointUiState {
  id: string;
  label: string;
  kind: JointKind;
  unit: '°' | 'mm';
  value: number;
  min: number;
  max: number;
}

export interface PlacedItem {
  id: string;
  spec: ProductSpec;
  group: THREE.Group;
  /** 규격 박스(수직 자세)의 중심(m, 월드) — 판정·저장이 쓰는 좌표계다. `group.position`은
   *  화면 자세라 y가 다르다(`group.position.y`는 규격 박스 **밑면** 높이, 여기는 중심).
   *  x·z는 같다 — 기울기는 그룹 원점(밑면 중심)을 축으로 도니 보정 오프셋이 없다.
   *  **y는 사용자가 정한 저장값이다** — 드롭 순간에만 지지면에서 초기화한다 (ADR-0023). */
  center: { x: number; y: number; z: number };
  /** Y축 요 회전(도) — 연속값. 규격이 아니라 배치 인스턴스 상태 (REQ-SIM-18) */
  yawDeg: number;
  /** 벽에 붙어 있으면 그 벽 (REQ-SIM-02·REQ-ENV-04, `prop.mount_surface = 'WALL'`).
   *  **이 값이 있으면 `center.y`가 파생값이 아니라 저장값이고 `yawDeg`가 벽에 종속돼
   *  고정이다** — `resnap`이 지지면에서 y를 다시 유도하면 안 된다. 상판·바닥 아이템은
   *  undefined다. 벽을 끄는 것도 이 값으로 막는다(붙은 아이템이 있는 벽은 못 끈다).
   *  **벽 아이템에는 `pitchDeg`를 적용하지 않는다** — y가 이미 자유롭고 yaw는 벽 법선에
   *  종속돼 고정이다. */
  wallSide?: WallSide;
  /** 앞뒤 기울기(도, 로컬 X축). **`placed_item.pitch_deg`로 저장한다** — 사용자가 정한
   *  자세이고 로드 시 재계산이 없다 (ADR-0023 결정 2·3). 한계는 `PITCH_LIMIT_DEG`(±75°). */
  pitchDeg: number;
  /** 메쉬당 OBB 콜라이더 — FK 포즈를 matrixWorld로 자동 반영 */
  collider: ItemCollider;
  collided: boolean;
  /** 지지 파트가 상판을 벗어났거나 footprint가 켜진 벽을 넘음 (소프트 플래그) */
  boundary: boolean;
  /** lamps only: 이 램프에 배정된 무드 SpotLight **슬롯**. 슬롯을 못 받은 램프는
   *  undefined이고 빛을 내지 못한다(경고 대상 — `lightingInfo().unlitLampCount`).
   *  광원은 슬롯 풀 소유라 아이템이 만들지도 해제하지도 않는다 (235) */
  light?: THREE.SpotLight;
  /** 장식 발광체 전용 — 배정된 그림자 없는 PointLight 슬롯. 램프의 `light`와 합치지
   *  않는다: 기능 조명과 장식 발광은 캡·그림자·색의 정본이 전부 다르다 (ADR-0003 결정 2) */
  emitterLight?: THREE.PointLight;
  /** 발광체의 위치(m, 그룹 로컬) — 발광체가 없으면 undefined. 슬롯이 매 프레임 여기에
   *  그룹 월드 변환을 곱해 따라온다(광원이 그룹의 자식이던 구조의 대체물) */
  emitterLocal?: THREE.Vector3;
  /** 발광체의 현재 실효색 `'#RRGGBB'` — 발광체가 없으면 undefined */
  emitterColor?: string;
  /** 사용자가 이 발광체를 껐는지 (선택 패널 스위치). **미설정이면 켜짐**이다 —
   *  배치 시점에 값을 박아 넣지 말 것. 세션 한정이라 저장 스냅샷에 안 실린다. */
  emitterOn?: boolean;
  /** lamps only: 사용자가 고른 밝기 배율 (REQ-SIM-08, 287). **미설정이면 규격 그대로(=1)**
   *  라는 뜻이다 — 배치 시점에 1을 박아 넣지 말 것. 실효 lm = `spec.optical.lumens × 이 값`이고
   *  슬롯 배정 랭킹(`lampSlotOrder`, 223)의 입력도 그 실효 lm이다. */
  emitterBrightnessScale?: number;
  /** lamps only: 사용자가 고른 색온도(K). 미설정이면 규격 `optical.colorTempK`를 쓴다. */
  emitterColorTempK?: number;
  /** monitors only: 사용자가 화면에 올린 사진 텍스처. 없으면 절차 기본 화면이다.
   *  서버에 안 실린다 — 브라우저 IndexedDB에만 남는다(`utils/screenPhotoStore.ts`). */
  screenPhoto?: THREE.Texture;
  /** articulated products only: FK joints keyed by joint id */
  joints?: Map<string, JointState>;
  /** monitors only: 결합된 암의 배치 id (D22). 있으면 그룹이 암 피벗의 자식이다. */
  mountedToId?: string;
  /** 타공판 부착 제품(`'PEGBOARD'`)만 — 붙어 있는 호스트의 배치 id (DERO-518).
   *  호스트는 타공판 패널이거나 그 패널에 이미 붙은 아이템(후크)이라 체인이 된다.
   *  `mountedToId`(모니터↔암)와 **합치지 않는다** — 저쪽은 그룹을 암 피벗의 자식으로
   *  옮기고 `removeItem`이 `detachMonitor`를 부르는 모니터 전용 프로토콜이다.
   *  이 필드가 있으면 `wallSide`도 호스트에서 물려받아 채워진다(벽 아이템 갈래 재사용). */
  pegboardHostId?: string;
  /** 이 아이템을 받치고 있는 아이템의 배치 id (REQ-SIM-24, ADR-0023 결정 5). **상태
   *  플래그가 아니라 매 `recomputeCollisions`마다 규격 박스 기하에서 다시 추론한 결과**다
   *  — 저장하지 않고 로드 시 같은 규칙으로 재추론한다. 쓰는 곳은 **충돌 경고 제외 쌍
   *  하나뿐**이다: 이 추론은 자세를 정하지 않는다. */
  seatedOnId?: string;
  /** 배치 API의 실제 아이템 id — 불러온 아이템이거나 저장 응답으로 받은 뒤에만 존재한다.
   *  없으면(신규·미저장) 저장 시 신규 삽입(id: null)으로 보낸다. */
  backendId?: number;
}

/** 배치된 암의 결합 앵커 — 모니터 패널 뒷면이 붙을 월드 좌표(m). */
export interface MountPoint {
  armId: string;
  point: Vec3;
}

/** 분리 옵션 — 드래그 재분리는 포인터가 가리키는 상판 좌표로 되돌려야 드래그가 이어진다. */
export interface DetachOptions {
  /** 복귀할 상판 좌표(m). 없으면 암 옆(+X)으로 재스냅한다. */
  at?: { x: number; z: number };
}

export interface MountResult {
  judgment: Judgment;
  /** 자석이 발동해 실제로 붙었는가 (INCOMPATIBLE이면 false) */
  mounted: boolean;
}

/**
 * 결합·엣지 스냅 알림 (D22). UI 배선은 스토어가 하고 엔진은 사실만 낸다.
 * 분리에는 판정이 없다 — 판정 실패가 아니라 사용자 조작이므로 payload에도 없다.
 * `edge-*`는 암↔책상 **결합**(D22 ①층)의 채널 내부명이다 — Phase 2의 거치(seat)가
 * 아니므로 화면 문구에 "거치"를 쓰면 안 된다(거치는 판정 어휘를 쓰지 않는 별개 층).
 */
export type MountEvent =
  | { kind: 'mounted' | 'rejected'; monitorId: string; armId: string; judgment: Judgment }
  | { kind: 'detached'; monitorId: string; armId: string }
  | { kind: 'edge-snapped' | 'edge-rejected'; armId: string; judgment: Judgment };

export interface LampLightInfo {
  /** 인스턴스 반영값 — 사용자가 색온도를 조절했으면 규격이 아니라 그 값이다 (287). */
  colorTempK: number;
  /** 실효 광속(lm) = 규격 정격 lm × 사용자 배율. 슬롯 광원의 `power`이자 배정 랭킹 입력이다. */
  lumens: number;
  distribution: 'spot' | 'flood' | 'ambient';
  angle: number;
  castShadow: boolean;
}

/** 선택된 램프의 밝기·색온도 조절 상태 (REQ-SIM-08, 287) — UI가 그릴 값 전부. */
export interface LampInfo {
  /** 현재 밝기 배율. 사용자가 안 만졌으면 1(규격 그대로)이다. */
  brightnessScale: number;
  /** 현재 색온도(K). 사용자가 안 만졌으면 규격 값이다. */
  colorTempK: number;
  /** 규격 정격 광속(lm) — 배율이 곱해지는 기준값. */
  baseLumens: number;
  /** 실효 광속(lm) = `baseLumens × brightnessScale`. */
  effectiveLumens: number;
  /**
   * 저작 색온도 사양 그대로(**K, 클램프 없음**). 사양 미제공이면 null.
   * **캡션이 읽는 값이자 세 상태(범위형·고정형·미제공)의 판정 정본이다** — 아래 마커로
   * 판정하면 조절 범위 밖 범위형이 뭉개져 "고정형"으로 거짓 표시된다.
   */
  colorTempSpec: MarkerSpan | null;
  /**
   * 저작 광속 사양 그대로(**lm, 배율 아님·클램프 없음**). 사양 미제공이면 null.
   * 캡션은 이 값을 그대로 lm으로 적는다 — 사양은 제품의 lm이지 사용자 배율이 아니다.
   */
  brightnessSpec: MarkerSpan | null;
  /** 색온도 마커 **위치**(K 축, 조절 범위로 클램프됨). 그릴 자리가 없으면 null. */
  colorTempMarker: MarkerSpan | null;
  /**
   * 밝기 마커 **위치**(**배율 축**, 조절 범위로 클램프됨). 그릴 자리가 없으면 null.
   * `brightnessSpec`과 어긋날 수 있고 그건 사실이다 — 제품은 200lm까지 내려가지만
   * 조절 하한(×0.5)이 280lm이면 띠는 280lm 자리에서 시작한다.
   */
  brightnessMarker: MarkerSpan | null;
}

export interface LightingInfo {
  roomLightOn: boolean;
  /** **배치된** 램프 수 — 슬롯 배정 여부와 무관하다(슬롯 초과분도 센다). */
  lampCount: number;
  /** effective shadow casters: room key (if on) + shadow-casting lamps */
  shadowCasters: number;
  /** 슬롯을 못 받아 빛을 내지 못하는 램프 수 = 배치 수 − 배정 수 (235 부수 결정 1) */
  unlitLampCount: number;
  /** 배치된 램프 전체 — 미배정 램프도 spec 유도값으로 들어온다(castShadow는 false). */
  lamps: LampLightInfo[];
  /** 렌더러의 그림자 맵 스위치. 광원의 `castShadow` 플래그가 전부 정상이어도 이게
   *  false면 씬 전체에 그림자가 하나도 안 그려진다 — DERO-248이 딱 그 상태로
   *  4주를 갔다(`<Canvas>`에 `shadows` prop이 없어 R3F가 렌더러 설정을 덮어썼다).
   *  플래그만 재는 어서션은 이 회귀를 못 잡아서 렌더러 상태를 같이 싣는다. */
  shadowMapEnabled: boolean;
  /** 램프 갓 쿠키 (265) — 슬롯 순서 고정, 빈 슬롯도 들어온다(마스크는 흰색). */
  cookies: CookieSlotInfo[];
  /** 지금까지 완료된 쿠키 베이크 횟수. 제품당 1회라 램프를 돌리거나 다시 놓아도 안 는다. */
  cookieBakes: number;
  /** 활성 셰이더 프로그램 수(`renderer.info.memory.programs`). **235/265의 제일 중요한
   *  회귀 축**이다 — 램프를 놓고 지우는 동안 이 값이 늘면 어딘가에서 광원 집합이나
   *  `colorNode`/`map` 캐시 키를 건드려 씬 전역 셰이더가 다시 빌드된 것이고, 실기 WebGPU에서
   *  1.2~1.9초 스톨로 나타난다. `lightingInfo`가 이 값을 싣는 이유는 `shadowMapEnabled`와
   *  같다 — 플래그만 재는 어서션으로는 이 회귀가 조용히 지나간다. */
  shaderProgramCount: number;
}

export interface SurfaceInfo {
  topY: number;
  halfW: number;
  halfD: number;
}

export interface JointHandle {
  id: string;
  kind: JointKind;
  /** 월드 좌표(m) */
  point: Vec3;
  /** 월드 단위 축 — 부모 체인 회전이 반영돼 있다(방향 표시·드래그 수학 전용). */
  axis: Vec3;
  /** 매니페스트 로컬 축(unit) — 부모가 돌아도 안 바뀐다. gizmo 축별 색 판정은 반드시 이걸 쓴다. */
  localAxis: Vec3;
  value: number;
  min: number;
  max: number;
}

/** 회전 링 기즈모의 기하 (REQ-SIM-18, ADR-0022 결정 7) — 링 하나뿐이라 배열이 아니다. */
export interface RotateHandle {
  itemId: string;
  /** 링 중심 = 규격 박스 밑면 중심 살짝 위 (월드 m). */
  center: Vec3;
  /** 링 반지름(m) — 규격 footprint 대각선 + 여유. **메쉬 치수를 읽지 않는다.** */
  radius: number;
  /** 현재 yaw(도) — 드래그 시작 기준값이자 라벨 값. */
  yawDeg: number;
}

export interface SimScene {
  scene: THREE.Scene;
  desk: THREE.Group;
  setRoomLight: (on: boolean) => boolean;
  roomLightOn: () => boolean;
  lightingInfo: () => LightingInfo;
  setWall: (side: WallSide, on: boolean) => boolean;
  wallState: () => Record<WallSide, boolean>;
  /** 좌/우 벽까지 거리(m, 책상 중심 기준) 조정 — 책상 반폭+여백 미만·3m 초과는 클램프.
   *  반환값은 실제 적용된 거리(클램프 후). */
  setWallDistance: (side: 'left' | 'right', distanceM: number) => number;
  wallDistance: () => Record<'left' | 'right', number>;
  /** 전면 벽 간격(m, 책상 뒷변 기준) 조정 — 1mm 미만·3m 초과는 클램프.
   *  반환값은 실제 적용된 간격(클램프 후). */
  setFrontWallGap: (gapM: number) => number;
  frontWallGap: () => number;
  /** 방 표면 적용 — 벽면 3벌 + 바닥 + 시간대를 받아 재질·장식을 교체하는 **단일 창구**
   *  (ADR-0030 결정 10). 판정과 무관한 순수 시각 상태다. */
  applyRoom: (config: RoomConfig) => void;
  roomConfig: () => RoomConfig;
  /** **화면에 실제로 선 표면**의 `계열/변형` 이름. `roomConfig()`가 요청값인 데 반해 이것은
   *  `resolveWallFinish` 폴백을 지난 결과라, 둘이 갈리면 그 키가 죽었다는 뜻이다 — 계측기가
   *  엉뚱한 재질을 재고도 조용히 통과하는 것을 막는 유일한 관측점이다. */
  roomSurfaceNames: () => { walls: Record<WallSide, string>; floor: string };
  chooseDesk: (id: string) => void;
  /** VESA 결합 표현 — 모니터 스탠드를 숨기고 충돌 파트를 재생성한다 */
  setMonitorMounted: (id: string, mounted: boolean) => boolean;
  /** 배치된 클램프 암들의 결합 앵커 (자석 근접 판정 입력, REQ-SIM-22) */
  mountPoints: () => MountPoint[];
  /** 판정 ②를 실행하고 FIT·CONDITIONAL이면 모니터를 암 헤드에 결합한다 (D22).
   *  INCOMPATIBLE이면 아무것도 바꾸지 않고 판정만 낸다. 모르는 id·이미 점유된 암이면 null. */
  tryMountMonitor: (monitorId: string, armId: string) => MountResult | null;
  /** 결합 해제 — 스탠드를 되살리고 상판으로 재스냅한다. 결합 상태가 아니면 false.
   *  `at` 없으면 암 옆(+X), 있으면 그 좌표(드래그 재분리). 부착 트윈은 취소된다. */
  detachMonitor: (monitorId: string, opts?: DetachOptions) => boolean;
  /** 결합 거절 피드백 — 아이템을 잠깐 충돌색으로 비췄다가 실제 판정 상태로 되돌린다 (D22). */
  flashReject: (itemId: string) => void;
  /** 결합·엣지 스냅 알림 구독 (배지·배너 배선용) */
  onMountEvent: (cb: (e: MountEvent) => void) => void;
  setDesk: (config: DeskConfig) => void;
  deskConfig: () => DeskConfig;
  frontWallZ: () => number;
  /**
   * GLB 템플릿을 확보하고 **배치에 쓸 spec**을 돌려준다 (ProductAssets.ensureTemplate 위임).
   * placeAt은 동기라 템플릿이 없으면 파라메트릭 박스로 떨어진다 — GLB 제품은 placeAt **전에**
   * 이걸 await하고 반환된 spec을 넘겨야 한다. assets가 없는 씬(테스트)은 spec을 그대로 돌려준다.
   */
  ensureTemplate: (spec: ProductSpec) => Promise<ProductSpec>;
  /** 드래그 예열 — 실패를 삼킨다. */
  prefetchTemplate: (spec: ProductSpec) => void;
  placeAt: (
    spec: ProductSpec,
    x: number,
    z: number,
    opts?: PlaceOptions,
  ) => { id: string; collided: boolean };
  /** 배치 아이템 이동 (REQ-SIM-16) — 지지면 재스냅 + 재판정. 없는 id면 false. */
  moveItem: (id: string, x: number, z: number) => boolean;
  /** 벽에 붙은 아이템 이동 (REQ-SIM-02) — 벽면 히트 좌표로 중심·자세를 다시 잡는다.
   *  벽 제품이 아니거나 없는 id·결합 중이면 false. */
  moveItemOnWall: (id: string, side: WallSide, hit: WallPoint) => boolean;
  /** 벽면 레이캐스트 — **켜진 벽만** 본다. 어느 벽에도 안 닿으면 null. */
  pickWall: (raycaster: THREE.Raycaster) => WallHit | null;
  /** 타공판 부착 아이템 이동 (DERO-518) — 호스트 앞면 히트로 중심·자세를 다시 잡는다.
   *  타공판 제품이 아니거나 없는 id·호스트면 false. */
  moveItemOnPegboard: (id: string, hit: PegboardHit) => boolean;
  /** 부착 호스트 레이캐스트 — 타공판 패널과 이미 그 위에 붙은 아이템만 본다.
   *  하나도 안 닿으면 null. */
  pickPegboard: (raycaster: THREE.Raycaster, excludeId?: string) => PegboardHit | null;
  /** 모니터 패널 레이캐스트 (DERO-591) — 스탠드 높이 아래 히트는 버린다.
   *  어느 모니터도 안 맞히면 null. */
  pickMonitorTop: (raycaster: THREE.Raycaster, excludeId?: string) => MonitorTopHit | null;
  /** 모니터 위에 얹은 아이템 이동 (DERO-591) — 패널 상단 높이로 커서를 따라간다.
   *  상판 스냅 제품이 아니거나 없는 id·호스트·결합 중이면 false. */
  moveItemOnMonitorTop: (id: string, hit: MonitorTopHit) => boolean;
  /** 드래그 되돌리기 전용 — 엣지 스냅·벽 클램프 없이 정확히 이 포즈로 되돌린다. 없는 id·결합 중이면 false.
   *  `centerYMm`(밀리미터)은 **모든 아이템에서 되읽힌다** — 높이가 사용자가 정한 저장값이라
   *  로드·되돌리기 때 재계산이 없다 (ADR-0023 결정 4). */
  restorePose: (id: string, x: number, z: number, yawDeg: number, centerYMm?: number) => boolean;
  /** 연속 Y축 회전 (REQ-SIM-18) — 각도는 [0,360)으로 정규화해 반환. 없는 id면 null. */
  rotateItem: (id: string, yawDeg: number) => number | null;
  /** 규격 박스 밑면의 절대 높이(mm) — `[0, LIFT_MAX_MM]`로 클램프해 적용값을 반환.
   *  저장된다. 없는 id·결합 중이면 null. */
  liftItem: (id: string, liftMm: number) => number | null;
  /** 앞뒤 기울기(도) — `[-PITCH_LIMIT_DEG, PITCH_LIMIT_DEG]`로 클램프해 적용값을 반환.
   *  저장된다 (`placed_item.pitch_deg`). 없는 id·결합 중이면 null. */
  tiltItem: (id: string, pitchDeg: number) => number | null;
  /** 배치 아이템 삭제 (REQ-SIM-17) — GPU 리소스 해제 포함. 없는 id면 false. */
  removeItem: (id: string) => boolean;
  /** 선택 아이템 복제 (REQ-SIM-19) — 폭+10mm 옆에 같은 회전으로. 없는 id면 null. */
  duplicateItem: (id: string) => { id: string; collided: boolean } | null;
  /** 드롭 착지 트윈 진행 (프레임당 1회, dt는 ms). 진행 중인 트윈 수를 반환. */
  tick: (dtMs: number) => number;
  /** 드래그 중 고스트 프리뷰 표시·이동 (배치 아이템이 아니므로 충돌·저장 대상 아님). */
  ghostShow: (spec: ProductSpec, x: number, z: number, yawDeg?: number) => void;
  ghostMove: (x: number, z: number) => void;
  /** 벽 아이템 고스트 — 벽 자세로 띄우고 수평 스냅 링은 숨긴다(벽에 누운 링은 거짓말이다). */
  ghostShowOnWall: (spec: ProductSpec, side: WallSide, hit: WallPoint) => void;
  /** 타공판 부착 고스트 — 호스트 앞면 자세로 띄운다(링은 벽 고스트와 같은 이유로 숨김). */
  ghostShowOnPegboard: (spec: ProductSpec, hit: PegboardHit) => void;
  /** 모니터 위 얹기 고스트 (DERO-591) — 패널 상단 자세로 띄운다(링은 유지). */
  ghostShowOnMonitorTop: (spec: ProductSpec, hit: MonitorTopHit, yawDeg?: number) => void;
  ghostHide: () => void;
  /** FK: drive one DRIVER joint of a placed articulated item (clamped to spec
   *  DB limits, dependents recomputed). revolute=도, prismatic=mm.
   *  Returns the applied value, or null when id/joint is unknown or coupled. */
  articulate: (placedId: string, jointId: string, value: number) => number | null;
  /** UI-facing driver joint list of a placed item (empty when not articulated). */
  jointStates: (placedId: string) => JointUiState[];
  /** 관절 조작 gizmo — placement가 레이캐스트로 집고, 스토어가 표시/숨김을 준다. */
  jointGizmo: JointGizmo;
  /** 회전 링 gizmo — 관절 gizmo와 같은 규약(엔진이 기하, placement가 픽·드래그). */
  rotateGizmo: RotateGizmo;
  /** 상판 경계 위반 가이드선 — 엔진이 판정할 때마다 스스로 갱신한다(외부는 표시 대상에서
   *  빼는 데만 쓴다: 편집 전용 표시라 썸네일 캡처에서 숨겨야 한다). */
  boundaryGuide: BoundaryGuide;
  /** 회전 링의 기하 (REQ-SIM-18). 회전이 사용자 소관이 아닌 아이템이면 null —
   *  벽 아이템(yaw가 벽 법선에 종속)·결합 모니터(포즈 주인이 암 FK)·없는 id. */
  rotateHandle: (placedId: string) => RotateHandle | null;
  /** gizmo·드래그용 driver 관절 핸들 (월드 좌표·축). */
  jointHandles: (placedId: string) => JointHandle[];
  clearPlaced: () => void;
  placed: () => PlacedItem[];
  anyCollision: () => boolean;
  /** 경계(지지 파트 이탈) 위반 존재 여부 — 소프트 블록 저장 게이트 입력 */
  anyBoundaryViolation: () => boolean;
  /** 겹침 경고를 세션 한정으로 무시한다 — 판정(`anyCollision`·`item.collided`)은 그대로
   *  돌고 빨강 틴트만 걷힌다. 경계 위반은 무시 대상이 아니다. */
  setCollisionIgnored: (on: boolean) => void;
  surfaceInfo: () => SurfaceInfo;
  /** 가변 발광의 색을 바꾼다. recolorable이 false면 무시된다. */
  setEmitterColor: (itemId: string, hex: string) => void;
  /** 이 아이템의 발광을 켜고 끈다(세션 한정). 발광체가 없으면 no-op. */
  setEmitterOn: (itemId: string, on: boolean) => void;
  /** 선택 아이템의 발광 상태. 발광체가 없으면 null. */
  emitterInfo: (itemId: string) => { recolorable: boolean; color: string; on: boolean } | null;
  /** 모니터 화면에 사용자 사진을 올리거나(`tex`) 절차 기본 화면으로 되돌린다(`null`).
   *  화면 메쉬가 없는 제품이면 no-op. 이전 사진 텍스처는 여기서 해제한다. */
  setScreenPhoto: (itemId: string, tex: THREE.Texture | null) => void;
  /** 선택 아이템의 화면 사진 상태. `supported`는 화면 메쉬 보유 여부(= 절차 생성 모니터). */
  screenInfo: (itemId: string) => { supported: boolean; hasPhoto: boolean } | null;
  /** 램프 밝기 배율 조절 (REQ-SIM-08). 램프가 아니면 no-op. 값은 조절 범위로 클램프된다. */
  setLampBrightnessScale: (itemId: string, scale: number) => void;
  /** 램프 색온도(K) 조절 (REQ-SIM-08). 램프가 아니면 no-op. 값은 조절 범위로 클램프된다. */
  setLampColorTempK: (itemId: string, k: number) => void;
  /** 선택 아이템의 램프 조절 상태. 램프가 아니면 null. */
  lampInfo: (itemId: string) => LampInfo | null;
  /** 저장 응답이 새로 부여한 배치 API id를 아이템에 반영(REQ-SIM-06 저장). 없는 id면 no-op. */
  setBackendId: (itemId: string, backendId: number) => void;
}

export interface PlaceOptions {
  /** 초기 Y축 요 회전(도). 기본 0. 벽 제품은 무시된다 — yaw가 벽에 종속이다. */
  yawDeg?: number;
  /** true면 착지 트윈으로 내려앉는다 (사이드바 드롭 연출). 기본 false. */
  drop?: boolean;
  /** 배치 API에서 불러온 아이템의 실제 id — 불러오기 전용, 신규 배치는 안 넘긴다. */
  backendId?: number;
  /** 벽 배치 전용 — 붙일 벽과 규격 박스 중심 y(m). 벽 제품인데 이걸 안 주면 켜진 벽
   *  중 하나에 상판 높이로 붙는다. 벽 제품이 아니면 무시된다. */
  wall?: { side: WallSide; centerY: number };
  /** 타공판 제품만 — 붙일 호스트와 그 위의 점. 없으면 켜져 있는 패널 중앙에 붙고,
   *  패널조차 없으면 종전대로 상판에 놓는다(아이템을 잃지 않는 쪽으로 물러선다). */
  pegboard?: PegboardHit;
  /** 커서가 모니터 패널을 맞힌 드롭 — 드롭 높이가 패널 상단이 된다 (DERO-591).
   *  상판 스냅을 타는 제품에만 적용된다(바닥·벽·타공판 제품이면 무시). */
  monitorTop?: MonitorTopHit;
}

/** 벽면 위의 한 점 (월드 m). */
export interface WallPoint {
  x: number;
  y: number;
  z: number;
}

/** 벽면 레이캐스트 결과 — 어느 벽의 어느 점인가. */
export interface WallHit extends WallPoint {
  side: WallSide;
}

/** 모니터 레이캐스트 결과 — 어느 모니터의 패널 위 어느 점인가 (DERO-591).
 *  y는 안 담는다: 얹는 높이는 히트 지점이 아니라 **패널 상단**이라 규격에서 나온다. */
export interface MonitorTopHit {
  hostId: string;
  x: number;
  z: number;
}

/** 타공판 부착 레이캐스트 결과 — 어느 호스트 아이템의 어느 점인가 (DERO-518).
 *  `side`는 호스트가 붙어 있는 벽 면이라 부착 아이템이 그대로 물려받는다. */
export interface PegboardHit extends WallPoint {
  hostId: string;
  side: WallSide;
}

// 엔진 벽 면 타입의 정본은 `core/snap.ts`다(순수 클램프 수학이 같은 값을 쓴다). 기존
// 임포트 경로(`scene/scene`)를 유지하려고 여기서 다시 내보낸다 — 저장·API의 대문자
// `WallSide`(`types/placement.ts`)와는 이름만 같은 별개 타입이다.
export type { WallSide };

const COLLIDE_EMISSIVE = 0x7a1f1a;
/** 결합 거절 시 대상 아이템을 충돌색으로 비추는 시간 (ms) — D22 3단계 피드백. */
const REJECT_FLASH_MS = 700;
/** 복제본이 원본과 곧바로 겹치지 않도록 두는 간격 (m). */
const DUPLICATE_GAP_M = 0.01;

/** 상판 4변. 값은 클램프가 그 변 바깥을 물도록 정렬하는 yaw(도)다.
 *  근거(실측): 자산 로컬 -Z가 클램프 물림면이고, 그 면이 규격 depth의 뒤 끝과
 *  일치한다 (monitor-arm-white: mesh_1 후면 z = -0.1928 = -depth/2). yaw θ는
 *  로컬 -Z를 (-sinθ, -cosθ)로 보내므로 뒤(-Z)=0°, 왼쪽(-X)=90°, 앞(+Z)=180°,
 *  오른쪽(+X)=270°. */
const EDGE_YAW = { back: 0, left: 90, front: 180, right: 270 } as const;
type EdgeKey = keyof typeof EDGE_YAW;
/** 변 선택 히스테리시스 (m) — 자석 밴드(부착 0.15/분리 0.20, placement.ts)와 같은 이유:
 *  판단 경계가 책상 대각선이라, 마진 없이는 그 위 한 픽셀 떨림마다 수백 mm 점프 +
 *  180° yaw 플립 + 서버 재확인(confirmMountWithServer)이 번갈아 터진다 (DERO-467). */
const EDGE_STICK_MARGIN_M = 0.05;
/** 그 변에 물리면 스냅이 고정하는 축 — 나머지 축만 벽 클램프를 받는다. */
const EDGE_PINNED_AXIS: Record<EdgeKey, PinnedAxis> = {
  back: 'z',
  front: 'z',
  left: 'x',
  right: 'x',
};

const DEG2RAD = Math.PI / 180;
/** yaw 회전축 (월드 +Y) — 안착 자세 합성에서 매번 새로 만들지 않는다. */
const UP_AXIS = new THREE.Vector3(0, 1, 0);
/** 사용자 pitch 회전축 (아이템 **로컬** X) — yaw 뒤에 곱해 로컬 좌우축이 되게 한다. */
const LOCAL_X_AXIS = new THREE.Vector3(1, 0, 0);

/** 좌·우 벽 평면 x (m) — 벽 메쉬 배치와 하드 클램프가 공유한다 (REQ-SIM-25).
 *  setWallDistance로 사용자가 조정할 수 있어 let. */
let WALL_LEFT_X = -1.55;
let WALL_RIGHT_X = 1.55;

/** 3면 순회용 상수 — 리터럴 배열을 매번 새로 만들지 않는다. */
const WALL_SIDES: readonly WallSide[] = ['left', 'front', 'right'];

/** 벽 거리 입력 클램프 — 책상 반폭보다 좁아지면 벽이 책상을 관통한다. */
const WALL_DISTANCE_MIN_MARGIN_M = 0.05;
const WALL_DISTANCE_MAX_M = 3;

/** 전면 벽 간격(책상 뒷변 기준) 클램프 — 최소 1mm는 z-fighting 방지. */
const FRONT_WALL_GAP_MIN_M = 0.001;
const FRONT_WALL_GAP_MAX_M = 3;
/** 전면 벽 간격 시작값 — 1mm(최소값)로 시작하면 벽이 책상에 딱 붙어 답답하다는 사용자
 *  피드백으로 50mm로 올렸다(2026-08-06). 새 배치와 저장값이 없는 옛 배치가 이 값으로 시작하고,
 *  조정한 값은 `placement_wall.distance_mm`로 저장돼 재로드 때 복원된다(DERO-548). */
const FRONT_WALL_GAP_DEFAULT_M = 0.05;

/** 고스트 프리뷰: 반투명도 + 스냅 링 치수·색. */
const GHOST_OPACITY = 0.45;
const GHOST_RING_COLOR = 0x8b7cf6; // primary(라벤더) — 판정 시맨틱 색과 겹치지 않게
const GHOST_RING_WIDTH_M = 0.006;
const GHOST_RING_LIFT_M = 0.001; // 지지면 위 1mm — z-fighting 방지
/** 톤매핑 노출(CAMERA_EXPOSURE=1/20) 역보상 — 상수색 오버레이 전용. */
const GHOST_EXPOSURE_GAIN = 20;

/** 회전 링: 지지면 위 1mm(고스트 링과 같은 이유 — z-fighting 방지)와 규격 대각 밖 여유(m).
 *  여유가 0이면 링이 아이템 실루엣에 붙어 집을 자리가 안 남는다. */
const ROTATE_RING_LIFT_M = 0.001;
const ROTATE_RING_MARGIN_M = 0.05;

/** [0, 360) 정규화 — 길게 누르면 각도가 무한히 커지므로 한 바퀴로 접는다. */
function normalizeYaw(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 앞뒤 기울기(도) 대칭 한계. HUD 입력 범위와 공유. 75°는 접촉 솔버가 "아이템을 통째로
 *  눕히는 것을 막는다"며 쓴 상한을 계승한 값이다 — 거치대에 세운 태블릿의 실제 각도가
 *  45°를 넘어 종전 한계로는 원하는 자세가 안 나왔다 (ADR-0023 결정 3). */
export const PITCH_LIMIT_DEG = 75;

/** 수동 높이 축의 상한 (mm) — 규격 박스 **밑면**의 절대 높이다(월드 바닥 0 기준).
 *  드롭 순간 지지면 높이로 초기화되고, 그 뒤로는 사용자 값이 정본이다 (ADR-0023 결정 3·4).
 *  상한은 벽 높이(core/snap.ts WALL_HEIGHT_M 2.6m)와 일치 — 종전 1000은 모니터 위 수동
 *  배치(결정 4의 의도된 탈출구)를 막는 자기모순이라 개정했다 (2026-08-11, DERO-588). */
export const LIFT_MAX_MM = 2600;

/** 밑면 절대 높이(mm) 클램프 — 상판 아래로도(홈에 넣으려면 필요하다) 내려갈 수 있다. */
function clampLift(mm: number): number {
  if (!Number.isFinite(mm)) return 0;
  return Math.min(LIFT_MAX_MM, Math.max(0, mm));
}

function clampPitch(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.min(PITCH_LIMIT_DEG, Math.max(-PITCH_LIMIT_DEG, deg));
}

/** 벽 평면 가로 폭(m) — framing 바깥까지 넓혀 어느 프리셋 시점에서도 벽 세로 모서리가
 *  안 보이게 한다(W11). 마감이 부조를 깔 때 읽는 값이라 FinishContext로도 나간다. */
const WALL_WIDTH_SIDE_M = 5.5;
const WALL_WIDTH_FRONT_M = 6.2;

function makeWall(w: number, h: number): THREE.Mesh {
  // 재질은 벽면 마감이 소유한다 — 부팅 직후 applyRoom(기본 방)이 갈아끼우고
  // 여기서 만든 자리표시자를 dispose한다(렌더 전이라 셰이더는 컴파일되지 않는다).
  // 지오메트리는 씬이 소유한다 — 창문이 생기면 syncWindows가 구멍 뚫린 것으로 갈아끼운다.
  const m = new THREE.Mesh(buildWallGeometry(w, h, null), new THREE.MeshStandardNodeMaterial());
  m.receiveShadow = true;
  // 햇살이 창문 구멍으로만 들게 벽이 태양(key) 그림자를 진다 — 광원이 아니라 메쉬의
  // castShadow라 셰이더 재빌드와 무관하고, 창문 없는 방은 태양 세기 0이라 종전과 같다.
  m.castShadow = true;
  return m;
}

/** TEMP(API 기획용, DERO): 배치 변경 시 필드명·값을 실시간 로그 — 저장 API 스펙 확정되면 제거. */
function logPlacementChange(name: string, value: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  console.log(`[placement] ${name}`, value);
}

export function createSimScene(renderer: THREE.WebGPURenderer, assets?: ProductAssets): SimScene {
  const scene = new THREE.Scene();
  const env = setupEnvironment(scene, renderer);

  // --- walls (left / front(far) / right), neutral grey, toggleable ---
  // Walls run wider than the framings so their vertical edges sit outside every
  // preset view — no hard wall/background seam shows past the corner (W11).
  const wallH = WALL_HEIGHT_M; // 벽 아이템 수직 클램프와 같은 값이어야 한다 (core/snap.ts)
  const left = makeWall(WALL_WIDTH_SIDE_M, wallH);
  left.rotation.y = Math.PI / 2;
  left.position.set(WALL_LEFT_X, wallH / 2, 0);
  const front = makeWall(WALL_WIDTH_FRONT_M, wallH); // the far wall the user faces
  front.position.set(0, wallH / 2, -1.0);
  const right = makeWall(WALL_WIDTH_SIDE_M, wallH);
  right.rotation.y = -Math.PI / 2;
  right.position.set(WALL_RIGHT_X, wallH / 2, 0);
  const walls: Record<WallSide, THREE.Mesh> = { left, front, right };
  // 설계 §2.3 — 책상 뒷변과 전면 벽 사이 간격은 기본 50mm(FRONT_WALL_GAP_DEFAULT_M)이고
  // setFrontWallGap으로 사용자가 조정할 수 있어 let. 책상이 아니라 벽을 움직인다
  // (책상을 밀면 배치 좌표계 전체가 이동해 기존 배치·충돌·e2e 좌표가 깨진다).
  let frontGapM = FRONT_WALL_GAP_DEFAULT_M;
  // 마감 상태는 아래 "벽면 마감" 절이 주인이지만 선언은 여기다 — 부팅 중 fitFrontWall이
  // 이 값을 읽으므로(장식 추종) 그보다 뒤에 선언하면 TDZ에 걸린다.
  let currentRoom: RoomConfig = roomConfigForPreset(DEFAULT_ROOM_PRESET_KEY);
  // 면 단위로 갈아 끼우므로 필드만 바뀐다(교체 없음) — applyWallSurface가 유일한 쓰기다.
  const wallDecorDepthM: Record<WallSide, number> = { left: 0, front: 0, right: 0 };
  // 면별 창문 사각형(벽 로컬 m) — syncWindows가 지오메트리와 함께 갱신한다. 벽 포즈
  // 해석(wallPoseAt)이 이 값으로 "중심이 창문 안"인 포즈를 밖으로 민다.
  const wallWindowRect: Record<WallSide, WindowRectM | null> = {
    left: null,
    front: null,
    right: null,
  };
  // 창문에 딸린 것들(창밖 풍경 평면 + 커튼) — **벽 메쉬의 자식**이라 벽이 움직이거나
  // (책상 깊이 추종·벽 거리 조절) 꺼지면 통째로 따라간다. 그 배선이 0줄인 것이 부모를
  // 벽으로 잡은 이유다.
  const wallWindowDressing: Record<WallSide, THREE.Group | null> = {
    left: null,
    front: null,
    right: null,
  };
  let finishDecor: THREE.Group | null = null;
  function fitFrontWall(config: DeskConfig): void {
    const z = -mmToM(config.depthMm) / 2 - frontGapM;
    shiftFinishDecor('front', z - front.position.z);
    front.position.z = z;
  }
  const wallOn: Record<WallSide, boolean> = { left: true, front: true, right: false };
  for (const s of WALL_SIDES) {
    walls[s].visible = wallOn[s];
    scene.add(walls[s]);
  }

  // --- room rig: 중립 고정 베이스. 수치·토글 규약의 정본은 `roomRig.ts`이고
  // 관리자 발광 프리뷰가 같은 모듈을 쓴다(복제하면 두 화면이 갈린다).
  const room = createRoomRig(scene);
  const { setRoomLight } = room;
  // 장식 발광 PointLight 캡 (ADR-0003 결정 6) — 백엔드별 값. 슬롯 풀을 만들 때
  // 필요해 여기서 읽는다(배정 규칙은 아래 reassignEmitterLights).
  const emitterCap = EMITTER_LIGHT_CAP[backendName(renderer)];
  // 광원 슬롯 풀 (DERO-235) — 램프·발광 광원의 유일한 생성 지점이다.
  const lightSlots = createLightSlots(scene, emitterCap, renderer);

  // --- desk ---
  // 기본 책상은 실 카탈로그(DB) 제품을 쓰지 않는다 — 규격 데이터 오류(예: 단위 실수로 10배
  // 작게 들어간 desk row)가 그대로 기본 진입 화면에 성냥갑 책상으로 나타난 전례가 있다
  // (2026-08-01). mock 모드의 로컬 spec('desk-oak-1200')만 시도하고, 그마저 없으면(real
  // 모드는 항상 이 경로) `deskConfig.ts`의 `DEFAULT_CUSTOM_DESK`(프론트 하드코딩 규격)로 만든다.
  const defaultDeskSpec = getProduct('desk-oak-1200');
  let deskConfig: DeskConfig = defaultDeskSpec
    ? deskConfigFromProduct(defaultDeskSpec)
    : DEFAULT_CUSTOM_DESK;
  let desk = buildDesk(deskConfig);
  scene.add(desk);
  fitFrontWall(deskConfig);

  // --- placed items ---
  const placedRoot = new THREE.Group();
  scene.add(placedRoot);
  // 고스트 루트는 컨택트 섀도우 리그보다 먼저 선언해야 한다 — depth pass가
  // 이 그룹을 숨기고 굽기 때문에 TDZ에 걸리면 안 된다.
  const ghostRoot = new THREE.Group();
  ghostRoot.visible = false;
  scene.add(ghostRoot);
  const jointGizmo = createJointGizmo();
  scene.add(jointGizmo.group);
  const rotateGizmo = createRotateGizmo();
  scene.add(rotateGizmo.group);
  const boundaryGuide = createBoundaryGuide();
  scene.add(boundaryGuide.group);
  const items: PlacedItem[] = [];
  let idc = 0;

  // --- contact shadows (three r185 examples/webgpu_shadow_contact pattern) ---
  // One rig per receiving surface (desk top + floor): an orthographic camera at
  // the surface looks straight UP and renders everything within CONTACT_HEIGHT
  // into a small depth render target (opacity = (1-depth)*darkness), then a
  // horizontal plane re-displays that target through a TSL gaussianBlur. The
  // depth pass re-renders ONLY on placement changes (microtask-debounced) — the
  // per-frame cost is just the tiny blur of a 256px target. Grounding for every
  // prop is unified here; lamp SpotLight shadow maps stay as-is (they carry the
  // directional mood shadows, this rig carries the ambient "set down" contact).
  //
  // 벽 아이템(REQ-SIM-02)에는 전용 리그를 붙이지 않는다. makeContactRig는 수평 축이
  // 네 곳(플레인 rotateX·카메라 rotation.x·camera.position.y·plane.position.y)에
  // 하드코딩이라 setExtent로 방향을 못 바꾸고, 리그를 늘리면 renderContactShadows가
  // 리그 수만큼 풀 씬 렌더를 돈다(2개 → 최대 5개). 벽에 붙은 선반은 "얹혀 있다"는
  // 접지 신호가 애초에 필요 없다 (DERO-375 판단).
  const CONTACT_RT_SIZE = 256; // ≤512 budget; soft blobs need no more
  const CONTACT_BLUR = 3.5;
  const CONTACT_DARKNESS = 1;
  const CONTACT_EPS = 0.005; // camera floats 5mm above the receiver so the surface's own coplanar face is clipped, not rendered as full-dark
  const DESK_CONTACT_HEIGHT = 0.35; // m above desk top that still darkens it
  const FLOOR_CONTACT_HEIGHT = 0.45; // catches desk legs; slab top is far outside
  const FLOOR_CONTACT_MARGIN = 0.6; // extra plane width beyond the desk footprint (stays inside the walls)

  const contactDepthMaterial = new THREE.NodeMaterial();
  contactDepthMaterial.colorNode = vec3(0);
  contactDepthMaterial.opacityNode = float(1).sub(depth).mul(CONTACT_DARKNESS);
  contactDepthMaterial.depthTest = false;
  contactDepthMaterial.depthWrite = false;

  interface ContactRig {
    group: THREE.Group;
    camera: THREE.OrthographicCamera;
    rt: THREE.RenderTarget;
    plane: THREE.Mesh;
    setExtent: (w: number, d: number) => void;
  }

  function contactPlaneGeometry(w: number, d: number): THREE.PlaneGeometry {
    return new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2) as THREE.PlaneGeometry;
  }

  function makeContactRig(w: number, d: number, camHeight: number, opacity: number): ContactRig {
    const group = new THREE.Group();
    const rt = new THREE.RenderTarget(CONTACT_RT_SIZE, CONTACT_RT_SIZE, { depthBuffer: true });
    rt.texture.generateMipmaps = false;
    // gaussianBlur reads the texture size at node-build time (example line kept verbatim)
    if (!rt.texture.image) rt.texture.image = { width: CONTACT_RT_SIZE, height: CONTACT_RT_SIZE };

    const mat = new THREE.NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    const blurred = nodeObject(
      gaussianBlur(texture(rt.texture), CONTACT_BLUR, 4, { premultipliedAlpha: false }),
    );
    mat.colorNode = vec3(0);
    mat.opacityNode = blurred.a.mul(opacity);

    const plane = new THREE.Mesh(contactPlaneGeometry(w, d), mat);
    plane.renderOrder = 1;
    plane.scale.y = -1; // example-verbatim: flips the RT mapping to match the up-looking camera
    plane.scale.z = -1;
    plane.position.y = 0.002; // 2mm above the receiver — no z-fighting, behind camera near
    group.add(plane);

    const camera = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0, camHeight);
    camera.rotation.x = Math.PI / 2; // look straight up
    camera.position.y = CONTACT_EPS;
    group.add(camera);

    function setExtent(nw: number, nd: number): void {
      plane.geometry.dispose();
      plane.geometry = contactPlaneGeometry(nw, nd);
      camera.left = -nw / 2;
      camera.right = nw / 2;
      camera.top = nd / 2;
      camera.bottom = -nd / 2;
      camera.updateProjectionMatrix();
    }

    return { group, camera, rt, plane, setExtent };
  }

  const si0 = surfaceInfo();
  const deskContact = makeContactRig(si0.halfW * 2, si0.halfD * 2, DESK_CONTACT_HEIGHT, 0.55);
  deskContact.group.position.y = si0.topY;
  scene.add(deskContact.group);
  const floorContact = makeContactRig(
    si0.halfW * 2 + FLOOR_CONTACT_MARGIN,
    si0.halfD * 2 + FLOOR_CONTACT_MARGIN,
    FLOOR_CONTACT_HEIGHT,
    0.45,
  );
  scene.add(floorContact.group);
  const contactRigs = [deskContact, floorContact];

  function renderContactShadows(): void {
    const prevBackground = scene.background;
    scene.background = null;
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = contactDepthMaterial;
    for (const rig of contactRigs) rig.plane.visible = false;
    // 고스트는 아직 놓인 물건이 아니다 — 그림자를 굽지 않는다 (매 프레임 움직여
    // 어차피 스테일해진다).
    const prevGhostVisible = ghostRoot.visible;
    ghostRoot.visible = false;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.setClearAlpha(0);
    const prevRT = renderer.getRenderTarget();

    for (const rig of contactRigs) {
      renderer.setRenderTarget(rig.rt);
      renderer.clear();
      renderer.render(scene, rig.camera);
    }

    renderer.setRenderTarget(prevRT);
    renderer.setClearAlpha(prevClearAlpha);
    renderer.autoClear = prevAutoClear;
    for (const rig of contactRigs) rig.plane.visible = true;
    ghostRoot.visible = prevGhostVisible;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
  }

  // Debounce: hero population places 6 items in one tick -> a single depth pass.
  let contactPending = false;
  function scheduleContactShadows(): void {
    if (contactPending) return;
    contactPending = true;
    queueMicrotask(() => {
      contactPending = false;
      renderContactShadows();
    });
  }

  /** 켜진 벽만 담은 평면 집합 — 꺼진 벽은 제약 없음. 전면 벽 z는 책상 깊이에
   *  종속(fitFrontWall)이라 캐시하지 않고 매번 읽는다. */
  function activeWallPlanes(): WallPlanes {
    const planes: WallPlanes = {};
    if (wallOn.left) planes.leftX = WALL_LEFT_X;
    if (wallOn.right) planes.rightX = WALL_RIGHT_X;
    if (wallOn.front) planes.frontZ = front.position.z;
    return planes;
  }

  /** 벽 하드 클램프 공통 경로 — 배치·이동·고스트 프리뷰가 같은 좌표를 내야 한다.
   *  기준은 **명목 규격 AABB**다(결정론 우선): 관절 포즈로 삐져나온 팔은 여기서
   *  보지 않고 recomputeCollisions의 소프트 플래그가 맡는다 (rotateItem 미클램프와
   *  같은 철학). */
  function clampToWalls(
    spec: ProductSpec,
    x: number,
    z: number,
    yawDeg: number,
  ): { x: number; z: number } {
    const rect = rotatedFootprintRect(spec, x, z, yawDeg * DEG2RAD);
    return clampCenterToWalls(x, z, rect, activeWallPlanes());
  }

  // --- 벽 배치 (REQ-SIM-02·REQ-ENV-04, `prop.mount_surface = 'WALL'`) ----------
  // 상판 배치와 갈리는 축은 셋이다: y가 저장값이고, yaw가 벽에 종속이고, 지지면
  // 스냅(스태킹·요람)을 안 탄다. 수학은 전부 `core/snap.ts`에 있고 여기는 씬에서
  // 좌표를 꺼내 오는 몫만 한다.

  /** 그 벽의 평면 좌표 (m) — 좌·우는 x, 전면은 z. 전면은 책상 깊이 종속이라 캐시 금지. */
  function wallPlaneCoord(side: WallSide): number {
    if (side === 'left') return WALL_LEFT_X;
    if (side === 'right') return WALL_RIGHT_X;
    return front.position.z;
  }

  /** 벽면 히트 → 규격 박스 중심·자세 (켜진 벽 안쪽 클램프 포함). 현재 마감이 그 면에 깐
   *  장식(슬랫 등) 깊이를 같이 넘긴다 — 장식 없는 계열·면은 0이라 기존과 동일하다.
   *
   *  창문(DERO-511): 포인터 경로는 구멍을 레이캐스트가 통과해 애초에 여기로 못
   *  들어오지만, 히트 없는 배치(기본 부착)·창문 이동 후 재스냅은 좌표가 창문 안일 수
   *  있다 — **모든 벽 포즈가 이 한 함수를 지나므로** 여기서 창문 밖으로 민다. */
  function wallPoseAt(spec: ProductSpec, side: WallSide, hit: WallPoint): WallPose {
    const resolve = (h: WallPoint): WallPose =>
      resolveWallPose(
        spec,
        side,
        wallPlaneCoord(side),
        h,
        activeWallPlanes(),
        wallH,
        wallDecorDepthM[side],
      );
    const pose = resolve(hit);
    const rect = wallWindowRect[side];
    if (!rect) return pose;
    const half = mmToM(spec.widthMm) / 2;
    const inWindow = (p: WallPose): boolean =>
      evictAlongFromWindow(wallAlongOf(side, p.x, p.z), half, p.y, rect) !== null;
    if (!inWindow(pose)) return pose;
    // 퇴거는 고정점이어야 한다 — 코너에 붙은 창문은 벽 클램프가 첫 후보를 도로 창문
    // 안으로 밀어 넣을 수 있어 반대쪽 모서리까지 순서대로 시도한다. 둘 다 실패하면
    // (창문이 클램프 가능 구간 전체를 덮는 퇴화 사례) 마지막 후보의 클램프 결과를 쓴다.
    const candidates = evictAlongCandidates(wallAlongOf(side, pose.x, pose.z), half, pose.y, rect)!;
    let last = pose;
    for (const along of candidates) {
      last = resolve(wallPointAtAlong(side, along, pose.y));
      if (!inWindow(last)) return last;
    }
    return last;
  }

  /** 벽을 안 지정한 배치(라이브러리 클릭 등)가 붙을 벽 — 켜진 벽 중 전면 > 좌 > 우 순.
   *  전부 꺼져 있으면 붙을 데가 없으므로 null이고, 호출부는 종전대로 상판에 놓는다. */
  function defaultWallSide(): WallSide | null {
    return (['front', 'left', 'right'] as WallSide[]).find((s) => wallOn[s]) ?? null;
  }

  /** 벽을 안 지정한 배치의 기본 높이 — 상판에 얹었을 때와 같은 높이로 벽에 붙인다. */
  function defaultWallCenterY(spec: ProductSpec): number {
    return snapCenterY(spec, desk.userData.surfaceTopY as number);
  }

  /**
   * 벽면 레이캐스트 — **켜진 벽만** 본다. `Raycaster.intersectObjects`는 `visible=false`를
   * 무시하지 않아서(src/three/CLAUDE.md) 명시 필터가 없으면 꺼진 벽에 선반이 붙는다
   * (REQ-ENV-04 정면 위반). 벽은 두께 0 단면(FrontSide)이라 방 안에서 쏘면 정상 히트한다.
   */
  function pickWall(raycaster: THREE.Raycaster): WallHit | null {
    const on = WALL_SIDES.filter((s) => wallOn[s]);
    if (!on.length) return null;
    const hit = raycaster.intersectObjects(
      on.map((s) => walls[s]),
      false,
    )[0];
    if (!hit) return null;
    const side = on.find((s) => walls[s] === hit.object);
    return side ? { side, x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
  }

  /** 벽 아이템의 그룹 변환만 적용한다 — 판정·그림자는 부르지 않는다. 부착 체인이
   *  여러 아이템을 한 번에 옮기므로(`resnapPegboardGuests`) 재계산은 마지막에 한 번만
   *  돈다. **y는 여기서 유도하지 않는다**(벽 아이템의 `center.y`는 저장값이다).
   *  그룹 원점은 아이템 바닥면 중심이라 규격 높이의 절반을 내린다. */
  function applyWallTransform(it: PlacedItem): void {
    it.seatedOnId = undefined; // 벽 아이템은 아래 표면에 앉지 않는다
    it.group.position.set(it.center.x, it.center.y - mmToM(it.spec.heightMm) / 2, it.center.z);
    it.group.rotation.set(0, it.yawDeg * DEG2RAD, 0);
  }

  /** 벽 아이템의 그룹 자세·판정 갱신 — 상판 아이템의 `resnap` 자리다. 이 아이템에
   *  붙어 있는 타공판 아이템들도 같이 딸려 온다(안 그러면 판을 옮길 때 후크만 남는다). */
  function applyWallPose(it: PlacedItem): void {
    applyWallTransform(it);
    resnapPegboardGuests(it.id);
    reassignEmitterLights();
    recomputeCollisions();
    scheduleContactShadows();
  }

  function moveItemOnWall(id: string, side: WallSide, hit: WallPoint): boolean {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId || !isWallMounted(it.spec)) return false;
    const pose = wallPoseAt(it.spec, side, hit);
    it.wallSide = side;
    it.center.x = pose.x;
    it.center.y = pose.y;
    it.center.z = pose.z;
    it.yawDeg = pose.yawDeg;
    applyWallPose(it);
    logPlacementChange('moveItemOnWall', {
      id,
      side,
      x: it.center.x,
      y: it.center.y,
      z: it.center.z,
      yawDeg: it.yawDeg,
    });
    return true;
  }

  // --- 타공판 부착 (`prop.mount_surface = 'PEGBOARD'`, DERO-518) --------
  // 벽 아이템 갈래를 그대로 탄다 — y가 저장값이고, yaw가 벽 면에 종속이고, 지지면
  // 스냅을 안 탄다. 갈리는 것은 기준면 하나뿐이다: 벽 평면이 아니라 **호스트 아이템의
  // 앞면**이다. 그래서 붙은 아이템도 `wallSide`를 (호스트에게서 물려받아) 채운다 —
  // 벽 아이템용 분기(resnap·rotateHandle·setWall 거부·상판 경계 제외)가 전부 맞다.

  /** 부착 호스트가 될 수 있는 아이템 — 벽에 붙은 타공판 패널과, **이미 거기 붙어 있는
   *  아이템**(후크). 후자를 후보에 넣는 것이 "후크에 다시 건다"의 구현 전부다.
   *  꺼진 벽 필터가 없는 이유: 꺼진 벽에는 호스트가 존재할 수 없다(`setWall`이 아이템이
   *  붙어 있는 벽의 끄기를 거부한다). */
  function mountHosts(excludeId?: string): PlacedItem[] {
    return items.filter(
      (i) =>
        i.wallSide &&
        (i.pegboardHostId !== undefined || isPegboardProduct(i.spec)) &&
        // 끌고 있는 아이템 자신과 그 자손은 호스트가 될 수 없다. 자기 자신을 안 빼면
        // 후크를 끄는 동안 레이가 그 후크를 먼저 맞혀 이동이 통째로 거부되고(아이템이
        // 커서를 안 따라온다), 자손을 안 빼면 순환 체인이 만들어진다.
        i.id !== excludeId &&
        !(excludeId !== undefined && isPegboardDescendant(i.id, excludeId)),
    );
  }

  /** 부착 수학의 유일한 입력 — 규격 박스다(메쉬 금지, D7). */
  function hostBox(it: PlacedItem): MountHostBox {
    return {
      center: it.center,
      widthMm: it.spec.widthMm,
      depthMm: it.spec.depthMm,
      heightMm: it.spec.heightMm,
    };
  }

  /** 호스트가 **패널이면 그 위 자유 배치**, 이미 붙어 있는 것(후크)이면 **그 자리에
   *  걸린다** — 둘을 가르는 것은 호스트의 `pegboardHostId` 유무다. */
  function pegboardPoseAt(spec: ProductSpec, hit: PegboardHit): WallPose | null {
    const host = items.find((i) => i.id === hit.hostId);
    if (!host?.wallSide) return null;
    return host.pegboardHostId
      ? resolveHookHangPose(spec, host.wallSide, hostBox(host))
      : resolvePegboardPose(spec, host.wallSide, hostBox(host), hit);
  }

  /**
   * 부착 호스트 레이캐스트. 그룹이 아니라 `collider.parts`의 메쉬를 넘긴다 —
   * `intersectObjects`는 `visible=false`를 안 거르므로(src/three/CLAUDE.md) 그룹째
   * 넘기면 숨긴 메쉬가 유효 부착점이 된다.
   */
  function pickPegboard(raycaster: THREE.Raycaster, excludeId?: string): PegboardHit | null {
    const hosts = mountHosts(excludeId);
    if (!hosts.length) return null;
    const hit = raycaster.intersectObjects(
      hosts.flatMap((h) => h.collider.parts.map((p) => p.mesh)),
      false,
    )[0];
    if (!hit) return null;
    const host = hosts.find((h) => h.collider.parts.some((p) => p.mesh === hit.object));
    if (!host?.wallSide) return null;
    return { hostId: host.id, side: host.wallSide, x: hit.point.x, y: hit.point.y, z: hit.point.z };
  }

  /** 호스트를 안 짚은 배치(라이브러리 클릭)가 붙을 자리 — 패널 중앙을 우선한다. */
  function defaultPegboardHit(): PegboardHit | null {
    const hosts = mountHosts();
    const host = hosts.find((h) => !h.pegboardHostId) ?? hosts[0];
    if (!host?.wallSide) return null;
    return { hostId: host.id, side: host.wallSide, ...host.center };
  }

  /** `candidateId`가 `ancestorId`의 부착 자손인가 — 자기 자손에 붙는 순환을 막는다.
   *  없으면 `resnapPegboardGuests`가 무한 재귀한다. */
  function isPegboardDescendant(candidateId: string, ancestorId: string): boolean {
    let cur = items.find((i) => i.id === candidateId);
    while (cur?.pegboardHostId) {
      if (cur.pegboardHostId === ancestorId) return true;
      const nextId: string = cur.pegboardHostId;
      cur = items.find((i) => i.id === nextId);
    }
    return false;
  }

  /** 붙어 있는 아이템을 호스트 기준으로 다시 앉힌다(좌표만, 그룹 변환은 호출자 몫).
   *  호스트가 사라졌으면 false — 그때는 호출자가 종전 벽 갈래로 흘려보낸다. */
  function reseatOnHost(it: PlacedItem): boolean {
    const host = items.find((i) => i.id === it.pegboardHostId);
    if (!host?.wallSide) return false;
    const pose = host.pegboardHostId
      ? resolveHookHangPose(it.spec, host.wallSide, hostBox(host))
      : // 패널이면 지금 좌표를 유지한 채 판 경계로만 다시 민다 — 판이 움직여도
        // 후크가 판 위 같은 상대 자리에 남는 것이 아니라, 판 밖으로 나가지만 않는다.
        resolvePegboardPose(it.spec, host.wallSide, hostBox(host), it.center);
    it.wallSide = host.wallSide;
    it.center.x = pose.x;
    it.center.y = pose.y;
    it.center.z = pose.z;
    it.yawDeg = pose.yawDeg;
    return true;
  }

  /** 이 호스트에 붙어 있는 것들을 전부 다시 앉힌다 — 체인이라 재귀다(판 → 후크 →
   *  걸린 제품). 순환은 `isPegboardDescendant` 게이트가 애초에 못 만들게 막는다. */
  function resnapPegboardGuests(hostId: string): void {
    for (const guest of items) {
      if (guest.pegboardHostId !== hostId) continue;
      if (!reseatOnHost(guest)) continue;
      applyWallTransform(guest);
      resnapPegboardGuests(guest.id);
    }
  }

  function moveItemOnPegboard(id: string, hit: PegboardHit): boolean {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId || !isPegboardMounted(it.spec)) return false;
    if (hit.hostId === id || isPegboardDescendant(hit.hostId, id)) return false;
    const pose = pegboardPoseAt(it.spec, hit);
    if (!pose) return false;
    it.pegboardHostId = hit.hostId;
    it.wallSide = hit.side;
    it.center.x = pose.x;
    it.center.y = pose.y;
    it.center.z = pose.z;
    it.yawDeg = pose.yawDeg;
    applyWallPose(it);
    logPlacementChange('moveItemOnPegboard', {
      id,
      hostId: hit.hostId,
      x: it.center.x,
      y: it.center.y,
      z: it.center.z,
      yawDeg: it.yawDeg,
    });
    return true;
  }

  // --- 모니터 위 얹기 (DERO-591, ADR-0024 결정 4 개정) ------------------
  // 지지면 규칙은 그대로다 — 패널은 여전히 `supportSurfaces`를 안 내놓는다. 같은 XZ에
  // 유효 타깃이 둘(패널 위 / 그 아래 상판)이라 XZ 기반 자동 규칙으로는 의도를 못 가르고,
  // 되돌리면 431 증상 ①②가 그대로 돌아온다. 가르는 것은 **커서 레이**뿐이라 벽·타공판과
  // 같은 규약(`pickWall`·`pickPegboard`)으로 씬이 레이캐스트를 소유한다.

  /**
   * 모니터 레이캐스트 — 커서가 **패널**을 맞혔는가. 그룹이 아니라 `collider.parts`의
   * 메쉬를 넘기는 이유는 `pickPegboard`와 같다(`intersectObjects`는 `visible=false`를
   * 안 거른다 — 암에 결합돼 숨긴 스탠드가 유효 타깃이 되면 안 된다).
   *
   * **스탠드 높이 아래의 히트는 버린다.** 발판·목을 맞힌 커서는 상판 높이를 가리키는
   * 중이고(발판은 이미 지지면이다), 그걸 얹기로 읽으면 목 옆을 지나칠 때마다 아이템이
   * 꼭대기로 튄다 — 431 증상 ②의 재발이다. 경계는 규격·상수 파생이라 메쉬를 안 잰다.
   *
   * **암에 결합된 모니터(`mountedToId`)는 호스트가 아니다** — 결합은 `group`만 옮기고
   * `center`는 결합 전 상판 자세 그대로라(`tryMountMonitor`), 그걸로 얹으면 아이템이
   * 모니터가 있던 옛 자리 허공에 놓인다. `resolveSupportY`가 같은 이유로 같은 필터를 쓴다.
   * 덤으로 "모니터를 든 암을 끌다가 제 모니터 위에 얹히는" 자기참조도 이 필터가 막는다
   * (타공판 함정 ④와 같은 그림).
   */
  function pickMonitorTop(
    raycaster: THREE.Raycaster,
    /** 끌고 있는 아이템 — 자기 자신은 호스트가 될 수 없다. */
    excludeId?: string,
  ): MonitorTopHit | null {
    const hosts = items.filter((i) => i.spec.monitor && !i.mountedToId && i.id !== excludeId);
    if (!hosts.length) return null;
    const hit = raycaster.intersectObjects(
      hosts.flatMap((h) => h.collider.parts.map((p) => p.mesh)),
      false,
    )[0];
    if (!hit) return null;
    const host = hosts.find((h) => h.collider.parts.some((p) => p.mesh === hit.object));
    if (!host) return null;
    const panelBottomY =
      host.center.y - mmToM(host.spec.heightMm) / 2 + mmToM(MONITOR_STAND_HEIGHT_MM);
    if (hit.point.y < panelBottomY) return null;
    return { hostId: host.id, x: hit.point.x, z: hit.point.z };
  }

  /** 얹을 자세 — 호스트가 사라졌으면 null(호출부는 마지막 유효 자세를 지킨다). */
  function monitorTopPoseAt(
    spec: ProductSpec,
    /** 얹을 아이템의 yaw(도) — 클램프 여유가 회전 투영 반폭이라 필요하다. */
    yawDeg: number,
    hit: MonitorTopHit,
  ): { x: number; y: number; z: number } | null {
    const host = items.find((i) => i.id === hit.hostId);
    if (!host?.spec.monitor || host.mountedToId) return null;
    return resolveMonitorTopPose(
      { spec, yawRad: yawDeg * DEG2RAD },
      {
        center: host.center,
        widthMm: host.spec.widthMm,
        heightMm: host.spec.heightMm,
        yawRad: host.yawDeg * DEG2RAD,
      },
      hit,
    );
  }

  /**
   * 얹은 아이템 이동 — 패널 위에서 커서를 따라간다. 벽 갈래와 달리 아이템은 **여전히
   * 평범한 상판 아이템**이다(새 필드가 없다): 높이는 사용자 소유 저장값이라(ADR-0023
   * 결정 4) 여기서 정한 y가 그대로 정본이 되고, `resnap`은 `initHeight` 없이 부른다.
   * 그래서 모니터를 치우거나 옮겨도 얹힌 물건은 그 자리에 남는다 — ADR-0024 결정 6과 같다.
   */
  function moveItemOnMonitorTop(id: string, hit: MonitorTopHit): boolean {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId || it.wallSide || !canRestOnMonitor(it.spec)) return false;
    if (hit.hostId === id) return false;
    const pose = monitorTopPoseAt(it.spec, it.yawDeg, hit);
    if (!pose) return false;
    // 벽 하드 클램프는 얹기에도 그대로 건다 — 벽 관통을 막는 유일한 장치다(DERO-375).
    const clamped = clampToWalls(it.spec, pose.x, pose.z, it.yawDeg);
    it.center.x = clamped.x;
    it.center.y = pose.y;
    it.center.z = clamped.z;
    resnap(it);
    logPlacementChange('moveItemOnMonitorTop', {
      id,
      hostId: hit.hostId,
      x: it.center.x,
      y: it.center.y,
      z: it.center.z,
    });
    return true;
  }

  /**
   * 벽 토글. **그 벽에 붙은 아이템이 있으면 끄지 않고 거부한다** (2026-08-03 박동규 확정,
   * CONTEXT.md D4) — 조용한 삭제·이동·공중 부양보다 거부가 낫다. 반환값이 실제 상태이자
   * 거부 신호다(요청과 다르면 거부된 것). 켜는 방향은 종전대로 무제한이다.
   */
  function setWall(side: WallSide, on: boolean): boolean {
    if (!on && items.some((i) => i.wallSide === side)) return wallOn[side];
    wallOn[side] = on;
    walls[side].visible = on;
    syncFinishDecorVisibility(); // 그 벽의 슬랫·걸레받이도 같이 사라져야 한다
    // 창문 있는 벽을 끄면 창문(벽과 함께 숨음)과 햇살이 같이 사라져야 한다 — 주 창문
    // 선정이 켜진 벽만 보므로 여기서 다시 계산한다(ADR-0030 결정 7).
    syncSun(currentRoom);
    // 토글은 하드 클램프 평면 집합(activeWallPlanes)을 바꾼다 — 이미 놓인 아이템의 좌표는
    // 다음 이동·재스냅에서 새 평면을 받는다. 벽 소프트 판정(경고·저장 게이트)은 2026-08-03에
    // 제거됐으므로 여기 재판정이 보는 것은 상판 경계뿐이다.
    recomputeCollisions();
    return on;
  }
  const wallState = (): Record<WallSide, boolean> => ({ ...wallOn });

  // --- 벽면 마감 (ADR-0030, ADR-0021 결정 1·2·6 계승) -------------------------
  // 벽 3면 + ground의 룩은 `three/finishes/`의 계열 모듈이 **면마다 따로** 정한다. 마감은
  // **재질과 연속 부조만** 만든다 — 벽·바닥의 position/scale/visible은 씬 단독 소유다(벽
  // 메쉬를 raycast해 벽걸이 배치점을 잡고, 벽 좌표가 충돌 클램프 평면이며, 전면 벽 z는
  // 책상 깊이를 추종한다. 창문 개구부도 씬이 뚫는다). 광원 추가도 금지다(창구는
  // lightSlots.ts 하나, EMITTER_LIGHT_CAP).
  // 상태(`currentRoom`·`finishDecor`)는 부팅 순서 때문에 벽 생성부에 선언돼 있다.

  /** 장식 중 어느 벽에 속한 것(`userData.wallSide`)은 그 벽의 표시 상태를 따라간다 —
   *  꺼진 벽에 슬랫이 남으면 그 면 너머에서 들여다보는 카메라(기본값 우측 벽 OFF + hero
   *  시점이 정확히 그렇다)에서 방 전체가 가려진다. */
  function syncFinishDecorVisibility(): void {
    if (!finishDecor) return;
    for (const o of finishDecor.children) {
      const side = o.userData.wallSide as WallSide | undefined;
      if (side) o.visible = wallOn[side];
    }
  }

  /** 벽이 움직이면 그 벽의 장식도 같이 옮긴다. 마감을 다시 만들지 않는 이유는 재빌드가
   *  셰이더 재컴파일이라 거리 슬라이더·책상 변경마다 스톨이 되기 때문이다. 좌·우 벽은 x,
   *  전면 벽은 z만 변한다(`wallPlaneCoord`와 같은 축). */
  function shiftFinishDecor(side: WallSide, delta: number): void {
    if (!finishDecor || delta === 0) return;
    for (const o of finishDecor.children) {
      if (o.userData.wallSide !== side) continue;
      if (side === 'front') o.position.z += delta;
      else o.position.x += delta;
    }
  }

  /** 마감이 받는 씬 정보 — 전면 벽 z는 책상 깊이 종속이라 매번 새로 읽는다(캐시 금지). */
  function finishContext(): FinishContext {
    return {
      wallHeightM: wallH,
      wallWidthM: {
        left: WALL_WIDTH_SIDE_M,
        front: WALL_WIDTH_FRONT_M,
        right: WALL_WIDTH_SIDE_M,
      },
      wallPlaneCoord: { left: WALL_LEFT_X, front: front.position.z, right: WALL_RIGHT_X },
      groundSizeM: GROUND_SIZE_M,
      // 마감은 이 값으로 개구부를 안 덮기만 한다 — 구멍은 여전히 씬이 뚫는다(ADR-0030 결정 5).
      // `syncWindows`가 `applyRoom` 안에서 먼저 도므로 여기 값은 항상 이번 방의 것이다.
      windowRectM: { ...wallWindowRect },
    };
  }

  /** 그 표면 하나의 마감이 같은가 — 면 단위 diff의 기준이다. 창문·시간대는 여기서 안 본다
   *  (창문은 지오메트리라 재질 재컴파일이 필요 없다 — syncWindows가 따로 맡는다). */
  function sameFinish(a: FinishConfig, b: FinishConfig): boolean {
    return a.material === b.material && a.variant === b.variant;
  }

  // --- 창문 개구부 (ADR-0030 결정 5·6·7, DERO-511) ------------------------
  // 창문은 벽 지오메트리의 **진짜 구멍**이다 — pickWall 레이캐스트가 구멍을 통과하므로
  // 벽걸이 배치가 자동으로 창문을 피한다(판정 코드 0줄). 순수 수학은 core/window.ts.

  function wallWidthOf(side: WallSide): number {
    return side === 'front' ? WALL_WIDTH_FRONT_M : WALL_WIDTH_SIDE_M;
  }

  /** 월드 → 벽 로컬 수평 좌표(그 벽을 바라봤을 때 오른쪽 +, 벽 메쉬 중심 기준).
   *  세 면 모두 지오메트리 로컬 +x와 같은 축이다(벽 회전이 그렇게 세워져 있다). */
  function wallAlongOf(side: WallSide, x: number, z: number): number {
    if (side === 'front') return x;
    return side === 'left' ? -z : z;
  }

  /** 벽 로컬 수평 좌표 → 그 벽 평면 위 월드 점 (y는 호출부가 준다). */
  function wallPointAtAlong(side: WallSide, along: number, y: number): WallPoint {
    if (side === 'front') return { x: along, y, z: front.position.z };
    return { x: wallPlaneCoord(side), y, z: side === 'left' ? -along : along };
  }

  function sameWindow(a?: WallWindowConfig, b?: WallWindowConfig): boolean {
    if (!a || !b) return !a && !b;
    return (
      a.centerXMm === b.centerXMm &&
      a.centerYMm === b.centerYMm &&
      a.widthMm === b.widthMm &&
      a.heightMm === b.heightMm
    );
  }

  /** 창문 위치가 바뀐 면의 벽걸이 아이템이 창문 뒤에 남지 않게 민다. 기준은 아이템
   *  **중심**이다 — 부착 자체가 중심 레이캐스트라 퇴거도 같은 기준이라야 일관된다.
   *  타공판 게스트는 호스트를 따라가고, 새 좌표는 기존 벽 포즈 경로(클램프 포함)를 탄다. */
  function evictWallItemsFromWindow(side: WallSide, rect: WindowRectM): void {
    let moved = false;
    for (const it of items) {
      if (it.wallSide !== side || it.pegboardHostId || it.mountedToId) continue;
      const along = wallAlongOf(side, it.center.x, it.center.z);
      if (evictAlongFromWindow(along, mmToM(it.spec.widthMm) / 2, it.center.y, rect) === null)
        continue;
      // 실제 좌표는 공통 벽 포즈 경로가 낸다 — 퇴거와 벽 클램프가 한 번에 적용된다.
      const pose = wallPoseAt(it.spec, side, {
        x: it.center.x,
        y: it.center.y,
        z: it.center.z,
      });
      it.center.x = pose.x;
      it.center.y = pose.y;
      it.center.z = pose.z;
      it.yawDeg = pose.yawDeg;
      applyWallTransform(it);
      resnapPegboardGuests(it.id);
      moved = true;
    }
    if (moved) {
      reassignEmitterLights();
      recomputeCollisions();
      scheduleContactShadows();
    }
  }

  /** 바뀐 면만 벽 지오메트리를 다시 뚫는다 — 지오메트리는 셰이더 해시가 아니라 재빌드
   *  스톨이 없다. `currentRoom`이 이전 상태이므로 반드시 그것을 갱신하기 **전에** 부른다.
   *  반환값은 창문이 바뀐 면들이다 — 마감 부조가 개구부를 피해 서므로(`finishes/parts.ts`
   *  `buildSlats`) 마감이 그대로여도 그 면은 다시 세워야 한다. */
  function syncWindows(next: RoomConfig): WallSide[] {
    const changed: WallSide[] = [];
    for (const s of WALL_SIDES) {
      const win = next.walls[s].window;
      if (sameWindow(currentRoom.walls[s].window, win)) continue;
      const rect = win ? windowRectM(win, wallWidthOf(s), wallH) : null;
      wallWindowRect[s] = rect; // 퇴거·기본 부착이 보는 값 — 지오메트리와 같은 시점에 갱신
      walls[s].geometry.dispose();
      walls[s].geometry = buildWallGeometry(wallWidthOf(s), wallH, rect);
      syncWindowDressing(s, rect);
      if (rect) evictWallItemsFromWindow(s, rect);
      changed.push(s);
    }
    return changed;
  }

  /** 그 면의 창밖 포털·개구부 마감·블라인드를 새 창문 사각형에 맞춰 다시 짓는다. 창문이
   *  없어지면 지운다. 창문이 바뀐 면에서만 도므로(`syncWindows`의 diff 안이다) 마감 그리드를
   *  훑어도 안 돈다. */
  function syncWindowDressing(side: WallSide, rect: WindowRectM | null): void {
    const prev = wallWindowDressing[side];
    if (prev) {
      walls[side].remove(prev);
      disposeParametric(prev); // 드레싱은 항상 절차 생성(GLB·텍스처 파일 0)
      wallWindowDressing[side] = null;
    }
    if (!rect) return;
    const dressing = new THREE.Group();
    // 햇살이 오는 쪽 부호 — 좌 벽만 −1이다(`roomRig.SUN_POSITIONS.left`가 −z 쪽이고 좌 벽의
    // along이 −z다). 화면에서 밝은 쪽이 방에 드는 햇살과 반대편이면 즉시 거짓말로 읽힌다.
    dressing.add(buildWindowView(rect, wallH, side === 'left' ? -1 : 1));
    dressing.add(buildWindowTrim(rect, wallH));
    dressing.add(buildBlind(rect, wallH));
    walls[side].add(dressing);
    wallWindowDressing[side] = dressing;
  }

  /** 주 창문(켜진 벽 중 전면 > 좌 > 우)을 태양에 싣는다 — 창문·벽 표시가 바뀔 때마다.
   *  창문이 하나도 안 보이면 햇살 세기 0(광원은 그대로, ADR-0030 결정 7). */
  function syncSun(config: RoomConfig): void {
    room.setSunWindow(
      primaryWindowSide(
        {
          left: !!config.walls.left.window,
          front: !!config.walls.front.window,
          right: !!config.walls.right.window,
        },
        wallOn,
      ),
    );
  }

  /** 그 면의 재질·부조를 갈아 끼우고 이전 것을 dispose한다 — **캐시하지 않는다**(계열별
   *  NodeMaterial 셰이더가 VRAM에 상주하는 것을 막는다, ADR-0021 결정 6 유지). 반환값은
   *  부조 깊이가 바뀌었는지다 — 벽 아이템 재스냅 대상을 그 면으로 좁히는 데 쓴다. */
  function applyWallSurface(side: WallSide, config: WallConfig, ctx: FinishContext): boolean {
    const surface = buildWallSurface(config, side, ctx);

    const prevMaterial = walls[side].material as THREE.Material;
    walls[side].material = surface.material;
    prevMaterial.dispose();

    const prevDecor = finishDecor!.children.find((o) => o.userData.wallSide === side);
    if (prevDecor) {
      finishDecor!.remove(prevDecor);
      disposeParametric(prevDecor); // 마감 장식은 항상 절차 생성(GLB·텍스처 파일 0)
    }
    // 장식은 충돌·호환 판정에 들어가지 않는다 — 계열 작성자가 빼먹어도 엔진이 보장한다.
    surface.decor.traverse((o) => {
      o.raycast = () => {};
    });
    surface.decor.visible = wallOn[side]; // 꺼진 벽의 장식이 남으면 방 전체를 가린다
    finishDecor!.add(surface.decor);

    const depthChanged = wallDecorDepthM[side] !== surface.decorDepthM;
    wallDecorDepthM[side] = surface.decorDepthM;
    return depthChanged;
  }

  /** 방 전환의 단일 창구 — **바뀐 표면만 다시 짓는다.** 마감 그리드는 클릭해 훑는 UI라
   *  바닥 변형 하나를 눌렀는데 벽 슬랫 ~140개가 다시 서고 계열 NodeMaterial이 세 벌 다시
   *  컴파일되면 클릭마다 스톨이다. 면 단위 diff 모양은 `syncWindows`와 같다. */
  function applyRoom(config: RoomConfig): void {
    // 시간대는 광원을 새로 만들지 않는다 — roomRig의 key(태양)와 환경 스케일만 움직인다
    // (ADR-0030 결정 7). 방 조명 on/off는 별개 축이라 여기서 건드리지 않는다.
    room.setTimeOfDay(config.timeOfDay);
    // 창밖 풍경도 같은 축이다 — 유니폼 하나라 주·야 전환이 재질을 다시 짓지 않는다.
    setWindowNight(config.timeOfDay === 'NIGHT');
    // 창문도 재질이 아니라 지오메트리·태양 유니폼이다 — 표면 조기 반환보다 먼저,
    // currentRoom 갱신보다 먼저(이전 창문과의 diff가 재빌드 대상을 정한다).
    const windowChanged = syncWindows(config);
    syncSun(config);

    // 부팅 첫 호출 — 그때는 벽이 아직 마감 재질을 못 받았고 담을 그룹도 없다.
    const boot = !finishDecor;
    if (!finishDecor) {
      finishDecor = new THREE.Group();
      scene.add(finishDecor);
    }

    // 마감이 그대로인 표면은 건드리지 않는다 — 계열 NodeMaterial을 새로 컴파일하면 시간대를
    // 토글할 때마다(사용자 스토리 37) · 바닥 변형을 클릭할 때마다 셰이더 스톨이 난다.
    const ctx = finishContext();
    const resnapSides: WallSide[] = [];
    for (const s of WALL_SIDES) {
      // 창문이 바뀐 면은 마감이 그대로여도 다시 세운다 — 슬랫이 개구부를 피해 서기 때문이다.
      if (!boot && sameFinish(currentRoom.walls[s], config.walls[s]) && !windowChanged.includes(s))
        continue;
      if (applyWallSurface(s, config.walls[s], ctx)) resnapSides.push(s);
    }
    if (boot || !sameFinish(currentRoom.floor, config.floor)) {
      const prevGround = env.ground.material as THREE.Material;
      env.ground.material = buildFloorMaterial(config.floor, ctx);
      prevGround.dispose();
    }

    currentRoom = config;
    // 벽 장식 두께가 계열마다 다르다(우드 슬랫 14mm vs 페인트 0mm) — 이미 붙어 있는 벽
    // 아이템도 다시 스냅해야 한다. 안 그러면 얇은 제품(타공판 등)이 방금 생긴 슬랫 뒤에
    // 파묻힌 채로 남는다(2026-08-06). resnap이 wallPoseAt을 다시 불러 새 decorDepthM으로
    // 앞면 여유를 재계산한다. **두께가 실제로 바뀐 면만** 돈다 — 벽 아이템 재스냅은 타공판
    // 게스트 재귀·충돌 재계산까지 끌고 오므로 다른 면 클릭에 딸려오면 안 된다.
    for (const it of items) if (it.wallSide && resnapSides.includes(it.wallSide)) resnap(it);
  }

  // 부팅 첫 적용 — **`currentRoom`을 그대로 넘기면 안 된다.** `syncWindows`는 이전 상태
  // (`currentRoom`)와의 diff로 뚫을 면을 정하는데, 같은 객체를 넘기면 자기 자신과 비교돼
  // 창문이 하나도 안 뚫린다. 지금은 기본 프리셋에 창문이 없어 증상이 없지만 창문 있는
  // 프리셋이 기본이 되면 그 벽이 창문 없이 열린다(사용자가 그 면을 건드려야 낫는다).
  // 그래서 창문을 뺀 상태에서 출발한다.
  const bootRoom = currentRoom;
  currentRoom = {
    ...bootRoom,
    walls: {
      left: { ...bootRoom.walls.left, window: undefined },
      front: { ...bootRoom.walls.front, window: undefined },
      right: { ...bootRoom.walls.right, window: undefined },
    },
  };
  applyRoom(bootRoom);

  function setWallDistance(side: 'left' | 'right', distanceM: number): number {
    const minM = (desk.userData.surfaceHalfWidth as number) + WALL_DISTANCE_MIN_MARGIN_M;
    const clamped = Math.min(Math.max(distanceM, minM), WALL_DISTANCE_MAX_M);
    if (side === 'left') {
      shiftFinishDecor('left', -clamped - WALL_LEFT_X);
      WALL_LEFT_X = -clamped;
      left.position.x = WALL_LEFT_X;
    } else {
      shiftFinishDecor('right', clamped - WALL_RIGHT_X);
      WALL_RIGHT_X = clamped;
      right.position.x = WALL_RIGHT_X;
    }
    // 벽이 움직였으면 그 벽에 붙은 아이템도 같이 따라가야 한다 — 안 그러면 선반이 벽에서
    // 떨어져 공중에 남는다. (전면 벽은 책상 깊이 종속이지만 setDesk가 clearPlaced를 부르므로
    // 같이 옮길 아이템이 남지 않는다.)
    for (const it of items) if (it.wallSide === side) resnap(it);
    // 거리를 좁히면 그 밖에 놓인 아이템이 즉시 소프트 플래그로 잡혀야 한다 (D22와 동일 철학).
    recomputeCollisions();
    return clamped;
  }
  const wallDistance = (): Record<'left' | 'right', number> => ({
    left: -WALL_LEFT_X,
    right: WALL_RIGHT_X,
  });

  /** 전면 벽 간격(책상 뒷변 기준, m) 조정 — 좌/우와 달리 책상 중심이 아니라 뒷변 기준이다
   *  (전면 벽 z가 책상 깊이 종속이라 중심 기준 값은 책상마다 달라져 사용자에게 어색하다).
   *  책상 변경(fitFrontWall)에도 간격이 유지된다. 반환값은 실제 적용된 간격(클램프 후). */
  function setFrontWallGap(gapM: number): number {
    frontGapM = Math.min(Math.max(gapM, FRONT_WALL_GAP_MIN_M), FRONT_WALL_GAP_MAX_M);
    fitFrontWall(deskConfig);
    // 좌/우 setWallDistance와 같은 이유 — 벽에 붙은 아이템 추종 + 소프트 플래그 갱신.
    for (const it of items) if (it.wallSide === 'front') resnap(it);
    recomputeCollisions();
    return frontGapM;
  }
  const frontWallGap = (): number => frontGapM;

  function surfaceInfo(): SurfaceInfo {
    return {
      topY: desk.userData.surfaceTopY as number,
      halfW: desk.userData.surfaceHalfWidth as number,
      halfD: desk.userData.surfaceHalfDepth as number,
    };
  }

  function tintMesh(mesh: THREE.Mesh, on: boolean): void {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mm = m as THREE.MeshStandardNodeMaterial;
      if (!mm || !mm.emissive) continue;
      if (mm.userData._origEmissive === undefined) {
        mm.userData._origEmissive = mm.emissive.getHex();
        mm.userData._origEmissiveI = mm.emissiveIntensity;
      }
      if (on) {
        mm.emissive.setHex(COLLIDE_EMISSIVE);
        mm.emissiveIntensity = 12; // physical-lumen scale (renderer CAMERA_EXPOSURE)
      } else {
        mm.emissive.setHex(mm.userData._origEmissive as number);
        mm.emissiveIntensity = mm.userData._origEmissiveI as number;
      }
      // 지금 틴트가 emissive를 쥐고 있는지 — 발광 리컬러가 라이브 값을 덮어써서
      // 빨강 경고를 지우지 않게 하는 표시 (틴트 동작 자체는 위와 동일하다).
      mm.userData._tinted = on;
    }
  }

  /** 충돌 무시 토글(세션 한정) — 판정을 끄는 게 아니라 틴트만 걷는다. `it.collided`와
   *  `anyCollision()`은 계속 진실이라 e2e 수용 기준(collision-overhaul.spec.ts)이 그대로
   *  성립한다. 저장 게이트·경고 배너 쪽 게이트는 스토어가 이 플래그의 사본으로 건다. */
  let collisionIgnored = false;
  function setCollisionIgnored(on: boolean): void {
    if (collisionIgnored === on) return;
    collisionIgnored = on;
    // applyTint를 다시 태워 틴트를 걷거나(ON) 실제 위반 상태로 되돌린다(OFF).
    recomputeCollisions();
  }

  /** 관절 에셋: 위반 파트 메쉬만 빨강 (설계 §4) — 겹친 파트 + (경계 위반 시)
   *  지지 파트. 정적 소품: 아이템 전체. */
  function applyTint(it: PlacedItem, hit: Set<ColliderPart>): void {
    // 충돌 축만 무시 대상이다 — 경계 위반(상판 밖·벽 관통)은 계속 빨강이다.
    const collideFlag = it.collided && !collisionIgnored;
    const flagged = collideFlag || it.boundary;
    const partLevel = !!it.joints?.size;
    const supportNames = it.spec.rig?.supportPart
      ? new Set(it.spec.rig.segments[it.spec.rig.supportPart] ?? [])
      : null;
    for (const p of it.collider.parts) {
      const partHit =
        (collideFlag && hit.has(p)) ||
        (it.boundary && !!supportNames && supportNames.has(p.mesh.name));
      tintMesh(p.mesh, flagged && (!partLevel || partHit));
    }
  }

  /** 경계 판정용 지지 footprint — 관절 에셋은 supportPart 세그먼트의 월드 OBB,
   *  정적 소품은 자기 규격 footprint (설계 §3.4). `rigBased`는 앞쪽 경로를 탔는지로,
   *  경계 관용치를 가른다 — 관절 에셋은 상판 변에 물리는 것이 정상 자리라 여유가 없다. */
  function supportRect(it: PlacedItem): { rect: RectXZ | null; rigBased: boolean } {
    const rig = it.spec.rig;
    if (rig?.supportPart && it.joints) {
      const names = new Set(rig.segments[rig.supportPart] ?? []);
      const parts = it.collider.parts.filter((p) => names.has(p.mesh.name));
      if (parts.length) return { rect: footprintRectXZ(parts), rigBased: true };
    }
    return {
      rect: rotatedFootprintRect(it.spec, it.center.x, it.center.z, it.yawDeg * DEG2RAD),
      rigBased: false,
    };
  }

  /** 결합된 모니터와 그 암, 그리고 타공판 호스트와 거기 붙은 아이템은 서로 맞닿아 있는
   *  게 정상이다 — 이 쌍만 겹침에서 뺀다. 후크는 뒷면이 판 앞면에 정확히 맞물리므로
   *  안 빼면 부동소수 오차 하나로 판과 후크가 늘 빨강이 된다. */
  function isMountPair(a: PlacedItem, b: PlacedItem): boolean {
    return (
      a.mountedToId === b.id ||
      b.mountedToId === a.id ||
      a.pegboardHostId === b.id ||
      b.pegboardHostId === a.id
    );
  }

  /** 얹힘으로 볼 "밑면이 상대 박스 상단 **근처**"의 여유 (m). 기울인 아이템의 규격 박스
   *  밑면이 지지면보다 조금 뜨는 경우까지 얹힘으로 본다. 임계값 자체는 ADR-0023 범위
   *  밖이라 시각 QA로 조정할 여지가 있는 값이다. */
  const STACK_NEAR_M = 0.005;

  /**
   * 이 아이템이 얹혀 있는 아이템 — **런타임 추론이고 저장하지 않는다** (ADR-0023 결정 5).
   * 규칙: XZ 규격 footprint가 겹치고, 내 규격 박스 **밑면**이 상대 박스 상단 근처/아래이며
   * 상대 밑면보다는 위 → 그 위에 얹혔거나 홈에 들어간 것이다. 후보가 여럿이면 가장 높은
   * 박스를 고른다.
   *
   * 이 추론은 **자세를 정하지 않는다 — 경고만 정한다.** 틀려도 아이템 위치는 사용자가 준
   * 값 그대로라, 자세를 계산하던 두 세대(cradle 휴리스틱·접촉 솔버)를 반려시킨 실패 모드가
   * 여기서는 재현되지 않는다.
   */
  function inferSeatedOnId(it: PlacedItem): string | undefined {
    if (it.mountedToId || it.wallSide) return undefined;
    const myBase = it.center.y - mmToM(it.spec.heightMm) / 2;
    const myRect = rotatedFootprintRect(it.spec, it.center.x, it.center.z, it.yawDeg * DEG2RAD);
    let bestId: string | undefined;
    let bestTop = -Infinity;
    for (const other of items) {
      if (other.id === it.id || other.mountedToId || other.wallSide) continue;
      const half = mmToM(other.spec.heightMm) / 2;
      const otherTop = other.center.y + half;
      const otherBase = other.center.y - half;
      if (myBase > otherTop + STACK_NEAR_M || myBase <= otherBase) continue;
      const rect = rotatedFootprintRect(
        other.spec,
        other.center.x,
        other.center.z,
        other.yawDeg * DEG2RAD,
      );
      if (!rectsOverlapXZ(myRect, rect)) continue;
      if (otherTop > bestTop) {
        bestTop = otherTop;
        bestId = other.id;
      }
    }
    return bestId;
  }

  /** 얹힌 아이템과 그 받침은 서로 파묻히는 게 정상이다 — 결합 쌍과 같은 규약으로 겹침에서
   *  뺀다. 안 빼면 홈에 넣은 아이패드가 항상 빨강이 된다 (REQ-SIM-24, ADR-0023 결정 5). */
  function isSeatPair(a: PlacedItem, b: PlacedItem): boolean {
    return a.seatedOnId === b.id || b.seatedOnId === a.id;
  }

  function recomputeCollisions(): void {
    // 얹힘은 매번 다시 추론한다 — 저장하지 않으므로 로드 시에도 같은 규칙이 돈다.
    for (const it of items) it.seatedOnId = inferSeatedOnId(it);
    const hits = new Map<PlacedItem, Set<ColliderPart>>();
    for (const it of items) hits.set(it, new Set());
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (isMountPair(items[i], items[j]) || isSeatPair(items[i], items[j])) continue;
        const r = collideItems(items[i].collider, items[j].collider);
        for (const p of r.a) hits.get(items[i])!.add(p);
        for (const p of r.b) hits.get(items[j])!.add(p);
      }
    }
    const info = surfaceInfo();
    const deskRect: RectXZ = {
      minX: -info.halfW,
      maxX: info.halfW,
      minZ: -info.halfD,
      maxZ: info.halfD,
    };
    /** 첫 위반 아이템의 판정 사각형 — 가이드선 입력(재계산 없이 루프에서 받아둔다). */
    let violRect: RectXZ | null = null;
    for (const it of items) {
      it.collided = hits.get(it)!.size > 0;
      // 결합된 모니터는 암에 매달려 있다 — 상판·벽 경계 판정 대상이 아니다 (D22).
      if (it.mountedToId) {
        it.boundary = false;
        applyTint(it, hits.get(it)!);
        continue;
      }
      const { rect, rigBased } = supportRect(it);
      // 바닥 제품(FLOOR)은 책상 밑·옆이 정당한 자리라 상판 경계 판정에서 빠진다 —
      // 안 빼면 책상 밑 풋레스트가 항상 빨강이 되고 저장이 막힌다 (core/snap.ts).
      // 관용치는 경로별로 다르다 — 정적 소품 2mm, 관절 에셋은 엣지 스냅이 물림 면을
      // 정확히 변 위에 놓아 산술 노이즈만 흡수하는 0.1mm (core/snap.ts, DERO-467).
      const deskViol = violatesDeskBoundary(
        it.spec,
        rect,
        deskRect,
        rigBased ? RIG_BOUNDARY_EPS_M : DESK_BOUNDARY_EPS_M,
      );
      // 벽 소프트 판정(경고 + 저장 게이트)은 없다 — 2026-08-03 박동규 승인으로
      // 제거했다. 상판 경계는 지지 파트(클램프)만 보고 머리 캔틸리버를 허용하는데
      // (D22 지지 파트 경계 규칙) 벽만 전 파트 footprint를 봐서 두 규칙이 어긋났고,
      // 책상 뒷변에 물린 모니터암의 VESA 판이 벽을 살짝 넘는 정상 배치가 경고·저장
      // 거부로 잡혔다. 벽 관통 자체는 배치·이동 경로의 하드 클램프
      // (clampToWalls·clampCenterToWallsAlongEdge)가 계속 막는다 (REQ-SIM-25).
      it.boundary = deskViol;
      if (deskViol && !violRect) violRect = rect;
      applyTint(it, hits.get(it)!);
    }
    // 왜 걸렸는지 보여준다 — 판정 입력은 화면 실루엣이 아니라 규격 박스라(모니터 스탠드
    // 발판, GLB 균일 스케일의 남는 깊이) 선 없이는 "여유 있어 보이는데 빨강"으로 읽힌다.
    if (violRect) boundaryGuide.show(deskRect, violRect, info.topY);
    else boundaryGuide.hide();
  }

  /** 거절 틴트는 충돌 틴트를 잠깐 빌려 쓴다 — 자체 백업을 두지 않고 만료 시
   *  recomputeCollisions()의 applyTint가 실제 충돌·경계 상태로 다시 칠해 복원한다.
   *  (자체 백업을 두면 그 사이 진짜 충돌이 나도 만료 때 되돌려 버린다.) */
  const rejectFlashTimers = new Map<string, number>();
  function flashReject(itemId: string): void {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    const prev = rejectFlashTimers.get(itemId);
    if (prev !== undefined) window.clearTimeout(prev);
    for (const p of it.collider.parts) tintMesh(p.mesh, true);
    rejectFlashTimers.set(
      itemId,
      window.setTimeout(() => {
        rejectFlashTimers.delete(itemId);
        recomputeCollisions();
      }, REJECT_FLASH_MS),
    );
  }

  /**
   * 드롭 순간의 **지지면 높이** (m) — 아래 아이템이 내놓은 지지면(`supportSurfaces`) 중
   * 최상단, 없으면 기준면 (ADR-0023 결정 1, DERO-431 개정). 실메쉬 형상은 읽지 않는다.
   *
   * **아이템 하나가 지지면 하나라고 가정하지 말 것** — 모니터는 규격 박스 통짜가 아니라
   * 스탠드 발판만 내놓는다(패널은 안 내놓는다). 통짜로 되돌리면 모니터 밑에 받침대를 넣을
   * 수 없고 목 옆 소품이 모니터 꼭대기로 튄다 (`core/snap.ts` `supportSurfaces`).
   *
   * **게이트가 없다** — 카테고리 표(`CRADLE_ACCEPTS`)도 `stackable`도 안 본다(결정 8).
   * XZ에서 규격 footprint가 겹치는 배치 아이템 전부가 후보다. 이동 시 자기 자신은
   * 제외해야 자기 위에 얹히는 자기참조 스택이 생기지 않는다.
   *
   * **후보는 배치면이 같은 아이템뿐이다** (`sharesMountPlane`, DERO-517). 바닥
   * 제품끼리는 얹힌다 — 러그 위 의자는 러그 상단에서 시작해야 얹힘으로 잡혀 겹침 경고에서
   * 빠진다. 배치면을 섞으면 상판 위 아이템의 박스 상단이 바닥 제품의 기준 y를 덮어써서
   * 도로 상판으로 올라간다(2026-08-03 실측 함정) — 그 방지가 이 필터다.
   * **벽 제품(`'WALL'`)은 애초에 이 경로로 안 들어온다**(placeAt·resnap이 벽 갈래로
   * 빠진다) — 그래도 게이트를 남겨 둔다.
   *
   * 이 값은 **초기값일 뿐**이다: 얹은 뒤 높이는 사용자가 정한다(결정 4 — 받침을 치워도 위
   * 아이템은 그 자리에 남는다). `resnap`은 `opts.initHeight`일 때만 y를 다시 유도하고,
   * 이동 경로는 **얹혀 있던 아이템에만** 그 옵션을 준다(`seatedOnSupport`).
   */
  function resolveSupportY(
    spec: ProductSpec,
    cx: number,
    cz: number,
    yawDeg: number,
    excludeId?: string,
  ): number {
    const base = baseSupportY(spec, desk.userData.surfaceTopY as number);
    if (isWallMounted(spec)) return base;
    const itemRect = rotatedFootprintRect(spec, cx, cz, yawDeg * DEG2RAD);
    const supports = items
      .filter(
        (i) =>
          i.id !== excludeId && !i.mountedToId && !i.wallSide && sharesMountPlane(spec, i.spec),
      )
      .flatMap((i) => supportSurfaces(i.spec, i.center, i.yawDeg * DEG2RAD));
    return supportTopY(itemRect, base, supports);
  }

  /**
   * 지금 지지면에 얹혀 있는가 — **이동 시 다시 앉힐지 가르는 유일한 조건**이다. 띄우거나
   * 파묻은 아이템(사용자가 정한 높이)은 false라 이동해도 그 높이를 지킨다 (ADR-0023 결정 4의
   * "자세는 사용자 소관"을 이동 경로에서 유지하는 방법 — 플래그를 새로 두지 않는다).
   *
   * **좌표를 바꾸기 전에 불러야 한다** — 옛 자리의 지지면 기준으로 판정하는 값이다.
   * 낙차(`armClampDropM`)는 `resnap`의 `initHeight` 분기와 같은 식이어야 한다(암이 아니면 0).
   */
  /** 어느 모니터 패널 위에 얹혀 있는가 (DERO-591) — 규칙 정본은 `core/snap.ts`.
   *  이걸 안 세면 패널 위를 스쳐 지나간 아이템이 상판으로 안 내려온다. */
  function onAnyMonitorTop(it: PlacedItem): boolean {
    const rect = rotatedFootprintRect(it.spec, it.center.x, it.center.z, it.yawDeg * DEG2RAD);
    return items.some(
      (m) =>
        m.id !== it.id &&
        m.spec.monitor &&
        !m.mountedToId &&
        restsOnMonitorTop(it, { spec: m.spec, center: m.center, yawRad: m.yawDeg * DEG2RAD }, rect),
    );
  }

  function seatedOnSupport(it: PlacedItem): boolean {
    if (it.wallSide || it.mountedToId) return false;
    if (onAnyMonitorTop(it)) return true;
    const seatY = resolveSupportY(it.spec, it.center.x, it.center.z, it.yawDeg, it.id);
    return restsOnSurface(
      it.center.y,
      it.spec,
      seatY - armClampDropM(it.spec, it.group, it.collider),
    );
  }

  /** 자세(yaw × 사용자 pitch)를 그룹에 적용한다. 회전 중심은 그룹 원점 = 규격 박스
   *  **밑면 중심**이라, 기울이면 아이템이 제 발밑을 축으로 기운다 — 사용자가 준 자세를
   *  보정 없이 그대로 보여준다(ADR-0023 결정 4: 엔진은 자세를 정하지 않는다).
   *
   *  합성 순서는 `yawQuat × pitchQuat`다 — pitch를 yaw 뒤에 곱해 아이템 **로컬** 좌우축을
   *  축으로 삼는다(오더 'YXZ'와 같은 뜻). 기본 'XYZ'는 pitch를 월드 X축으로 먹여서 90°
   *  돌린 아이템이 앞뒤가 아니라 옆으로 기운다 — 에러도 경고도 없는 함정이다. */
  function applyItemPose(group: THREE.Object3D, yawDeg: number, pitchDeg: number): void {
    const yawRad = yawDeg * DEG2RAD;
    const pitchRad = pitchDeg * DEG2RAD;
    if (pitchRad === 0) {
      group.rotation.set(0, yawRad, 0);
      return;
    }
    const q = new THREE.Quaternion().setFromAxisAngle(UP_AXIS, yawRad);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(LOCAL_X_AXIS, pitchRad));
    group.quaternion.copy(q);
  }

  function ensureTemplate(spec: ProductSpec): Promise<ProductSpec> {
    return assets ? assets.ensureTemplate(spec) : Promise.resolve(spec);
  }

  function placeAt(
    spec: ProductSpec,
    x: number,
    z: number,
    opts?: PlaceOptions,
  ): { id: string; collided: boolean } {
    // 벽만 하드(D22, REQ-SIM-25): 켜진 벽 안쪽으로 중심을 클램프한다. 상판 경계는
    // 소프트 블록 그대로 — 캔틸레버는 정당한 배치라 클램프하지 않고, 배치 후 지지
    // 파트 footprint로 판정해 빨강 표시·저장 차단만 한다.
    //
    // 벽 제품(REQ-SIM-02)은 갈래가 다르다: x·z가 벽면에서 나오고 yaw가 벽에 종속이며
    // y는 파생값이 아니라 인자다. 붙일 벽이 하나도 안 켜져 있으면(defaultWallSide null)
    // 붙을 데가 없으므로 종전대로 상판에 놓는다 — 아이템을 잃지 않는 쪽으로 물러선다.
    //
    // 타공판 제품(DERO-518)은 한 칸 더 안쪽이다: 벽이 아니라 **호스트 아이템의
    // 앞면**에 붙는다. 짚은 호스트가 없으면 켜져 있는 패널 중앙에 붙이고, 패널조차
    // 없으면 벽 제품과 같은 규약으로 상판에 놓는다(아이템을 잃지 않는다).
    const pegHit = isPegboardMounted(spec) ? (opts?.pegboard ?? defaultPegboardHit()) : null;
    const pegPose = pegHit ? pegboardPoseAt(spec, pegHit) : null;
    const wallSide = isWallMounted(spec) ? (opts?.wall?.side ?? defaultWallSide()) : null;
    const wallPose = wallSide
      ? wallPoseAt(spec, wallSide, {
          x,
          y: opts?.wall?.centerY ?? defaultWallCenterY(spec),
          z,
        })
      : null;
    // 아래 로직은 "벽 평면에 붙었나"가 아니라 "어딘가에 부착됐나"만 보면 되므로 하나로 묶는다.
    const mountPose = pegPose ?? wallPose;
    // 바닥 제품(의자 등)은 기본 슬롯이 책상 앞이라 그냥 두면 등받이가 책상을 향한다 —
    // yawDeg를 명시하지 않은 배치는 180°(책상 쪽으로 돌아 앉음)를 기본값으로 삼는다
    // (2026-08-06). 명시적으로 넘긴 값(드래그 R키 회전 등)은 항상 우선한다.
    const defaultYawDeg = isFloorMounted(spec) ? 180 : 0;
    const yawDeg = mountPose ? mountPose.yawDeg : normalizeYaw(opts?.yawDeg ?? defaultYawDeg);
    // 커서가 모니터 패널을 맞힌 드롭 (DERO-591) — 부착이 아니라 **얹기**라 자세·클램프
    // 는 평범한 상판 아이템과 같고, 갈리는 것은 좌표와 드롭 높이뿐이다. yaw가 정해진 뒤에
    // 불러야 한다 — 폭 클램프 여유가 그 yaw로 회전 투영한 반폭이다.
    const topPose =
      !mountPose && opts?.monitorTop && canRestOnMonitor(spec)
        ? monitorTopPoseAt(spec, yawDeg, opts.monitorTop)
        : null;
    const clamped = mountPose ?? clampToWalls(spec, topPose?.x ?? x, topPose?.z ?? z, yawDeg);
    // 얹기는 x·z를 끌어당기지 않는다 — 벽 클램프 좌표 그대로다.
    const cx = clamped.x;
    const cz = clamped.z;
    // 그룹 원점(규격 박스 밑면 중심)이 놓일 높이 = **드롭 순간의 지지면**. 이 뒤로는
    // 사용자가 준 높이가 정본이라 `resnap`이 다시 유도하지 않는다 (ADR-0023 결정 4).
    // 벽 아이템은 지지면이 없어 규격 높이에서 곧장 나온다.
    // 모니터 위 얹기(topPose)도 지지면 탐색을 건너뛴다 — 패널은 지지면을 안 내놓으므로
    // 탐색을 태우면 상판 높이가 나온다(=얹기가 무효가 된다).
    const seatY =
      mountPose || topPose
        ? (mountPose ?? topPose!).y - mmToM(spec.heightMm) / 2
        : resolveSupportY(spec, cx, cz, yawDeg);

    // GLB products (preloaded templates) place synchronously like parametric
    // ones; snap/collision below stay spec-DB-driven either way. A missing
    // template (load failure) falls back to the parametric box.
    const inst = spec.glbUrl ? (assets?.instantiate(spec) ?? null) : null;
    const group = inst ? inst.group : buildProp(spec);
    // dispose path marker: GLB clones share geometry/textures with the
    // preloaded template — only their per-instance materials may be freed.
    group.userData.fromGLB = !!inst;
    const collider = buildItemCollider(group);
    applyItemPose(group, yawDeg, 0); // 신규 배치라 pitch는 0이다
    // 상판에 물린 클램프 암만 예외 — 얹지 않고 물림 두께만큼 내린다 (armClampDropM).
    const groundY = seatY - (mountPose || topPose ? 0 : armClampDropM(spec, group, collider));
    const centerY = snapCenterY(spec, groundY);
    group.position.set(cx, groundY, cz);
    placedRoot.add(group);

    // Grounding comes from the shared contact-shadow rigs above (scheduled at
    // the end of placeAt) — no per-item decal, so items read as "set down" (W1)
    // via one unified depth pass instead of stacked radial blobs.

    // 램프 SpotLight를 여기서 만들지 않는 이유: 광원 집합이 상수여야 셰이더가 재빌드되지
    // 않는다 (235). 아래 reassignLampShadows()가 미리 만들어 둔 슬롯에 규격(색온도·lm·
    // reach·배광, 메쉬 치수는 여전히 안 본다)을 싣고 it.light에 그 참조를 넣는다.
    // 전구 글로우는 셰이드 메쉬의 emissive다 (props.ts) — additive 데칼 없음.

    // 장식 발광(ADR-0003): 기능 조명과 나란한 별개 갈래다 — 램프와 따로 판정하는 것이
    // 핵심(`kind`와 무관하게 어떤 제품이든 발광체를 가질 수 있다). 광원은 램프와 같이
    // 슬롯 풀 소유이고(castShadow=false라 그림자 캐스터 캡을 한 칸도 먹지 않는다),
    // 여기서는 슬롯이 따라올 **로컬 위치**와 실효색만 정한다.
    let emitterLocal: THREE.Vector3 | undefined;
    let emitterColor: string | undefined;
    if (spec.emitter) {
      const em = spec.emitter;
      emitterColor = resolveEmitterColor(em); // 배치 직후엔 인스턴스 색이 없다 → defaultColor
      if (em.point) {
        emitterLocal = new THREE.Vector3(em.point[0], em.point[1], em.point[2]);
      } else {
        // 기본값 = bbox 중심(ADR-0003 결정 4). group은 이미 배치·회전된 상태라
        // 월드 박스를 구해 로컬로 되돌린다 — 로컬 오프셋으로 두면 슬롯이 이동·회전을
        // 매 프레임 sync에서 공짜로 따라간다.
        const c = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
        emitterLocal = group.worldToLocal(c);
      }
      // 블룸이 읽는 것은 재질의 emissive 채널이다 — 여기서 안 칠하면 스필만 있고
      // 발광체 자체는 빛나지 않는다.
      applyEmitterEmissive(group, hexToInt(emitterColor));
    }

    const id = `p${++idc}`;
    const it: PlacedItem = {
      id,
      spec,
      group,
      center: { x: cx, y: centerY, z: cz },
      yawDeg,
      // 타공판 아이템은 호스트가 붙어 있는 벽 면을 물려받는다 — 벽 아이템 분기를
      // 그대로 타야 하기 때문이다(resnap·회전 링 제외·벽 끄기 거부).
      wallSide: pegPose ? pegHit!.side : wallPose ? (wallSide ?? undefined) : undefined,
      pegboardHostId: pegPose ? pegHit!.hostId : undefined,
      pitchDeg: 0,
      collider,
      collided: false,
      boundary: false,
      emitterLocal,
      emitterColor,
      joints: inst?.joints,
      backendId: opts?.backendId,
    };
    items.push(it);
    // 클램프 가능한 암은 배치 시점에도 곧바로 가장 가까운 변에 물린다(REQ-SIM-23,
    // 2026-07-28 — moveItem과 같은 앵커 로직 재사용, 항상 고정이라 자유 배치 없음).
    // edgeSnapTarget은 원 요청 좌표(x,z, 벽 클램프 전) 기준으로 가장 가까운 변을
    // 고른다 — moveItem 호출부와 동일 규약. drop 트윈 기준 높이가 최종 위치를
    // 반영해야 하므로 startDrop보다 먼저 적용한다.
    const anchor = edgeSnapTarget(it, x, z);
    if (anchor) {
      it.center.x = anchor.x;
      it.center.z = anchor.z;
      it.yawDeg = anchor.yawDeg;
      resnap(it);
    }
    // 착지 트윈은 "내려놓는" 연출이다 — 벽·타공판에 붙는 아이템은 떨어질 곳이 없다.
    if (opts?.drop && !mountPose) startDrop(it);
    reassignLampShadows();
    reassignEmitterLights();
    recomputeCollisions();
    scheduleContactShadows();
    logPlacementChange('placeAt', {
      id,
      productId: spec.id,
      x: it.center.x,
      y: it.center.y,
      z: it.center.z,
      yawDeg: it.yawDeg,
    });
    return { id, collided: it.collided };
  }

  // --- 조작 API (이동·회전·삭제·복제) + 드롭 착지 트윈 ---

  // 착지 트윈 큐: id -> { elapsedMs, restY }. 물리 솔버가 아니라 연출용 보간
  // (docs/context/3d-scene.md 범위 규칙 — 중력·바운스 없음).
  const drops = new Map<string, { elapsedMs: number; restY: number }>();

  function startDrop(it: PlacedItem): void {
    const restY = it.group.position.y;
    drops.set(it.id, { elapsedMs: 0, restY });
    it.group.position.y = restY + dropOffsetY(0);
  }

  // 자석 부착 트윈 큐: monitorId -> 암 피벗 **로컬** 좌표계의 시작/목표 포즈 (D22 B).
  // 씬 그래프상 아이템은 이미 결합 완료 상태(부모·콜라이더·판정 전부 최종)이고, 여기
  // 보간은 시각 표현만 되감는다 — 드롭 트윈이 restY를 정본으로 두고 y만 띄우는 것과 같은 규약.
  // scale은 손대지 않는다: attach가 넣은 GLB 보정 상쇄분을 건드리면 크기가 튄다.
  const mounts = new Map<
    string,
    {
      elapsedMs: number;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      fromQuat: THREE.Quaternion;
      toQuat: THREE.Quaternion;
    }
  >();

  function tick(dtMs: number): number {
    runEmitterPoke(); // 발광 리컬러 지연 감지 우회 (아래 scheduleEmitterPoke 주석)
    // 창밖 구름·별과 커튼 흔들림의 시간 축 — **유니폼 하나**라 셰이더 재빌드가 없다.
    // 창문이 없어도 올려 둔다(값 하나 덧셈이고, 창문이 생긴 순간부터 이어져 돈다).
    advanceWindowTime(dtMs / 1000);
    if (!drops.size && !mounts.size) return 0;
    let landed = false;
    for (const [id, d] of drops) {
      const it = items.find((i) => i.id === id);
      if (!it) {
        drops.delete(id);
        continue;
      }
      d.elapsedMs += dtMs;
      it.group.position.y = d.restY + dropOffsetY(d.elapsedMs);
      if (dropDone(d.elapsedMs)) {
        drops.delete(id);
        landed = true;
      }
    }
    for (const [id, m] of mounts) {
      const it = items.find((i) => i.id === id);
      if (!it) {
        mounts.delete(id);
        continue;
      }
      m.elapsedMs += dtMs;
      const e = mountProgress(m.elapsedMs);
      it.group.position.lerpVectors(m.fromPos, m.toPos, e);
      it.group.quaternion.slerpQuaternions(m.fromQuat, m.toQuat, e);
      if (mountDone(m.elapsedMs)) {
        mounts.delete(id);
        landed = true;
      }
    }
    // 착지한 프레임에 한 번만 그림자 재굽기 — 트윈 중 매 프레임 굽지 않는다.
    if (landed) scheduleContactShadows();
    return drops.size + mounts.size;
  }

  /** 아이템의 XZ·회전·기울기를 그룹에 다시 적용한다. **`opts.initHeight` 없이는 높이를
   *  건드리지 않는다** — `center.y`는 사용자가 정한 저장값이다 (ADR-0023 결정 4: 받침을
   *  치워도 위 아이템은 그 자리에 남는다. 그래서 종전의 re-seat 캐스케이드도 사라졌다).
   *  트윈 중이면 목표 높이(restY)만 갱신해 착지 연출이 끊기지 않게 한다.
   *
   *  `opts.initHeight`는 "다시 앉히는" 경로용이다 — 지금 y가 의미를 잃은 아이템(결합을 뗀
   *  모니터)과, **이동 전에 지지면에 얹혀 있던 아이템**(`moveItem`의 `seatedOnSupport`)이다.
   *  띄우거나 파묻은 수동 높이는 이 옵션을 못 받으므로 이동해도 유지된다. */
  function resnap(it: PlacedItem, opts?: { initHeight?: boolean }): void {
    // 타공판 아이템은 벽 평면이 아니라 호스트 앞면이 기준이라 벽 갈래보다 먼저 본다 —
    // 순서를 뒤집으면 `wallPoseAt`이 후크를 벽면까지 끌고 가 판을 통과한다.
    // 호스트가 사라졌으면(reseat 실패) 아래 벽 갈래로 흘려보낸다.
    if (it.pegboardHostId && reseatOnHost(it)) {
      applyWallPose(it);
      return;
    }
    // 벽 아이템은 지지면 스냅을 타지 않는다 — `center.y`가 파생값이 아니라 저장값이라
    // 여기서 덮으면 벽에 붙인 높이가 이동·회전 때마다 상판 높이로 되돌아간다. 벽면
    // 좌표는 매번 다시 읽는다(벽 거리 조절·책상 깊이 변경을 따라가야 한다).
    // 들어올림·기울기도 여기선 안 먹인다: y가 이미 자유롭고 yaw는 벽 법선에 종속이다.
    if (it.wallSide) {
      const pose = wallPoseAt(it.spec, it.wallSide, it.center);
      it.center.x = pose.x;
      it.center.y = pose.y;
      it.center.z = pose.z;
      it.yawDeg = pose.yawDeg;
      applyWallPose(it);
      return;
    }
    applyItemPose(it.group, it.yawDeg, it.pitchDeg);
    if (opts?.initHeight) {
      const seatY = resolveSupportY(it.spec, it.center.x, it.center.z, it.yawDeg, it.id);
      // 상판에 물린 클램프 암만 예외 — 얹지 않고 물림 두께만큼 내린다 (아래 armClampDropM).
      it.center.y = snapCenterY(it.spec, seatY - armClampDropM(it.spec, it.group, it.collider));
    }
    it.group.position.x = it.center.x;
    it.group.position.z = it.center.z;
    // 그룹 원점은 규격 박스 밑면 중심이다 — 기울여도 center(판정·저장 좌표)는 규격 박스
    // 기준으로 그대로 두고, 화면 자세만 회전으로 준다.
    const groundY = it.center.y - mmToM(it.spec.heightMm) / 2;
    const d = drops.get(it.id);
    if (d) {
      d.restY = groundY;
      it.group.position.y = groundY + dropOffsetY(d.elapsedMs);
    } else {
      it.group.position.y = groundY;
    }
    reassignEmitterLights(); // 아이템이 움직이면 카메라 근접순도 바뀐다 (캡 이하면 no-op)
    recomputeCollisions();
    scheduleContactShadows();
  }

  // --- 암↔상판 엣지 스냅 (REQ-SIM-23, D22) -----------------------------------
  // 게이트는 판정 ①이다: null(클램프 불가 암)은 아무 것도 하지 않고, INCOMPATIBLE은
  // 붙지 않고 사유만 낸다. 물리 솔버가 아니라 좌표·yaw 정렬이다.

  /** 암별 마지막 발행 시그니처(`${edge}|${result}`) — 드래그 중 매 프레임 같은 이벤트를
   *  쏘지 않는다. `edgeSnapTarget`의 변 선택 히스테리시스 메모리도 겸한다(직전 변 파싱). */
  const edgeSnapSig = new Map<string, string>();

  function emitEdgeEvent(armId: string, edge: EdgeKey, judgment: Judgment): void {
    const sig = `${edge}|${judgment.result}`;
    if (edgeSnapSig.get(armId) === sig) return;
    edgeSnapSig.set(armId, sig);
    emitMount({
      kind: judgment.result === 'INCOMPATIBLE' ? 'edge-rejected' : 'edge-snapped',
      armId,
      judgment,
    });
  }

  /** 판정 ①에 넣을 책상 두께 규격 — 씬의 물림 낙차도 **같은 값**을 봐야 한다. */
  function deskGrip(): DeskGripSpec {
    return {
      topThicknessMm: deskConfig.topThicknessMm,
      edgeThicknessMm: deskConfig.edgeThicknessMm,
    };
  }

  /** 판정 ① 결과 (암이 아니거나 클램프 불가면 null — 판정 행 자체가 없다).
   *  `edgeSnapTarget`의 게이트이자 물림 낙차의 게이트다. 이벤트는 내지 않는다. */
  function armDeskJudgment(it: PlacedItem): Judgment | null {
    return it.spec.arm ? judgeArmDesk(it.spec.arm, deskGrip()) : null;
  }

  /**
   * 지지 세그먼트 박스와 아이템 전체 박스를 **아이템 로컬** 좌표계에서 잰다.
   * 지지 세그먼트가 없으면 support는 null. 판정이 아니라 기하 연출이므로 메쉬
   * 좌표를 봐도 된다 (판정 입력은 여전히 규격 mm).
   */
  function localBoxes(
    spec: ProductSpec,
    group: THREE.Object3D,
    collider: ItemCollider,
  ): { support: THREE.Box3 | null; item: THREE.Box3 } {
    const rig = spec.rig;
    const names = rig?.supportPart ? new Set(rig.segments[rig.supportPart] ?? []) : null;
    group.updateWorldMatrix(true, false);
    const inv = group.matrixWorld.clone().invert();
    const item = new THREE.Box3();
    let support: THREE.Box3 | null = null;
    for (const p of collider.parts) {
      p.mesh.updateWorldMatrix(true, false);
      const local = new THREE.Box3().copy(p.localBox);
      local.applyMatrix4(inv.clone().multiply(p.mesh.matrixWorld));
      item.union(local);
      if (names?.has(p.mesh.name)) support = (support ?? new THREE.Box3()).union(local);
    }
    return { support, item };
  }

  /**
   * 엣지에 물린 암을 상판 위에서 내릴 낙차 (m). 물리지 않는 아이템은 0 — 종전대로
   * 상판 상면에 얹힌다.
   *
   * 게이트는 `edgeSnapTarget`과 같다(판정 ① 행이 있고 INCOMPATIBLE이 아닐 것) —
   * 자유 배치로 폴백한 암은 물린 적이 없으니 내려서도 안 된다. 상태가 아니라 규격에서
   * 매번 다시 유도하므로 엣지 스냅을 건너뛰는 `restorePose` 경로에서도 일치한다.
   * 배치 아이템이 아니라 (규격, 그룹, 콜라이더)를 받는 이유는 드래그 고스트가 같은
   * 낙차를 미리 보여줘야 하기 때문이다 — 고스트는 `items`에 없다.
   */
  function armClampDropM(spec: ProductSpec, group: THREE.Object3D, collider: ItemCollider): number {
    const judgment = spec.arm ? judgeArmDesk(spec.arm, deskGrip()) : null;
    if (!judgment || judgment.result === 'INCOMPATIBLE') return 0;
    const { support, item } = localBoxes(spec, group, collider);
    if (!support) return 0; // 지지 세그먼트 미배선 — 물림면을 못 찾으니 얹는다
    return clampDropM(clampGripMm(deskGrip()), support.min.y, item.min.y);
  }

  /** 배치·이동 목표 (x,z)에서 물릴 변을 고른다. 거리는 **클램프 물림면**과 변
   *  사이라 yaw와 무관하다(물림면은 아이템 로컬 -Z에 고정). 클램프 가능한 암은
   *  **항상** 가장 가까운 변에 고정된다(2026-07-28 개정 — 모니터암은 책상 모서리에
   *  물려 있어야 하는 부품이라 자유 배치를 허용하지 않는다. 이전엔 8cm 이내에서만
   *  붙는 자석 보조였다). 결합 불가(INCOMPATIBLE)인 조합만 예외로 붙지 않는다 —
   *  그 경우는 애초에 물리적으로 물릴 수 없으니 자유 위치에 두고 사유만 낸다.
   *
   *  **반환 좌표는 최종 좌표다** — 호출부에서 `clampToWalls`를 덧걸지 말 것. 여기서
   *  거는 벽 클램프는 변에 평행한 축뿐이고(`clampCenterToWallsAlongEdge`), 통짜
   *  클램프를 덧걸면 물린 암이 상판 안쪽으로 밀려 들어간다. `placeAt`과 `moveItem`이
   *  이 함수 하나만 보게 해서 두 경로가 같은 자리를 내도록 묶어 둔 것이다
   *  (2026-08-02 시각 QA 반려 — 이동만 하면 암이 상판 한가운데로 갔다). */
  function edgeSnapTarget(
    it: PlacedItem,
    x: number,
    z: number,
  ): { x: number; z: number; yawDeg: number } | null {
    const judgment = armDeskJudgment(it);
    if (!judgment) return null; // 암이 아니거나 클램프 불가 암 — 판정 행 자체가 없다
    const info = surfaceInfo();
    // 물림 거리는 지지 세그먼트 로컬 -Z 끝에서 잰다. 규격 depth/2를 그대로 쓰면 안 된다 —
    // GLB 균일 스케일은 높이 축 기준이라 깊이가 0.3mm 남고, 그만큼 물림면이 상판 밖으로
    // 나가 경계 위반으로 잡힌다(실측 확인).
    const { support } = localBoxes(it.spec, it.group, it.collider);
    const reach = support ? -support.min.z : mmToM(it.spec.depthMm) / 2;
    const cands: { edge: EdgeKey; d: number; x: number; z: number }[] = [
      { edge: 'back', d: Math.abs(z + info.halfD - reach), x, z: -info.halfD + reach },
      { edge: 'front', d: Math.abs(info.halfD - z - reach), x, z: info.halfD - reach },
      { edge: 'left', d: Math.abs(x + info.halfW - reach), x: -info.halfW + reach, z },
      { edge: 'right', d: Math.abs(info.halfW - x - reach), x: info.halfW - reach, z },
    ];
    const nearest = cands.reduce((a, b) => (b.d < a.d ? b : a));
    // 직전 변을 마진만큼 우대한다 — 대각선 경계에서의 변 플리핑 방지 (EDGE_STICK_MARGIN_M).
    const prevEdge = edgeSnapSig.get(it.id)?.split('|')[0] as EdgeKey | undefined;
    const prev = prevEdge ? cands.find((c) => c.edge === prevEdge) : undefined;
    const best = prev && nearest.d + EDGE_STICK_MARGIN_M >= prev.d ? prev : nearest;
    emitEdgeEvent(it.id, best.edge, judgment);
    if (judgment.result === 'INCOMPATIBLE') return null; // 물리적으로 못 무는 암은 안 붙는다
    const yawDeg = EDGE_YAW[best.edge];
    // 변을 따라 미끄러지는 축을 상판 코너 안으로 클램프 — 벽 클램프는 상판 사각형을 안
    // 보므로(halfW 0.7 vs 벽 ±1.55) 이게 없으면 지지 박스가 인접 변을 넘어 진짜 경계
    // 위반이 된다 (DERO-467). extents는 로컬 X 범위 — EDGE_YAW 4포즈 모두에서
    // 로컬 X가 변-방향 월드축으로 가며, 부호만 변마다 다르다(back·right +, front·left −).
    const alongSign = best.edge === 'back' || best.edge === 'right' ? 1 : -1;
    const a = support ? alongSign * support.min.x : -mmToM(it.spec.widthMm) / 2;
    const b = support ? alongSign * support.max.x : mmToM(it.spec.widthMm) / 2;
    const extMin = Math.min(a, b);
    const extMax = Math.max(a, b);
    if (EDGE_PINNED_AXIS[best.edge] === 'z') {
      best.x = clampAlongEdgeToDesk(best.x, extMin, extMax, info.halfW);
    } else {
      best.z = clampAlongEdgeToDesk(best.z, extMin, extMax, info.halfD);
    }
    const rect = rotatedFootprintRect(it.spec, best.x, best.z, yawDeg * DEG2RAD);
    const walled = clampCenterToWallsAlongEdge(
      best.x,
      best.z,
      rect,
      activeWallPlanes(),
      EDGE_PINNED_AXIS[best.edge],
    );
    return { x: walled.x, z: walled.z, yawDeg };
  }

  function moveItem(id: string, x: number, z: number): boolean {
    const it = items.find((i) => i.id === id);
    if (!it) return false;
    if (it.mountedToId) return false; // 결합된 모니터는 분리해야 움직인다 (D22)
    // 얹혀 있던 아이템은 이동 뒤에도 새 지지면에 앉는다 — 받침대 위로 끌면 올라타고, 받침대
    // 밖으로 끌면 상판 높이로 내려온다. **좌표를 바꾸기 전에** 판정해야 옛 자리 기준이 된다.
    const wasSeated = seatedOnSupport(it);
    // 엣지 스냅이 성립하면 그 좌표가 최종이다 (벽 클램프는 edgeSnapTarget 안에서
    // 변에 평행한 축에만 걸렸다) — placeAt과 같은 자리를 내야 하므로 여기서 통짜
    // 벽 클램프를 덧걸지 않는다. 안 물린 아이템만 종전대로 통짜 클램프를 받는다.
    const snap = edgeSnapTarget(it, x, z);
    const yawDeg = snap ? snap.yawDeg : it.yawDeg;
    const target = snap ?? clampToWalls(it.spec, x, z, yawDeg);
    it.center.x = target.x;
    it.center.z = target.z;
    it.yawDeg = yawDeg;
    resnap(it, { initHeight: wasSeated });
    logPlacementChange('moveItem', {
      id,
      x: it.center.x,
      y: it.center.y,
      z: it.center.z,
      yawDeg: it.yawDeg,
    });
    return true;
  }

  /** 드래그 되돌리기 전용 — 엣지 스냅·벽 클램프를 건너뛰고 정확히 이 포즈로 되돌린다.
   *  moveItem과 달리 저장된 좌표를 다시 판정하지 않는다. 없는 id·결합 중이면 false.
   *  `centerYMm`(밀리미터, 저장 배치 복원 경로)은 **모든 아이템에서 되읽힌다** — 높이는
   *  사용자가 정한 저장값이라 로드 시 재계산이 없다 (ADR-0023 결정 2·4). */
  function restorePose(
    id: string,
    x: number,
    z: number,
    yawDeg: number,
    centerYMm?: number,
  ): boolean {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId) return false;
    it.center.x = x;
    it.center.z = z;
    it.yawDeg = normalizeYaw(yawDeg);
    if (centerYMm !== undefined) {
      it.center.y = mmToM(centerYMm); // y는 파생값이 아니라 사용자가 정한 저장값이다
    }
    resnap(it);
    logPlacementChange('restorePose', {
      id,
      x: it.center.x,
      y: it.center.y,
      z: it.center.z,
      yawDeg: it.yawDeg,
    });
    return true;
  }

  function rotateItem(id: string, yawDeg: number): number | null {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId) return null;
    it.yawDeg = normalizeYaw(yawDeg);
    resnap(it);
    logPlacementChange('rotateItem', { id, yawDeg: it.yawDeg });
    return it.yawDeg;
  }

  /** 회전 링의 기하 — `rotateItem`이 거부하는 아이템에는 링도 띄우지 않는다(벽·결합).
   *  링 중심 y는 `center.y - 규격높이/2` = **규격 박스 밑면**이다: 사용자가 정한 높이를
   *  이미 반영한 값이라 지지면을 다시 찾지 않고 매 프레임 쓸 수 있다. x·z도
   *  `center`(판정·저장 좌표)를 쓴다. */
  function rotateHandle(placedId: string): RotateHandle | null {
    const it = items.find((i) => i.id === placedId);
    if (!it || it.mountedToId || it.wallSide) return null;
    const diagM = Math.hypot(mmToM(it.spec.widthMm), mmToM(it.spec.depthMm));
    return {
      itemId: it.id,
      center: [
        it.center.x,
        it.center.y - mmToM(it.spec.heightMm) / 2 + ROTATE_RING_LIFT_M,
        it.center.z,
      ],
      radius: diagM / 2 + ROTATE_RING_MARGIN_M,
      yawDeg: it.yawDeg,
    };
  }

  /** 규격 박스 밑면의 절대 높이(mm) — `[0, LIFT_MAX_MM]`로 클램프해 적용값을 돌려준다.
   *  드롭 순간의 지지면 높이를 사용자가 여기서 덮어쓴다(ADR-0023 결정 3·4). 벽 아이템도
   *  대상이다 — 그쪽은 원래부터 y가 저장값이라 같은 축이다. 결합된 모니터는 암이 높이를
   *  정하므로 제외한다. */
  function liftItem(id: string, liftMm: number): number | null {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId) return null;
    const applied = clampLift(liftMm);
    it.center.y = mmToM(applied) + mmToM(it.spec.heightMm) / 2;
    resnap(it);
    logPlacementChange('liftItem', { id, liftMm: applied });
    return applied;
  }

  function tiltItem(id: string, pitchDeg: number): number | null {
    const it = items.find((i) => i.id === id);
    if (!it || it.mountedToId) return null;
    it.pitchDeg = clampPitch(pitchDeg);
    resnap(it);
    logPlacementChange('tiltItem', { id, pitchDeg: it.pitchDeg });
    return it.pitchDeg;
  }

  function removeItem(id: string): boolean {
    if (!items.some((i) => i.id === id)) return false;
    // 타공판을 지우면 거기 붙어 있던 후크·걸린 제품이 공중에 남는다 — 체인째 먼저
    // 지운다(재귀는 각 단계가 자기 손님을 지우면서 자연히 끝난다). 암을 지울 때
    // 모니터를 상판에 내려놓는 것과 다른 선택인 이유: 후크는 내려놓을 상판 자리가
    // 없다(벽 좌표계 아이템이라 놓으면 벽 속에 박힌다).
    // **인덱스는 이 뒤에 잡는다** — 손님을 splice로 지우는 동안 배열이 밀린다.
    for (const guest of items.filter((g) => g.pegboardHostId === id)) removeItem(guest.id);
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return false;
    const it = items[idx];
    // 암을 지우면 매달린 모니터가 씬 그래프째 딸려간다 — 먼저 상판으로 내려놓는다.
    const hanging = items.find((i) => i.mountedToId === it.id);
    if (hanging) detachMonitor(hanging.id);
    // 결합된 모니터를 직접 지우는 경로엔 detachMonitor가 없어 'detached'가 안 나간다 —
    // 구독자(스토어)의 결합 판정 기록에 죽은 id가 남는다. 재스냅은 필요 없고(곧 사라진다)
    // 사실만 알린다.
    if (it.mountedToId) {
      const armId = it.mountedToId;
      it.mountedToId = undefined;
      emitMount({ kind: 'detached', monitorId: it.id, armId });
    }
    // 위에 얹혀 있던 아이템은 **그 자리에 남는다** — 높이가 사용자 값이라 따라 내려오지
    // 않는다 (ADR-0023 결정 4). 얹힘 추론만 recomputeCollisions에서 다시 돈다.
    it.group.removeFromParent(); // 결합 중인 모니터는 placedRoot가 아니라 암 피벗의 자식이다
    edgeSnapSig.delete(id);
    const flash = rejectFlashTimers.get(id);
    if (flash !== undefined) {
      window.clearTimeout(flash); // 틴트 중 삭제되면 만료 콜백이 죽은 id로 남는다
      rejectFlashTimers.delete(id);
    }
    disposeItem(it);
    items.splice(idx, 1);
    drops.delete(id);
    mounts.delete(id);
    reassignLampShadows();
    reassignEmitterLights();
    recomputeCollisions();
    scheduleContactShadows();
    return true;
  }

  function duplicateItem(id: string): { id: string; collided: boolean } | null {
    const it = items.find((i) => i.id === id);
    if (!it) return null;
    // 원본 옆(+X)에 폭+간격만큼 띄워 둔다 — 겹친 채 생겨서 즉시 빨강이 되는 것
    // 보다 낫다. 상판을 벗어나는 것은 클램프하지 않고 소프트 블록이 잡는다. 벽 밖은
    // placeAt이 안쪽으로 되밀므로, 벽에 붙은 원본을 복제하면 간격이 먹히지 않고
    // 원본과 겹쳐 충돌 빨강으로 잡힌다 — 이 역시 소프트 규약 그대로다.
    const dx = mmToM(it.spec.widthMm) + DUPLICATE_GAP_M;
    const made = placeAt(it.spec, it.center.x + dx, it.center.z, { yawDeg: it.yawDeg, drop: true });
    // 기울기·높이도 원본을 따라간다(회전과 같은 취급) — 자세가 사용자 소유라 복제가
    // 자세를 잃으면 안 된다. PlaceOptions로 넘기지 않고 뮤테이터를 재사용하는 이유는
    // 클램프 정본을 한 곳에 두기 위해서다.
    if (it.pitchDeg) tiltItem(made.id, it.pitchDeg);
    liftItem(made.id, (it.center.y - mmToM(it.spec.heightMm) / 2) * 1000);
    const dup = items.find((i) => i.id === made.id);
    return { id: made.id, collided: dup?.collided ?? made.collided };
  }

  // --- 드래그 고스트 프리뷰 (REQ-SIM-01) ---
  // 실제 아이템과 같은 형상을 반투명으로 띄운다. `items`에 넣지 않으므로 충돌·
  // 경계 판정·저장·아웃라인 대상이 아니다 — 순수 시각 피드백.
  let ghost: {
    spec: ProductSpec;
    group: THREE.Group;
    ring: THREE.Mesh;
    yawDeg: number;
    /** 클램프 낙차를 미리 보여주려면 고스트도 지지 세그먼트 실측이 필요하다 —
     *  `armClampDropM`의 입력. 판정·틴트에는 쓰지 않는다. */
    collider: ItemCollider;
  } | null = null;

  function makeSnapRing(spec: ProductSpec): THREE.Mesh {
    // footprint 대각 반지름 — 회전해도 링 밖으로 삐져나오지 않는다.
    const r = Math.hypot(mmToM(spec.widthMm), mmToM(spec.depthMm)) / 2;
    const geo = new THREE.RingGeometry(r - GHOST_RING_WIDTH_M, r, 48).rotateX(-Math.PI / 2);
    // 상수색 오버레이 — 톤매핑 노출(1/20) 역보상이 없으면 물리 단위 씬에 묻혀
    // 사실상 안 보인다 (postfx outline과 같은 이유, src/three/CLAUDE.md 참조).
    const mat = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color(GHOST_RING_COLOR).multiplyScalar(GHOST_EXPOSURE_GAIN),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    return m;
  }

  function buildGhost(spec: ProductSpec): THREE.Group {
    const inst = spec.glbUrl ? (assets?.instantiate(spec) ?? null) : null;
    const group = inst ? inst.group : buildProp(spec);
    group.userData.fromGLB = !!inst;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = GHOST_OPACITY;
        m.depthWrite = false;
      }
    });
    return group;
  }

  /** 고스트를 만들거나(다른 제품이면 갈아끼우고) 자세만 갱신한다. 표시·이동은 호출부가. */
  function ensureGhost(spec: ProductSpec, yawDeg: number): void {
    if (ghost && ghost.spec.id !== spec.id) ghostHide();
    if (!ghost) {
      const group = buildGhost(spec);
      // 링은 그룹의 자식이 아니라 형제 — GLB 고스트는 disposeGroup이 지오메트리를
      // 건드리지 않으므로(템플릿 공유) 링을 안에 넣으면 링 지오메트리가 샌다.
      const ring = makeSnapRing(spec);
      ghostRoot.add(group);
      ghostRoot.add(ring);
      ghost = {
        spec,
        group,
        ring,
        yawDeg: normalizeYaw(yawDeg),
        collider: buildItemCollider(group),
      };
    } else {
      ghost.yawDeg = normalizeYaw(yawDeg);
    }
    ghostRoot.visible = true;
  }

  function ghostShow(spec: ProductSpec, x: number, z: number, yawDeg = 0): void {
    ensureGhost(spec, yawDeg);
    ghostMove(x, z);
  }

  /** 벽 아이템 고스트 — 벽 자세로 띄우고 **수평 스냅 링은 숨긴다**(벽에 누운 링은
   *  거짓말이다). 링은 `ghostHide`가 통째로 버리므로 다시 켤 자리가 없다. */
  function ghostShowOnWall(spec: ProductSpec, side: WallSide, hit: WallPoint): void {
    ensureGhost(spec, WALL_YAW_DEG[side]);
    if (!ghost) return;
    ghost.ring.visible = false;
    const pose = wallPoseAt(spec, side, hit);
    ghost.yawDeg = pose.yawDeg;
    ghost.group.rotation.set(0, pose.yawDeg * DEG2RAD, 0);
    ghost.group.position.set(pose.x, pose.y - mmToM(spec.heightMm) / 2, pose.z);
  }

  /** 타공판 부착 고스트 — 호스트 앞면 자세로 띄운다. 링을 숨기는 이유는 벽 고스트와
   *  같다(수평 링은 벽 좌표계 아이템에 대해 거짓말이다). 호스트가 사라졌으면 아무것도
   *  안 한다 — 마지막 유효 자세를 유지해야지 상판으로 튀면 안 된다. */
  function ghostShowOnPegboard(spec: ProductSpec, hit: PegboardHit): void {
    ensureGhost(spec, WALL_YAW_DEG[hit.side]);
    if (!ghost) return;
    const pose = pegboardPoseAt(spec, hit);
    if (!pose) return;
    ghost.ring.visible = false;
    ghost.yawDeg = pose.yawDeg;
    ghost.group.rotation.set(0, pose.yawDeg * DEG2RAD, 0);
    ghost.group.position.set(pose.x, pose.y - mmToM(spec.heightMm) / 2, pose.z);
  }

  /** 모니터 위 얹기 고스트 (DERO-591) — 패널 상단 자세로 띄운다. 링은 그대로 둔다:
   *  수평 링이 패널 상단 평면 위에 놓이므로 벽·타공판 고스트와 달리 거짓말이 아니다.
   *  호스트가 사라졌으면 아무것도 안 한다(마지막 유효 자세 유지). */
  function ghostShowOnMonitorTop(spec: ProductSpec, hit: MonitorTopHit, yawDeg = 0): void {
    ensureGhost(spec, yawDeg);
    if (!ghost) return;
    const pose = monitorTopPoseAt(spec, ghost.yawDeg, hit);
    if (!pose) return;
    // 프리뷰와 실제 드롭이 같아야 하므로 placeAt과 같은 벽 클램프를 건다.
    const clamped = clampToWalls(spec, pose.x, pose.z, ghost.yawDeg);
    const restY = pose.y - mmToM(spec.heightMm) / 2;
    applyItemPose(ghost.group, ghost.yawDeg, 0);
    ghost.group.position.set(clamped.x, restY, clamped.z);
    ghost.ring.position.set(clamped.x, restY + GHOST_RING_LIFT_M, clamped.z);
  }

  function ghostMove(x: number, z: number): void {
    if (!ghost) return;
    // 프리뷰는 실제 드롭 위치와 같아야 하므로 placeAt과 같은 벽 클램프를 건다.
    const clamped = clampToWalls(ghost.spec, x, z, ghost.yawDeg);
    // 고스트는 items에 없으므로 excludeId 없이 그대로 지지면을 찾는다.
    const seatY = resolveSupportY(ghost.spec, clamped.x, clamped.z, ghost.yawDeg);
    // placeAt과 같은 얹기 높이를 쓴다 — 클램프 낙차를 프리뷰가 빼먹으면 놓는 순간
    // 아이템이 내려앉아 프리뷰가 거짓말이 된다.
    const restY = seatY - armClampDropM(ghost.spec, ghost.group, ghost.collider);
    applyItemPose(ghost.group, ghost.yawDeg, 0);
    ghost.group.position.set(clamped.x, restY, clamped.z);
    ghost.ring.position.set(clamped.x, restY + GHOST_RING_LIFT_M, clamped.z);
  }

  function ghostHide(): void {
    if (!ghost) return;
    ghostRoot.remove(ghost.group);
    ghostRoot.remove(ghost.ring);
    disposeGroup(ghost.group);
    ghost.ring.geometry.dispose();
    (ghost.ring.material as THREE.Material).dispose();
    ghost = null;
    ghostRoot.visible = false;
  }

  /** 배치된 램프 — 슬롯 배정 여부와 무관한 정본 목록. */
  function lampItems(): PlacedItem[] {
    return items.filter((i) => i.spec.kind === 'lamp' && i.spec.optical);
  }

  /** 실효 광속(lm) = 규격 정격 × 사용자 배율 (287). 배율 미설정은 규격 그대로다.
   *  슬롯 `power`와 배정 랭킹(`lampSlotOrder`, 223)이 **같은** 이 값을 써야 한다 —
   *  갈리면 어두운 램프가 캐스터 칸을 먹는다. */
  function effectiveLumens(it: PlacedItem): number {
    return it.spec.optical!.lumens * (it.emitterBrightnessScale ?? 1);
  }

  /** 실효 색온도(K) — 인스턴스 값 우선, 없으면 규격 값 (287). */
  function effectiveColorTempK(it: PlacedItem): number {
    return it.emitterColorTempK ?? it.spec.optical!.colorTempK;
  }

  // 램프 → 슬롯 배정 (235). castShadow는 절대 안 만진다 — 어느 슬롯에 싣느냐가 곧
  // 그림자 배정이다(앞 LAMP_SHADOW_CAP칸이 캐스터). 실효 lm 높은 램프가 캐스터 칸을
  // 가지고, 슬롯 수를 넘은 램프는 빛을 내지 못한다(경고는 스토어가 띄운다).
  function reassignLampShadows(): void {
    const lamps = lampItems();
    const out = lightSlots.assignLamps(
      lamps.map((i) => ({
        specId: i.spec.id, // 쿠키 마스크 캐시 키 (265)
        group: i.group,
        heightMm: i.spec.heightMm,
        lumens: effectiveLumens(i), // 배율 반영 — 슬롯 배정 랭킹의 입력이기도 하다 (287)
        colorTempK: effectiveColorTempK(i),
        distribution: i.spec.optical!.distribution,
        reachMm: i.spec.optical!.reachMm,
      })),
    );
    lamps.forEach((it, i) => (it.light = out[i]));
  }

  // --- 장식 발광 PointLight 캡 (ADR-0003 결정 6) ---
  // 램프 그림자 캡과 두 가지가 다르다: (1) 순서가 아니라 카메라 근접순 — 스필이
  // 국소(30~60cm)라 화면 밖 발광체는 어차피 안 보인다. (2) 백엔드별 캡 — WebGL2
  // 폴백은 광원 하나가 셰이더 비용에 직결된다. 캡 값(emitterCap)은 슬롯 풀 크기와
  // 같은 값이라 위 풀 생성부에서 읽는다.
  /** 마지막으로 배정에 쓴 카메라 위치. 첫 렌더 전에는 null → 배치 순서로 폴백. */
  let emitterCamPos: THREE.Vector3 | null = null;
  let emitterEvalAtMs = 0;
  /** 이 거리 이상 움직였을 때만 재배정 — 스필 반경보다 작게 움직여도 순위가
   *  뒤집힐 수 있지만 화면상 차이가 없다. */
  const EMITTER_REASSIGN_MOVE_M = 0.15;
  const EMITTER_REASSIGN_MIN_MS = 120;
  const emitterWorldPos = new THREE.Vector3();

  /** 발광체의 월드 위치 — 슬롯 배정 전에도 필요하므로 광원이 아니라 로컬 오프셋에서 구한다. */
  function emitterWorld(it: PlacedItem): THREE.Vector3 {
    it.group.updateWorldMatrix(true, false);
    return emitterWorldPos.copy(it.emitterLocal!).applyMatrix4(it.group.matrixWorld);
  }

  function reassignEmitterLights(): void {
    const es = items.filter((i) => i.emitterLocal);
    // 사용자가 끈 발광체는 후보에서 뺀다 — 광원의 `visible`을 만지는 대신 슬롯 배정에서
    // 제외하는 것이 이 풀의 유일한 "끄기"다(235). 캡 한 칸이 비므로 다른 발광체가
    // 대신 스필을 받는다.
    const candidates = es.filter((i) => i.emitterOn !== false);
    // 캡 이하면 전원 배정(슬롯 모드에는 "켠다"가 없다 — 실리는 것이 곧 켜지는 것이다).
    let live = candidates;
    if (candidates.length > emitterCap) {
      const cam = emitterCamPos;
      const distances = candidates.map((it, i) => {
        if (!cam) return i; // 카메라 미확인 → 인덱스 = 배치 순서 폴백(결정적)
        return emitterWorld(it).distanceTo(cam);
      });
      const flags = emitterLightFlags(distances, emitterCap);
      live = candidates.filter((_, i) => flags[i]);
    }
    // 초과분은 슬롯을 못 받아 스필이 없다 — emissive는 그대로라 발광체는 계속 빛난다.
    const out = lightSlots.assignEmitters(
      live.map((it): SlotEmitter => ({
        group: it.group,
        localPoint: it.emitterLocal!,
        colorHex: hexToInt(it.emitterColor ?? resolveEmitterColor(it.spec.emitter!)),
        radiusMm: it.spec.emitter!.radiusMm,
        lumens: it.spec.emitter!.lumens,
      })),
    );
    for (const it of es) it.emitterLight = undefined;
    live.forEach((it, i) => (it.emitterLight = out[i]));
  }

  // 근접순 배정은 카메라 의존이라 배치·삭제만으로는 스테일해진다. 매 프레임 돌리는
  // 대신 카메라가 15cm 이상 움직이고 120ms가 지났을 때만 — 궤도 감쇠(OrbitControls
  // dampingFactor 0.08) 때문에 카메라가 멈춘 뒤에도 미세 이동 프레임이 이어진다.
  // 캡 이하일 때는 아예 계산하지 않으므로 평상시 비용이 0이다.
  // 카메라를 받는 경로가 `scene.onBeforeRender`인 이유: 씬은 postfx의 scenePass가
  // 렌더하고 엔진이 카메라를 들고 있지 않다. 컨택트 섀도우 패스도 같은 훅을 때리므로
  // 원근 카메라만 받는다(그쪽은 직교).
  scene.onBeforeRender = (_renderer, _scene, camera): void => {
    lightSlots.sync(); // 아이템이 움직이면 슬롯 광원이 따라간다 (235)
    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    // 시간 게이트를 발광체 세기보다 **먼저** 본다 — 매 프레임 도는 경로라
    // `items.filter(...)`를 앞에 두면 60fps 내내 배열을 새로 만든다.
    const now = performance.now();
    if (now - emitterEvalAtMs < EMITTER_REASSIGN_MIN_MS) return;
    // 배정 여부가 아니라 **발광체를 가진 아이템 수**를 센다 — 슬롯 모드에서 배정 수는
    // 캡을 넘을 수 없으므로 emitterLight를 세면 이 게이트가 영원히 안 열린다.
    // 꺼진 발광체는 슬롯을 안 먹으므로 세지도 않는다 (reassignEmitterLights의 후보 조건과 동일).
    let emitterCount = 0;
    for (const it of items) if (it.emitterLocal && it.emitterOn !== false) emitterCount++;
    if (emitterCount <= emitterCap) return;
    if (
      emitterCamPos &&
      emitterCamPos.distanceToSquared(camera.position) <
        EMITTER_REASSIGN_MOVE_M * EMITTER_REASSIGN_MOVE_M
    ) {
      return;
    }
    emitterEvalAtMs = now;
    emitterCamPos = (emitterCamPos ?? new THREE.Vector3()).copy(camera.position);
    reassignEmitterLights();
  };

  /** `'#RRGGBB'` -> 0xRRGGBB (sRGB — Color.setHex의 기본 색공간과 같다). */
  function hexToInt(hex: string): number {
    return parseInt(hex.slice(1), 16);
  }

  // three NodeMaterialObserver 우회 — 규약과 사유는 `emitterEmissive.ts`의 pokeEmissive.
  // 발광체가 2개 이상이면 재현된다(같은 cacheKey를 공유하는 렌더오브젝트 중 한 개만
  // 매 렌더 무조건 갱신을 받기 때문). 여기서는 "몇 프레임 뒤에 어느 아이템을"만 관리한다.
  const EMITTER_POKE_FRAMES = 2;
  const emitterPokeItems = new Set<PlacedItem>();
  let emitterPokeCountdown = 0;

  function scheduleEmitterPoke(it: PlacedItem): void {
    emitterPokeItems.add(it);
    emitterPokeCountdown = EMITTER_POKE_FRAMES;
  }

  function runEmitterPoke(): void {
    if (emitterPokeCountdown === 0) return;
    if (--emitterPokeCountdown > 0) return;
    for (const it of emitterPokeItems) pokeEmissive(it.group);
    emitterPokeItems.clear();
  }

  /** 가변 발광의 색을 바꾼다 — PointLight 색과 재질 emissive를 함께 갱신한다.
   *  `recolorable`이 false면 no-op이다(정본은 매니페스트, 인스턴스 값은 종속). */
  function setEmitterColor(itemId: string, hex: string): void {
    const it = items.find((i) => i.id === itemId);
    const em = it?.spec.emitter;
    if (!it || !em) return;
    const resolved = resolveEmitterColor(em, hex);
    if (resolved === it.emitterColor) return;
    it.emitterColor = resolved;
    const n = hexToInt(resolved);
    it.emitterLight?.color.setHex(n);
    // 꺼진 발광체의 색을 바꿔도 다시 켜지면 안 된다 — 세기를 0으로 유지한 채 색만 갈아둔다.
    applyEmitterEmissive(it.group, n, emissiveIntensityFor(it));
    scheduleEmitterPoke(it); // 위 우회 주석 참고 — 없으면 발광체 2개 이상일 때 색이 안 바뀐다
  }

  /** 이 아이템에 지금 실려야 할 emissive 세기 — 꺼져 있으면 0(블룸 채널이 0이라 안 번진다). */
  function emissiveIntensityFor(it: PlacedItem): number {
    return it.emitterOn === false ? 0 : EMITTER_EMISSIVE_INTENSITY;
  }

  /** 발광 on/off (세션 한정, 선택 패널 스위치). 발광체가 없으면 no-op.
   *  광원은 `visible`을 만지지 않고 슬롯 배정에서 빼는 것으로 끈다 (235). */
  function setEmitterOn(itemId: string, on: boolean): void {
    const it = items.find((i) => i.id === itemId);
    const em = it?.spec.emitter;
    if (!it || !em) return;
    if (it.emitterOn === undefined ? on : it.emitterOn === on) return;
    it.emitterOn = on;
    const hex = hexToInt(it.emitterColor ?? resolveEmitterColor(em));
    applyEmitterEmissive(it.group, hex, emissiveIntensityFor(it));
    scheduleEmitterPoke(it); // 세기를 바꿨으므로 색 변경과 같은 우회가 필요하다
    reassignEmitterLights(); // 슬롯 회수(끄기) 또는 재획득(켜기)
  }

  /** 모니터 화면 사진 교체. 화면 메쉬가 없으면(GLB 제품·비모니터) 조용히 no-op이다.
   *  발광 세기가 같이 바뀌므로 색 변경과 똑같이 poke가 필요하다 — 없으면 화면이 두 개
   *  이상일 때 재질 변경이 GPU에 안 올라간다(NodeMaterialObserver lazy 스냅샷). */
  function setScreenPhoto(itemId: string, tex: THREE.Texture | null): void {
    const it = items.find((i) => i.id === itemId);
    if (!it || !findScreenMesh(it.group)) return;
    if (it.screenPhoto === tex) return;
    it.screenPhoto?.dispose(); // 교체·해제 모두 이전 사진을 여기서 놓는다
    it.screenPhoto = tex ?? undefined;
    applyScreenPhoto(it.group, tex);
    scheduleEmitterPoke(it);
  }

  function screenInfo(itemId: string): { supported: boolean; hasPhoto: boolean } | null {
    const it = items.find((i) => i.id === itemId);
    if (!it) return null;
    return { supported: findScreenMesh(it.group) !== null, hasPhoto: it.screenPhoto !== undefined };
  }

  /** 저장 응답이 새로 부여한 배치 API id를 신규 아이템에 반영한다(REQ-SIM-06 저장). */
  function setBackendId(itemId: string, backendId: number): void {
    const it = items.find((i) => i.id === itemId);
    if (it) it.backendId = backendId;
  }

  function emitterInfo(
    itemId: string,
  ): { recolorable: boolean; color: string; on: boolean } | null {
    const it = items.find((i) => i.id === itemId);
    const em = it?.spec.emitter;
    if (!it || !em) return null;
    return {
      recolorable: em.recolorable,
      color: it.emitterColor ?? resolveEmitterColor(em),
      on: it.emitterOn !== false,
    };
  }

  /** 램프 갓 자신의 발광을 인스턴스 값에 맞춘다 (287). 슬롯 SpotLight만 갱신하면 책상
   *  웅덩이는 즉시 바뀌는데 갓은 배치 시점에 구워진 규격 색·세기로 남는다.
   *  색은 `props.ts`가 굽는 것과 **같은 함수·같은 색공간**이어야 규격 그대로일 때의 색이
   *  배치 직후와 조절 직후로 갈리지 않는다. 세기 기준값도 `props.ts`가 정본이다.
   *  갓 메쉬를 못 찾으면(GLB 램프 등) 조용히 no-op이다.
   *  충돌 틴트와 emissive를 공유하므로 `applyEmitterEmissive`와 같은 규약을 따른다 —
   *  틴트가 쥐고 있는 동안은 복원 기준선만 고친다.
   *  쿠키 베이크는 갓을 자기 재질(`SHADE_TRANSMITTANCE`)로 갈아끼워 굽기 때문에 이 값을
   *  읽지 않는다 — 마스크는 이 경로와 무관하다 (`render/cookieBake.ts` `renderMask`). */
  function syncLampShadeEmissive(it: PlacedItem): void {
    const rgb = colorTempToRGB(effectiveColorTempK(it));
    const color = new THREE.Color().setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
    const intensity = LAMP_SHADE_EMISSIVE_INTENSITY * (it.emitterBrightnessScale ?? 1);
    it.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.name !== SHADE_MESH_NAME) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mm = m as THREE.MeshStandardNodeMaterial;
        if (!mm || !mm.emissive) continue;
        if (mm.userData._origEmissive !== undefined) {
          mm.userData._origEmissive = color.getHex();
          mm.userData._origEmissiveI = intensity;
        }
        if (mm.userData._tinted) continue;
        mm.emissive.copy(color);
        mm.emissiveIntensity = intensity;
      }
    });
    // 없으면 램프를 2대 이상 놓았을 때 JS 값만 새 색이고 화면은 옛 색으로 남는다
    // (NodeMaterialObserver lazy 스냅샷 — 위 scheduleEmitterPoke 주석).
    scheduleEmitterPoke(it);
  }

  /** 램프 밝기 배율 조절 (REQ-SIM-08, 287). 램프가 아니면(= `optical` 없음) no-op.
   *  `reassignLampShadows()`로 되돌리는 이유는 배율이 슬롯 배정 랭킹까지 바꾸기 때문이다
   *  — 밝게 올린 램프가 캐스터 칸을 가져가는 것이 223 규칙의 귀결이다. 이 경로는 전부
   *  유니폼 축이라(광원 생성·`visible`·`castShadow` 불변) 셰이더 재빌드가 없다 (235). */
  function setLampBrightnessScale(itemId: string, scale: number): void {
    const it = items.find((i) => i.id === itemId);
    if (!it?.spec.optical || !Number.isFinite(scale)) return;
    const next = clampBrightnessScale(scale);
    if (next === (it.emitterBrightnessScale ?? 1)) return;
    it.emitterBrightnessScale = next;
    reassignLampShadows();
    syncLampShadeEmissive(it); // 갓 자신의 발광도 같이 — 없으면 웅덩이만 밝아진다
  }

  /** 램프 색온도 조절 (REQ-SIM-08, 287). 램프가 아니면 no-op. */
  function setLampColorTempK(itemId: string, k: number): void {
    const it = items.find((i) => i.id === itemId);
    if (!it?.spec.optical || !Number.isFinite(k)) return;
    const next = clampColorTempK(k);
    if (next === effectiveColorTempK(it)) return;
    it.emitterColorTempK = next;
    reassignLampShadows();
    syncLampShadeEmissive(it); // 갓 자신의 발광도 같이 — 없으면 웅덩이만 색이 바뀐다
  }

  /** 선택 아이템의 램프 조절 상태 — UI가 그릴 값 전부를 담는다. 램프가 아니면 null. */
  function lampInfo(itemId: string): LampInfo | null {
    const it = items.find((i) => i.id === itemId);
    const op = it?.spec.optical;
    if (!it || !op) return null;
    return {
      brightnessScale: it.emitterBrightnessScale ?? 1,
      colorTempK: effectiveColorTempK(it),
      baseLumens: op.lumens,
      effectiveLumens: effectiveLumens(it),
      colorTempSpec: specSpan(op.colorTempMinK, op.colorTempMaxK),
      brightnessSpec: specSpan(op.lumensMinLm, op.lumensMaxLm),
      colorTempMarker: colorTempMarkerSpan(op.colorTempMinK, op.colorTempMaxK),
      brightnessMarker: brightnessMarkerSpan(op.lumens, op.lumensMinLm, op.lumensMaxLm),
    };
  }

  function lightingInfo(): LightingInfo {
    // 기준은 **배치된 램프**다 — `i.light`로 세면 슬롯을 못 받은 램프가 통째로 빠져
    // HUD·e2e가 실제 배치와 어긋난다 (235 부수 결정 1, 스파이크에서 발견한 버그).
    const lamps = lampItems();
    const lit = lamps.filter((i) => i.light);
    const cookie = lightSlots.cookieInfo();
    return {
      roomLightOn: room.roomOn(),
      lampCount: lamps.length,
      // room key(=태양)는 야간에도 castShadow=true인 채 세기만 0이라(235) 플래그가
      // 아니라 sunOn으로 센다. 방 조명 off는 태양을 끄지 않는다(ADR-0030 결정 4).
      shadowCasters: (room.sunOn() ? 1 : 0) + lit.filter((i) => i.light!.castShadow).length,
      unlitLampCount: lamps.length - lit.length,
      lamps: lamps.map((i) => ({
        // 규격이 아니라 인스턴스 반영값이다 (287) — 사용자 조절이 실제 광원에 실렸는지
        // e2e·QA가 이 두 값으로 잰다.
        colorTempK: effectiveColorTempK(i),
        lumens: effectiveLumens(i),
        distribution: i.spec.optical!.distribution,
        // 미배정 램프는 광원이 없다 — 각도는 배광 규격에서 유도한다(슬롯에 싣는 값과 같다).
        angle: beamHalfAngleRad(i.spec.optical!.distribution),
        castShadow: i.light?.castShadow ?? false,
      })),
      shadowMapEnabled: renderer.shadowMap.enabled,
      cookies: cookie.slots,
      cookieBakes: cookie.bakes,
      shaderProgramCount: renderer.info.memory.programs,
    };
  }

  /** driver 관절만 조작 가능하다 — 종속 관절은 driver를 따라 재계산된다. */
  function articulate(placedId: string, jointId: string, value: number): number | null {
    const it = items.find((i) => i.id === placedId);
    const target = it?.joints?.get(jointId);
    if (!it || !target || target.joint.coupledTo) return null;
    const applied = setJointValue(target, value);
    for (const dep of it.joints!.values()) {
      if (dep.joint.coupledTo?.joint !== jointId) continue;
      setJointValue(dep, coupledValue(dep.joint, applied)); // 로드 경로와 같은 산술을 공유한다
    }
    recomputeCollisions(); // 포즈 변경 → 파트 OBB가 matrixWorld로 따라옴 (설계 §3.2)
    scheduleContactShadows(); // pose changed -> re-bake grounding
    logPlacementChange('articulate', { placedId, jointId, value: applied });
    return applied;
  }

  /** UI-facing driver joint list (종속 관절은 사용자가 만지지 않으므로 뺀다). */
  function jointStates(placedId: string): JointUiState[] {
    const it = items.find((i) => i.id === placedId);
    if (!it?.joints) return [];
    return [...it.joints.values()]
      .filter((j) => isDriver(j.joint))
      .map((j) => {
        const kind = jointKind(j.joint);
        const { min, max } = jointLimits(j.joint);
        return {
          id: j.joint.joint,
          label: j.joint.label,
          kind,
          unit: kind === 'prismatic' ? ('mm' as const) : ('°' as const),
          value: j.value,
          min,
          max,
        };
      });
  }

  /** gizmo·드래그용 driver 관절 핸들 — 좌표·축은 월드 공간(m). */
  function jointHandles(placedId: string): JointHandle[] {
    const it = items.find((i) => i.id === placedId);
    if (!it?.joints) return [];
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    return [...it.joints.values()]
      .filter((j) => isDriver(j.joint))
      .map((j) => {
        j.pivot.getWorldPosition(pos);
        j.pivot.getWorldQuaternion(quat);
        axis.copy(j.axis).applyQuaternion(quat).normalize();
        const { min, max } = jointLimits(j.joint);
        return {
          id: j.joint.joint,
          kind: jointKind(j.joint),
          point: [pos.x, pos.y, pos.z] as Vec3,
          axis: [axis.x, axis.y, axis.z] as Vec3,
          localAxis: j.joint.axis,
          value: j.value,
          min,
          max,
        };
      });
  }

  // GPU teardown for parametric builds (buildProp/buildDesk): geometry,
  // materials and their per-build CanvasTextures (monitor screen) are all
  // created fresh per group — safe to free. NOT for GLB instances (shared
  // template resources — see disposeItem).
  function disposeParametric(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      // 인스턴스 행렬 버퍼는 지오메트리가 아니라 InstancedMesh가 쥔다 — dispose()를 따로
      // 부르지 않으면 테마 슬랫처럼 인스턴싱한 장식이 교체될 때마다 GPU 버퍼가 남는다.
      const inst = mesh as THREE.InstancedMesh;
      if (inst.isInstancedMesh) inst.dispose();
      // 사용자 사진이 올라가 있으면 map은 사진이고 절차 기본 화면 텍스처는 userData에서만
      // 참조된다 — 따로 놓지 않으면 아이템을 지울 때마다 CanvasTexture가 남는다.
      (mesh.userData.defaultScreenTexture as THREE.Texture | undefined)?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as THREE.MeshStandardNodeMaterial;
        sm.map?.dispose();
        sm.emissiveMap?.dispose();
        m.dispose();
      }
    });
  }

  function disposeItem(it: PlacedItem): void {
    // 램프·발광 광원(`light`·`emitterLight`)은 슬롯 풀 소유라 아이템이 해제하지 않는다 —
    // 삭제 후에도 슬롯은 살아 있어야 하고(그게 셰이더 재빌드 회피의 전부다) 세기 0으로
    // 꺼지는 것은 뒤따르는 재배정이 한다 (235). 방 조명 리그와 같은 수명이다.
    disposeGroup(it.group);
  }

  function disposeGroup(group: THREE.Object3D): void {
    if (group.userData.fromGLB) {
      // GLB clone: geometry/textures belong to the preloaded template (reused by
      // future placements) — free only the per-instance materials (skin/clones).
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      });
    } else {
      disposeParametric(group);
    }
  }

  function clearPlaced(): void {
    // 결합된 모니터는 암 피벗의 자식이다 — 암을 먼저 dispose하면 disposeGroup의 GLB
    // 분기(재질만 해제)가 traverse로 모니터 메쉬까지 먹고, 이어서 모니터 자신의
    // 파라메트릭 dispose가 같은 재질을 또 해제한다. dispose 경계를 아이템 경계와
    // 맞춰 두면 두 분기가 서로의 서브트리를 넘보지 않는다. 재스냅은 불필요 —
    // 바로 다음 줄에서 전부 사라진다.
    for (const it of items) {
      if (!it.mountedToId) continue;
      it.group.removeFromParent();
      it.mountedToId = undefined;
    }
    for (const it of items) disposeItem(it);
    placedRoot.clear();
    items.length = 0;
    drops.clear();
    mounts.clear();
    edgeSnapSig.clear();
    for (const t of rejectFlashTimers.values()) window.clearTimeout(t);
    rejectFlashTimers.clear();
    // 빈 배열을 배정해 잔여 슬롯을 전부 세기 0으로 되돌린다 — 아이템을 지워도 슬롯은
    // 살아 있으므로(풀 소유) 여기서 안 끄면 사라진 발광체의 스필이 남는다 (235).
    reassignLampShadows();
    reassignEmitterLights();
    scheduleContactShadows();
  }

  function setDesk(config: DeskConfig): void {
    scene.remove(desk);
    disposeParametric(desk); // 책상은 항상 절차 생성 — geometry·material 해제 안전
    clearPlaced(); // 규격이 바뀌면 기존 배치의 유효성을 보장할 수 없다
    deskConfig = config;
    desk = buildDesk(config);
    scene.add(desk);
    fitFrontWall(config);
    // 새 책상이 기존 벽 거리보다 넓으면 벽이 관통한다 — 같은 최소 거리 클램프를 태워 벽을 밀어낸다.
    setWallDistance('left', -WALL_LEFT_X);
    setWallDistance('right', WALL_RIGHT_X);
    // re-fit both contact rigs to the new desk footprint/height
    const si = surfaceInfo();
    deskContact.setExtent(si.halfW * 2, si.halfD * 2);
    deskContact.group.position.y = si.topY;
    floorContact.setExtent(
      si.halfW * 2 + FLOOR_CONTACT_MARGIN,
      si.halfD * 2 + FLOOR_CONTACT_MARGIN,
    );
    scheduleContactShadows();
  }

  function chooseDesk(id: string): void {
    const spec = getProduct(id);
    if (!spec || spec.kind !== 'surface') return;
    setDesk(deskConfigFromProduct(spec));
  }

  /** VESA 결합 표현 — 스탠드를 숨기고 충돌 파트를 다시 만든다 (설계 §2.4).
   *  모니터↔암 attach 판정(REQ-CMP-02)이 들어오면 여기에 연결한다. */
  function setMonitorMounted(id: string, mounted: boolean): boolean {
    const it = items.find((i) => i.id === id);
    const stand = it?.group.userData.standGroup as THREE.Group | undefined;
    if (!it || !stand) return false;
    stand.visible = !mounted;
    it.collider = buildItemCollider(it.group);
    recomputeCollisions();
    scheduleContactShadows();
    return true;
  }

  // --- 모니터↔암 자석 결합 (REQ-SIM-22, D22) ----------------------------------
  // "결합의 자석은 판정의 보상" — 판정 ②가 FIT·CONDITIONAL일 때만 붙는다.
  // 붙는 방식은 씬 그래프 부모 변경이라 관절을 움직이면 모니터가 공짜로 따라온다.

  const mountCbs: ((e: MountEvent) => void)[] = [];
  function emitMount(e: MountEvent): void {
    for (const cb of mountCbs) cb(e);
  }

  /** head-mount 세그먼트 메쉬가 실제로 매달린 피벗 (모니터의 새 부모). */
  function mountPivot(it: PlacedItem): THREE.Object3D | null {
    const rig = it.spec.rig;
    if (!rig?.mountPart || !it.joints) return null;
    const idx = segmentPivotIndex(rig.joints, rig.mountPart);
    if (idx < 0) return null;
    return it.joints.get(rig.joints[idx].joint)?.pivot ?? null;
  }

  /** 결합 앵커 = mountPart(VESA 판) 박스의 **접합면** 중앙 — 판 중심이 아니다.
   *  중심에 패널 뒷면을 붙이면 판 두께의 절반이 모니터 안에 박혀 암 헤드가 화면을
   *  뚫고 나온다. 접합면은 결합 피벗 로컬 +Z 바깥면이다: `tryMountMonitor`가 모니터
   *  자세로 피벗의 월드 쿼터니언을 그대로 쓰므로 패널 뒷면의 법선이 곧 피벗 +Z다.
   *  판 메쉬는 이 피벗의 자식이라 피벗 로컬 박스는 관절 포즈와 무관하다 (규격이
   *  아니라 기하 연출이다). 피벗을 못 찾으면 종전대로 월드 박스 중심으로 폴백한다. */
  function mountAnchor(it: PlacedItem): THREE.Vector3 | null {
    const rig = it.spec.rig;
    if (!rig?.mountPart) return null;
    const names = new Set(rig.segments[rig.mountPart] ?? []);
    const parts = it.collider.parts.filter((p) => names.has(p.mesh.name));
    if (!parts.length) return null;
    const pivot = mountPivot(it);
    if (!pivot) {
      const world = new THREE.Box3();
      for (const p of parts) world.union(new THREE.Box3().setFromObject(p.mesh));
      return world.getCenter(new THREE.Vector3());
    }
    pivot.updateWorldMatrix(true, false);
    const inv = pivot.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    for (const p of parts) {
      p.mesh.updateWorldMatrix(true, false);
      const local = new THREE.Box3().copy(p.localBox);
      box.union(local.applyMatrix4(inv.clone().multiply(p.mesh.matrixWorld)));
    }
    const a = mountFaceAnchorLocal(box.min, box.max);
    return pivot.localToWorld(new THREE.Vector3(a.x, a.y, a.z));
  }

  function mountPoints(): MountPoint[] {
    const out: MountPoint[] = [];
    for (const it of items) {
      if (!it.spec.arm) continue;
      const p = mountAnchor(it);
      if (p) out.push({ armId: it.id, point: [p.x, p.y, p.z] });
    }
    return out;
  }

  function tryMountMonitor(monitorId: string, armId: string): MountResult | null {
    const mon = items.find((i) => i.id === monitorId);
    const arm = items.find((i) => i.id === armId);
    if (!mon?.spec.monitor || !arm?.spec.arm || mon.mountedToId) return null;
    if (items.some((i) => i.mountedToId === armId)) return null; // 암 하나에 모니터 하나
    const judgment = judgeMonitorArm(mon.spec.monitor, arm.spec.arm);
    if (judgment.result === 'INCOMPATIBLE') {
      emitMount({ kind: 'rejected', monitorId, armId, judgment });
      return { judgment, mounted: false }; // 자석 미발동 — 씬은 한 글자도 안 바뀐다
    }
    const pivot = mountPivot(arm);
    const anchor = mountAnchor(arm);
    const local = mon.group.userData.mountLocal as THREE.Vector3 | undefined;
    if (!pivot || !anchor || !local) return null;

    // 붙기 직전의 월드 포즈 — 부착 트윈의 출발점이다. attach 뒤에는 못 읽는다.
    mon.group.updateWorldMatrix(true, false);
    const w0p = mon.group.getWorldPosition(new THREE.Vector3());
    const w0q = mon.group.getWorldQuaternion(new THREE.Quaternion());

    // 월드 트랜스폼으로 자세를 잡고 attach로 부모를 바꾼다 — attach가 부모의 균일
    // 스케일(GLB 실측 보정 3.33배)을 로컬 스케일로 상쇄해 준다.
    const q = pivot.getWorldQuaternion(new THREE.Quaternion());
    mon.group.quaternion.copy(q);
    mon.group.position.copy(anchor).sub(local.clone().applyQuaternion(q));
    pivot.attach(mon.group);
    drops.delete(mon.id); // 착지 트윈이 남아 있으면 로컬 y를 덮어써 모니터가 흘러내린다

    // 출발 포즈를 같은 피벗 로컬 좌표계로 옮겨 둔다. 목표는 지금 막 attach가 남긴
    // 로컬값 그대로 — 트윈이 끝나면 정확히 여기로 안착한다.
    pivot.updateWorldMatrix(true, false);
    const toPos = mon.group.position.clone();
    const toQuat = mon.group.quaternion.clone();
    const fromPos = w0p.applyMatrix4(pivot.matrixWorld.clone().invert());
    const fromQuat = pivot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(w0q);

    mon.mountedToId = armId;
    // 판정·콜라이더는 **목표 포즈**에서 굳힌다 — 되감기를 먼저 하면 출발 위치로
    // 겹침을 계산해 버린다(드롭 트윈이 restY를 정본으로 두는 것과 같은 이유).
    setMonitorMounted(monitorId, true); // 스탠드 숨김 + 콜라이더 재생성 + 재판정
    emitMount({ kind: 'mounted', monitorId, armId, judgment });

    // 여기서부터는 시각 표현만 — 출발 포즈로 되감고 tick이 목표까지 끌고 간다.
    mounts.set(monitorId, { elapsedMs: 0, fromPos, toPos, fromQuat, toQuat });
    mon.group.position.copy(fromPos);
    mon.group.quaternion.copy(fromQuat);
    return { judgment, mounted: true };
  }

  function detachMonitor(monitorId: string, opts?: DetachOptions): boolean {
    const mon = items.find((i) => i.id === monitorId);
    if (!mon?.mountedToId) return false;
    const armId = mon.mountedToId;
    const arm = items.find((i) => i.id === armId);
    mounts.delete(monitorId); // 부착 트윈 중 되뗐으면 목표로 계속 끌려가면 안 된다
    placedRoot.attach(mon.group);
    mon.group.scale.set(1, 1, 1); // attach가 남긴 스케일 상쇄분의 부동소수 찌꺼기 제거
    // attach는 결합 자세를 그대로 물려준다 — 관절이 돌아간 암이거나 부착 트윈 중이면
    // x·z 축 기울기가 섞여 있다. resnap은 yaw(y)와 사용자 pitch(x)만 다시 넣으므로
    // 여기서 비워야 암 자세의 잔여 기울기가 상판 위 모니터에 남지 않는다.
    mon.group.rotation.set(0, 0, 0);
    mon.mountedToId = undefined;
    setMonitorMounted(monitorId, false);
    // 복귀 위치: `at`이 있으면 그 좌표(드래그 재분리 — 포인터를 그대로 따라간다),
    // 없으면 암 옆(+X) 상판으로 재스냅(분리 버튼 경로, 종전 동작 그대로).
    // 어느 쪽이든 겹침은 소프트 규약(빨강)이 잡는다 (duplicateItem 관례).
    const dx = mmToM((arm?.spec.widthMm ?? 0) + mon.spec.widthMm) / 2 + DUPLICATE_GAP_M;
    const targetX = opts?.at ? opts.at.x : (arm?.center.x ?? mon.center.x) + dx;
    const targetZ = opts?.at ? opts.at.z : (arm?.center.z ?? mon.center.z);
    const clamped = clampToWalls(mon.spec, targetX, targetZ, mon.yawDeg);
    mon.center.x = clamped.x;
    mon.center.z = clamped.z;
    // 매달려 있던 높이는 의미를 잃었다 — 상판에 다시 내려놓는 경로라 높이를 초기화한다.
    resnap(mon, { initHeight: true });
    emitMount({ kind: 'detached', monitorId, armId });
    return true;
  }

  return {
    scene,
    get desk() {
      return desk;
    },
    setRoomLight,
    roomLightOn: room.roomOn,
    lightingInfo,
    setWall,
    wallState,
    setWallDistance,
    wallDistance,
    setFrontWallGap,
    frontWallGap,
    applyRoom,
    roomConfig: () => currentRoom,
    roomSurfaceNames: () => ({
      walls: {
        left: (walls.left.material as THREE.Material).name,
        front: (walls.front.material as THREE.Material).name,
        right: (walls.right.material as THREE.Material).name,
      },
      floor: (env.ground.material as THREE.Material).name,
    }),
    chooseDesk,
    setMonitorMounted,
    mountPoints,
    tryMountMonitor,
    detachMonitor,
    flashReject,
    onMountEvent: (cb) => {
      mountCbs.push(cb);
    },
    setDesk,
    deskConfig: () => deskConfig,
    frontWallZ: () => front.position.z,
    ensureTemplate,
    prefetchTemplate: (spec: ProductSpec) => assets?.prefetch(spec),
    placeAt,
    moveItem,
    moveItemOnWall,
    pickWall,
    moveItemOnPegboard,
    pickPegboard,
    pickMonitorTop,
    moveItemOnMonitorTop,
    restorePose,
    rotateItem,
    liftItem,
    tiltItem,
    removeItem,
    duplicateItem,
    tick,
    ghostShow,
    ghostMove,
    ghostShowOnWall,
    ghostShowOnPegboard,
    ghostShowOnMonitorTop,
    ghostHide,
    articulate,
    jointStates,
    jointGizmo,
    jointHandles,
    rotateGizmo,
    boundaryGuide,
    rotateHandle,
    clearPlaced,
    placed: () => items,
    anyCollision: () => items.some((i) => i.collided),
    anyBoundaryViolation: () => items.some((i) => i.boundary),
    setCollisionIgnored,
    surfaceInfo,
    setEmitterColor,
    setEmitterOn,
    emitterInfo,
    setScreenPhoto,
    screenInfo,
    setLampBrightnessScale,
    setLampColorTempK,
    lampInfo,
    setBackendId,
  } as SimScene;
}
