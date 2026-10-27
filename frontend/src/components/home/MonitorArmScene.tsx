// 모니터암 실제 FK 리그(src/three/core/productAssets.ts)를 재사용해 관절이 스스로 움직이는 미니 쇼케이스 씬 — three가 window를 건드리므로 MonitorArmShowcase에서 ssr:false로만 임포트한다
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three/webgpu';
import { createRenderer } from '@/three/render/renderer';
import { createAssetLoader, type AssetLoader } from '@/three/render/assetLoader';
import {
  createProductAssets,
  setJointValue,
  type ProductInstance,
} from '@/three/core/productAssets';
import { PRODUCTS } from '@/three/scene/product';

// 목업 카탈로그 직참조 — real 모드에서도 이 쇼케이스는 항상 로컬 'monitor-arm-white' 규격을
// 쓴다(getProduct()는 real 카탈로그로 배타 전환되면 이 id를 못 찾는다, DERO-325).
const SPEC = PRODUCTS.find((p) => p.id === 'monitor-arm-white')!;

/** 실제 규격 한계각 안에서 느리게 오가는 idle 모션 — base-yaw로 좌우를 살피고 elbow/head가 따라 움직인다. */
const ArmRig = ({ instance }: { instance: ProductInstance }) => {
  useFrame(({ clock }) => {
    const joints = instance.joints;
    if (!joints) return;
    const t = clock.getElapsedTime();
    const baseYaw = joints.get('base-yaw');
    const elbow = joints.get('elbow-pitch');
    const headTilt = joints.get('head-tilt');
    if (baseYaw) setJointValue(baseYaw, Math.sin(t * 0.28) * 22);
    if (elbow) setJointValue(elbow, Math.sin(t * 0.35 + 1) * 18 - 8);
    if (headTilt) setJointValue(headTilt, Math.sin(t * 0.4 + 2) * 12);
  });
  return <primitive object={instance.group} />;
};

/** Canvas camera prop only sets position — without an explicit lookAt the default
 *  orientation stares down -Z untilted, so an off-axis camera misses the subject. */
const CameraAim = () => {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(0, 0.22, 0);
  }, [camera]);
  return null;
};

const Scene = () => {
  const { gl } = useThree();
  const [instance, setInstance] = useState<ProductInstance | null>(null);
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
      const assets = createProductAssets(loader);
      await assets.preload([SPEC]);
      if (cancelled) return;
      setInstance(assets.instantiate(SPEC));
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
      {instance && <ArmRig instance={instance} />}
    </>
  );
};

const MonitorArmScene = () => {
  return (
    <Canvas
      camera={{ position: [0.58, 0.4, 0.76], fov: 26 }}
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

export default MonitorArmScene;
