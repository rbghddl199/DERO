/**
 * DERO 시뮬레이터 → 실사화 워커(imagine_img) 캡처 모듈.
 *
 * 화면(뷰포트)을 캡처하지 않는다. 같은 씬을 **실사화 전용 설정으로 다시 렌더**해서
 * 그 픽셀만 보낸다. 그래서:
 *
 *   - DOM 오버레이(WEB VITALS 패널, 툴바, 가이드선)가 원천적으로 안 들어간다
 *   - 사용자에게 보이는 캔버스의 툰 셰이딩·아웃라인을 끄지 않아도 된다
 *   - 조명 상태 4종을 사용자 화면과 무관하게 연속으로 뽑을 수 있다
 *
 * 왜 이렇게까지 하는지는 ../SIMULATOR_CAPTURE_SPEC.md 를 본다.
 * 요약: 조명은 프롬프트로 만들 수 없고(실측 193.6 → 186.4), 음영이 없는 렌더는
 * 실사화가 걸리지 않는다(국소 표준편차 1.2 미만이면 워커가 경고를 남긴다).
 *
 * three.js r160+ 기준. 버전 차이가 나는 API 는 아래 주석에 표시했다.
 */

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// ---------------------------------------------------------------------------
// 1. 씬에 붙이는 약속 (이것만 지키면 아래 코드는 그대로 돈다)
// ---------------------------------------------------------------------------

/**
 * 조명에 역할을 붙인다. `light.userData.deroRole = 'room'` 처럼.
 *
 *   sun      창밖 자연광 (DirectionalLight). NIGHT 에서 꺼진다
 *   sky      하늘/환경 채움광 (Ambient/Hemisphere). NIGHT 에서 크게 줄어든다
 *   room     천장 조명 (roomLightOn 을 따른다)
 *   product  스탠드·모니터 백라이트 등 제품 조명 — **방 조명에 묶인다**(결정 2026-08-01)
 */
export type DeroLightRole = 'sun' | 'sky' | 'room' | 'product'

/**
 * 아웃라인용 메시(인버티드 헐 등)에는 `mesh.userData.deroOutline = true` 를 붙인다.
 * 캡처 동안 숨긴다. EffectComposer 의 OutlinePass 로 만들었다면 애초에
 * composer 를 안 타므로 아무것도 안 해도 된다.
 */
export const OUTLINE_FLAG = 'deroOutline'

export type TimeOfDay = 'DAY' | 'NIGHT'

export interface LightingState {
  timeOfDay: TimeOfDay
  roomLightOn: boolean
}

/**
 * 사용자가 생성 페이지에서 고를 수 있는 조명 조건 네 가지.
 *
 * **한 번에 다 만들지 않는다** (2026-08-01 결정). 사용자가 하나를 고르고 생성 버튼을
 * 누르면 그 조건으로만 렌더해서 한 장을 보낸다. 이 배열은 버튼 목록일 뿐이다.
 *
 * 네 장을 한꺼번에 뽑는 건 렌더 설정 점검용 `captureAllStatesForCheck()` 뿐이다.
 */
export const CAPTURE_STATES: readonly LightingState[] = [
  { timeOfDay: 'DAY', roomLightOn: true },
  { timeOfDay: 'DAY', roomLightOn: false },
  { timeOfDay: 'NIGHT', roomLightOn: true },
  { timeOfDay: 'NIGHT', roomLightOn: false },
]

/**
 * 역할별 밝기 배수. **원래 intensity 에 곱한다** — 절대값을 넣지 않으므로
 * 씬 디자이너가 잡은 상대적인 밸런스가 유지된다.
 *
 * 여기가 결과 밝기를 가르는 유일한 지점이다. 워커는 입력 밝기를 그대로 따라가므로
 * (실측 오차 1~2/255) 네 상태의 평균 밝기가 뚜렷이 갈려야 한다.
 * `scripts/check_capture.py` 로 4장을 한 번에 넣으면 밝기 비교표가 나온다.
 */
