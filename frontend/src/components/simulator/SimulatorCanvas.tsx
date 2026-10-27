'use client';
// 시뮬레이터 R3F 마운트 — three 엔진(renderer/scene/camera/placement/postfx, 전부 무변경)을
// Canvas gl prop으로 부팅하고 simulatorStore에 연결한다. HUD는 Canvas 밖 형제 컴포넌트.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import * as THREE from 'three/webgpu';
import { createRenderer } from '@/three/render/renderer';
import { useSimulatorStore } from '@/store/simulatorStore';
import { useSimulatorTourStore } from '@/store/simulatorTourStore';
import type { DeskConfig } from '@/three/core/deskConfig';
import { publishSelectionAnchor } from '@/three/scene/selectionAnchor';
import SimHud from './SimHud';
import LoadingScreen from './LoadingScreen';
import '@/three/bootstrap/style.css';

// useFrame 밖에서 재생성하면 매 프레임 GC 압박 — 재사용 스크래치 객체.
const anchorBox = new THREE.Box3();
const anchorPoint = new THREE.Vector3();

/** Canvas 준비 후 1회: 엔진 부팅 + 완성된 THREE.Scene을 통째로 얹기 + 카메라 교체. */
const EngineRoot = () => {
  const { gl, size, set } = useThree();
  const initEngine = useSimulatorStore((s) => s.initEngine);
  const sim = useSimulatorStore((s) => s.sim);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const renderer = gl as unknown as THREE.WebGPURenderer;
    void initEngine(renderer, size.width / size.height).then(() => {
      const camera = useSimulatorStore.getState().camera;
      if (camera) set({ camera });
    });
  }, [gl, size, initEngine, set]);

  if (!sim) return null;
  return <primitive object={sim.scene} />;
};

/** R3F 자동 렌더를 끄고(priority=1) postfx.render()가 매 프레임을 전담 —
 *  postfx.ts의 커스텀 RenderPipeline은 그대로 재사용(0번 스파이크에서 검증한 패턴). */
const RenderLoop = () => {
  useFrame((_, delta) => {
    const { controls, postfx, sim, selectedItemId, camera, renderer } =
      useSimulatorStore.getState();
    sim?.tick(delta * 1000); // 드롭 착지 트윈 (delta는 초 단위)
    controls?.update();
    // 선택 아이템의 gizmo 핸들을 매 프레임 재동기화 — 이동·회전·드롭 트윈 등 어떤
    // 경로로 그룹이 움직여도 gizmo가 따라온다(미선택/무관절이면 handles=[]로 no-op).
    if (sim && selectedItemId) sim.jointGizmo.sync(sim.jointHandles(selectedItemId));
    // 회전 링도 같은 이유로 매 프레임 따라온다 — 이동·요람 안착·드롭 트윈으로 발밑
    // 높이가 바뀐다. handle이 null이면(회전 불가 아이템) sync가 링을 숨긴다.
    if (sim) sim.rotateGizmo.sync(selectedItemId ? sim.rotateHandle(selectedItemId) : null);

    // 부동 선택 툴바(SelectionToolbar.tsx)의 화면 좌표 — 아이템 바운딩박스 상단 중앙을
    // 월드 → NDC → CSS px로 매 프레임 투영해 Canvas 밖 형제 DOM에 전달한다. 조작 중
    // 동결은 구독자(툴바) 쪽 책임이다 — 여기서 멈추면 다른 구독자가 생길 때 같이 굳는다.
    const item = sim && selectedItemId ? sim.placed().find((i) => i.id === selectedItemId) : null;
    if (item && camera && renderer) {
      anchorBox.setFromObject(item.group);
      anchorPoint.set(
        (anchorBox.min.x + anchorBox.max.x) / 2,
        anchorBox.max.y,
        (anchorBox.min.z + anchorBox.max.z) / 2,
      );
      anchorPoint.project(camera);
      // z가 [-1,1] 밖이면 카메라 클립 범위 밖(뒤쪽 등) — 좌표가 뒤집혀 나오니 숨긴다.
      if (Math.abs(anchorPoint.z) <= 1) {
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        publishSelectionAnchor({
          x: ((anchorPoint.x + 1) / 2) * w,
          y: ((1 - anchorPoint.y) / 2) * h,
        });
      } else {
        publishSelectionAnchor(null);
      }
    } else {
      publishSelectionAnchor(null);
    }

    postfx?.render();
  }, 1);
  return null;
};

