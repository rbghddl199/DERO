# 조사: "광원을 옮기면 표면에 비친 반사도 따라 움직이게 하려면 무엇이 필요한가"

- 대상 버전: **three 0.185.1 (r185)** — `frontend/node_modules/three/package.json:3`. 2026-07-28 기준 npm `latest`도 0.185.1 (`npm view three dist-tags`).
- 조사 방법: ① `node_modules/three/` 소스 직접 확인 ② three.js 공식 예제 원본(r185 태그) ③ **실측** — 프로젝트 e2e와 동일한 SwiftShader 인자로 Chromium을 띄우고 `WebGPURenderer({ forceWebGL: true })`로 각 기법을 실제 컴파일·렌더시킴.
- 실측 하네스(재현용, 조사 산출물이며 레포에는 넣지 않았다):
  `/tmp/claude-1000/-home-dong99u-DERO/2dfe8694-ea33-438e-b0d2-f1caa87ba18f/scratchpad/webglprobe/`
  (`index.html`, `sweep.html`, `run.mjs`, `run2.mjs`, 스크린샷 `shot-*.png`·`sweep-*.png`)
  실행: `python3 -m http.server 8899` → `node run.mjs <test>`
- 실측 조건: Chromium `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist` (= `frontend/playwright.config.ts:5-10`과 동일), 640×400, 30프레임, 오브젝트 3개짜리 최소 씬.

---

## 요약: 이 프로젝트에 지금 당장 중요한 3가지

1. **SSR은 r185에서 WebGL2 폴백에 컴파일되지 않는다.** GLSL 코드젠 버그. e2e가 SwiftShader에서 도는 이상 채택 불가. (Q1/Q7)
2. **평면 반사(`reflector()`)는 WebGL2에서 잘 돈다.** 프로젝트 모양의 MRT 파이프라인 안에서도 확인했다. 다만 **공식 예제가 쓰는 `emissiveNode` 경로를 그대로 베끼면 MRT emissive 블룸 이중 계상이 확정으로 터진다** — 실측으로 증명했다. (Q2/Q3)
3. **지금 상판 거칠기(oak 0.55)로는 무슨 광원을 써도 "광원이 비쳤다"고 안 읽힌다.** 실측 스윕 결과 광원 모양이 드러나는 한계는 **roughness ≈ 0.15**, 0.28부터는 형체 없는 얼룩이다. 반사 기법을 얹기 전에 재질부터가 병목이다. (Q5)

---

## Q1. 현재 three 버전의 SSR

**결론 한 줄: `SSRNode`(TSL 애드온)는 r185에 존재하고 WebGPU에서는 돌지만, WebGL2 백엔드에서는 프래그먼트 셰이더가 컴파일 실패해 반사가 통째로 사라진다 — 이 프로젝트에서는 채택 불가.**

### 존재 여부
- `frontend/node_modules/three/examples/jsm/tsl/display/SSRNode.js` (1348줄). `import { ssr } from 'three/addons/tsl/display/SSRNode.js'` (같은 파일 34줄).
- 코어가 아니라 **애드온**이다. `three/tsl`에서는 안 나온다.
- 소스상으로는 백엔드 중립이다 — compute 셰이더·storage 텍스처·`isWebGPUBackend` 분기가 **하나도 없다**(grep 결과 0건). 렌더 경로는 전부 fullscreen quad(`SSRNode.js:769-786`).

### WebGL2에서 실제로 도는가 → **아니다** (실측)
`forceWebGL: true` + SwiftShader에서 SSR을 켜면 콘솔에 다음이 찍힌다:

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
FRAGMENT
ERROR: 0:225: 'max' : no matching overloaded function found
ERROR: 0:225: 'assign' : cannot convert from 'const mediump float' to 'highp int'
> 225: nodeVar25 = max( int( trunc( ( max( abs( nodeVar23 ), abs( nodeVar24 ) )
                * clamp( nodeUniform10, 0.0, 1.0 ) ) ) ), 1.0 );
