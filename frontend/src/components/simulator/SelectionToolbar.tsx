'use client';
// 선택된 3D 아이템 바로 위에 뜨는 부동 툴바 — 수동 3축(회전 · 기울기 · 높이) + 복제 ·
// 삭제 · 선택 해제 (ADR-0023 결정 6, REQ-SIM-35, DERO-409).
//
// 2026-08-03 폐기됐다가 2026-08-04 복구했다. **폐기 사유(조작 중 패널·마우스 동반 상승)의
// 원인은 부동 구조 자체가 아니라 조작 중에도 좌표를 따라간 것이다** — 그래서 조작이
// 시작되면 그 순간 화면 좌표를 동결하고(freeze), 조작이 끝나면 다시 추적한다. 이 동결이
// 이 컴포넌트의 존재 이유이므로 지우지 말 것.
//
// 세 축 모두 슬라이더가 아니라 숫자 입력 + 꾹 누르기 ± 쌍이다(정확한 값을 바로 타이핑하고
// 싶다는 피드백). 링 기즈모·R 키(394)는 큰 각을 휙 돌리는 도구로 **병존**하고 이 ± 버튼은
// 1~5° 미세 조정 도구다(결정 7).
//
// RenderLoop(SimulatorCanvas.tsx)가 Canvas 안에서 매 프레임 화면 좌표를 계산해
// selectionAnchor.ts로 밀어주면 여기서 DOM style을 직접 갱신한다(React 상태에 안 담아 매
// 프레임 리렌더를 피한다). 그 좌표는 utils/selectionToolbarPos.ts에서 뷰포트 안으로
// 클램프한다 — 키 큰 아이템이나 top 프리셋에서 툴바가 화면 위로 잘려 조작 불가가 되던
// 문제(2026-08-03).

import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSimulatorStore } from '@/store/simulatorStore';
import { subscribeSelectionAnchor } from '@/three/scene/selectionAnchor';
import { PITCH_LIMIT_DEG, LIFT_MAX_MM } from '@/three/scene/scene';
import { ANCHOR_GAP_PX, clampToolbarPos } from '@/utils/selectionToolbarPos';
import CommitNumberInput from './CommitNumberInput';
import SidebarIcon from './SidebarIcon';

/** 길게 누르는 동안 초당 회전량(도) — 한 바퀴에 약 3초 (ADR-0023 결정 6). */
const ROTATE_DEG_PER_SEC = 120;
/** 짧게 눌렀다 뗐을 때의 최소 회전량(도) — 탭이 아무 반응 없이 끝나지 않게. */
const ROTATE_TAP_DEG = 5;
/** 길게 누르는 동안 초당 기울기량(도) — 한쪽 끝(±75°)까지 약 2.5초 (결정 6). */
const TILT_DEG_PER_SEC = 30;
const TILT_TAP_DEG = 5;
/** 길게 누르는 동안 초당 높이량(mm) — 실사용 구간(상판 720 → 모니터 상단 ~1300mm)을 약 2초에
 *  훑는다. 상한이 2600mm로 늘었지만(DERO-588) 전 구간 왕복은 드문 조작이라 속도는 유지. */
const LIFT_MM_PER_SEC = 300;
/** 짧게 눌렀다 뗐을 때의 최소 높이 변화(mm) — 1mm는 아무 일도 안 일어난 것처럼 보인다. */
const LIFT_TAP_MM = 10;

/** 길게 누르기 축 정의 — 값의 정본은 항상 스토어이고 이 객체는 읽기·쓰기 경로만 준다. */
interface SpinAxis {
  /** 현재값을 스토어에서 직접 읽는다(렌더 클로저 값을 쓰면 한 프레임 뒤처진다). */
  get: () => number;
  set: (next: number) => void;
  perSec: number;
  tapStep: number;
}

/** 한 축의 값을 tapStep만큼 한 번 움직인다 — 짧은 탭과 키보드(Enter/Space)가 공유한다. */
const stepAxis = (axis: SpinAxis, dir: 1 | -1): void => axis.set(axis.get() + dir * axis.tapStep);