const LIGHT_GAIN: Record<DeroLightRole, (s: LightingState) => number> = {
  sun: (s) => (s.timeOfDay === 'DAY' ? 1.0 : 0.0),
  sky: (s) => (s.timeOfDay === 'DAY' ? 1.0 : 0.06),
  room: (s) => (s.roomLightOn ? 1.0 : 0.0),
  product: (s) => (s.roomLightOn ? 1.0 : 0.0),
}

/** 환경맵(IBL) 세기. NIGHT 에 이걸 안 줄이면 방을 껐는데도 화면이 밝게 남는다. */
const ENVIRONMENT_INTENSITY: Record<TimeOfDay, number> = {
  DAY: 1.0,
  NIGHT: 0.08,
}

/**
 * 발광 **표면**의 세기 배수. 실제 조명(light)은 안 건드린다 — 둘은 다른 것이다.
 *
 * ```text
 * 발광 표면   물체가 하얗게 타서 형태가 사라진다   ← 여기서 낮춘다
 * 실제 빛     책상에 빛 웅덩이·색 번짐이 생긴다     ← 그대로 둔다 (LIGHT_GAIN 소관)
 * ```
 *
 * **실측(2026-08-02)**: RGB 케이스가 붙은 배치를 실사화했더니 케이스가 매번 다른 것으로
 * 그려졌다 — 흰 판 · 환기구 패널 · 빈 공간. 발광 재질이 표면을 흰색으로 클리핑해서
 * 모델이 붙잡을 형태가 없었기 때문이다. `product_emitter` 는 `spec_type` 과 직교라
 * (ADR-0003) 조명·RGB 케이스·선반 언더라이트·벽 스트립이 전부 같은 증상을 낸다.
 *
 * **블룸은 따로 끌 필요가 없다** — 이 모듈은 `renderer.render()` 를 직접 부르므로
 * `EffectComposer` 를 안 타고, 블룸은 그 위에 있는 후처리다(2026-08-02 확인).
 * 화면에 보이는 뿌연 후광은 캡처에 안 들어간다. 나중에 블룸을 composer 가 아닌
 * 다른 방식(커스텀 노드·재질)으로 옮기면 **이 가정이 깨지므로 여기서 따로 꺼야 한다.**
 *
 * 값을 0 으로 두지 않는 이유: 완전히 끄면 "RGB 가 켜져 있다"는 단서까지 사라진다.
 * 형태가 읽힐 만큼만 낮춘다.
 */
const EMISSIVE_SURFACE_SCALE = 0.25

// ---------------------------------------------------------------------------
// 2. 캡처 설정
// ---------------------------------------------------------------------------

export interface CaptureOptions {
  /**
   * 긴 변 픽셀. 워커의 생성 픽셀 예산이 1152x1024(1.18M)이라 이보다 훨씬 크게 주면
   * Lanczos 축소·확대 배율만 커지고 디테일은 안 는다. 1100~1250 이 권장 구간이다.
   */
  longSide?: number
  /** 'image/webp' | 'image/png'. WebP 는 워커가 받는다(2026-08-01 추가). */
  mimeType?: string
  /** WebP 품질. PNG 는 무시된다. */
  quality?: number
  /**
   * 톤 매핑. 화면이 툰 룩이라 NoToneMapping 이더라도, 실사화용 렌더는 ACES 로
   * 하이라이트를 굴리는 편이 사진에 가깝다. 화면 설정을 그대로 쓰려면 null.
   */
  toneMapping?: THREE.ToneMapping | null
  toneMappingExposure?: number
  /** 그림자 맵 해상도. 2048 이면 노트북 GPU 에서도 4장 렌더가 1초 이내다. */
  shadowMapSize?: number
}

const DEFAULTS: Required<CaptureOptions> = {
  longSide: 1200,
  mimeType: 'image/webp',
  quality: 0.95,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.0,
  shadowMapSize: 2048,
}

