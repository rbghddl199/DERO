'use client';
// 리그 저작 도구 3D 캔버스 — rigPreview 씬을 R3F 기본 Canvas에 얹고 파트 클릭 레이캐스트·궤도 조작·카메라 프레이밍을 붙인다

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRigPreview } from '@/three/scene/rigPreview';
import { useRigDraftStore } from '@/store/rigDraftStore';

/** 모델이 GLB 원본 스케일이라(모니터암 ≈ 0.12m) 카메라를 모델 크기에 맞춰야 한다. */
const FIT_MARGIN = 1.6;
/** 헤드온 정면이 아니라 살짝 비스듬한 3/4 뷰 — 축 화살표 세 방향이 한 번에 구분된다. */
const FIT_DIR: [number, number, number] = [0.62, 0.5, 0.85];

const FOV_DEG = 40;

/** 궤도 조작 + 로드된 모델에 맞춘 카메라 프레이밍. drei 없이 three addons만 쓴다. */
const CameraRig = () => {
  // 카메라를 여기서 직접 만들어 R3F에 등록한다 — useThree가 돌려준 기본 카메라를
  // 컴포넌트에서 변형하면 react-hooks/immutability에 걸린다(SimulatorCanvas와 같은 방식).
  const set = useThree((s) => s.set);
  const domElement = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const partBoxes = useRigDraftStore((s) => s.partBoxes);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const camera = new PerspectiveCamera(FOV_DEG, 1, 0.01, 100);
    camera.position.set(0.3, 0.25, 0.4);
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    cameraRef.current = camera;
    controlsRef.current = controls;
    set({ camera });
    return () => {
      cameraRef.current = null;
      controlsRef.current = null;
      controls.dispose();
    };
  }, [domElement, set]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }, [size]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const boxes = Object.values(partBoxes);
    if (!camera || !controls || boxes.length === 0) return;

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const b of boxes) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], b.min[i]);
        max[i] = Math.max(max[i], b.max[i]);
      }
    }
    const center = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
    const radius = Math.max(...[0, 1, 2].map((i) => (max[i] - min[i]) / 2)) || 0.15;
    const dist = (radius * FIT_MARGIN) / Math.sin((camera.fov * Math.PI) / 360);

    camera.near = Math.max(dist / 500, 1e-4);
    camera.far = dist * 100;
    camera.position.set(
      center[0] + FIT_DIR[0] * dist,
      center[1] + FIT_DIR[1] * dist,
      center[2] + FIT_DIR[2] * dist,
    );
    camera.updateProjectionMatrix();
    controls.target.set(center[0], center[1], center[2]);
    // 모델 크기가 제각각이라 줌 한계도 모델 기준으로 다시 잡는다.
    controls.minDistance = radius * 0.4;
    controls.maxDistance = dist * 8;
    controls.update();
  }, [partBoxes]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
};

/** rigPreview 인스턴스 소유 — 마운트 때 만들고 언마운트 때 반드시 dispose한다. */
const PreviewScene = () => {
  const preview = useRigDraftStore((s) => s.preview);
  const attachPreview = useRigDraftStore((s) => s.attachPreview);
  const detachPreview = useRigDraftStore((s) => s.detachPreview);
  const selectPart = useRigDraftStore((s) => s.selectPart);

  useEffect(() => {
    const instance = createRigPreview();
    attachPreview(instance);
    return () => {
      detachPreview();
      instance.dispose(); // 라우트 이동이 캔버스를 언마운트한다 — 안 부르면 GPU 리소스가 샌다
    };
  }, [attachPreview, detachPreview]);

  if (!preview) return null;

  /** 히트한 오브젝트에서 위로 올라가며 파트(mesh) 이름을 찾는다. */
  const partNameOf = (object: Object3D): string | null => {
    const { parts } = useRigDraftStore.getState();
    for (let node: Object3D | null = object; node; node = node.parent) {
      if (parts.includes(node.name)) return node.name;
    }
    return null;
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>): void => {
    // 피벗 구슬·축 화살표가 앞을 가릴 수 있어 가장 가까운 히트만 보지 않고 순서대로 훑는다.
    for (const hit of e.intersections) {
      const name = partNameOf(hit.object);
      if (name) {
        e.stopPropagation();
        selectPart(name);
        return;
      }
    }
  };

  return <primitive object={preview.scene} onPointerDown={handlePointerDown} />;
};

const RigCanvas = () => {
  const loading = useRigDraftStore((s) => s.loading);
  const loadError = useRigDraftStore((s) => s.loadError);

  return (
    // rigPreview는 scene.background을 두지 않는다 — 캔버스 배경은 CSS 담당(뉴트럴 그레이).
    <div className="relative h-full w-full" style={{ backgroundColor: '#31343a' }}>
      {/* createRenderer()는 노출 1/20이 박혀 있어 이 씬(일반 스케일 조명)을 새까맣게 만든다.
          기본 <Canvas>를 gl 커스터마이즈 없이 그대로 쓴다. */}
      <Canvas>
        <PreviewScene />
        <CameraRig />
      </Canvas>
      {loading && (
        <p className="pointer-events-none absolute top-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
          GLB 로드 중…
        </p>
      )}
      {loadError && (
        <p className="absolute top-3 left-3 rounded bg-red-900/80 px-2 py-1 text-xs text-white">
          로드 실패: {loadError}
        </p>
      )}
    </div>
  );
};

export default RigCanvas;