```
이어서 `WebGL: INVALID_OPERATION: useProgram: program not valid`가 매 드로우마다 반복된다.

- 원인 지점: **`SSRNode.js:1060`**
  ```js
  const totalStep = int( this.stochastic === false
      ? trunc( max( abs( xLen ), abs( yLen ) ).mul( this.quality.clamp() ) ).max( int( 1 ) ).toConst()
      : this.quality.clamp().mul( MAX_STEPS ).max( float( 1 ) ) ).toConst();
  ```
  `.max( int( 1 ) )`가 GLSL로 `max(int(...), 1.0)`으로 내려간다. GLSL ES 3.00에는 `max(int, float)` 오버로드가 없다. WGSL에서는 문제없이 나가므로 WebGPU 예제는 정상이다.
- 이 버그는 **기본 경로**(`stochastic: false`)에 있다.
- **조용하다.** three가 `console.error`로 찍을 뿐 throw하지 않는다. 프로그램이 링크 안 되니 SSR 렌더타깃이 클리어 상태로 남고, `scenePassColor.add(ssrPass.rgb)` 합성이 0을 더한다 → 화면은 SSR 없는 베이스라인과 **바이트 단위로 동일**했다(실측 `floorPixelSum` 3068095 = 베이스라인과 같은 값). 즉 픽셀 diff 없이는 아무도 못 잡는다.
- 같은 종류의 GLSL 코드젠 버그가 최근 여러 건 보고돼 있다(예: `texelFetch` LOD를 float로 뱉는 문제 — https://github.com/mrdoob/three.js/issues/33394, PR #33399로 수정). **SSRNode의 이 건이 이슈로 등록돼 있는지는 확인하지 못했다 — 미확인.**

`stochastic: true`로 돌리면 위 줄을 피해가지만(1061줄은 `float(1)`) 이번엔 빌드 단계에서 죽는다:
```
THREE.TSL: TypeError: Cannot read properties of null (reading 'sampleEnvironmentBRDF')
```
- 원인: stochastic 경로는 환경맵 폴백이 필수인데(`SSRNode.js:974`가 `this._importanceEnvironment.sampleEnvironmentBRDF`를 호출) `setEnvMap()`을 안 부르면 null이다.
- 그리고 `setEnvMap()`은 **CPU측 `image.data`가 살아있는 equirect HDR**만 받는다 — `SSRNode.js:316-320`:
  > `SSRNode: 'environmentNode' / 'setEnvMap()' expects an equirectangular HDR texture with CPU-side image data (e.g. RGBELoader). PMREM cubemaps and 'scene.environment' are not supported.`
  이 프로젝트는 `frontend/src/three/render/environment.ts:22`에서 PMREM 굽고 곧바로 `equirect.dispose()`한다. 쓰려면 원본 텍스처를 붙잡아 둬야 한다.

### 비용
- three 자체 측정치(개발자 보고):
  - PR #29597(SSRNode 최초 도입): M2 Pro Mac mini, 5K 해상도에서 **WGSL 42 FPS vs WebGL 60 FPS**. 즉 도입 당시 WebGL 백엔드가 더 빨랐다.
  - PR #31649(roughness blur mip 추가): 5K에서 **52 → 43 FPS**.
- 구조상 비용: SSR RT 1장 fullscreen(1패스) + `stochastic === false && roughnessNode !== null`이면 blur mip **6패스 추가**(`SSRNode.js:412`의 mipmaps 5장 + base, 렌더 루프는 `776-788`). `resolutionScale`로 해상도 낮출 수 있다(기본 1).
- 레이마칭 최대 스텝 `MAX_STEPS = 64` (`SSRNode.js:13`), `quality` 유니폼(기본 0.5)이 스케일한다.

### 디노이저
- 붙는다. `examples/jsm/tsl/display/DenoiseNode.js`, `RecurrentDenoiseNode.js`가 같이 있고, r185 릴리스 노트에 "ImportanceSampledEnvironment — Spatiotemporal Denoiser for SSR. #33843"이 있다 (https://github.com/mrdoob/three.js/releases/tag/r185).
- stochastic 경로는 디노이저가 사실상 필수다(노드 JSDoc 17줄이 "expects a temporal/spatial denoiser downstream"이라고 명시).

### 입력 요구사항 (프로젝트 대비 추가분)
공식 예제 `webgpu_postprocessing_ssr.html` (r185) 원문:
```js
scenePass.setMRT( mrt( {
    output: output,
    normal: packNormalToRGB( normalView ),
    metalrough: vec2( metalness, roughness )   // metalness+roughness를 한 어태치먼트에 팩
} ) );
...
ssrPass = ssr( scenePassColor, scenePassDepth, sceneNormal, {
    metalnessNode: scenePassMetalRough.r,
    roughnessNode: scenePassMetalRough.g
} );
const outputNode = smaa( scenePassColor.add( ssrPass.rgb ) );  // premultiplied → 가산 합성
```
- 프로젝트 현재 MRT는 `output / normal / emissive` 3장(`frontend/src/three/scene/postfx.ts:63`)이므로 **`metalrough` 어태치먼트 1장 추가**가 필요하다. 또 프로젝트는 normal을 `normalView` 생값으로 쓰는데 예제는 `packNormalToRGB`로 팩한다(대역폭 최적화로 `UnsignedByteType`).
- 알려진 함정: PBR이 아닌 재질(`MeshBasicNodeMaterial`, 스프라이트 등)은 metalness/roughness/normal을 못 써서 SSR에 아티팩트가 생긴다 (https://github.com/mrdoob/three.js/issues/32776). 이 프로젝트엔 고스트·기즈모가 `MeshBasicNodeMaterial`이고(`scene.ts:1129`, `jointGizmo.ts:114,131`) 벽·바닥이 `MeshStandardNodeMaterial`이라 그대로는 안 맞는다.

---

## Q2. 평면 반사 (Reflector)

**결론 한 줄: 노드판 `reflector()`는 코어에 있고 WebGL2/SwiftShader에서 프로젝트 모양의 MRT 파이프라인 안에서도 정상 동작한다 — 비용은 "해상도 스케일² 만큼의 씬 1회 추가 렌더", 오브젝트 제외는 레이어로 가능하다.**

### 어느 것을 쓰는가
- **써야 하는 것**: `ReflectorNode` — `frontend/node_modules/three/src/nodes/utils/ReflectorNode.js` (**코어**, 애드온 아님). `src/nodes/TSL.js:47`에서 export되어 `import { reflector } from 'three/tsl'`로 쓴다. 팩토리는 `ReflectorNode.js:628`.
- **쓰면 안 되는 것**: classic `examples/jsm/objects/Reflector.js`. `ShaderMaterial`(6줄) + `WebGLRenderTarget`(10줄, 101줄)을 쓴다. `StandardNodeLibrary`에는 `ShaderMaterial` 매핑이 **없다**(`src/renderers/webgpu/nodes/StandardNodeLibrary.js:64-71`에 Mesh*Material만 등록). → `OutlinePass`와 정확히 같은 이유로 이 파이프라인에 못 섞인다.
  - 참고: r185 릴리스 노트의 "Reflector — Make `getReflectionCamera()` public. #33556"은 이 classic 쪽 이야기다.

### 노드 파이프라인과 섞이는가 → **섞인다** (실측)
| 실측 케이스 | 백엔드 | 셰이더 에러 | 평균 ms/프레임 |
|---|---|---|---|
| 베이스라인(프로젝트 모양 MRT, 이펙트 없음) | webgl | 없음 | 2.64 |
| `reflector()` → `colorNode`, 순수 `renderer.render` | webgl | 없음 | 3.90 |
| `reflector()` → `colorNode`, **MRT RenderPipeline 안** | webgl | 없음 | 5.26 |

스크린샷 `shot-reflectorpipe.png`에 상자와 발광 구의 거울상이 상판 아래로 정상적으로 찍혔다.

### 비용 (소스 기준)
- `ReflectorBaseNode.updateBefore()`가 `renderer.render( scene, virtualCamera )`를 **씬 전체에 대해 1회** 호출한다 (`ReflectorNode.js:567`).
- RT 크기 = `drawingBufferSize × resolutionScale` (`ReflectorNode.js:471-478`). `resolutionScale: 0.3`이면 픽셀 수는 9%.
- 반사 렌더는 **MRT를 끈다** — `renderer.setMRT( null )`(551줄) 후 `setMRT( currentMRT )`로 복원(574줄). 즉 반사 패스는 normal/emissive 어태치먼트 비용을 안 낸다.
- 톤매핑도 안 걸린다 — `Renderer.js:2502` `get currentToneMapping() { return this.isOutputTarget ? this.toneMapping : NoToneMapping; }`. 반사 텍스처는 선형 HDR로 나온다(재질에 되먹이기에 올바른 상태).
- **`bounces` 파라미터 주의**: 기본 `true`면 `updateBeforeType = NodeUpdateType.RENDER`(`ReflectorNode.js:299`)라 **render 호출마다** 다시 굽는다. `bounces: false`로 두면 `FRAME`(프레임당 1회). 반사가 서로를 비추지 않아도 되는 이 프로젝트에선 `false`가 맞다.
- 공짜 최적화 2개가 이미 들어있다:
  - 반사면이 카메라 반대편을 보면 렌더 자체를 건너뛴다 (`isFacingAway`, 462-479줄).
  - 반사 렌더 동안 반사면 자기 재질을 `material.visible = false`로 끈다(545줄) → 자기 자신은 자동 제외.

### 반사 대상에서 특정 오브젝트 빼기 → **가능하다 (레이어)**
- `getVirtualCamera( camera )`가 public 메서드다 (`ReflectorNode.js:508`). 여기서 받은 가상 카메라의 `layers`를 조작하면 된다.
- 근거: 반사 렌더가 통과하는 `Renderer._projectObject`가 `const visible = object.layers.test( camera.layers )`로 컬링한다 (`src/renderers/common/Renderer.js:3084`). 조명도 같은 방식으로 걸러진다(`Renderer.js:973`).
- **미확인**: 이 레이어 제외를 실제로 실행해 보지는 않았다. 코드 경로만 확인했다. (배치 고스트·조인트 기즈모·아웃라인 대상 같은 UI 오브젝트를 반사에서 빼려면 이 경로가 필요하다.)

### 한계
- **평면 한 장에만 걸린다.** 반사면은 `target` Object3D 하나에 묶인 무한 평면이다. 벽 3면에 각각 걸려면 리플렉터 3개 = 씬 3회 추가 렌더다.
- 상판이 곡면이거나 기울어지면 못 쓴다(이 프로젝트 상판은 평면이므로 해당 없음).

---

## Q3. emissive 표면이 반사에 잡히나 / 블룸 이중 계상

**결론 한 줄: 평면 반사는 발광 메쉬를 그대로 비춘다(실측 확인). 이중 계상은 "공식 예제대로 `emissiveNode`에 꽂으면 확정으로 터지고, `colorNode`로 꽂으면 안 터진다" — 둘 다 실측으로 확인했다.**

### 발광 메쉬가 반사에 잡히는가 → 잡힌다
`shot-reflector.png` / `shot-reflectorpipe.png`: `emissiveIntensity 8`짜리 구가 상판에 또렷한 거울상으로 찍혔다. 반사 렌더는 `renderer.render(scene, virtualCamera)` 그대로라 emissive를 포함한 완성된 라이팅 결과가 들어온다.

### 이중 계상 위험 — 이게 진짜 함정이다
- three 공식 예제 `webgpu_reflection.html` (r185) 118줄이 이렇게 쓴다:
  ```js
  floorMaterial.emissiveNode = reflection.mul( 0.25 );
  ```
- 그런데 `src/materials/nodes/NodeMaterial.js:1109-1113`:
  ```js
  if ( ( emissiveNode && emissiveNode.isNode === true ) || ( material.emissive && material.emissive.isColor === true ) ) {
      emissive.assign( vec3( emissiveNode ? emissiveNode : materialEmissive ) );
      outgoingLightNode = outgoingLightNode.add( emissive );
  }
  ```
  `emissiveNode`가 **TSL `emissive` PropertyNode에 그대로 대입된다**.
- 이 프로젝트의 MRT는 `emissive: vec4(emissive, output.a)` — 바로 그 PropertyNode다 (`frontend/src/three/scene/postfx.ts:63`). 그리고 그 어태치먼트가 emissive 블룸(strength 0.75 / radius 0.6 / **threshold 0**)의 입력이다(`postfx.ts:110-113`).
- **실측 증명**: `reflector() → emissiveNode`로 꽂고 emissive 어태치먼트만 뽑아 화면에 출력했더니, 거울상(반사된 발광구 + 반사된 상자 실루엣 + 반사된 바닥)이 **전부 emissive 버퍼에 들어와 있었다** → 스크린샷 `shot-emissiveMRT.png`. threshold가 0이므로 이건 전량 블룸된다. 실제 램프는 이미 블룸되고 있으므로 그 반사상까지 또 블룸 = 이중 계상.
- `colorNode` 경로에서는 emissive 어태치먼트가 깨끗하다(실측, `shot-reflectorpipe.png` 정상).
- **남은 위험(미확인)**: `colorNode`로 넣어도 글레어 블룸(`scenePassColor`, threshold **50**, `postfx.ts:134-138`)은 반사값이 50을 넘으면 잡는다. 이 씬은 물리 광속 스케일이고 램프 셰이드가 `emissiveIntensity = 18`(`props.ts:242-249`)이라 넘길 여지가 있다. **프로젝트 씬 단위로 측정하지 않았다.**

### SSR의 경우
- SSR 셰이더는 히트 지점에서 `this.colorNode.sample( uvS )`를 읽는다(`SSRNode.js:1227`). `colorNode`는 beauty(`output`) 어태치먼트이고 emissive가 포함돼 있으므로 SSR도 발광면을 반사한다. 그리고 SSR 결과는 `scenePassColor.add(ssrPass.rgb)`로 emissive MRT를 건드리지 않고 합성되므로 emissive 블룸 이중 계상은 없다(글레어 블룸은 위와 동일 위험).
- 다만 Q1 결론대로 WebGL2에서 안 도니 현시점에서는 실익 없음.

---

## Q4. 동적 환경 반사 (CubeCamera + 실시간 PMREM)

**결론 한 줄: 경로는 있다(`PMREMGenerator.fromScene`). 하지만 SwiftShader 폴백에서 1회 재굽기가 20~75 ms로 측정됐다 — 실시간은 물론이고 "N프레임마다"도 눈에 띄는 히칭이다.**

### 경로 존재
- `PMREMGenerator.fromScene( scene, sigma, near, far, { size, position, renderTarget } )` — `frontend/node_modules/three/src/renderers/common/extras/PMREMGenerator.js:137`. WebGPURenderer용 공용 구현이고, `await renderer.init()` 이후에만 호출 가능하다(149줄이 아니면 throw).
- `CubeCamera.update( renderer, scene )`도 있다 — `src/cameras/CubeCamera.js:178`, 내부는 `renderer.render()` **6회**(220~247줄). 큐브맵만 얻을 뿐, roughness 대응 IBL로 쓰려면 결국 PMREM을 한 번 더 거쳐야 한다.

### 1회 재굽기의 실제 작업량 (소스 카운트, `size: 256` 기준)
| 단계 | 내용 | 드로우 |
|---|---|---|
| `_sceneToCubeUV` | 씬 전체를 6면 렌더 (`PMREMGenerator.js:517-522`) + 배경 박스 1 | **씬 렌더 6회** |
| `_applyPMREM` | `(_lodMeshes.length - 1)` 단계 × 각 2 fullscreen (`600-612`, `_applyGGXFilter` 내 render 2회) | **fullscreen 20회** |
- `_lodMax = log2(256) = 8`, `LOD_MIN = 4`(35줄), `EXTRA_LOD_SIGMA.length = 6`(39줄) → `totalLods = 8-4+1+6 = 11` → 10단계 × 2 = 20드로우.
- GGX 중요도 샘플링 `GGX_SAMPLES = 512`/픽셀.

### 실측 (SwiftShader/WebGL2, 오브젝트 8개짜리 최소 씬)
| size | 1회 `fromScene` 소요 |
|---|---|
| 256 | **40.7 / 43.9 / 51.8 / 57.4 / 74.4 ms** (5회 측정) |
| 64 | **21.1 / 21.2 / 22.4 / 30.1 / 37.0 ms** |

- 60fps 예산이 16.7 ms인데, **가장 작은 64px PMREM 한 번이 그 예산을 넘는다.** 이건 오브젝트 8개짜리 장난감 씬 기준이고, 실제 씬은 `_sceneToCubeUV`의 6회 렌더가 그대로 비싸진다.
- **미확인**: 실제 GPU(WebGPU 백엔드)에서의 비용은 측정하지 않았다. 훨씬 싸겠지만, 채택 가부를 가르는 건 폴백 쪽이다.
- 결론: 이 프로젝트에서 실시간 IBL 재굽기는 현실적이지 않다. 굳이 한다면 "사용자가 조명 배치를 확정하고 손을 뗀 뒤 1회"처럼 이벤트성으로만 가능하다.

---

## Q5. 광원 자체의 반사 — PBR 하이라이트만으로 되는 조건

**결론 한 줄: 광원의 *모양*이 드러나려면 (a) 면광원이어야 하고 (b) roughness가 대략 **0.15 이하**여야 한다. 0.2에서 모서리가 뭉개지고 0.28부터는 형체 없는 얼룩이다. 점광원·스팟은 어떤 거칠기에서도 동그란 얼룩만 만든다.**

### 실측 스윕
같은 재질(`MeshPhysicalNodeMaterial`, metalness 0)에 roughness만 바꾼 타일 8장을 나란히 놓고, 타일마다 동일한 광원을 1개씩 배치해 각자의 하이라이트가 자기 타일에 떨어지게 했다. WebGL2/SwiftShader.

roughness (좌→우): **0.03 / 0.06 / 0.10 / 0.15 / 0.20 / 0.28 / 0.40 / 0.55**

- **RectAreaLight (LTC)** — `sweep-rect.png`
  - 0.03 ~ 0.15: 직선 모서리와 평평한 윗변/아랫변을 가진 **또렷한 직사각형**. "저건 저 조명이 비친 것"이라고 읽힌다.
  - 0.20: 여전히 사각이지만 모서리가 풀리기 시작.
  - 0.28: 모서리 소실, 가로로 긴 얼룩.
  - 0.40 / 0.55: 형체 없는 번짐.
- **PointLight** — `sweep-point.png`
  - 모든 거칠기에서 **동그란 얼룩**. 거칠기가 낮을수록 작고 날카로워질 뿐, 어떤 값에서도 "모양"이 없다. 점광원은 모양 자체가 없으니 당연한 결과다.
- **SpotLight** — `sweep-spot.png`, PointLight와 같은 성질(스팟의 원뿔은 조도 분포를 바꿀 뿐 스페큘러 로브의 모양을 만들지 않는다).

### 면광원(RectAreaLight LTC)이 여기 관련되는가 → **결정적으로 관련된다**
- 하이라이트가 광원의 **형상**을 갖는 유일한 아날리틱 광원이다. LTC(Linearly Transformed Cosines)가 사각형 광원의 스페큘러 적분을 닫힌 형태로 풀기 때문이다.
- 노드 구현: `src/nodes/lighting/RectAreaLightNode.js`, `StandardNodeLibrary.js:80`에 등록돼 있다.
- 사용 전 **`RectAreaLightNode.setLTC( RectAreaLightTexturesLib.init() )` 1회 호출이 필수**다 — `src/lights/RectAreaLight.js:17`에 문서화돼 있고, 안 부르면 `_ltcLib`가 null이라 죽는다.
- **WebGL2 폴백에서 도는가 → 돈다 (실측).** `sweep-rect.png`가 WebGL2/SwiftShader 렌더 결과다. 셰이더 에러 0건, 3.53 ms/프레임.
  - 소스도 폴백을 의도하고 있다 — `RectAreaLightNode.js:88-99`가 `builder.isAvailable('float32Filterable')`이 false면 `LTC_HALF_1/2`(HalfFloatType)로 자동 전환한다. WebGL 백엔드의 `isAvailable`은 `OES_texture_float_linear` 확장을 본다(`src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js:1380-1382`).
  - ⚠️ **이건 `frontend/src/three/CLAUDE.md:18`의 "RectAreaLight 금지(WebGL2 폴백 미지원)"와 상충한다.** r185 + SwiftShader에서 직접 렌더된다. 그 금지 규칙이 과거 버전 기준이었는지, 다른 실패(예: 그림자)를 본 것인지는 **미확인**이다. 규칙을 바꾸려면 프로젝트 씬에서 한 번 더 확인이 필요하다.
- **RectAreaLight는 그림자를 못 만든다.** `src/lights/RectAreaLight.js:10` — "There is no shadow support." 지금 램프가 `SpotLight` + `castShadow`로 그림자를 지고 있으므로(`scene.ts:782-806`), 통째로 갈아끼우면 그림자를 잃는다. "그림자용 SpotLight + 하이라이트용 RectAreaLight" 2개 조합이 현실적이다.

### 이 프로젝트의 현재 상태
- 상판 oak: **roughness 0.55**, metalness 0 (`frontend/src/three/core/deskConfig.ts:57-62`). 위 스윕 기준 "형체 없는 번짐" 구간이다.
- wood 클래스는 클리어코트가 있지만 `clearcoat 0.22 / clearcoatRoughness 0.55`(`frontend/src/three/render/materials.ts:27`) — 클리어코트 쪽도 똑같이 거칠어서 날카로운 하이라이트를 못 만든다.
- 즉 **지금은 램프를 옮겨도 "부드러운 밝기 그라데이션"만 이동한다.** 이건 이미 물리적으로 정확한 거동이고, 사용자가 "반사가 안 움직인다"고 느끼는 원인은 반사 기법의 부재가 아니라 **표면이 너무 거친 것**이다.

---

## Q6. stylized(약한 toon ramp) 룩과 반사의 상호작용

**결론 한 줄: 충돌하지 않는다 — 단, 반사를 **어느 슬롯에 꽂느냐**에 따라 밴딩이 걸리기도 하고 안 걸리기도 하므로 그게 룩 결정 항목이 된다.**

프로젝트의 posterize 위치 (`frontend/src/three/render/toonPhysical.ts:36-50`):
```js
const bandedDiffuse = mix( rl.directDiffuse, rl.directDiffuse.mul( ratio ), TOON_STRENGTH )
context.outgoingLight.assign(
  bandedDiffuse.add( rl.indirectDiffuse ).add( rl.directSpecular ).add( rl.indirectSpecular ),
)
```
- 밴딩은 **`rl.directDiffuse`에만** 걸린다. `directSpecular`·`indirectSpecular`(IBL 반사)·`indirectDiffuse`는 손대지 않는다. 즉 **PBR 스페큘러/IBL은 이미 밴딩에서 면제돼 있다.**

기법별 상호작용:
- **`reflector()` → `colorNode`**: 반사가 base color가 되어 `directDiffuse` 계산에 들어간다 → **거울상이 2~3밴드로 포스터라이즈된다.** 버그는 아니고 룩 선택이다. "조금 카툰"에는 오히려 어울릴 수도 있고, 거울상이 계단지는 게 싫으면 라이팅 모델 뒤에 더해야 한다.
- **`reflector()` → `emissiveNode`**: 밴딩은 안 걸리지만 **Q3의 블룸 이중 계상이 확정**이다. 쓰지 말 것.
- **`reflector()` → 라이팅 이후 가산**: `ToonPhysicalLightingModel.finish()`의 `outgoingLight`에 더하거나 postfx 합성 단계에서 더하면 밴딩·블룸 둘 다 피한다. 다만 이러면 반사가 조명과 무관하게 항상 같은 밝기로 붙는다.
- **SSR / SSGI**: 포스트 프로세스라 material의 posterize와 애초에 만나지 않는다. `postfx.ts`의 합성식에 더해지므로 밴딩된 diffuse 위에 PBR-샤프한 반사가 올라간다. 스페큘러/IBL이 이미 그렇게 붙어 있으므로 새로 생기는 불일치는 아니다.
- **컨투어 패스와의 관계**: 컨투어는 depth+normal 엣지만 본다(`contourNode.ts`, `postfx.ts:95-97`에서 곱셈 합성) → 반사가 색을 바꿔도 선 검출은 영향 없다. **안전.**
- **GTAO와의 관계**: AO는 `scenePassColor`에 곱셈으로 들어간다(`postfx.ts:95`). `colorNode` 경로 반사는 AO에 눌리고, postfx 가산 경로 반사는 안 눌린다. 어느 쪽이 맞는지는 룩 판단.

**미확인**: `ToonPhysicalNodeMaterial` + `reflector()`를 실제 프로젝트 재질에 물려 보지는 않았다. 실측 프로브는 순정 `MeshPhysicalNodeMaterial`로 했다.

---

## Q7. WebGL2 / SwiftShader 폴백에서 각 기법이 도는가 — **채택 가부의 결정 항목**

전부 직접 돌려서 확인했다. 조건: SwiftShader(프로젝트 e2e와 동일 인자), `forceWebGL: true`, 640×400, 30프레임, 오브젝트 3개 최소 씬.

| 기법 | 백엔드 확인 | 셰이더 에러 | ms/프레임 | 판정 |
|---|---|---|---|---|
| 베이스라인 (프로젝트 모양 MRT, 이펙트 없음) | webgl | 없음 | 2.64 | 기준선 |
| `reflector()` → colorNode, 순수 렌더 | webgl | 없음 | 3.90 | ✅ 정상 |
| `reflector()` → colorNode, **MRT 파이프라인 안** | webgl | 없음 | 5.26 | ✅ 정상 |
| `reflector()` → emissiveNode, MRT 파이프라인 안 | webgl | 없음 | 5.76 | ⚠️ 돌지만 emissive 오염 |
| RectAreaLight + LTC | webgl | 없음 | 3.53 | ✅ 정상 |
| `ssr()` (기본, stochastic:false) | webgl | **FRAGMENT 컴파일 실패** | 5.19 | ❌ 반사가 0으로 나옴 |
| `ssr()` (stochastic:true) | webgl | 빌드 시 TypeError | 5.07 | ❌ setEnvMap 필수 |
| `ssgi()` (올바른 합성, useTemporalFiltering=false) | webgl | 없음 | 6.69 | ✅ 정상(노이즈 있음) |

주의: 절대 ms는 장난감 씬 값이라 프로젝트 예산에 그대로 못 쓴다. **비율만** 참고할 것(reflector ≈ 2.0×, ssgi ≈ 2.5× 베이스라인).

프로젝트 e2e가 이 결과에 걸리는 지점:
- `frontend/e2e/smoke.spec.ts:7`이 `window.__sim.backend === 'webgl'`을 하드 어서트한다 → **새 패스는 반드시 WebGL2에서 돌아야 한다.**
- 프로젝트 e2e는 60 s 타임아웃/워커 1개이고 이미 tail에서 타임아웃 나는 스펙이 있다(`frontend/e2e/CLAUDE.md`, `src/three/CLAUDE.md`의 "알려진 e2e 갭"). 씬을 1회 더 렌더하는 리플렉터는 그 마진을 직접 갉아먹는다.
- `frontend/e2e/lighting.spec.ts`의 픽셀 예산(벽 R/B 중립 0.9~1.12, 데스크 `sum > 400`, 룸오프 비율, 컨투어 토글 차이 등)은 반사가 붙으면 흔들린다. **temporal 성격의 기법(TRAA 등)은 고정 `waitForTimeout(200~400)` 대기와 근본적으로 안 맞는다.**

---

## 기법 비교표

| 기법 | 무엇이 움직이나 (광원 이동 시) | 비용 | WebGL2 폴백 | 노드 파이프라인 호환 | 적합도 |
|---|---|---|---|---|---|
| **재질 광택 + 면광원 (RectAreaLight LTC)** | 광원의 **형상 하이라이트**가 상판 위를 이동 | 추가 패스 **0** (아날리틱 라이트 1개 비용) | ✅ 실측 정상 | ✅ 코어 라이트, MRT 무관 | **높음** — 가장 싸고 확실 |
| **평면 반사 `reflector()`** | 씬 전체(모니터·컵·램프)의 **거울상**이 이동 | 씬 1회 추가 렌더 × `resolutionScale²`; 실측 ≈2.0× | ✅ 실측 정상 (MRT 파이프라인 안에서도) | ✅ 코어 노드, `colorNode`로 물릴 것 | **중~높음** — 평면 1장 한정 |
| **SSGI `ssgi()`** | 표면에서 튄 **간접광(바운스)**이 이동 | fullscreen 다패스 + 디노이즈; 실측 ≈2.5× | ✅ 실측 정상(노이즈 有) | ✅ TSL 노드, `diffuseColor` MRT 추가 필요 | **중** — 거울상은 아님 |
| **SSR `ssr()`** | 화면 안 오브젝트의 **스크린스페이스 반사**가 이동 | SSR 1패스 + blur mip 6패스, 5K에서 43~52 FPS(three 측정) | ❌ **GLSL 컴파일 실패** (`SSRNode.js:1060`) | ⚠️ TSL이지만 `metalrough` MRT 추가 필요 | **낮음** — 업스트림 수정 전까지 불가 |
| **동적 PMREM (`fromScene` 재굽기)** | 환경 반사(IBL) 전체가 이동 | 씬 6면 렌더 + fullscreen 20; 실측 **21~74 ms/회** | ✅ 돌긴 함 | ✅ `scene.environment` 교체 | **낮음** — 실시간 불가, 이벤트성만 |
| **CubeCamera** | (PMREM 없이는) 거울 큐브맵만 | `renderer.render` 6회 | ✅ | ✅ | **낮음** — PMREM 없으면 반쪽 |
| classic `Reflector`/`SSRPass` (postprocessing) | — | — | — | ❌ **`ShaderMaterial` 미지원** (OutlinePass와 동일) | **불가** |

---

## 3안: 가장 싼 것부터 가장 비싼 것까지

### 안 1 — "표면을 광택 있게 만든다" (추가 패스 0)
**무엇을 하나**
- 상판 재질의 `roughness`를 0.55 → 0.12~0.18로, 또는 `clearcoatRoughness`를 0.55 → 0.06~0.10으로 (`deskConfig.ts:57-62`, `materials.ts:25-30`).
- 램프를 `RectAreaLight`로 바꾸거나(형상 하이라이트) 추가한다. 그림자는 기존 `SpotLight`에 남겨두고 하이라이트용으로 RectAreaLight를 겸치는 조합.
- 선행: `RectAreaLightNode.setLTC( RectAreaLightTexturesLib.init() )` 1회 + `frontend/src/three/CLAUDE.md:18`의 금지 규칙 재검토.

**사용자가 실제로 보는 것**
램프를 끌면 상판 위의 밝은 띠가 같이 미끄러진다. RectAreaLight면 그 띠가 **램프 갓의 사각 형태**를 갖는다 — "조명이 책상에 비쳤다"고 바로 읽힌다. 모니터나 컵의 상은 비치지 않는다.

**비용 / 위험**
- 렌더 비용 증가 없음. RectAreaLight 1개는 실측 3.53 ms(베이스라인 2.64) 수준.
- `lighting.spec.ts`의 밝기 어서트가 흔들린다(데스크 sum, 벽 스필). 임계값 재조정 필요.
- 룩이 "조금 카툰"에서 "반들반들"로 기울 수 있다 — roughness를 얼마나 낮출지는 QA 판정 대상.
- RectAreaLight는 그림자를 못 만든다는 점을 설계에 반영해야 한다.

---

### 안 2 — "상판 한 장에 평면 반사" (씬 1회 추가 렌더)
**무엇을 하나**
```js
const refl = reflector({ resolutionScale: 0.3, bounces: false })
refl.target.rotateX(-Math.PI / 2)   // 상판 평면에 정렬, 상판 그룹에 add
deskTopMaterial.colorNode = <기존 우드 그레인>.add(refl.rgb.mul(k))   // emissiveNode 아님!
```
- 반사에서 뺄 오브젝트(배치 고스트, 조인트 기즈모, 아웃라인 대상)는 레이어를 파고 `refl.reflector.getVirtualCamera(camera).layers.disable(n)`.
- 안 1을 같이 해야 의미가 산다(거친 표면에 거울상을 얹으면 어차피 안 보인다).

**사용자가 실제로 보는 것**
상판에 모니터·컵·램프의 **실제 거울상**이 뜬다. 램프를 옮기면 그 상이 같이 움직이고, 모니터를 옮기면 모니터 상도 따라 움직인다. 이게 "반사"라고 말했을 때 사람들이 기대하는 그림이고, 이 파이프라인에서 그걸 실제로 얻는 가장 싼 방법이다.

**비용 / 위험**
- 씬 전체를 프레임당 1회 더 렌더. `resolutionScale: 0.3`이면 픽셀은 9%지만 **드로우콜·지오메트리 비용은 100%** 그대로 든다. e2e의 60 s 마진을 직접 갉아먹는다.
- `emissiveNode`에 꽂으면 블룸 이중 계상(§Q3, 실측 증명됨).
- 반사상이 toon 밴딩을 탄다(`colorNode` 경로). 룩 판단 필요.
- 평면 1장 한정 — 벽 3면까지 하려면 비용 4배.
- `bounces: false`를 반드시 줄 것(기본 `true`는 render 호출마다 재굽기).

---

### 안 3 — "빛이 튀게 만든다: SSGI" (fullscreen 다패스 + 디노이즈)
**무엇을 하나**
- MRT에 `diffuseColor` 어태치먼트를 추가하고 normal을 `packNormalToRGB`로 팩(공식 예제 `webgpu_postprocessing_ssgi.html` 방식).
- `ssgi(colorNode, depthNode, normalNode, camera)` → `getAONode()` / `getGINode()`를 받아
  `scenePassColor.rgb.mul(ao.r) + scenePassDiffuse.rgb.mul(gi.rgb)`로 합성.
- `useTemporalFiltering = false` + 기존 `DenoiseNode`로 공간 디노이즈 (노드 JSDoc `SSGINode.js:187-190`이 명시한 경로이고, 프로젝트는 이미 GTAO에 `DenoiseNode`를 쓰고 있다 — `postfx.ts:83-88`).
- ⚠️ `useTemporalFiltering = true`는 `TRAANode` + velocity MRT를 요구하고, 이는 e2e의 고정 대기 픽셀 어서트와 정면 충돌한다.

**사용자가 실제로 보는 것**
거울상은 아니다. 대신 **바닥·벽에서 튄 빛이 물체 옆면을 물들인다.** 실측 스크린샷에서 상자의 어두운 면이 바닥의 나무색 반사광으로 따뜻하게 밝아졌다. 램프를 옮기면 그 바운스가 같이 이동한다. "빛이 공간에 돈다"는 인상은 가장 강하지만, "저기 램프가 비쳤네"라는 인식은 안 준다.

**비용 / 위험**
- 실측 6.69 ms vs 베이스라인 2.64 ms (≈2.5×), 장난감 씬 기준.
- 디노이즈 없이는 눈에 띄는 스페클 노이즈가 남는다(스크린샷에서 확인됨).
- MRT 어태치먼트 1장 추가 = 대역폭 증가.
- SSR과 달리 **WebGL2에서 실제로 돈다**는 점은 확인했다.

---

### 안 밖: SSR
지금은 못 쓴다. `SSRNode.js:1060`의 GLSL 코드젠 버그가 고쳐지기 전까지 WebGL2 폴백에서 반사가 통째로 0이다. 그것도 조용히. 업스트림 수정(또는 로컬 패치)이 선행되어야 하고, 그 뒤에도 `metalrough` MRT 추가 + 비-PBR 재질(고스트·기즈모) 처리 + 스테이지 비용이 남는다.

---

## 미확인 목록 (추측하지 않고 남겨둔 것)

1. `SSRNode.js:1060` GLSL 버그가 three 이슈 트래커에 등록돼 있는지, 수정 PR이 있는지 — 검색으로 찾지 못했다.
2. WebGPU 백엔드(실제 GPU)에서의 각 기법 실측 — 이 환경에 WebGPU가 없어 측정하지 못했다. WebGL2 폴백만 측정했다(그리고 그쪽이 채택 게이트다).
3. 리플렉터 가상 카메라의 **레이어 제외를 실제로 실행**해 보지는 않았다. `Renderer.js:3084`의 컬링 코드 경로만 확인했다.
4. `colorNode` 경로 반사가 **글레어 블룸(threshold 50)**을 넘기는지 — 프로젝트의 물리 광속 스케일에서 측정하지 않았다.
5. `ToonPhysicalNodeMaterial`(프로젝트 재질)에 `reflector()`를 물렸을 때의 실제 밴딩 결과 — 순정 `MeshPhysicalNodeMaterial`로만 검증했다.
6. `frontend/src/three/CLAUDE.md:18`의 "RectAreaLight WebGL2 폴백 미지원" 규칙이 **어떤 관찰에 근거했는지** — r185에서는 최소 렌더가 되는 것을 확인했으므로, 규칙이 낡았는지 다른 실패(그림자 등)를 가리키는지는 프로젝트 씬에서 재확인이 필요하다.
7. 프로젝트 실제 씬에서의 프레임 예산 — 모든 ms 측정치는 오브젝트 3~8개짜리 장난감 씬 값이다. 비율만 유효하다.
