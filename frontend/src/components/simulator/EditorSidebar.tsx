'use client';
// 좌측 세로 아이콘 레일 — 저장 + 실행 취소/다시 실행(스택) + 제품·찜·벽·시점 4개
// 카테고리(찜은 2026-08-06 추가 — 좋아요한 제품만 모아 보는 LikedProductsPanel.tsx)
// + 전체 화면 토글. 카테고리를 클릭하면 레일 옆에 플라이아웃 패널이 하나만 뜬다
// (다른 카테고리를 누르면 이전 플라이아웃이 닫힘). 저장·실행 취소/다시
// 실행·전체 화면은 카테고리가 아니라 단발 액션/토글이라 플라이아웃을 열지 않는다.
// (2026-08-03) 견적서는 더 이상 이 레일에서 여는 전체 화면 팝업이 아니다 — 우측 상시
// 노출 팝업(EstimatePanel.tsx, SimHud.tsx가 조립)으로 옮겨갔다.
// (2026-07-27) 조명(방 조명) on/off·외곽선 on/off는 상단 네비바(EditorTopBar.tsx)로
// 옮겨갔다 — 예전 '조명' 카테고리는 방 조명이 빠지며 벽 스위치만 남아 '벽'으로 개명.
// 저장은 우측 상단에서 이 레일로 옮겨왔다.
// (2026-07-28) 제품 플라이아웃(LibraryPanel)이 화면 오른쪽 하단 고정으로 잠깐
// 분리됐었으나, 좌측 레일 바로 옆이 더 낫다는 피드백으로 벽/시점과 같은
// editor-rail-flyout으로 되돌렸다.
// (2026-08-03) '벽' 플라이아웃의 벽지 색·바닥 색 피커(2026-07-28 추가분)를 방 프리셋
// 선택으로 대체했다 — 자유 hex는 영구 금지다.
// (2026-08-08 DERO-508) 그 아래에 벽면 선택 → 계열 → 변형 단계를 놓았다. 프리셋 칩은
// 남지만 이제 **값을 써넣는 버튼**이다 — 누른 뒤 한 면만 고쳐도 그 수정이 유지된다
// (ADR-0030 결정 1). 계열·변형 목록은 레지스트리(WALL_FINISHES·FLOOR_FINISHES)를 그대로
// 순회하므로 계열을 늘려도 이 파일에 손댈 것이 없다.

import { Fragment, useState } from 'react';
import type { WallSide } from '@/three/scene/scene';
import { FLOOR_FINISHES, WALL_FINISHES } from '@/three/finishes';
import type { FinishConfig, FinishVariant, TimeOfDay } from '@/three/finishes/types';
import { ROOM_PRESETS, roomPresetKeyOf } from '@/three/finishes/presets';
import {
  windowAtSlot,
  windowSlotOf,
  windowSizeOf,
  windowWithSize,
  type WindowSizeKey,
  type WindowSlotKey,
} from '@/three/core/window';
import type { PresetName } from '@/three/render/camera';
import { useSimulatorStore } from '@/store/simulatorStore';
import { uploadPlacementThumbnail } from '@/api/placement';
import SidebarIcon, { type SidebarCategory } from './SidebarIcon';
import CameraPresetIcon from './CameraPresetIcon';
import CommitNumberInput from './CommitNumberInput';
import LightSwitch from './LightSwitch';
import LibraryPanel from './LibraryPanel';
import LikedProductsPanel from './LikedProductsPanel';
import WallDiagram from './WallDiagram';

const WALLS: { side: WallSide; label: string }[] = [
  { side: 'left', label: '벽 좌' },
  { side: 'right', label: '벽 우' },
  { side: 'front', label: '벽 전면' },
];

/** 벽까지 거리 최소/최대 버튼용 — 실제 값은 scene.ts의 클램프(책상 반폭+여백 / 3m)가
 *  정하므로 여기선 그 범위를 확실히 벗어나는 극단값만 보내면 된다. */
const WALL_DISTANCE_MIN_SENTINEL_MM = 0;
const WALL_DISTANCE_MAX_SENTINEL_MM = 100_000;