const SelectionToolbar = () => {
  const selectedItemId = useSimulatorStore((s) => s.selectedItemId);
  const selectedYawDeg = useSimulatorStore((s) => s.selectedYawDeg);
  const selectedPitchDeg = useSimulatorStore((s) => s.selectedPitchDeg);
  const selectedLiftMm = useSimulatorStore((s) => s.selectedLiftMm);
  const rotateSelected = useSimulatorStore((s) => s.rotateSelected);
  const tiltSelected = useSimulatorStore((s) => s.tiltSelected);
  const liftSelected = useSimulatorStore((s) => s.liftSelected);
  const duplicateSelected = useSimulatorStore((s) => s.duplicateSelected);
  const deleteSelected = useSimulatorStore((s) => s.deleteSelected);
  const selectItem = useSimulatorStore((s) => s.selectItem);
  const editLocked = useSimulatorStore((s) => s.editLocked);
  const elRef = useRef<HTMLDivElement>(null);
  // 매 프레임 offsetWidth를 읽으면 강제 리플로우가 난다 — 툴바는 내용이 고정이라 선택마다
  // 1회 측정이면 충분하다. resize에서만 캐시를 비운다.
  const metrics = useRef<{ w: number; h: number; vw: number; vh: number } | null>(null);
  /** 조작 중인 컨트롤 수 — 0보다 크면 앵커 갱신을 무시해 툴바를 그 자리에 세워 둔다.
   *  ± 꾹 누르기와 숫자 입력 편집이 겹칠 수 있어 불리언이 아니라 카운터다.
   *  **이것이 2026-08-03 폐기 사유(동반 상승)를 도려낸 부분이다** (ADR-0023 결정 6). */
  const freezeCount = useRef(0);

  const freeze = (): void => {
    freezeCount.current += 1;
  };
  const unfreeze = (): void => {
    freezeCount.current = Math.max(0, freezeCount.current - 1);
  };

  useEffect(
    () =>
      subscribeSelectionAnchor((pos) => {
        const el = elRef.current;
        if (!el) return;
        // 조작 중에는 좌표를 갱신하지 않는다 — 숨김 판정까지 멈춘다(조작 중에 아이템이
        // 화면 밖으로 나가는 것은 조작의 결과일 뿐이고, 그때 툴바가 사라지면 손이 끊긴다).
        if (freezeCount.current > 0) return;
        if (!pos) {
          el.style.visibility = 'hidden';
          return;
        }
        el.style.visibility = 'visible';
        if (metrics.current === null && el.offsetWidth > 0) {
          metrics.current = {
            w: el.offsetWidth,
            h: el.offsetHeight,
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        }
        const m = metrics.current;
        if (!m) {
          // 측정 전(레이아웃이 아직 없는 첫 프레임) — 클램프 없이 기존 방식으로 얹는다.
          el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, calc(-100% - ${ANCHOR_GAP_PX}px))`;
          return;
        }
        // m 하나가 ToolbarSize(w·h)와 Viewport(vw·vh) 필드를 모두 갖는다 — 매 프레임
        // 임시 객체를 두 개 만들지 않으려고 합쳐 뒀다.
        const { left, top } = clampToolbarPos(pos, m, m);
        el.style.transform = `translate(${left}px, ${top}px)`;
      }),
    [],
  );

  useEffect(() => {
    const onResize = (): void => {
      metrics.current = null;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // rAF 루프 상태는 리렌더를 유발하면 안 되므로 ref에. 세 축(회전·기울기·높이)이 이
  // 루프 하나를 공유한다 — 동시에 두 버튼을 누를 수는 없으므로 상태도 하나면 된다.
  const spin = useRef<{
    raf: number;
    lastMs: number;
    dir: 1 | -1;
    moved: boolean;
    axis: SpinAxis;
  } | null>(null);

  const yawAxis: SpinAxis = {
    get: () => useSimulatorStore.getState().selectedYawDeg,
    set: rotateSelected,
    perSec: ROTATE_DEG_PER_SEC,
    tapStep: ROTATE_TAP_DEG,
  };
  const tiltAxis: SpinAxis = {
    get: () => useSimulatorStore.getState().selectedPitchDeg,
    set: tiltSelected,
    perSec: TILT_DEG_PER_SEC,
    tapStep: TILT_TAP_DEG,
  };
  const liftAxis: SpinAxis = {
    get: () => useSimulatorStore.getState().selectedLiftMm,
    set: liftSelected,
    perSec: LIFT_MM_PER_SEC,
    tapStep: LIFT_TAP_MM,
  };

  const stopSpin = (): void => {
    const s = spin.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    spin.current = null;
    // 누르자마자 뗐으면 프레임이 안 돌아 값이 그대로다 — 탭 몫만큼 움직여준다.
    if (!s.moved) stepAxis(s.axis, s.dir);
    unfreeze();
  };

  /** 키보드(Enter·Space)로 ± 버튼을 눌렀을 때 — rAF 스핀 대신 tapStep 한 칸.
   *  누르고 있으면 OS 키 자동반복이 계단식으로 이어준다. */
  const onStepKeyDown = (e: ReactKeyboardEvent, axis: SpinAxis, dir: 1 | -1): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    stepAxis(axis, dir);
  };

  const startSpin = (axis: SpinAxis, dir: 1 | -1): void => {
    stopSpin();
    freeze(); // 조작 시작 = 좌표 동결. stopSpin이 unfreeze를 짝지어 돌려놓는다.
    const step = (nowMs: number): void => {
      const s = spin.current;
      if (!s) return;
      const dt = (nowMs - s.lastMs) / 1000;
      s.lastMs = nowMs;
      if (dt > 0) {
        s.moved = true;
        // 정본은 스토어의 현재값 — 렌더 클로저 값을 쓰면 한 프레임 전에 묶인다.
        s.axis.set(s.axis.get() + s.dir * s.axis.perSec * dt);
      }
      s.raf = requestAnimationFrame(step);
    };
    spin.current = {
      raf: requestAnimationFrame(step),
      lastMs: performance.now(),
      dir,
      moved: false,
      axis,
    };
  };

  // 버튼 밖에서 손을 떼도 길게 누르기가 멈춰야 한다 (pointerup이 버튼에 안 올 수 있다).
  useEffect(() => {
    const onUp = (): void => stopSpin();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (spin.current) cancelAnimationFrame(spin.current.raf);
    };
    // stopSpin은 렌더마다 새로 만들어지지만 ref와 스토어만 읽어 재구독이 필요 없다.
  }, []);

  // 선택이 바뀌면 동결을 반드시 풀어야 한다 — 조작 중 아이템이 지워지면(삭제 버튼) 짝이
  // 맞는 unfreeze가 안 와서 툴바가 영구히 그 자리에 굳는다.
  useEffect(() => {
    freezeCount.current = 0;
  }, [selectedItemId]);

  if (!selectedItemId) return null;

  return (
    <div ref={elRef} className="glass hud selection-toolbar" data-testid="selection-toolbar">
      <button
        type="button"
        className="chip chip-sq"
        aria-label="왼쪽으로 회전 (길게 누르면 계속)"
        title="왼쪽으로 회전"
        data-testid="rotate-ccw"
        disabled={editLocked}
        onPointerDown={() => startSpin(yawAxis, -1)}
        onKeyDown={(e) => onStepKeyDown(e, yawAxis, -1)}
      >
        <SidebarIcon name="rotate-ccw" width={15} height={15} />
      </button>
      <CommitNumberInput
        className="sel-angle-input"
        testId="rotate-angle"
        label="회전 각도"
        min={0}
        max={360}
        value={selectedYawDeg}
        disabled={editLocked}
        onCommit={rotateSelected}
        onEditStart={freeze}
        onEditEnd={unfreeze}
      />
      <button
        type="button"
        className="chip chip-sq"
        aria-label="오른쪽으로 회전 (길게 누르면 계속)"
        title="오른쪽으로 회전"
        data-testid="rotate-cw"
        disabled={editLocked}
        onPointerDown={() => startSpin(yawAxis, 1)}
        onKeyDown={(e) => onStepKeyDown(e, yawAxis, 1)}
      >
        <SidebarIcon name="rotate-cw" width={15} height={15} />
      </button>

      <div className="selection-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className="chip chip-sq"
        aria-label="앞으로 기울이기 (길게 누르면 계속)"
        title="앞으로 기울이기"
        data-testid="tilt-down"
        disabled={editLocked}
        onPointerDown={() => startSpin(tiltAxis, -1)}
        onKeyDown={(e) => onStepKeyDown(e, tiltAxis, -1)}
      >
        <SidebarIcon name="tilt-down" width={15} height={15} />
      </button>
      <CommitNumberInput
        className="sel-angle-input"
        testId="tilt-deg"
        label="앞뒤 기울기 각도"
        min={-PITCH_LIMIT_DEG}
        max={PITCH_LIMIT_DEG}
        value={selectedPitchDeg}
        disabled={editLocked}
        onCommit={tiltSelected}
        onEditStart={freeze}
        onEditEnd={unfreeze}
      />
      <button
        type="button"
        className="chip chip-sq"
        aria-label="뒤로 기울이기 (길게 누르면 계속)"
        title="뒤로 기울이기"
        data-testid="tilt-up"
        disabled={editLocked}
        onPointerDown={() => startSpin(tiltAxis, 1)}
        onKeyDown={(e) => onStepKeyDown(e, tiltAxis, 1)}
      >
        <SidebarIcon name="tilt-up" width={15} height={15} />
      </button>

      <div className="selection-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className="chip chip-sq"
        aria-label="내리기 (길게 누르면 계속)"
        title="내리기"
        data-testid="lift-down"
        disabled={editLocked}
        onPointerDown={() => startSpin(liftAxis, -1)}
        onKeyDown={(e) => onStepKeyDown(e, liftAxis, -1)}
      >
        <SidebarIcon name="lift-down" width={15} height={15} />
      </button>
      <CommitNumberInput
        className="sel-angle-input"
        testId="lift-mm"
        label="바닥에서의 높이 (mm)"
        min={0}
        max={LIFT_MAX_MM}
        value={selectedLiftMm}
        disabled={editLocked}
        onCommit={liftSelected}
        onEditStart={freeze}
        onEditEnd={unfreeze}
      />
      <button
        type="button"
        className="chip chip-sq"
        aria-label="올리기 (길게 누르면 계속)"
        title="올리기"
        data-testid="lift-up"
        disabled={editLocked}
        onPointerDown={() => startSpin(liftAxis, 1)}
        onKeyDown={(e) => onStepKeyDown(e, liftAxis, 1)}
      >
        <SidebarIcon name="lift-up" width={15} height={15} />
      </button>

      <div className="selection-toolbar-divider" aria-hidden="true" />

      <button
        type="button"
        className="chip chip-sq"
        aria-label="복제"
        title="복제"
        data-testid="duplicate-item"
        disabled={editLocked}
        onClick={() => duplicateSelected()}
      >
        <SidebarIcon name="duplicate" width={15} height={15} />
      </button>
      <button
        type="button"
        className="chip chip-danger chip-sq"
        aria-label="삭제"
        title="삭제"
        data-testid="delete-item"
        disabled={editLocked}
        onClick={() => deleteSelected()}
      >
        <SidebarIcon name="delete" width={15} height={15} />
      </button>
      {/* 선택 해제만 편집 잠금 중에도 살아 있다 — selectItem은 씬을 바꾸지 않아
          스토어 게이트가 없고, 잠금 중에도 선택은 풀 수 있어야 한다. */}
      <button
        type="button"
        className="chip chip-sq"
        aria-label="선택 해제"
        title="선택 해제"
        data-testid="deselect-item"
        onClick={() => selectItem(null)}
      >
        <SidebarIcon name="close" width={15} height={15} />
      </button>
    </div>
  );
};

export default SelectionToolbar;
