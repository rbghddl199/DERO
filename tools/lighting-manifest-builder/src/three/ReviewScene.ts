import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { LightManifest, PreviewStage, Vec3 } from '../lighting-manifest/types';

const stageConfig: Record<PreviewStage, { emissive: boolean; main: boolean; fill: boolean; bounce: boolean }> = {
  MODEL_ONLY: { emissive: false, main: false, fill: false, bounce: false },
  EMISSIVE_ONLY: { emissive: true, main: false, fill: false, bounce: false },
  MAIN_LIGHT: { emissive: true, main: true, fill: false, bounce: false },
  HYBRID_BASIC: { emissive: true, main: true, fill: true, bounce: false },
  HYBRID_FINAL: { emissive: true, main: true, fill: true, bounce: true },
};

export class ReviewScene {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly transform: TransformControls;
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private model: THREE.Object3D | null = null;
  private manifest: LightManifest | null = null;
  private stage: PreviewStage = 'HYBRID_FINAL';
  private targetMode: 'origin' | 'target' = 'origin';
  private onOrigin: (value: Vec3) => void = () => {};
  private onTarget: (value: Vec3) => void = () => {};
  private animation = 0;
  private mainLight: THREE.Light | null = null;
  private fillLight: THREE.PointLight | null = null;
  private bounceLights: THREE.PointLight[] = [];
  private targetObject = new THREE.Object3D();
  private originMarker = marker(0x38bdf8, 0.032);
  private targetMarker = marker(0xf97316, 0.026);
  private line: THREE.Line;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.shadowMap.enabled = true;
    this.scene.background = new THREE.Color(0x2f343a);
    this.camera.position.set(0.6, 0.45, 0.72);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setMode('translate');
    this.transform.setSize(0.75);
    this.transform.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });
    this.transform.addEventListener('objectChange', () => this.syncTransformBack());
    this.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf8d172 }));
    this.setupScene();
    this.attachTransform();
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  async loadModel(url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url);
    this.disposeModel();
    this.model = gltf.scene;
    this.model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((item) => item.clone()) : mesh.material.clone();
    });
    this.scene.add(this.model);
    this.fitCamera();
    this.applyManifestVisuals();
  }

  setManifest(manifest: LightManifest | null): void {
    this.manifest = manifest ? structuredClone(manifest) : null;
    this.applyManifestVisuals();
  }

  setStage(stage: PreviewStage): void {
    this.stage = stage;
    this.applyManifestVisuals();
  }

  setTransformTarget(mode: 'origin' | 'target'): void {
    this.targetMode = mode;
    this.attachTransform();
  }

  setCallbacks(callbacks: { onOrigin: (value: Vec3) => void; onTarget: (value: Vec3) => void }): void {
    this.onOrigin = callbacks.onOrigin;
    this.onTarget = callbacks.onTarget;
  }

  async pngBlob(): Promise<Blob> {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const blob = await new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG capture failed.');
    return blob;
  }

  dispose(): void {
    cancelAnimationFrame(this.animation);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.transform.dispose();
    this.disposeModel();
    this.renderer.dispose();
  }

  private setupScene(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 3, 2);
    this.scene.add(key);
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ color: 0xd7c7ad, roughness: 0.75 }));
    desk.rotation.x = -Math.PI / 2;
    desk.receiveShadow = true;
    this.scene.add(desk);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.025), new THREE.MeshStandardMaterial({ color: 0xede8dd, roughness: 0.9 }));
    wall.position.set(0, 0.55, -0.65);
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.scene.add(new THREE.GridHelper(2.4, 12, 0x7b7f87, 0x4f545d));
    this.scene.add(this.targetObject, this.originMarker, this.targetMarker, this.line, this.transform as unknown as THREE.Object3D);
  }

  private applyManifestVisuals(): void {
    this.clearLights();
    if (!this.manifest) return;
    const config = stageConfig[this.stage];
    const origin = toThree(this.manifest.binding.fallbackOrigin);
    const target = this.manifest.binding.fallbackTarget ? toThree(this.manifest.binding.fallbackTarget) : null;
    this.originMarker.position.copy(origin);
    this.targetMarker.visible = Boolean(target);
    if (target) {
      this.targetMarker.position.copy(target);
      this.targetObject.position.copy(target);
    } else {
      this.targetObject.position.copy(origin).add(new THREE.Vector3(0, -0.5, 0));
    }
    this.updateLine();
    this.attachTransform();
    this.applyEmissive(config.emissive);
    if (config.main) this.createMainLight(origin);
    if (config.fill) this.createFillLight(origin);
    if (config.bounce) this.createBounceLights();
  }

  private createMainLight(origin: THREE.Vector3): void {
    if (!this.manifest) return;
    const main = this.manifest.hybridLighting.main;
    if (main.type === 'SPOT') {
      const light = new THREE.SpotLight(0xfff3db, main.intensityRatio * 5, main.rangeM);
      light.position.copy(origin);
      light.angle = (main.angleDeg * Math.PI) / 180;
      light.penumbra = main.penumbra;
      light.castShadow = main.castShadow;
      light.target = this.targetObject;
      this.mainLight = light;
      this.scene.add(light);
      this.scene.add(new THREE.SpotLightHelper(light, 0x72d6ff));
      return;
    }
    const point = new THREE.PointLight(0xfff3db, main.intensityRatio * 4, main.rangeM);
    point.position.copy(origin);
    point.castShadow = main.castShadow && main.type === 'POINT';
    this.mainLight = point;
    this.scene.add(point);
    this.scene.add(new THREE.PointLightHelper(point, 0.08, 0x72d6ff));
  }

  private createFillLight(origin: THREE.Vector3): void {
    const fill = this.manifest?.hybridLighting.fill;
    if (!fill?.enabled) return;
    const light = new THREE.PointLight(0xfff7ea, fill.intensityRatio * 5, fill.rangeM);
    light.position.copy(origin).add(toThree(fill.localOffset));
    this.fillLight = light;
    this.scene.add(light);
  }

  private createBounceLights(): void {
    if (!this.manifest?.binding.fallbackTarget) return;
    const target = toThree(this.manifest.binding.fallbackTarget);
    for (const policy of this.manifest.hybridLighting.bouncePolicies) {
      if (!policy.enabled || policy.role === 'NO_BOUNCE') continue;
      const light = new THREE.PointLight(0xf8e8d0, policy.intensityRatio * 3, this.manifest.hybridLighting.main.rangeM * policy.rangeRatio);
      light.position.copy(target);
      this.bounceLights.push(light);
      this.scene.add(light);
    }
  }

  private clearLights(): void {
    const remove: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.SpotLightHelper ||
        object instanceof THREE.PointLightHelper ||
        object === this.mainLight ||
        object === this.fillLight ||
        this.bounceLights.includes(object as THREE.PointLight)
      ) {
        remove.push(object);
      }
    });
    remove.forEach((object) => this.scene.remove(object));
    this.mainLight = null;
    this.fillLight = null;
    this.bounceLights = [];
  }

  private applyEmissive(enabled: boolean): void {
    const target = this.manifest?.materialResponse.emissive.meshNode ?? this.manifest?.materialBindings.emissiveSurfaceMesh;
    this.model?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const selected = enabled && target && (mesh.name === target || object.name === target);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard.emissive) continue;
        standard.emissive.set(selected ? 0xfff1be : 0x000000);
        standard.emissiveIntensity = selected ? this.manifest?.materialResponse.emissive.intensityRatio ?? 1 : 0;
      }
    });
  }

  private syncTransformBack(): void {
    if (!this.manifest) return;
    const object = this.targetMode === 'origin' ? this.originMarker : this.targetMarker;
    const value: Vec3 = [round(object.position.x), round(object.position.y), round(object.position.z)];
    if (this.targetMode === 'origin') this.onOrigin(value);
    else this.onTarget(value);
    this.updateLine();
  }

  private attachTransform(): void {
    const target = this.targetMode === 'origin' ? this.originMarker : this.targetMarker;
    if (target.visible) this.transform.attach(target);
  }

  private updateLine(): void {
    const origin = this.originMarker.position;
    const target = this.targetMarker.visible ? this.targetMarker.position : this.targetObject.position;
    const array = new Float32Array([origin.x, origin.y, origin.z, target.x, target.y, target.z]);
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry();
    this.line.geometry.setAttribute('position', new THREE.BufferAttribute(array, 3));
  }

  private fitCamera(): void {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(...box.getSize(new THREE.Vector3()).toArray()) / 2 || 0.25;
    const dist = (radius * 1.65) / Math.sin((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(center.x + dist * 0.72, center.y + dist * 0.52, center.z + dist * 0.86);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || 800;
    const height = parent?.clientHeight || 600;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private loop = (): void => {
    this.animation = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private disposeModel(): void {
    if (!this.model) return;
    this.scene.remove(this.model);
    this.model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
    this.model = null;
  }
}

function marker(color: number, radius: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshBasicMaterial({ color }));
}

function toThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