export interface Capture extends LightingState {
  blob: Blob
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// 3. 상태 저장·복원 (중간에 예외가 나도 화면이 망가지면 안 된다)
// ---------------------------------------------------------------------------

interface Restore {
  run(): void
}

function createRestore(): Restore & { add(fn: () => void): void } {
  const undos: Array<() => void> = []
  return {
    add: (fn) => undos.push(fn),
    // 역순으로 되돌린다.
    run: () => {
      for (let i = undos.length - 1; i >= 0; i--) {
        try {
          undos[i]()
        } catch (err) {
          console.error('[deroCapture] 복원 실패', err)
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// 4. 실사화 렌더 설정 적용
// ---------------------------------------------------------------------------

/**
 * MeshBasicMaterial / MeshToonMaterial 을 MeshStandardMaterial 로 바꾼다.
 *
 * **이게 음영량을 가장 크게 올린다.** MeshBasicMaterial 은 조명을 아예 안 받아
 * 완전 평면으로 나오고, 워커 입장에서는 "실사화할 단서가 없는 면"이다.
 * 단색 재질을 MeshBasicMaterial 로 만들었다면 여기서 구제된다.
 */
function relightMaterials(root: THREE.Object3D, restore: ReturnType<typeof createRestore>): number {
  let converted = 0

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return

    // 그림자를 주고받게 한다. 이게 꺼져 있으면 접지 그림자가 없어서
    // 물체가 공중에 뜬 것처럼 보이고, 실사화하면 더 어색해진다.
    const hadCast = mesh.castShadow
    const hadReceive = mesh.receiveShadow
    mesh.castShadow = true
    mesh.receiveShadow = true
    restore.add(() => {
      mesh.castShadow = hadCast
      mesh.receiveShadow = hadReceive
    })

    const original = mesh.material
    const list = Array.isArray(original) ? original : [original]
    const swapped = list.map((material) => {
      const basic = material as THREE.MeshBasicMaterial
      const toon = material as THREE.MeshToonMaterial
      if (!basic?.isMeshBasicMaterial && !toon?.isMeshToonMaterial) return material

      converted++
      const standard = new THREE.MeshStandardMaterial({
        color: (material as THREE.MeshBasicMaterial).color?.clone(),
        map: (material as THREE.MeshBasicMaterial).map ?? null,
        transparent: material.transparent,
        opacity: material.opacity,
        side: material.side,
        alphaTest: material.alphaTest,
        // 무광 플라스틱 정도. 완전 무광(1.0)이면 하이라이트가 없어 다시 평면이 된다.
        roughness: 0.65,
        metalness: 0.0,
      })
      restore.add(() => standard.dispose())
      return standard
    })

    if (swapped.some((m, i) => m !== list[i])) {
      mesh.material = Array.isArray(original) ? swapped : swapped[0]
      restore.add(() => {
        mesh.material = original
      })
    }
  })

  return converted
}

/**
 * 발광 표면을 낮춘다. 실제 조명은 안 건드린다 — `EMISSIVE_SURFACE_SCALE` 주석 참고.
 *
 * `emissiveIntensity` 만 만진다. `emissive` 색을 바꾸면 어떤 색으로 빛나는지가 사라져서
 * "따뜻한 색온도 스탠드"와 "RGB 케이스"를 모델이 구별하지 못한다.
 */
function dimEmissiveSurfaces(
  root: THREE.Object3D,
  restore: ReturnType<typeof createRestore>,
): number {
  let dimmed = 0
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of list) {
      const standard = material as THREE.MeshStandardMaterial
      // emissive 가 검정이면 발광체가 아니다 — 건드릴 이유가 없다.
      if (!standard?.emissive || standard.emissive.getHex() === 0) continue
      const previous = standard.emissiveIntensity ?? 1
      standard.emissiveIntensity = previous * EMISSIVE_SURFACE_SCALE
      dimmed++
      restore.add(() => {
        standard.emissiveIntensity = previous
      })
    }
  })
  return dimmed
}

/** 아웃라인 메시를 숨긴다. */
function hideOutlines(root: THREE.Object3D, restore: ReturnType<typeof createRestore>): number {
  let hidden = 0
  root.traverse((object) => {
    if (object.userData?.[OUTLINE_FLAG] !== true) return
    const wasVisible = object.visible
    object.visible = false
    hidden++
    restore.add(() => {
      object.visible = wasVisible
    })
  })
  return hidden
}

/** 조명 역할별로 세기를 조절하고 그림자를 부드럽게 만든다. */
function applyLighting(
  root: THREE.Object3D,
  state: LightingState,
  shadowMapSize: number,
  restore: ReturnType<typeof createRestore>,
): void {
  root.traverse((object) => {
    const light = object as THREE.Light
    if (!light.isLight) return

    const role = light.userData?.deroRole as DeroLightRole | undefined
    if (!role) {
      console.warn(
        `[deroCapture] 조명 "${light.name || light.type}" 에 userData.deroRole 이 없다. ` +
          '조명 상태 전환에서 제외된다.',
      )
      return
    }

    const baseIntensity = light.userData.deroBaseIntensity ?? light.intensity
    light.userData.deroBaseIntensity = baseIntensity

    const previous = light.intensity
    light.intensity = baseIntensity * LIGHT_GAIN[role](state)
    restore.add(() => {
      light.intensity = previous
    })

    const shadowed = light as THREE.DirectionalLight
    if (!shadowed.shadow) return

    const hadCast = shadowed.castShadow
    const hadSize = shadowed.shadow.mapSize.clone()
    const hadBias = shadowed.shadow.bias
    const hadNormalBias = shadowed.shadow.normalBias

    // 꺼진 조명이 그림자를 만들 필요는 없다 — 렌더 패스만 낭비된다.
    shadowed.castShadow = light.intensity > 0
    shadowed.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    shadowed.shadow.bias = -0.0005
    // normalBias 가 그림자 여드름(shadow acne)을 없앤다. 이게 없으면 평면에
    // 줄무늬가 생기고 워커가 그걸 재질 무늬로 착각한다.
    shadowed.shadow.normalBias = 0.02
    shadowed.shadow.needsUpdate = true

    restore.add(() => {
      shadowed.castShadow = hadCast
      shadowed.shadow.mapSize.copy(hadSize)
      shadowed.shadow.bias = hadBias
      shadowed.shadow.normalBias = hadNormalBias
      shadowed.shadow.needsUpdate = true
    })
  })
}

// ---------------------------------------------------------------------------
// 5. 환경맵 (IBL)
// ---------------------------------------------------------------------------

let cachedEnvironment: THREE.Texture | null = null

/**
 * 환경맵을 만든다. HDR 파일이 없어도 되도록 three.js 내장 RoomEnvironment 를 쓴다.
 *
 * IBL 이 없으면 물체의 그늘진 면이 완전히 까맣게 죽어서 음영 단서가 사라진다.
 * 실측: 프록시 렌더 1.71 → GLB 렌더 1.92(IBL 없음). 목표는 2.5 이상이다.
 *
 * 한 번 만들면 재사용한다 — PMREM 생성이 수십 ms 걸린다.
 */
function getEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (cachedEnvironment) return cachedEnvironment
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  // r155 이전에는 `new RoomEnvironment(renderer)` 로 renderer 를 넘겨야 한다.
  cachedEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  return cachedEnvironment
}