/** 타이핑 커밋의 클램프 범위 — 극단값 센티넬과 달리 사람이 칠 수 있는 범위여야 한다.
 *  하한은 엔진의 전면 간격 최소(1mm)이고 좌/우의 진짜 하한(책상 반폭+여백)은 규격마다
 *  달라 엔진이 적용 시점에 다시 좁힌다. 상한은 엔진 클램프와 같은 3m. */
const WALL_DISTANCE_INPUT_MIN_MM = 1;
const WALL_DISTANCE_INPUT_MAX_MM = 3000;

/** 방 프리셋 칩 — 레지스트리를 그대로 순회한다. 라벨·칩 2색은 각 프리셋이 들고 있으므로
 *  프리셋을 늘려도 이 파일에 손댈 것이 없다(ADR-0030 결정 1). */
const PRESET_LIST = Object.values(ROOM_PRESETS);

/** 마감을 고를 수 있는 면 — 벽 3면 + 바닥. 바닥은 계열 레지스트리가 달라 따로 분기한다. */
const SURFACES: { key: WallSide | 'floor'; label: string }[] = [
  { key: 'left', label: '좌' },
  { key: 'front', label: '전면' },
  { key: 'right', label: '우' },
  { key: 'floor', label: '바닥' },
];

/** 시간대는 2값이다 — 연속 시각별 태양 궤적은 폐기 유지(ADR-0030 부결 표). */
const TIMES_OF_DAY: { key: TimeOfDay; label: string }[] = [
  { key: 'DAY', label: '주간' },
  { key: 'NIGHT', label: '야간' },
];

/** 창문 슬롯 — UI는 유한 슬롯, 저장은 mm다(ADR-0030 결정 6). 값 정본은 core/window.ts. */
const WINDOW_SLOTS: { key: WindowSlotKey; label: string }[] = [
  { key: 'LEFT', label: '좌' },
  { key: 'CENTER', label: '중' },
  { key: 'RIGHT', label: '우' },
];

const WINDOW_SIZE_OPTIONS: { key: WindowSizeKey; label: string }[] = [
  { key: 'STANDARD', label: '스탠다드' },
  { key: 'WIDE', label: '와이드' },
];

const PRESETS: { name: PresetName; label: string }[] = [
  { name: 'hero', label: '히어로' },
  { name: 'first-person', label: '1인칭' },
  { name: 'front', label: '전면' },
  { name: 'back', label: '후면' },
  { name: 'side', label: '측면' },
  { name: 'top', label: '탑뷰' },
];

const RAIL_ITEMS: { key: SidebarCategory; label: string }[] = [
  { key: 'product', label: '제품' },
  { key: 'liked', label: '찜' },
  { key: 'wall', label: '벽' },
  { key: 'view', label: '시점' },
];

/** 플라이아웃 렌더 상태 — 열린 카테고리 키 하나뿐(또는 없음). 등장/퇴장 애니메이션이
 *  없어져(2026-08-03 사용자 요청) 닫기를 누르면 바로 언마운트한다 — 예전엔 퇴장 애니메이션이
 *  끝날 때까지 렌더를 유지하는 `phase:'in'|'out'` 2단 상태가 있었지만 지금은 불필요하다. */
type FlyoutState = SidebarCategory | null;

