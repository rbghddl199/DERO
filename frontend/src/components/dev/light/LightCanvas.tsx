'use client';
// 조명 등록 도구 3D 캔버스 — lightPreview 씬을 R3F 기본 Canvas에 얹고 궤도 조작·모델 프레이밍을 붙인다

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createLightPreview } from '@/three/scene/lightPreview';
import { useLightAuthorStore } from '@/store/lightAuthorStore';

/** GLB 원본 스케일 그대로 얹으므로 카메라를 모델 크기에 맞춰야 한다(rigPreview와 같은 규약). */
const FIT_MARGIN = 1.6;
/** 살짝 비스듬한 3/4 뷰 — 광원 마커의 높이와 갓 아랫테가 한 번에 보인다. */
const FIT_DIR: [number, number, number] = [0.62, 0.5, 0.85];
const FOV_DEG = 40;

/** 궤도 조작 + 로드된 모델에 맞춘 카메라 프레이밍. drei 없이 three addons만 쓴다. */
const CameraRig = () => {
  // 카메라를 직접 만들어 R3F에 등록한다 — useThree가 돌려준 기본 카메라를 컴포넌트에서
  // 변형하면 react-hooks/immutability에 걸린다(SimulatorCanvas·RigCanvas와 같은 방식).
  const set = useThree((s) => s.set);
  const domElement = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const bounds = useLightAuthorStore((s) => s.bounds);
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
    if (!camera || !controls || !bounds) return;

    const center = [0, 1, 2].map((i) => (bounds.min[i] + bounds.max[i]) / 2);
    const radius = Math.max(...[0, 1, 2].map((i) => (bounds.max[i] - bounds.min[i]) / 2)) || 0.15;
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
  }, [bounds]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
};

/** lightPreview 인스턴스 소유 — 마운트 때 만들고 언마운트 때 반드시 dispose한다. */
const PreviewScene = () => {
  // KTX2 detectSupport가 렌더러 핸들을 요구한다 — 조명 GLB는 텍스처가 박혀 있어
  // KTX2Loader 없이는 로드 자체가 실패한다(rigPreview가 KTX2를 뺀 것과 반대 사정).
  const gl = useThree((s) => s.gl);
  const preview = useLightAuthorStore((s) => s.preview);
  const attachPreview = useLightAuthorStore((s) => s.attachPreview);
  const detachPreview = useLightAuthorStore((s) => s.detachPreview);

  useEffect(() => {
    const instance = createLightPreview(gl);
    attachPreview(instance);
    return () => {
      detachPreview();
      instance.dispose(); // 라우트 이동이 캔버스를 언마운트한다 — 안 부르면 GPU 리소스가 샌다
    };
  }, [gl, attachPreview, detachPreview]);

  if (!preview) return null;
  return <primitive object={preview.scene} />;
};

const LightCanvas = () => {
  const loading = useLightAuthorStore((s) => s.loading);
  const loadError = useLightAuthorStore((s) => s.loadError);

  return (
    // lightPreview는 scene.background을 두지 않는다 — 캔버스 배경은 CSS 담당(뉴트럴 그레이).
    <div className="relative h-full w-full" style={{ backgroundColor: '#31343a' }}>
      {/* createRenderer()는 노출 1/20이 박혀 있어 이 씬(일반 스케일 조명)을 새까맣게 만든다.
          기본 <Canvas>를 gl 커스터마이즈 없이 그대로 쓴다(RigCanvas와 같은 이유). */}
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
        <p className="absolute top-3 left-3 max-w-[80%] rounded bg-red-900/80 px-2 py-1 text-xs text-white">
          로드 실패: {loadError}
        </p>
      )}
    </div>
  );
};

export default LightCanvas;