export function disposeEnvironment(): void {
  cachedEnvironment?.dispose()
  cachedEnvironment = null
}

// ---------------------------------------------------------------------------
// 6. 캡처 본체
// ---------------------------------------------------------------------------

function computeSize(renderer: THREE.WebGLRenderer, longSide: number) {
  const size = renderer.getSize(new THREE.Vector2())
  const scale = longSide / Math.max(size.x, size.y)
  // 화면과 **같은 비율**로만 키운다. 그래야 camera.aspect 를 안 건드리고,
  // 사용자가 본 프레이밍이 결과와 일치한다.
  return {
    width: Math.round(size.x * scale),
    height: Math.round(size.y * scale),
    original: size,
  }
}

/**
 * 조명 상태 하나를 렌더해서 이미지 데이터 URL 로 뽑는다.
 *
 * WebGLRenderTarget 을 쓰지 않는 이유: three.js 는 렌더 타깃에 그릴 때 톤 매핑을
 * 적용하지 않는다(`_currentRenderTarget === null ? toneMapping : NoToneMapping`).
 * 화면과 다른 색이 나와서 조명 상태 비교가 어긋난다. 대신 기본 프레임버퍼에 그리고
 * **같은 태스크 안에서 동기적으로** toDataURL 을 호출한다 — 브라우저가 아직 합성하지
 * 않았으므로 preserveDrawingBuffer 없이도 픽셀이 살아 있고, 중간 상태가 화면에
 * 그려지지도 않는다(깜빡임 없음).
 */
