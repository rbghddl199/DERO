'use client';
// 발광 3D 프리뷰 — 저작 중인 product_emitter 값이 시뮬레이터와 같은 조명 리그·노출·블룸에서
// 실제로 어떻게 보이는지 확인한다. AssetLightProbe(노드가 있나)와 답하는 질문이 다르다.
//
// 렌더러는 `<Canvas gl={createRenderer}>`로 만든다 — 노출 1/20 + 발광 블룸 MRT가 이 화면의
// 전제라 기본 <Canvas>(LightCanvas 경로)를 쓰면 발광이 이 씬에서 안 읽힌다. 캔버스 크기·DPR·
// 리사이즈는 R3F가 잡는다(createRenderer 자신은 window 크기로 setSize를 박지만 R3F가
// 컨테이너 크기로 덮어쓴다).

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import InlineNotice from '@/components/common/InlineNotice';
import { createRenderer } from '@/three/render/renderer';
import { createPostFX, type PostFX } from '@/three/scene/postfx';
import { createEmitterPreview, type EmitterPreview } from '@/three/scene/emitterPreview';
import type { EmitterDraft } from '@/types/admin/asset';
import { emitterPreviewFromDraft } from '@/utils/admin/assetDraft';

const FOV_DEG = 40;
/** 살짝 낮은 3/4 뷰 — 상판 웅덩이와 발광면이 한 화면에 든다. */
const FIT_DIR: [number, number, number] = [0.55, 0.42, 0.9];
const FIT_MARGIN = 2.6;

type Props = {
  glbUrl: string;
  draft: EmitterDraft;
};

type SceneProps = Props & {
  /** 방 조명 토글은 Canvas 밖 버튼이 잡는다 — 인스턴스를 부모 ref에 실어 준다. */
  previewRef: RefObject<EmitterPreview | null>;
  onError: (message: string | null) => void;
};

/** 프리뷰 인스턴스·postfx·카메라 소유. 언마운트 시 전부 놓는다(라우트 이동이 캔버스를 언마운트한다). */
const PreviewScene = ({ glbUrl, draft, previewRef, onError }: SceneProps) => {
  const gl = useThree((s) => s.gl);
  const domElement = useThree((s) => s.gl.domElement);
  const size = useThree((s) => s.size);
  const set = useThree((s) => s.set);

  const [preview, setPreview] = useState<EmitterPreview | null>(null);
  const postfxRef = useRef<PostFX | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    let disposed = false;
    // 카메라는 직접 만들어 등록한다 — useThree가 돌려준 카메라를 변형하면
    // react-hooks/immutability에 걸린다(SimulatorCanvas·LightCanvas와 같은 방식).
    const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.01, 100);
    camera.position.set(0.6, 1.1, 1.2);
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.75, 0);
    cameraRef.current = camera;
    controlsRef.current = controls;
    set({ camera });

    const renderer = gl as unknown as THREE.WebGPURenderer;
    void createEmitterPreview(renderer)
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        previewRef.current = instance;
        postfxRef.current = createPostFX(renderer, instance.scene, camera);
        setPreview(instance);
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : '프리뷰를 만들지 못했습니다.');
      });

    return () => {
      disposed = true;
      controls.dispose();
      controlsRef.current = null;
      cameraRef.current = null;
      postfxRef.current = null;
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, [gl, domElement, set, previewRef, onError]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }, [size]);

  useEffect(() => {
    if (!preview) return;
    onError(null);
    void preview
      .loadModel(glbUrl)
      .then(() => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const { center, radius } = preview.focus();
        const dist = (radius * FIT_MARGIN) / Math.sin((camera.fov * Math.PI) / 360);
        camera.position.set(
          center[0] + FIT_DIR[0] * dist,
          center[1] + FIT_DIR[1] * dist,
          center[2] + FIT_DIR[2] * dist,
        );
        camera.updateProjectionMatrix();
        controls.target.set(center[0], center[1], center[2]);
        controls.update();
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : 'GLB를 열지 못했습니다.');
      });
  }, [preview, glbUrl, onError]);

  // `draft`는 EmitterSection의 useState 객체라 실제 편집이 있을 때만 참조가 바뀐다 —
  // 그대로 deps에 넣어도 매 렌더 실행되지 않는다.
  useEffect(() => {
    preview?.setEmitter(emitterPreviewFromDraft(draft));
  }, [preview, draft]);

  useFrame(() => {
    controlsRef.current?.update();
    previewRef.current?.tick();
    postfxRef.current?.render();
  }, 1);

  if (!preview) return null;
  return <primitive object={preview.scene} />;
};

const EmitterPreviewPanel = ({ glbUrl, draft }: Props) => {
  const [error, setError] = useState<string | null>(null);
  const [isRoomOn, setIsRoomOn] = useState(true);
  const previewRef = useRef<EmitterPreview | null>(null);

  const handleToggleRoom = () => {
    const next = !isRoomOn;
    setIsRoomOn(next);
    previewRef.current?.setRoomLight(next);
  };

  return (
    <div className="mt-4">
      <div className="border-ash/20 relative h-[420px] overflow-hidden rounded-[10px] border bg-neutral-800">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={async (props) => createRenderer(props.canvas as HTMLCanvasElement)}
        >
          <PreviewScene glbUrl={glbUrl} draft={draft} previewRef={previewRef} onError={setError} />
        </Canvas>
        <button
          type="button"
          onClick={handleToggleRoom}
          aria-pressed={isRoomOn}
          className="absolute top-3 left-3 cursor-pointer rounded-[8px] bg-black/60 px-3 py-1.5 text-[13px] font-medium text-white"
        >
          방 조명 {isRoomOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <p className="text-ash mt-2 text-[13px] leading-5">
        시뮬레이터와 같은 조명 리그·카메라 노출·블룸입니다. 방 조명을 끄면 발광만 남습니다 — 여기서
        고른 광속(lm)이 시뮬레이터에서도 같은 밝기입니다.
      </p>
      {error !== null ? (
        <div className="mt-3">
          <InlineNotice variant="error" title="프리뷰를 그리지 못했습니다" message={error} />
        </div>
      ) : null}
    </div>
  );
};

export default EmitterPreviewPanel;
