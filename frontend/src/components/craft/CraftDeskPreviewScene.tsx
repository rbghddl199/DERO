// 직접 입력 폼의 실시간 3D 미리보기 — buildDesk(config)를 dims/재질/프레임 변경마다
// 다시 지어 <primitive>로 교체한다. three가 window를 건드리므로 CraftDeskPreview에서
// ssr:false로만 임포트한다.
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three/webgpu';
import { createRenderer } from '@/three/render/renderer';
import { buildDesk } from '@/three/scene/desk';
import { DEFAULT_CUSTOM_DESK, type DeskConfig, type DeskFrameType } from '@/three/core/deskConfig';
import type { MaterialSkin } from '@/three/scene/product';

type Props = {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  topThicknessMm: number;
  /** `GET /desk-textures`에서 만든 렌더 스킨(DERO-335). 재질 목록을 못 받았으면
   *  undefined이고 deskMaterialSkin의 기본 materialId 폴백(오크)이 쓰인다. */
  materialSkin?: MaterialSkin;
  frameType: DeskFrameType;
};

function disposeDeskGroup(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
}

// 타이핑 도중 일시적으로 빈 문자열/0이 되는 상태에서 퇴화 지오메트리(0·NaN 치수)로
// buildDesk를 부르지 않기 위한 최소값 클램프 — DESK_RANGE 범위 검증(제출 시점,
// validateCustomDesk)과는 별개의, 순수 지오메트리 방어다.
function sanitizeDim(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 1;
}

const DeskSceneContent = ({
  widthMm,
  depthMm,
  heightMm,
  topThicknessMm,
  materialSkin,
  frameType,
}: Props) => {
  // Canvas의 camera prop이 fov를 받는 PerspectiveCamera로 생성되므로 안전한 캐스트다
  // (PerspectiveCamera는 'three'/'three/webgpu' 양쪽 모두 three.core.js의 동일 클래스).
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  // 순수 파생값이라 useEffect+setState가 아니라 useMemo로 렌더 중 계산한다
  // (react-hooks/set-state-in-effect 회피 + hooks.md "derived state는 렌더 중 계산" 원칙).
  const deskGroup = useMemo(() => {
    const config: DeskConfig = {
      source: 'custom',
      widthMm: sanitizeDim(widthMm),
      depthMm: sanitizeDim(depthMm),
      heightMm: sanitizeDim(heightMm),
      topThicknessMm: sanitizeDim(topThicknessMm),
      materialId: DEFAULT_CUSTOM_DESK.materialId,
      materialSkin,
      frameType,
    };
    return buildDesk(config);
  }, [widthMm, depthMm, heightMm, topThicknessMm, materialSkin, frameType]);

  // 카메라 자동 프레이밍(외부 시스템 동기화)과 이전 그룹의 GPU 리소스 해제(cleanup) —
  // 둘 다 useEffect의 정상 용도.
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(deskGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dir = new THREE.Vector3(1, 0.85, 1.3).normalize();
    const distance = (maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.7;
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.lookAt(center);

    return () => disposeDeskGroup(deskGroup);
  }, [deskGroup, camera]);

  return (
    <>
      <hemisphereLight args={[0xffffff, 0x9a938a, 8]} />
      <ambientLight intensity={7} />
      <directionalLight position={[1.2, 2, 1.5]} intensity={55} />
      <primitive object={deskGroup} />
    </>
  );
};

const CraftDeskPreviewScene = (props: Props) => {
  return (
    <Canvas
      camera={{ position: [1.6, 1.2, 2.0], fov: 32 }}
      gl={async (canvasProps) => {
        const renderer = await createRenderer(canvasProps.canvas as HTMLCanvasElement, {
          alpha: true,
        });
        renderer.setClearColor(0x000000, 0);
        return renderer;
      }}
    >
      <DeskSceneContent {...props} />
    </Canvas>
  );
};

export default CraftDeskPreviewScene;
