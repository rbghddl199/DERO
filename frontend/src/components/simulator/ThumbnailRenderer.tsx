'use client';
// 갤러리 카드용 정적 썸네일 캡처 대상 — 로컬 오브젝트 1개만 중립 배경 위에 렌더링한다.
// 실제 시뮬레이터 화면에는 노출되지 않고 scripts/generate-thumbnails.mjs가 헤드리스로 스크린샷만 찍어간다.

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import * as THREE from 'three/webgpu';
import { createRenderer } from '@/three/render/renderer';
import { createAssetLoader } from '@/three/render/assetLoader';
import { createProductAssets } from '@/three/core/productAssets';
import { buildProp } from '@/three/scene/props';
import { buildDesk } from '@/three/scene/desk';
import { getProduct } from '@/three/scene/product';
import { deskConfigFromProduct } from '@/three/core/deskConfig';

const SIZE = 512;

async function buildObject(
  loader: Awaited<ReturnType<typeof createAssetLoader>>,
  id: string,
  kind: string,
): Promise<THREE.Object3D | null> {
  if (kind === 'desk') {
    const spec = getProduct(id);
    if (!spec) return null;
    return buildDesk(deskConfigFromProduct(spec));
  }

  if (kind === 'local') {
    const spec = getProduct(id);
    if (!spec) return null;
    if (spec.glbUrl) {
      const assets = createProductAssets(loader);
      await assets.preload([spec]);
      return assets.instantiate(spec)?.group ?? null;
    }
    return buildProp(spec);
  }

  return null;
}

const ThumbnailRenderer = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const kind = searchParams.get('kind');

  useEffect(() => {
    const validKind = kind === 'local' || kind === 'desk';
    if (!canvasRef.current || !id || !validKind) return;
    const canvas = canvasRef.current;
    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;

    // globals.css의 body 배경(neutral-50)이 캔버스 투명 영역 뒤로 그대로 비쳐서
    // 스크린샷의 omitBackground가 무력화된다 — 이 라우트에서만 걷어낸다.
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';

    (async () => {
      renderer = await createRenderer(canvas);
      if (disposed) return;
      renderer.setPixelRatio(1);
      renderer.setSize(SIZE, SIZE, false);
      // 투명 배경 — ACES 톤매핑+노출(1/20)이 scene.background 같은 상수색도 짙게
      // 눌러버려서(three/CLAUDE.md postfx 노트와 동일 원인) 불투명 배경색은 쓸 수 없다.
      // 카드 쪽 배경(.lib-thumb)이 같은 중립색을 깔아주므로 투명이면 이음매 없이 붙는다.
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();

      // 씬 전역 조명 리그(scene.ts)와 동일한 세기 — 소품 머티리얼이 그 톤에 맞춰
      // 튜닝돼 있어(예: 램프 emissiveIntensity) 다른 조명이면 실제 배치 모습과 어긋난다.
      const key = new THREE.DirectionalLight(0xffffff, 60);
      key.position.set(2.6, 4.2, 2.4);
      const fill = new THREE.DirectionalLight(0xffffff, 17);
      fill.position.set(-3, 2.4, 1.5);
      const rim = new THREE.DirectionalLight(0xffffff, 20);
      rim.position.set(-1.2, 3, -3);
      scene.add(key, fill, rim);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a938a, 6));
      scene.add(new THREE.AmbientLight(0xffffff, 7));

      const loader = await createAssetLoader(renderer);
      const object = await buildObject(loader, id, kind);
      if (!object || disposed) return;
      scene.add(object);

      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;

      const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
      const dir = new THREE.Vector3(1, 0.85, 1.3).normalize();
      const distance = (maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.7;
      camera.position.copy(center).addScaledVector(dir, distance);
      camera.lookAt(center);

      // WebGPU 백엔드는 프레임 제출이 비동기라 rAF를 몇 번 넘겨야 실제로 출력이
      // 캔버스에 반영된다 — sampleRegion()과 동일한 이유(simulatorStore.ts 참조).
      for (let i = 0; i < 3; i++) {
        renderer.render(scene, camera);
        await new Promise<void>((res) => requestAnimationFrame(() => res()));
      }
      if (!disposed) canvas.dataset.thumbReady = '1';
    })();

    return () => {
      disposed = true;
      renderer?.dispose();
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
    };
  }, [id, kind]);

  return <canvas ref={canvasRef} width={SIZE} height={SIZE} data-testid="thumbnail-canvas" />;
};

export default ThumbnailRenderer;