const SimulatorCanvas = () => {
  // 마운트당 1회, 스토어 read보다 먼저 동기 초기화 — 나갔다 재진입해도 새로고침과
  // 동일하게 로딩부터 다시 시작하도록 이전 세션의 ready/screen을 지운다.
  const resetRef = useRef<true | null>(null);
  if (resetRef.current == null) {
    resetRef.current = true;
    useSimulatorStore.getState().resetForMount();
    // 코치마크 투어의 진행 상태(active·stepIndex)도 같이 지운다 — 중간에 나갔던 사람은
    // 4단계가 아니라 1단계부터 다시 본다. "본 적 있다"(seen)는 건드리지 않는다.
    useSimulatorTourStore.getState().resetForMount();
  }

  const screen = useSimulatorStore((s) => s.screen);
  const ready = useSimulatorStore((s) => s.ready);
  const enterSim = useSimulatorStore((s) => s.enterSim);
  const setDeskConfig = useSimulatorStore((s) => s.setDeskConfig);
  const setProjectTitle = useSimulatorStore((s) => s.setProjectTitle);
  const setBudgetKrw = useSimulatorStore((s) => s.setBudgetKrw);
  const loadPlacement = useSimulatorStore((s) => s.loadPlacement);
  // 정상 경로는 책상을 항상 여기 오기 전에 고른다: 기존 데스크테리어 이어서 열기
  // (?deskProjectId=, loadPlacement로 저장된 책상·벽·조명·아이템을 전부 복원한다,
  // REQ-SIM-06)나 /craft/new에서 고른 책상(?deskId= 또는 ?customDesk=,
  // CraftDeskPicker.tsx)이 실려온다. 파라미터가 하나도 없이 직접 /simulator로 들어온
  // 경우엔 책상 선택 팝업 없이 enterSim()의 기본 책상으로 바로 진입한다(아래 effect).
  const searchParams = useSearchParams();
  const deskProjectId = searchParams.get('deskProjectId');
  const deskId = searchParams.get('deskId');
  const customDeskParam = searchParams.get('customDesk');
  // /craft/new 마법사 2·3단계(예산 입력·이름 작성)에서 실려온다 — CraftNewWizard.tsx.
  const projectNameParam = searchParams.get('projectName');
  const budgetKrwParam = searchParams.get('budgetKrw');
  // 방금 생성한 배치의 서버 id — 서버 배치 로드 대상. "이어서 편집"(deskProjectId)과 로드
  // 동작은 동일하고 진입 우선순위만 다르다. 보내는 곳 둘: CraftNewWizard.tsx(마법사 완료,
  // customDesk와 함께)와 CollectionDetail.tsx의 "가져오기"(2026-08-06). 미리보기 자동 캡처는
  // 더 이상 이 파라미터가 아니라 loadPlacement 자신이 상세 응답의 thumbnailUrl === null을
  // 보고 판단한다 — 종전의 이 파일 1회 캡처 effect는 그 게이트로 대체돼 삭제됐다.
  const placementIdParam = searchParams.get('placementId');

  useEffect(() => {
    if (!ready || screen !== 'select') return;
    if (deskProjectId) {
      const id = Number(deskProjectId);
      if (Number.isFinite(id)) void loadPlacement(id);
      return;
    }
    // 마법사가 방금 POST로 만든 배치(?placementId=)로 들어온 경우 — 서버가 정본이므로
    // 씬(책상·아이템)·제목·예산·version을 전부 loadPlacement가 서버 값으로 덮어쓴다.
    // 아래 customDesk 분기로 새로고침 때마다 씬을 다시 지으면 저장했던 아이템이 사라지고,
    // version이 0에 머물러 이후 저장이 전부 409 PLACEMENT_STALE로 막힌다.
    if (placementIdParam) {
      const id = Number(placementIdParam);
      if (Number.isFinite(id)) {
        void loadPlacement(id);
        return;
      }
    }
    // 여기부터는 서버 배치가 없는 진입이라 title·budget을 URL 파라미터로 채운다 —
    // loadPlacement 경로(위 두 분기)는 서버 값으로 덮어쓰므로 여기서 미리 세팅하면
    // 헛수고일 뿐 아니라, loadPlacement가 자체적으로 맞추는 changeVersion 동기화보다
    // 먼저 changeVersion만 올려놔 EditorTopBar가 마운트되는 순간 "저장 안 한 변경사항
    // 있음"으로 잘못 보이는 창을 넓힌다(2026-08-06, `loadPlacement`의 자체 수정과 세트).
    if (projectNameParam) setProjectTitle(projectNameParam);
    if (budgetKrwParam) {
      const budget = Number(budgetKrwParam);
      if (Number.isFinite(budget)) setBudgetKrw(budget);
    }
    if (deskId) {
      enterSim(deskId);
      return;
    }
    if (customDeskParam) {
      try {
        // URLSearchParams.get()이 이미 퍼센트 디코딩을 끝낸 상태라 여기서 또
        // decodeURIComponent를 부르면 이중 디코딩이다 — JSON.parse만 하면 된다.
        const config = JSON.parse(customDeskParam) as DeskConfig;
        setDeskConfig(config);
        return;
      } catch {
        // 잘못된 값이면 조용히 무시하고 아래 enterSim() 폴백으로 흘린다 — 여기서 return하면
        // screen이 'select'에 머물러 로딩 화면이 영영 안 닫힌다.
      }
    }
    // 파라미터 없이 직접 /simulator로 들어온 경우 — 책상 선택 팝업(DeskSelectScreen) 없이
    // 기본 책상으로 바로 진입한다.
    enterSim();
  }, [
    ready,
    screen,
    deskProjectId,
    deskId,
    customDeskParam,
    projectNameParam,
    budgetKrwParam,
    placementIdParam,
    enterSim,
    loadPlacement,
    setDeskConfig,
    setProjectTitle,
    setBudgetKrw,
  ]);

  // 배치 미리보기 자동 캡처는 이 파일에 더 이상 없다(2026-08-06) — loadPlacement가 상세
  // 응답의 thumbnailUrl === null(한 번도 안 찍힌 배치)을 보고 스스로 찍어 올린다. 종전의
  // 파라미터 기반 1회 effect(customDesk+placementId 게이트)는 "가져오기" 사본처럼 다른
  // 경로로 생긴 썸네일 없는 배치를 놓쳤다.

  return (
    <div id="app">
      <Canvas
        id="scene"
        // `renderer.ts`가 이미 켜는 그림자를 여기서 또 켠다 — 중복이 아니라 필수다.
        // R3F는 gl 팩토리가 돌려준 렌더러에 자기 기본값을 덧씌워서(`shadows` 미지정 =
        // false → `gl.shadowMap.enabled = false`), 이 prop이 없으면 createRenderer가
        // 켠 그림자가 부팅 직후 꺼진다(DERO-248, 2026-07-22 R3F 전환 때 유실).
        // boolean이면 R3F도 PCFSoftShadowMap을 넣으므로 renderer.ts와 값이 같다.
        // renderer.ts 쪽은 `<Canvas>` 없이 createRenderer만 부르는 경로
        // (ThumbnailRenderer.tsx)의 유일한 설정이라 지우면 안 된다.
        shadows
        // 레티나(dpr 2)에서 이 씬은 픽셀 바운드다 — 백킹스토어가 6.66M px가 되면서 프레임
        // p50이 3.9 → 14.2ms로 뛰어 120Hz 예산 8.3ms를 프레임의 98%가 넘겼다(실측
        // DERO-283). 상한 1.5면 픽셀이 56%로 줄어 p50 8.0ms다. 판정 박동규.
        // `renderer.ts`의 `setPixelRatio(min(dpr, 2))`는 `<Canvas>` 없이 createRenderer만
        // 부르는 썸네일 경로용이라 그대로 둔다 — 정지 이미지는 선명한 쪽이 맞다.
        dpr={[1, 1.5]}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' }}
        gl={async (props) => {
          // 새로 만든 renderer라 hook 반환값이 아님 — id/testid 부여가 immutability 규칙에 안 걸림.
          const renderer = await createRenderer(props.canvas as HTMLCanvasElement);
          renderer.domElement.id = 'scene-canvas';
          renderer.domElement.dataset.testid = 'sim-canvas';
          return renderer;
        }}
      >
        <EngineRoot />
        <RenderLoop />
      </Canvas>
      <div className="ui-root">
        {/* ready만으로 닫으면 엔진이 지어둔 기본 책상이 잠깐 노출되고 그 사이 카메라도 돌아간다
            — 진입 경로(loadPlacement/enterSim/setDeskConfig)가 실제 책상을 얹고 screen을
            'sim'으로 바꿀 때까지 로딩 화면을 유지한다(pointer-events:auto가 캔버스 입력을 막는다). */}
        {(!ready || screen !== 'sim') && <LoadingScreen />}
        {ready && screen === 'sim' && <SimHud />}
      </div>
    </div>
  );
};

export default SimulatorCanvas;