function renderOnce(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  state: LightingState,
  options: Required<CaptureOptions>,
): { dataUrl: string; width: number; height: number } {
  const restore = createRestore()

  try {
    // --- 렌더러 ---
    const size = computeSize(renderer, options.longSide)
    const hadPixelRatio = renderer.getPixelRatio()
    const hadShadowEnabled = renderer.shadowMap.enabled
    const hadShadowType = renderer.shadowMap.type
    const hadToneMapping = renderer.toneMapping
    const hadExposure = renderer.toneMappingExposure

    restore.add(() => {
      renderer.setPixelRatio(hadPixelRatio)
      renderer.setSize(size.original.x, size.original.y, false)
      renderer.shadowMap.enabled = hadShadowEnabled
      renderer.shadowMap.type = hadShadowType
      renderer.toneMapping = hadToneMapping
      renderer.toneMappingExposure = hadExposure
      renderer.shadowMap.needsUpdate = true
    })

    renderer.setPixelRatio(1) // longSide 를 실제 픽셀로 만든다
    renderer.setSize(size.width, size.height, false) // false = CSS 크기 유지
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.needsUpdate = true
    if (options.toneMapping !== null) {
      renderer.toneMapping = options.toneMapping
      renderer.toneMappingExposure = options.toneMappingExposure
    }

    // --- 씬 ---
    const hadEnvironment = scene.environment
    scene.environment = getEnvironment(renderer)
    restore.add(() => {
      scene.environment = hadEnvironment
    })

    // scene.environmentIntensity 는 r163+. 없으면 NIGHT 가 덜 어두워지므로
    // 그때는 sky 조명 gain 을 더 낮춰서 보완한다.
    if ('environmentIntensity' in scene) {
      const hadIntensity = (scene as any).environmentIntensity
      ;(scene as any).environmentIntensity = ENVIRONMENT_INTENSITY[state.timeOfDay]
      restore.add(() => {
        ;(scene as any).environmentIntensity = hadIntensity
      })
    } else if (state.timeOfDay === 'NIGHT') {
      console.warn(
        '[deroCapture] three.js 가 scene.environmentIntensity 를 지원하지 않는다(r163 미만). ' +
          'NIGHT 렌더가 예상보다 밝게 나온다.',
      )
    }

    hideOutlines(scene, restore)
    relightMaterials(scene, restore)
    dimEmissiveSurfaces(scene, restore)
    applyLighting(scene, state, options.shadowMapSize, restore)

    // --- 렌더 + 즉시 캡처 (사이에 await 을 넣으면 안 된다) ---
    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
    const dataUrl = renderer.domElement.toDataURL(options.mimeType, options.quality)

    return { dataUrl, width: size.width, height: size.height }
  } finally {
    restore.run()
  }
}