const EditorSidebar = () => {
  const [flyout, setFlyout] = useState<FlyoutState>(null);
  // 어느 면을 편집 중인지는 화면 상태다 — 저장되지 않는다. 전면이 기본인 이유는 기본
  // 카메라(hero)가 가장 넓게 보는 면이기 때문이다.
  const [surface, setSurface] = useState<WallSide | 'floor'>('front');

  const isFullscreen = useSimulatorStore((s) => s.isFullscreen);
  const toggleFullscreen = useSimulatorStore((s) => s.toggleFullscreen);
  const wallState = useSimulatorStore((s) => s.wallState);
  const wallDistanceMm = useSimulatorStore((s) => s.wallDistanceMm);
  const frontWallGapMm = useSimulatorStore((s) => s.frontWallGapMm);
  const roomConfig = useSimulatorStore((s) => s.roomConfig);
  const activePreset = useSimulatorStore((s) => s.activePreset);
  const setWall = useSimulatorStore((s) => s.setWall);
  const setWallDistance = useSimulatorStore((s) => s.setWallDistance);
  const setFrontWallGap = useSimulatorStore((s) => s.setFrontWallGap);
  const setWallFinish = useSimulatorStore((s) => s.setWallFinish);
  const setFloorFinish = useSimulatorStore((s) => s.setFloorFinish);
  const setWallWindow = useSimulatorStore((s) => s.setWallWindow);
  const applyRoomPreset = useSimulatorStore((s) => s.applyRoomPreset);
  const setTimeOfDay = useSimulatorStore((s) => s.setTimeOfDay);
  const setCameraPreset = useSimulatorStore((s) => s.setCameraPreset);
  const moveHistory = useSimulatorStore((s) => s.moveHistory);
  const redoHistory = useSimulatorStore((s) => s.redoHistory);
  const undoLastMove = useSimulatorStore((s) => s.undoLastMove);
  const redoMove = useSimulatorStore((s) => s.redoMove);
  const trySave = useSimulatorStore((s) => s.trySave);
  const editLocked = useSimulatorStore((s) => s.editLocked);
  const placementId = useSimulatorStore((s) => s.placementId);
  const captureThumbnail = useSimulatorStore((s) => s.captureThumbnail);
  const showToast = useSimulatorStore((s) => s.showToast);

  const toggle = (key: SidebarCategory): void => {
    setFlyout((current) => (current === key ? null : key));
  };

  // 지금 고른 면의 마감과, 그 면이 고를 수 있는 계열 목록. 벽과 바닥은 레지스트리가 다르다.
  const isFloor = surface === 'floor';
  const finish: FinishConfig = isFloor ? roomConfig.floor : roomConfig.walls[surface];
  const families = Object.values(isFloor ? FLOOR_FINISHES : WALL_FINISHES);
  // 미상 계열(계열을 지운 뒤 열린 옛 배치)은 목록에 없다 — 그때는 계열 선택이 비고 변형도
  // 안 그린다. 씬은 이미 폴백을 그리고 있으므로, 사용자가 계열을 고르면 정상 궤도로 돌아온다.
  const variants: readonly FinishVariant[] =
    families.find((f) => f.family === finish.material)?.variants ?? [];
  const applyFinish = (next: FinishConfig): void => {
    if (isFloor) setFloorFinish(next);
    else setWallFinish(surface, next);
  };
  // 창문은 벽 면에만 있다 — 바닥 탭에서는 절이 통째로 빠진다. 슬롯 밖 mm(원격 자유 값)로
  // 저장된 창문은 슬롯 칩이 아무것도 안 켜진 채 존재만 표시된다.
  const wallWindow = !isFloor ? roomConfig.walls[surface].window : undefined;
  const windowSlot = !isFloor && wallWindow ? windowSlotOf(surface, wallWindow) : null;
  const windowSize = wallWindow ? windowSizeOf(wallWindow) : null;
  // 슬롯·크기 클릭은 각각 그 축만 바꾼다(core/window.ts) — 슬롯 밖 자유 mm로 저장된
  // 창문(원격 데이터)의 나머지 기하를 클릭 한 번이 지우면 안 된다.
  const applyWindowSlot = (slot: WindowSlotKey | null): void => {
    if (isFloor) return;
    setWallWindow(surface, slot ? windowAtSlot(surface, slot, wallWindow ?? null) : null);
  };
  const applyWindowSize = (size: WindowSizeKey): void => {
    if (isFloor || !wallWindow) return;
    setWallWindow(surface, windowWithSize(wallWindow, size));
  };
  // "적용된 프리셋"이라는 상태는 없다 — 값이 같은지로만 답한다(한 면만 고치면 null).
  const presetKey = roomPresetKeyOf(roomConfig);

  const handleCaptureThumbnail = async (): Promise<void> => {
    if (!placementId) return;
    const blob = await captureThumbnail();
    if (!blob) return;
    try {
      await uploadPlacementThumbnail(placementId, blob);
      showToast('미리보기 이미지가 저장되었습니다');
    } catch (error) {
      console.error('[EditorSidebar] 미리보기 저장에 실패했습니다', error);
      showToast('미리보기 저장에 실패했습니다');
    }
  };

  return (
    <>
      <div className="editor-sidebar">
        <div className="glass hud editor-rail" data-testid="editor-rail">
          <button
            type="button"
            className="rail-btn"
            data-testid="save-layout"
            onClick={() => trySave()}
          >
            <SidebarIcon name="save" width={18} height={18} />
            저장
          </button>

          <button
            type="button"
            className="rail-btn"
            data-testid="capture-thumbnail"
            disabled={!placementId}
            title={
              placementId
                ? undefined
                : '이어서 편집 중인 배치는 아직 미리보기 촬영을 지원하지 않습니다'
            }
            onClick={() => void handleCaptureThumbnail()}
          >
            <SidebarIcon name="camera" width={18} height={18} />
            미리보기 촬영
          </button>

          <div className="editor-rail-divider" aria-hidden="true" />

          <button
            type="button"
            className="rail-btn"
            data-testid="undo-move"
            disabled={moveHistory.length === 0 || editLocked}
            onClick={() => undoLastMove()}
          >
            <SidebarIcon name="undo" width={18} height={18} />
            실행 취소
          </button>
          <button
            type="button"
            className="rail-btn"
            data-testid="redo-move"
            disabled={redoHistory.length === 0 || editLocked}
            onClick={() => redoMove()}
          >
            <SidebarIcon name="redo" width={18} height={18} />
            다시 실행
          </button>

          <div className="editor-rail-divider" aria-hidden="true" />

          {/* 조건부 template literal 금지 — prettier-plugin-tailwindcss가 선행 공백을 삼켜
              rail-btnactive로 융합시킨다(simulator/CLAUDE.md trap, 2026-08-05 실제 재발). */}
          {RAIL_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={flyout === item.key ? 'rail-btn active' : 'rail-btn'}
              data-testid={`rail-${item.key}`}
              onClick={() => toggle(item.key)}
            >
              <SidebarIcon name={item.key} width={18} height={18} />
              {item.label}
            </button>
          ))}

          <button
            type="button"
            className={isFullscreen ? 'rail-btn active' : 'rail-btn'}
            data-testid="toggle-fullscreen"
            onClick={toggleFullscreen}
          >
            <SidebarIcon
              name={isFullscreen ? 'fullscreen-exit' : 'fullscreen-enter'}
              width={18}
              height={18}
            />
            전체 화면
          </button>
        </div>

        {(flyout === 'product' || flyout === 'liked' || flyout === 'wall' || flyout === 'view') && (
          <div
            className={[
              'glass hud editor-rail-flyout',
              flyout === 'view' && 'editor-rail-flyout-compact',
              (flyout === 'product' || flyout === 'liked') && 'editor-rail-flyout-product',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="editor-rail-flyout"
          >
            {/* '찜'도 제품 플라이아웃과 같은 레이아웃 계약(제목 고정 + 갤러리만 내부 스크롤)이라
                같은 -product 수식자를 공유한다 — 이름은 제품 전용처럼 보이지만 실제로는
                "고정 헤더 + 자체 스크롤 갤러리" 레이아웃을 쓰는 플라이아웃 공통 스위치다. */}
            {flyout === 'product' && <LibraryPanel />}
            {flyout === 'liked' && <LikedProductsPanel />}

            {flyout === 'wall' && (
              <div className="hud-wall-panel" data-testid="hud-wall">
                <WallDiagram
                  wallState={wallState}
                  onToggle={(side) => setWall(side, !wallState[side])}
                />
                <div className="light-list">
                  {WALLS.map((w, i) => {
                    const distanceSide = w.side === 'left' || w.side === 'right' ? w.side : null;
                    return (
                      <Fragment key={w.side}>
                        {i > 0 && <div className="editor-rail-divider" aria-hidden="true" />}
                        <div className="wall-row">
                          <LightSwitch
                            label={w.label}
                            checked={wallState[w.side]}
                            onToggle={() => setWall(w.side, !wallState[w.side])}
                            testId={`wall-${w.side}`}
                          />
                          {distanceSide ? (
                            <div className="wall-distance-row">
                              <span className="wall-distance-label">벽까지 거리</span>
                              <button
                                type="button"
                                className="wall-distance-btn"
                                data-testid={`wall-distance-min-${distanceSide}`}
                                onClick={() =>
                                  setWallDistance(distanceSide, WALL_DISTANCE_MIN_SENTINEL_MM)
                                }
                              >
                                최소
                              </button>
                              <CommitNumberInput
                                className="wall-distance-input"
                                testId={`wall-distance-${distanceSide}`}
                                label={`${w.label} 벽까지 거리(mm)`}
                                min={WALL_DISTANCE_INPUT_MIN_MM}
                                max={WALL_DISTANCE_INPUT_MAX_MM}
                                step={10}
                                value={wallDistanceMm[distanceSide]}
                                onCommit={(mm) => setWallDistance(distanceSide, mm)}
                              />
                              <span className="wall-distance-unit">mm</span>
                              <button
                                type="button"
                                className="wall-distance-btn"
                                data-testid={`wall-distance-max-${distanceSide}`}
                                onClick={() =>
                                  setWallDistance(distanceSide, WALL_DISTANCE_MAX_SENTINEL_MM)
                                }
                              >
                                최대
                              </button>
                            </div>
                          ) : (
                            // 전면 벽은 좌/우와 기준이 다르다 — 책상 중심 거리가 아니라
                            // 책상 뒷변과의 간격(mm). 정본 클램프는 엔진 setFrontWallGap.
                            <div className="wall-distance-row">
                              <span className="wall-distance-label">책상과 간격</span>
                              <button
                                type="button"
                                className="wall-distance-btn"
                                data-testid="wall-distance-min-front"
                                onClick={() => setFrontWallGap(WALL_DISTANCE_MIN_SENTINEL_MM)}
                              >
                                최소
                              </button>
                              <CommitNumberInput
                                className="wall-distance-input"
                                testId="wall-distance-front"
                                label="전면 벽과 책상의 간격(mm)"
                                min={WALL_DISTANCE_INPUT_MIN_MM}
                                max={WALL_DISTANCE_INPUT_MAX_MM}
                                step={10}
                                value={frontWallGapMm}
                                onCommit={setFrontWallGap}
                              />
                              <span className="wall-distance-unit">mm</span>
                              <button
                                type="button"
                                className="wall-distance-btn"
                                data-testid="wall-distance-max-front"
                                onClick={() => setFrontWallGap(WALL_DISTANCE_MAX_SENTINEL_MM)}
                              >
                                최대
                              </button>
                            </div>
                          )}
                        </div>
                      </Fragment>
                    );
                  })}
                </div>

                <div className="theme-row" data-testid="theme-row">
                  <span className="emit-label">방 프리셋</span>
                  <div className="theme-grid">
                    {PRESET_LIST.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        className={preset.key === presetKey ? 'theme-chip active' : 'theme-chip'}
                        data-testid={`theme-${preset.key}`}
                        aria-pressed={preset.key === presetKey}
                        disabled={editLocked}
                        onClick={() => applyRoomPreset(preset.key)}
                      >
                        <span
                          className="theme-chip-swatch"
                          aria-hidden="true"
                          style={{
                            background: `linear-gradient(135deg, ${preset.chipColors[0]} 0 50%, ${preset.chipColors[1]} 50% 100%)`,
                          }}
                        />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 시간대는 마감과 직교한 축이라 프리셋이 덮지 않는다(ADR-0030 결정 4).
                    누르면 방 조명이 기본값으로 따라 움직이고, 그 뒤 상단 바에서 조명만
                    따로 켜고 끌 수 있다 — 조합 4개가 전부 만들어진다. */}
                <div className="finish-row" data-testid="time-of-day-row">
                  <span className="emit-label">시간대</span>
                  <div className="finish-surface-row">
                    {TIMES_OF_DAY.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={
                          t.key === roomConfig.timeOfDay ? 'finish-tab active' : 'finish-tab'
                        }
                        data-testid={`time-of-day-${t.key}`}
                        aria-pressed={t.key === roomConfig.timeOfDay}
                        disabled={editLocked}
                        onClick={() => setTimeOfDay(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="finish-row" data-testid="finish-row">
                  <span className="emit-label">벽면 마감</span>
                  {/* 면을 먼저 고른다 — 세 면이 비슷하게 보이므로 지금 어느 면을 고치는지가
                      화면에 있어야 한다(사용자 스토리 7). 꺼 놓은 면도 고를 수 있다(8). */}
                  <div className="finish-surface-row">
                    {SURFACES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className={s.key === surface ? 'finish-tab active' : 'finish-tab'}
                        data-testid={`finish-surface-${s.key}`}
                        aria-pressed={s.key === surface}
                        onClick={() => setSurface(s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="finish-family-row">
                    {families.map((family) => (
                      <button
                        key={family.family}
                        type="button"
                        className={
                          family.family === finish.material ? 'finish-tab active' : 'finish-tab'
                        }
                        data-testid={`finish-family-${family.family}`}
                        aria-pressed={family.family === finish.material}
                        disabled={editLocked}
                        // 계열을 바꾸면 변형은 그 계열의 기본값으로 간다 — 계열마다 변형
                        // 집합이 달라 이전 변형 키를 그대로 넘기면 폴백이 대신 답한다.
                        onClick={() =>
                          applyFinish({ material: family.family, variant: family.defaultVariant })
                        }
                      >
                        {family.label}
                      </button>
                    ))}
                  </div>

                  {/* 변형은 계열이 노출하는 것만 나온다 — 자유 hex 피커는 영구 금지다
                      (나무에 초록을 먹이지 않는다, 사용자 스토리 4). */}
                  <div className="finish-variant-grid">
                    {variants.map((variant) => (
                      <button
                        key={variant.key}
                        type="button"
                        className={
                          variant.key === finish.variant
                            ? 'finish-variant active'
                            : 'finish-variant'
                        }
                        data-testid={`finish-variant-${variant.key}`}
                        aria-pressed={variant.key === finish.variant}
                        disabled={editLocked}
                        onClick={() =>
                          applyFinish({ material: finish.material, variant: variant.key })
                        }
                      >
                        <span
                          className="finish-variant-swatch"
                          aria-hidden="true"
                          style={{ background: variant.chipColor }}
                        />
                        {variant.label}
                      </button>
                    ))}
                  </div>

                  {/* 창문 — 벽 지오메트리에 실제로 뚫리는 구멍이다(ADR-0030 결정 5).
                      UI는 가로 3슬롯 × 크기 2종, 창턱 900mm 고정. 저장은 mm(결정 6).
                      바닥 탭에서는 이 절이 통째로 빠진다. */}
                  {!isFloor && (
                    <div data-testid="window-row">
                      <span className="emit-label">창문</span>
                      <div className="finish-surface-row">
                        <button
                          type="button"
                          className={wallWindow ? 'finish-tab' : 'finish-tab active'}
                          data-testid="window-slot-none"
                          aria-pressed={!wallWindow}
                          disabled={editLocked}
                          onClick={() => applyWindowSlot(null)}
                        >
                          없음
                        </button>
                        {WINDOW_SLOTS.map((slot) => (
                          <button
                            key={slot.key}
                            type="button"
                            className={slot.key === windowSlot ? 'finish-tab active' : 'finish-tab'}
                            data-testid={`window-slot-${slot.key}`}
                            aria-pressed={slot.key === windowSlot}
                            disabled={editLocked}
                            onClick={() => applyWindowSlot(slot.key)}
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                      {wallWindow && (
                        <div className="finish-surface-row">
                          {WINDOW_SIZE_OPTIONS.map((size) => (
                            <button
                              key={size.key}
                              type="button"
                              className={
                                size.key === windowSize ? 'finish-tab active' : 'finish-tab'
                              }
                              data-testid={`window-size-${size.key}`}
                              aria-pressed={size.key === windowSize}
                              disabled={editLocked}
                              onClick={() => applyWindowSize(size.key)}
                            >
                              {size.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {flyout === 'view' && (
              <div className="hud-camera" data-testid="hud-camera">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={activePreset === p.name ? 'cam-tab active' : 'cam-tab'}
                    data-testid={`cam-${p.name}`}
                    onClick={() => setCameraPreset(p.name)}
                  >
                    <CameraPresetIcon name={p.name} />
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default EditorSidebar;
