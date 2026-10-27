// 홈 히어로 옆 데스크 GLB 360도 자동 회전 쇼케이스 — three가 window를 건드리므로 DesktopShowcase에서 ssr:false로만 임포트한다
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three/webgpu';
import { createRenderer } from '@/three/render/renderer';
import { createAssetLoader, type AssetLoader } from '@/three/render/assetLoader';

const GLB_URL = '/assets/desktop.glb';
/** 한 바퀴 도는 데 걸리는 시간(초) — 감상용으로 느리게 */
const ROTATION_PERIOD_S = 30;
/** 저작 크기가 얼마든 일정한 프레이밍으로 보이도록 맞추는 목표 최대 변 길이 */
const TARGET_MAX_DIM = 1.4;

const RotatingDesktop = ({ model }: { model: THREE.Group }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += (delta * Math.PI * 2) / ROTATION_PERIOD_S;
  });
  return <primitive ref={ref} object={model} />;
};

/** Canvas camera prop only sets position — without an explicit lookAt the default
 *  orientation stares down -Z untilted, so an off-axis camera misses the subject
 *  (same pitfall as MonitorArmScene.tsx). */
const CameraAim = () => {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
};

const Scene = () => {
  const { gl } = useThree();
  const [model, setModel] = useState<THREE.Group | null>(null);
  const loaderRef = useRef<AssetLoader | null>(null);

  useEffect(() => {
    let cancelled = false;
    const renderer = gl as unknown as THREE.WebGPURenderer;

    void (async () => {
      const loader = await createAssetLoader(renderer);
      if (cancelled) {
        loader.dispose();
        return;
      }
      loaderRef.current = loader;

      const [{ Box3, Vector3 }, root] = await Promise.all([
        import('three/webgpu'),
        loader.loadGLB(GLB_URL),
      ]);
      if (cancelled) return;

      // 장식용 쇼케이스라 규격 mm 대신 자체 bbox로 중심·프레이밍만 균일 스케일로 맞춘다.
      const box = new Box3().setFromObject(root);
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const scale = TARGET_MAX_DIM / (Math.max(size.x, size.y, size.z) || 1);
      root.scale.setScalar(scale);
      root.position.copy(center).multiplyScalar(-scale);

      setModel(root);
    })();

    return () => {
      cancelled = true;
      loaderRef.current?.dispose();
    };
  }, [gl]);

  return (
    <>
      <CameraAim />
      <hemisphereLight args={[0xffffff, 0x9a938a, 8]} />
      <ambientLight intensity={7} />
      <directionalLight position={[1.2, 2, 1.5]} intensity={55} />
      {model && <RotatingDesktop model={model} />}
    </>
  );
};

const DesktopScene = () => {
  return (
    <Canvas
      camera={{ position: [1.6, 1.1, 1.9], fov: 50 }}
      gl={async (props) => {
        const renderer = await createRenderer(props.canvas as HTMLCanvasElement, { alpha: true });
        renderer.setClearColor(0x000000, 0);
        return renderer;
      }}
    >
      <Scene />
    </Canvas>
  );
};

export default DesktopScene;