async function toCaptures(
  rendered: Array<{ state: LightingState; dataUrl: string; width: number; height: number }>,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<Capture[]> {
  // 화면 복원 후에 비동기 변환을 한다. dataUrl 은 이미 픽셀을 들고 있어 안전하다.
  const captures = await Promise.all(
    rendered.map(async ({ state, dataUrl, width, height }) => ({
      ...state,
      blob: await (await fetch(dataUrl)).blob(),
      width,
      height,
    })),
  )
  // 다음 프레임에 화면이 원래대로 그려지게 한다.
  renderer.render(scene, camera)
  return captures
}

/**
 * 고른 조명 조건으로 **한 장**을 렌더한다. 노트북 GPU 기준 0.3초 이내.
 *
 * 사용자가 생성 페이지에서 낮/밤·방 조명을 고르고 버튼을 누를 때 부른다.
 * 조건이 바뀌면 그때 다시 부르면 된다 — 미리 네 장을 만들어 두지 않는다.
 */
export async function captureForAI(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  state: LightingState,
  options: CaptureOptions = {},
): Promise<Capture> {
  const rendered = [{ state, ...renderOnce(renderer, scene, camera, state, { ...DEFAULTS, ...options }) }]
  const [capture] = await toCaptures(rendered, renderer, scene, camera)
  return capture
}

/**
 * **개발용.** 네 조건을 전부 렌더한다. 서비스 경로에서는 쓰지 않는다.
 *
 * 있는 이유는 하나다 — `scripts/check_capture.py` 에 네 장을 한꺼번에 넣으면 밝기
 * 비교표가 나오고, 거기서 값이 안 갈리면 **조명이 렌더에 구워지지 않았다**는 뜻이다.
 * 이게 1순위 실패 모드라 확인 경로를 없앨 수 없다 (../SIMULATOR_CAPTURE_SPEC.md §1.2).
 */
export async function captureAllStatesForCheck(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: CaptureOptions = {},
): Promise<Capture[]> {
  const resolved = { ...DEFAULTS, ...options }
  const rendered = CAPTURE_STATES.map((state) => ({
    state,
    ...renderOnce(renderer, scene, camera, state, resolved),
  }))
  return toCaptures(rendered, renderer, scene, camera)
}

// ---------------------------------------------------------------------------
// 7. 개발용 자가 진단
// ---------------------------------------------------------------------------

/**
 * 캡처 전에 씬이 스펙을 만족하는지 본다. 개발 중에만 호출하면 된다.
 * 워커에 보내고 나서 `scripts/check_capture.py` 로 재는 것보다 원인이 명확하다.
 */
export function auditScene(scene: THREE.Scene): string[] {
  const problems: string[] = []
  const roles = new Set<string>()
  let basicMaterials = 0
  let meshes = 0
  let castShadow = 0

  scene.traverse((object) => {
    const light = object as THREE.Light
    if (light.isLight) {
      const role = light.userData?.deroRole
      if (role) roles.add(role)
      else problems.push(`조명 "${light.name || light.type}" 에 userData.deroRole 이 없다`)
      return
    }

    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || object.userData?.[OUTLINE_FLAG]) return
    meshes++
    if (mesh.castShadow) castShadow++
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (list.some((m) => (m as THREE.MeshBasicMaterial)?.isMeshBasicMaterial)) basicMaterials++
  })

  for (const required of ['sun', 'sky', 'room'] as const) {
    if (!roles.has(required)) problems.push(`deroRole="${required}" 조명이 없다 — 조명 상태가 안 갈린다`)
  }
  if (basicMaterials > 0) {
    problems.push(
      `MeshBasicMaterial 을 쓴 메시가 ${basicMaterials}개다. 캡처 시 자동으로 Standard 로 바꾸지만, ` +
        '원본을 MeshStandardMaterial 로 만들면 화면과 캡처가 같아진다',
    )
  }
  if (meshes > 0 && castShadow / meshes < 0.5) {
    problems.push(`castShadow 가 켜진 메시가 ${castShadow}/${meshes} 뿐이다 — 접지 그림자가 빠진다`)
  }
  return problems
}
