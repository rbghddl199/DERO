# three.js 광원 프리미티브 능력 — 사실 조사

**조사일** 2026-07-28 · **대상 프로젝트** `/home/dong99u/DERO` (frontend, WebGPURenderer + WebGL2 폴백)

## 확인된 three 버전

- `frontend/package.json:28` → `"three": "^0.185.1"`
- 실제 설치본 `frontend/node_modules/three/package.json` → `"version": "0.185.1"` = **r185**

아래 모든 소스 경로는 `frontend/node_modules/three/` 기준이다.

---

## 조사 방법 및 실측 하네스

문서·소스 확인에 더해, **프로젝트와 동일한 폴백 경로에서 직접 렌더링해 픽셀을 읽는 실측**을 했다.
그 결과가 이 문서의 "실측" 항목이다.

- 하네스: `/tmp/claude-1000/-home-dong99u-DERO/2dfe8694-ea33-438e-b0d2-f1caa87ba18f/scratchpad/probe/`
  (`index.html`, `run.mjs`, `run2.mjs`) — 프로젝트 코드는 건드리지 않았다.
- 렌더러: `new THREE.WebGPURenderer({ forceWebGL: true })` → 매 케이스 `backend: "webgl"` 확인됨.
- 브라우저: Playwright chromium + `--enable-unsafe-swiftshader --use-angle=swiftshader`
  (프로젝트 `frontend/playwright.config.ts`와 동일한 SwiftShader 인자).
- 재질: `MeshPhysicalNodeMaterial` (프로젝트와 동일). 톤매핑은 판독을 위해 `NoToneMapping`.
- 측정: 256×256 `RenderTarget`에 렌더 후 `readRenderTargetPixelsAsync`로 RGBA를 읽어 휘도 평균/영역 평균/체크섬 산출.
- 케이스마다 **새 페이지**를 열어 `RectAreaLightNode.setLTC` 같은 static 상태 오염을 제거했다.

**미확인(공통)**: 이 환경에는 실제 WebGPU 디바이스가 없다. 따라서 "WebGPU 백엔드에서의 동작"은
전부 소스 근거이며 실측이 아니다. WebGPU 전용 수치(바인딩 한도 등)도 W3C 스펙 문서 근거일 뿐 실측이 아니다.

---

## Q1. RectAreaLight

### 결론 한 줄
**r185에서 RectAreaLight는 WebGPURenderer의 WebGL2 백엔드에서 정상 동작한다(실측 확인).
진짜 제약은 "그림자 불가(켜면 크래시)", "setLTC 부트스트랩 필수", "PBR/볼륨 재질 한정" 세 가지다.**

### (a) WebGPU(TSL 노드 경로) 지원 — 예, `RectAreaLightNode` 존재

- `src/nodes/lighting/RectAreaLightNode.js` — `class RectAreaLightNode extends AnalyticLightNode`.
  `halfWidth`/`halfHeight` 유니폼을 `renderGroup`에 두고 매 렌더 갱신, `setupDirectRectArea(builder)`에서
  LTC 텍스처 2장을 물려 넘긴다.
- 노드 라이브러리 등록:
  - `src/renderers/webgpu/nodes/StandardNodeLibrary.js:80` → `this.addLight( RectAreaLightNode, RectAreaLight )`
  - `src/renderers/webgpu/nodes/BasicNodeLibrary.js:47` → 동일
  즉 WebGPURenderer가 쓰는 두 노드 라이브러리 모두에 등록되어 있다.

### (b) WebGL2 백엔드(`forceWebGL`) — **예, 동작한다 (실측)**

소스 근거:
- `RectAreaLightNode.js:93` — `if ( builder.isAvailable( 'float32Filterable' ) )` 로 분기해
  float32 필터링이 되면 `LTC_FLOAT_*`, 안 되면 `LTC_HALF_*` 텍스처를 쓴다.
- `src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js:1368~1405` — WebGL 폴백 빌더가
  `float32Filterable`을 `OES_texture_float_linear` 확장 유무로 판정한다.
  (LTC half 텍스처는 `HalfFloatType` + `LinearFilter` — `examples/jsm/lights/RectAreaLightTexturesLib.js:73-74`.
  WebGL2에서 half-float 선형 필터링은 코어라 확장 없이 동작한다.)
- 대응 WGSL 쪽: `src/renderers/webgpu/nodes/WGSLNodeBuilder.js:2452` — `renderer.hasFeature('float32-filterable')`.
- 상류 PR #28580 "WebGPURenderer: RectAreaLight support" (2024-06 머지, r166)가
  **`GLSLNodeBuilder.js`를 같이 수정**했다 — 즉 WebGL 폴백 경로를 처음부터 함께 지원 대상으로 만들었다.
  <https://github.com/mrdoob/three.js/pull/28580>

실측 (SwiftShader, `forceWebGL: true`, 광원은 RectAreaLight **하나뿐**, 앰비언트 없음):

| 케이스 | 화면 평균 휘도 | 중앙 패치 | 바닥 좌측 패치 |
|---|---|---|---|
| R2 RectAreaLight + `setLTC` | **55.79** | **220.45** | **86.77** |
| R3 대조군: 광원 완전 제거 | 0 | 0 | 0 |

대조군이 완전 검정인데 R2가 밝다 → RectAreaLight가 실제로 조명에 기여하고 있다. 콘솔 에러 0건.

### (c) 그림자 — **캐스트하지 않는다. 켜면 크래시한다.**

- `src/lights/RectAreaLight.js:10` 문서 주석: "There is no shadow support."
- `RectAreaLight`는 `Light`를 상속하는데 `Light`/`RectAreaLight` 어디에도 `this.shadow` 대입이 없다
  (`grep -n "this.shadow" src/lights/Light.js src/lights/RectAreaLight.js` → 0 hit).
- 그런데 `src/nodes/lighting/AnalyticLightNode.js:259`는 `if ( this.light.castShadow )` 만 보고
  `setupShadow()`로 들어가고, `:214`에서 `this.light.shadow.shadowNode`를 읽는다 → `undefined` 참조.
- 실측 R4 (`rect.castShadow = true`):
  `error: THREE.TSL: TypeError: Cannot read properties of undefined (reading 'shadowNode')`
  바닥 패치 휘도가 86.77 → **0**으로 떨어졌다(수신 재질 컴파일 실패).
  → 조용한 no-op이 아니라 **해당 재질이 렌더되지 않는 하드 실패**다.

### (d) 초기화 — WebGPU 경로에서도 **필수**. 단 `RectAreaLightUniformsLib`가 아니다.

- `src/lights/RectAreaLight.js:12-17` (공식 주석):
  ```
  RectAreaLightUniformsLib.init();                                   // only relevant for WebGLRenderer
  THREE.RectAreaLightNode.setLTC( RectAreaLightTexturesLib.init() ); // only relevant for WebGPURenderer
  ```
- 즉 WebGPURenderer(두 백엔드 모두)에 필요한 것은 `RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`.
  `RectAreaLightUniformsLib.init()`는 내부에서 `RectAreaLightTexturesLib.init()`을 부르지만
  (`examples/jsm/lights/RectAreaLightUniformsLib.js:24`) **`setLTC`는 부르지 않는다** → 단독으로는 불충분.
- `setLTC`가 없으면 `RectAreaLightNode.js:93` 근처의 `_ltcLib`이 `null`이다.
- 실측 R1 (setLTC 생략, 새 페이지에서 최초 실행):
  `error: THREE.TSL: TypeError: Cannot read properties of null (reading 'LTC_FLOAT_1')`,
  화면 전체 휘도 **0** (완전 검정).
- 부수 비용: LTC BRDF 데이터는 애드온에 하드코딩된 64×64 RGBA 텍스처 4장(float 2장 + half 2장)이다.
  `examples/jsm/lights/RectAreaLightTexturesLib.js` 주석 기준 "roughly 80kb",
  실제 소스 파일은 **314,764 bytes / 127줄**(대부분이 하드코딩 배열 리터럴).

### (e) 동작하는 재질 — PBR(Physical) 계열과 볼륨 재질뿐

`directRectArea`를 구현한 라이팅 모델만 반응한다.

- `src/nodes/core/LightingModel.js:55` — 베이스 `directRectArea(){}` 는 빈 함수(무시).
- `src/nodes/functions/PhysicalLightingModel.js:637` — 구현 있음.
- `src/nodes/functions/VolumetricLightingModel.js:193` — 구현 있음.

따라서 반응하는 재질:
`MeshStandardNodeMaterial` (`src/materials/nodes/MeshStandardNodeMaterial.js:127`),
`MeshPhysicalNodeMaterial` (`:366`) ← **프로젝트가 쓰는 재질**,
`MeshSSSNodeMaterial` (`SSSLightingModel extends PhysicalLightingModel`, `src/nodes/functions/SSSLightingModel.js:12`),
`VolumeNodeMaterial` (`src/materials/nodes/VolumeNodeMaterial.js:75`).

무시하는 재질(에러 없이 조용히 안 비침): `MeshPhongNodeMaterial`, `MeshLambertNodeMaterial`,
`MeshToonNodeMaterial`, `MeshBasicNodeMaterial`.

### 프로젝트 진술 판정

프로젝트 문구:
- `docs/context/3d-scene.md:49` — "**RectAreaLight 금지**(WebGL2 폴백 미지원) — 확산형은 넓은 cone SpotLight/PointLight로."
- `frontend/src/three/CLAUDE.md:18` — "RectAreaLight 금지(WebGL2 폴백 미지원)."
- `docs/adr/0003-emission-orthogonal-to-product-type.md:39,140` — "`RectAreaLight` 금지도 유지."

판정: **괄호 안의 사유 "(WebGL2 폴백 미지원)"은 r185 기준 거짓이다.**
WebGPURenderer의 WebGL2 백엔드에서 실측으로 조명이 들어간다(R2 vs R3).
상류에서 이 경로는 2024-06(r166, PR #28580)부터 지원 대상이었다.

단, **"금지"라는 결론 자체가 틀렸다고는 말할 수 없다.** 유지할 근거가 남아 있다:
(1) 그림자를 못 만들고 `castShadow=true`는 크래시,
(2) `setLTC` 부트스트랩을 빼먹으면 화면 전체 검정이라는 발등 찍는 실패 모드,
(3) LTC 텍스처 번들 비용,
(4) PBR/볼륨 재질에서만 동작.
→ 권장: 금지를 유지하든 해제하든, **사유를 사실에 맞게 고쳐 써야 한다.**

**미확인**: 이 프로젝트 문서의 "금지" 문구가 언제/어느 three 버전 기준으로 작성됐는지는 확인하지 않았다
(오래된 판단이 남은 것인지, 다른 이유를 축약한 것인지 구분 못 함).

---

## Q2. PointLight 그림자 (cube shadow)

### 결론 한 줄
**지원된다. WebGL2 백엔드에서 실측 확인했고, 비용은 광원 1개당 프레임마다 큐브 6면 = 깊이 패스 6회다.**

### 근거

- `src/nodes/lighting/PointLightNode.js` — `setupShadowNode()` → `pointShadow( this.light )`.
- `src/nodes/lighting/PointShadowNode.js` — 전용 구현.
  - **6면 렌더 루프**: `:267` `for ( let face = 0; face < 6; face ++ )`,
    `:270` `renderer.setRenderTarget( shadowMap, face )`,
    `:302` 디버그 이름 `Point Light Shadow [ ... ] - Face N`.
  - 큐브 방향/업 벡터 테이블이 **좌표계별로 따로** 있다:
    `_cubeDirectionsWebGPU`/`_cubeUpsWebGPU` (`:25`,`:30`)와 `_cubeDirectionsWebGL`/`_cubeUpsWebGL` (`:36`,`:41`),
    `:251`에서 `isWebGPU`로 선택. → WebGPU 백엔드를 명시적으로 다루고 있다.
  - 깊이 저장은 `CubeDepthTexture`.
- 필터: `PointShadowNode.js:177-179`
  `getShadowFilterFn(type) { return type === BasicShadowMap ? BasicPointShadowFilter : PointShadowFilter; }`
  → 렌더러가 `PCFSoftShadowMap`이어도 포인트 라이트는 `PointShadowFilter`를 쓴다(5탭 Vogel 디스크 + IGN 회전,
  `:66~93`). 이 필터는 `shadow.radius`를 읽는다(`:68-71`).

실측 (SwiftShader, `forceWebGL: true`, 박스가 바닥 위에 떠 있고 포인트 라이트가 바로 위):

| 케이스 | 박스 뒤 바닥 패치 | 먼 바닥 패치 |
|---|---|---|
| P1 `castShadow = false` | **255.00** | 84.75 |
| P2 `castShadow = true` | **95.62** | 84.75 |
| P3 `castShadow = true`, `shadow.radius = 10` | **100.69** | 84.75 |

그림자가 실제로 찍히고, `radius`도 (포인트에 한해) 효과가 있다.

**미확인**: 실제 WebGPU 디바이스에서의 동작. 소스에 WebGPU 좌표계 분기가 명시되어 있으나 실측은 못 했다.

---

## Q3. SpotLight `map` (쿠키/고보 투영), IES

### 결론 한 줄
**`SpotLight.map` 지원된다. WebGL2 백엔드 실측 확인. `IESSpotLight`/`IESLoader`/`ProjectorLight`도 r185에 살아 있고 전부 노드 렌더러(WebGPURenderer) 전용이다.**

### `SpotLight.map`

- `src/nodes/lighting/SpotLightNode.js` `setupDirect()`:
  ```js
  if ( light.colorNode ) {            // TSL 함수로 절차적 고보
      lightCoord = this.getLightCoord( builder );
      projected = light.colorNode( lightCoord );
  } else if ( light.map ) {           // 텍스처 고보
      lightCoord = this.getLightCoord( builder );
      projected = texture( light.map, lightCoord.xy ).onRenderUpdate( () => light.map );
  }
  if ( projected ) {
      const inSpotLightMap = lightCoord.mul( 2. ).sub( 1. ).abs().lessThan( 1. ).all();
      lightColor = inSpotLightMap.select( lightColor.mul( projected ), lightColor );
  }
  ```
  순수 TSL이라 백엔드 종속이 없다 → WGSL/GLSL 양쪽으로 컴파일된다.
  투영 UV는 `lightProjectionUV(light, positionWorld)` (`src/nodes/accessors/Lights.js`).
- 보너스: **`light.colorNode`** — 텍스처 대신 TSL 함수로 고보를 만들 수 있는 공식 경로.

실측 (SwiftShader, `forceWebGL: true`, 위에서 내려다본 스팟 원, 8×8 체커 `CanvasTexture`):

| 케이스 | 화면 평균 | 중앙 8×8 | 옆 8×8 |
|---|---|---|---|
| S1 `map` 없음 | 200.68 | 255.00 | 255.00 |
| S2 `map` 있음 | **108.89** | **188.19** | **162.94** |

`map` 없으면 평평(255/255), 있으면 위치별로 값이 갈린다 → 체커가 투영되고 있다.

### IES

- `src/lights/webgpu/IESSpotLight.js` — `class IESSpotLight extends SpotLight`, `iesMap` 프로퍼티.
  클래스 문서: "**Can only be used with `WebGPURenderer`**"
  (= 노드 렌더러 전용이라는 뜻. 클래식 `WebGLRenderer` 불가. WebGPURenderer의 WebGL2 백엔드는 노드 경로이므로 포함된다 — 다만 미실측.)
- `src/nodes/lighting/IESSpotLightNode.js` — `getSpotAttenuation()`을 오버라이드해
  `angleCosine.acos().mul(1/π)`를 IES 룩업 텍스처 U좌표로 써서 감쇠를 읽는다.
- 등록: `StandardNodeLibrary.js:85`, `BasicNodeLibrary.js:52`.
- `examples/jsm/loaders/IESLoader.js` **존재**. `.ies` → `DataTexture`, `IESSpotLight.iesMap`에 대입하는 용법이 문서화돼 있다.
- 예제 `webgpu_lights_ies_spotlight` — r185 `examples/files.json`에 존재.
- 관련: `src/lights/webgpu/ProjectorLight.js` + `src/nodes/lighting/ProjectorLightNode.js`
  (SpotLight 파생 텍스처 프로젝터, 예제 `webgpu_lights_projector`). 역시 "Can only be used with WebGPURenderer".

**미확인**: IES / ProjectorLight는 실측하지 않았다(소스·문서 근거만).

---

## Q4. 다광원 처리

### 결론 한 줄
**`TiledLightsNode`는 r185에서 삭제됐다. 대체는 `ClusteredLightsNode`(Forward+ 클러스터드)이며 컴퓨트 패스를 쓰고 공식 예제는 WebGPU 전용으로 가드돼 있다. 기본 `LightsNode`에는 개수 하드코딩 상한이 없고, WebGL2에서 광원 256개까지 기능적 실패 없이 돌았다(성능은 선형 악화, 셰이더 컴파일은 초선형 악화).**

### `TiledLightsNode` → 삭제됨

- 로컬 패키지 전수 grep: `TiledLightsNode` 문자열은 `examples/jsm/tsl/lighting/ClusteredLightsNode.js`
  (주석에서 2D 타일드와 비교하는 문장)에만 있고 **클래스는 없다**.
- 상류 근거: PR #33751 "Addons: Removed `TiledLighting`" — `examples/jsm/lighting/TiledLighting.js`,
  `examples/jsm/tsl/lighting/TiledLightsNode.js`, `webgpu_lights_tiled.html` 삭제.
  <https://github.com/mrdoob/three.js/pull/33751>
- r185 릴리스 노트 / 마이그레이션 가이드:
  "`TiledLighting` has been removed, see #33751. Please use `ClusteredLighting` instead."
  <https://github.com/mrdoob/three.js/wiki/Migration-Guide>
- 참고: threejs.org 문서 사이트에는 아직 `TiledLightsNode.html` 페이지가 남아 있다(스테일 문서). **소스가 정본.**

### `ClusteredLightsNode` (대체품)

- `examples/jsm/tsl/lighting/ClusteredLightsNode.js` (`class ClusteredLightsNode extends LightsNode`)
  + 래퍼 `examples/jsm/lighting/ClusteredLighting.js`.
- 생성자: `(maxLights = 1024, tileSize = 32, zSlices = 24, maxLightsPerCluster = 64)`.
- 사용법: `renderer.lighting = new ClusteredLighting()`.
- **범위 제한**: 포인트 라이트 중 그림자를 안 쓰는 것만 클러스터에 들어간다.
  `ClusteredLightsNode.js:218` — `if ( light.isPointLight === true && light.castShadow !== true )`.
  나머지(디렉셔널·스팟·그림자 포인트)는 `materialLights`로 빠져 기존 언롤 경로를 탄다(`:224`, `:233`).
  r185 체인지로그: "ClusteredLightsNode — keep castShadow point lights on the material-lights path (#33792)".
- **렌더러 경로**: 컴퓨트 패스 필요. `:203` `renderer.compute( this._compute )`,
  `:565` `.compute( clusterCount )`, 광원 인덱스는 `attributeArray`(스토리지 버퍼)에 저장.
  공식 예제 `webgpu_lights_clustered`는 `if ( WebGPU.isAvailable() === false ) throw new Error('No WebGPU support')`로
  하드 가드하며 `forceWebGL` 경로가 없다.
- **미확인**: WebGL2 백엔드에서 `ClusteredLightsNode`가 도는지. 판단 재료는 양쪽으로 있다 —
  `WebGLBackend`는 `compute()`를 트랜스폼 피드백으로 구현해 뒀지만(`src/renderers/webgl-fallback/WebGLBackend.js:887`),
  `GLSLNodeBuilder`는 `storageBuffer: false`를 선언한다. 실측하지 않았다.

### `DynamicLightsNode` (또 다른 대안 — 재컴파일 회피용)

- `examples/jsm/tsl/lighting/DynamicLightsNode.js` + `examples/jsm/lighting/DynamicLighting.js`, 예제 `webgpu_lights_dynamic`.
- 목적(클래스 주석): "batches supported analytic lights into uniform arrays so **light count changes do not recompile materials**".
- 기본 상한: `maxDirectionalLights=8`, `maxPointLights=16`, `maxSpotLights=16`, `maxHemisphereLights=4`
  (`DynamicLighting.js:33-38`). 생성자 옵션으로 조정 가능.
- 배치 제외 조건 (`DynamicLightsNode.js:36-42` `canBatchLight`):
  `light.isNode === true`, **`light.castShadow === true`**, `map`/`colorNode`를 가진 SpotLight,
  지원 타입이 아닌 광원. → 제외된 광원은 기존 언롤 경로로 간다.

### 기본 `LightsNode`의 상한과 재컴파일

- 개수 하드코딩 상한 **없음**. 광원 하나당 코드 블록을 하나씩 언롤한다.
- 광원 집합이 바뀌면 해시가 바뀌어 **재컴파일**된다. 해시에는 `castShadow` 상태도 들어간다:
  `src/nodes/lighting/LightsNode.js:156` — `_hashData.push( light.castShadow ? 1 : 0 )`.
  → 광원 추가/삭제뿐 아니라 **`castShadow` 토글만으로도 셰이더가 다시 빌드된다.**

### 실측: 광원 개수 vs 성능 (WebGL2/SwiftShader, 256×256, 그림자 없는 PointLight, 전면 바닥 1장)

| 광원 수 | 첫 프레임(컴파일 포함) | 정상 상태 ms/frame |
|---|---|---|
| 1 | 81 ms | 3.1 |
| 8 | 169 ms | 6.5 |
| 32 | 584 ms | 23.0 |
| 64 | 1,324 ms | 43.1 |
| 128 | 3,631 ms | 77.4 |
| 256 | 9,817 ms | 191.0 |

- 프레임 비용은 광원 수에 대략 **선형**.
- 셰이더 컴파일 시간은 **초선형** — 256개에서 첫 프레임 9.8초. 언롤 방식의 진짜 비용은 여기에 있다.
- 256개까지 링크 실패·경고 없음(로그 0건).

### 바인딩/유니폼 한계

- **WebGL2**: 실제로 먼저 걸린 벽은 유니폼이 아니라 **텍스처 유닛**이었다(→ Q5).
  유니폼 쪽은 `renderGroup`이 공유 UBO로 묶이고(`src/nodes/core/UniformGroupNode.js:159` `sharedUniformGroup('render',...)`),
  `MAX_UNIFORM_BLOCK_SIZE`는 `src/renderers/webgl-fallback/utils/WebGLCapabilities.js:81`에서 조회된다.
  256개 광원에서도 UBO 관련 에러는 나오지 않았다.
- **WebGPU**: three는 디바이스를 기본 `requiredLimits = {}`로 요청한다
  (`src/renderers/webgpu/WebGPUBackend.js:93`) → W3C 기본 한도가 그대로 적용된다.
  <https://www.w3.org/TR/webgpu/#limits> 기준 기본값:
  `maxSampledTexturesPerShaderStage` **16**, `maxSamplersPerShaderStage` **16**,
  `maxUniformBuffersPerShaderStage` **12**, `maxUniformBufferBindingSize` **65536**,
  `maxBindGroups` **4**, `maxStorageBuffersPerShaderStage` **8**.
  → 시사점: WebGPU에서 그림자 맵 개수 상한은 스테이지당 샘플드 텍스처 16개에 먼저 걸릴 가능성이 높다.
  **미확인** — 실제 디바이스에서 검증하지 못했다.

---

## Q5. 그림자 개수·비용

### 결론 한 줄
**three에 그림자 개수 하드코딩 상한은 없다. 실제 상한은 "수신 재질 한 개의 프래그먼트 셰이더가 쓰는 텍스처 유닛 수"이고, WebGL2/SwiftShader(MAX=32)에서 그림자 스팟 32개째에 링크 실패했다. 광원 N개 중 M개만 `castShadow`를 켜는 것은 정식 지원 패턴이지만, 토글할 때마다 재컴파일된다.**

### 하드코딩 상한 없음

- `grep -rn "maxShadow\|MAX_SHADOW\|numShadow" src/` → **0 hit**.
- 그림자 하나당 렌더 타깃 하나가 독립 생성된다. 아틀라스/배열 패킹은 기본값이 아니다:
  `src/nodes/lighting/ShadowNode.js:394-407` `setupRenderTarget()` — `new DepthTexture(...)` + `createRenderTarget(...)`.
  (배열 텍스처 경로 `isArrayTexture`/`depthLayer`는 CSM·`TileShadowNode` 같은 애드온용으로만 존재.)

### 실측: 그림자 캐스터 개수 한계 (WebGL2/SwiftShader, 그림자 스팟 N개 + 바닥 1장 + 박스 1개, 512×512 shadow map)

| N | 결과 | ms/frame |
|---|---|---|
| 2 | OK | 6.4 |
| 8 | OK | 23.1 |
| 16 | OK | 38.5 |
| 20 / 24 / 28 / 30 | OK | — |
| **32** | **실패** | — |

32개에서 나온 에러(원문):

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
Program Info Log: FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(32)
```

- 즉 상한 = `MAX_TEXTURE_IMAGE_UNITS` − (수신 재질 자체 텍스처 수 + 기타 샘플러).
- SwiftShader는 32를 보고했지만 **WebGL2 스펙 최소 보장은 16**이다. 저사양 디바이스에서는 15개 근처에서 깨질 수 있다.
- 비교: 같은 조건 비그림자 포인트 8개 = 6.5 ms/frame vs 그림자 스팟 8개 = 23.1 ms/frame (약 3.5배).

### `castShadow` 토글은 표준 패턴인가 — 예, 단 재컴파일이 붙는다

- `src/nodes/lighting/AnalyticLightNode.js:259-273`:
  ```js
  if ( this.light.castShadow ) {
      if ( builder.object.receiveShadow ) this.setupShadow( builder );
  } else if ( this.shadowNode !== null ) {
      this.shadowNode.dispose(); this.shadowNode = null; this.shadowColorNode = null;
  }
  ```
  → 끄면 그림자 노드를 정리한다. 수신 오브젝트가 `receiveShadow === false`면 아예 셋업하지 않는다.
- 단, `LightsNode.js:156`이 `castShadow`를 해시에 넣으므로 **토글 = 셰이더 재빌드**다.
  런타임에 자주 켰다 껐다 하면 프레임 스파이크가 생긴다(위 컴파일 시간 표 참조).
- 켜져 있는 동안의 비용: 광원당 프레임마다 그림자 렌더 패스 1회(포인트 라이트는 6회).

---

## Q6. 소프트 섀도우

### 결론 한 줄
**`PCFSoftShadowMap`에서는 `shadow.radius`가 완전히 무시된다(픽셀 단위 동일 확인). radius가 먹는 건 `PCFShadowMap`·`VSMShadowMap`·포인트 라이트 큐브 섀도우다. PCSS(가변 페넘브라)는 r185에 없다 — 광원 크기에 따라 그림자가 부드러워지게 하는 내장 기능은 존재하지 않는다.**

### 필터 매핑

- `src/nodes/lighting/ShadowNode.js:177`
  `const _shadowFilterLib = [ BasicShadowFilter, PCFShadowFilter, PCFSoftShadowFilter, VSMShadowFilter ];`
- 인덱스는 `renderer.shadowMap.type` (`src/constants.js:57,65,74,83` — Basic=0, PCF=1, PCFSoft=2, VSM=3).
- 미지원 타입이면 `:539` `throw new Error( 'THREE.WebGPURenderer: Shadow map type not supported yet.' )`.
- 커스텀 훅 2개(공식):
  - `shadow.filterNode` — `ShadowNode.js:535` `shadow.filterNode || this.getShadowFilterFn(...)`
  - `shadow.shadowNode` — `AnalyticLightNode.js:214`, 그림자 노드 전체를 교체

### `radius` 사용 여부 (소스)

| 필터 | `shadow.radius` | 근거 |
|---|---|---|
| `BasicShadowFilter` | 사용 안 함 | `ShadowFilterNode.js:24-35` (단순 compare) |
| `PCFShadowFilter` | **사용** | `ShadowFilterNode.js:52-96`, 특히 `:69-84` — 5탭 Vogel 디스크 오프셋에 곱함 |
| `PCFSoftShadowFilter` | **사용 안 함** | `ShadowFilterNode.js:98-134` — 고정 4× `gather` 블렌드, radius 참조 자체가 없음 |
| `VSMShadowFilter` | **사용** | 블러 패스 `VSMPassVertical/Horizontal` (`ShadowNode.js:97-160`, `:492-500`) |
| `PointShadowFilter` (포인트 전용) | **사용** | `PointShadowNode.js:68-71` |

### 실측 A/B (WebGL2, 디렉셔널 라이트 + 세로 박스, 이미지 전체 R채널 체크섬 & 중간톤 픽셀 비율)

| 케이스 | 체크섬 | 어두운 픽셀 % | 중간톤(페넘브라) % |
|---|---|---|---|
| D0 `castShadow=false` (대조군) | 1828417280 | 12.47 | 0.00 |
| D1 PCFSoft, radius=1 | **2089097668** | 14.01 | 0.12 |
| D2 PCFSoft, radius=25 | **2089097668** | 14.01 | 0.12 |
| D3 PCF, radius=1 | 1002735604 | 14.02 | 0.07 |
| D4 PCF, radius=25 | 55835779 | 13.43 | **2.02** |
| D5 Basic, radius=25 | 3517571618 | 14.04 | 0.00 |
| D6 VSM, radius=1 | 2505268080 | 14.05 | 0.07 |
| D7 VSM, radius=25 | 4222204581 | 13.66 | **2.89** |

- D1과 D2가 **체크섬까지 동일** → PCFSoft에서 radius는 완전한 no-op임이 실증됐다.
- D3→D4, D6→D7은 중간톤 비율이 유의미하게 늘었다 → PCF·VSM은 radius로 부드러워진다.
- D0(12.47%) vs D1(14.01%)로 그림자가 실제로 프레임 안에 있음을 확인했다(테스트가 헛돈 게 아님).

### PCSS / 가변 페넘브라

- `grep -rni "pcss" src/ examples/jsm/` → **0 hit**. 블로커 서치(blocker search) 구현도 없다.
- 즉 **"광원 크기에 따라 그림자가 부드러워지는" 기능은 r185에 내장돼 있지 않다.**
- 만들려면 `shadow.filterNode`(또는 `shadow.shadowNode`)에 TSL로 직접 작성해야 한다 — 확장점은 공식적으로 열려 있다.
- **미확인**: 손으로 쓴 PCSS가 SwiftShader 폴백에서 성능적으로 감당되는지.

### 프로젝트 직결 사항

`frontend/src/three/render/renderer.ts:28` 에서 `renderer.shadowMap.type = THREE.PCFSoftShadowMap`.
이 설정에서는 **방 리그 DirectionalLight와 램프 SpotLight의 `shadow.radius`가 아무 효과가 없다.**
포인트 라이트만 radius가 먹지만 프로젝트는 장식 발광 PointLight를 `castShadow=false`로 두고 있다.
→ 그림자 부드러움을 파라미터로 조절하고 싶으면 `PCFShadowMap`(또는 VSM)으로 바꿔야 한다.

---

## Q7. 광원 ≠ emissive 표면, 그리고 표준 관행

### 결론 한 줄
**emissive 재질이 다른 오브젝트를 비추지 않는 것은 맞고(실측 확인), 실제 광원과 발광 메쉬를 같은 위치에 두는 것 — 정확히는 발광 메쉬를 광원의 자식으로 붙이는 것 — 이 three 공식 예제의 표준 관행이다.**

### emissive는 주변을 비추지 않는다 (실측)

실측 E1 (WebGL2, 광원 0개, `emissive: 0xffffff`, `emissiveIntensity: 20`인 평면 1장 + 바닥):

| 측정 영역 | 휘도 |
|---|---|
| 발광 패널 자체 | **255.00** |
| 바로 아래 바닥 | **0.00** |

패널은 최대 밝기로 보이지만 바닥은 정확히 0 → 빛이 새어나가지 않는다.

### 공식 예제의 관행 (r185, `examples/*.html`)

- **`webgpu_lights_physical`** — PointLight의 **자식**으로 발광 구를 붙인다:
  ```js
  const bulbGeometry = new THREE.SphereGeometry( 0.02, 16, 8 );
  bulbLight = new THREE.PointLight( 0xffee88, 1, 100, 2 );
  bulbMat = new THREE.MeshStandardMaterial( { emissive: 0xffffee, emissiveIntensity: 1, color: 0x000000 } );
  bulbLight.add( new THREE.Mesh( bulbGeometry, bulbMat ) );
  bulbLight.position.set( 0, 2, 0 );
  bulbLight.castShadow = true;
  scene.add( bulbLight );
  ```
  (베이스 컬러는 검정, emissive만 사용 — 자기 자신이 다른 빛에 반응하지 않게)
- **`webgpu_lights_pointlights`** — 더 단순하게 `MeshBasicMaterial`로:
  ```js
  light1 = new THREE.PointLight( 0xff0040, 2000 );
  light1.add( new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0xff0040 } ) ) );
  ```
- **`webgpu_volume_lighting_rectarea`** — RectAreaLight의 자식으로 앞면(`MeshBasicMaterial`, `BackSide`)과
  뒷판(`MeshStandardMaterial` 어두운 색) 2장을 붙인다:
  `rectLight.add( backSide ); rectLight.add( frontSide );`
- **`webgpu_lights_rectarealight`** — 별도 메쉬 대신 `RectAreaLightHelper`를 씬에 추가한다
  (`examples/jsm/helpers/RectAreaLightHelper.js` — 헬퍼 자체가 평면을 그리므로 가시 광원 역할을 겸한다).

공통 패턴: **메쉬를 광원 객체의 자식으로 추가**해서 트랜스폼이 자동으로 따라가게 한다.
재질은 "빛나 보이기"만 하면 되므로 `MeshBasicMaterial` 또는 `color: 0x000000 + emissive`.

---

## 이 프로젝트에 대한 시사점 (5줄)

1. **"RectAreaLight 금지(WebGL2 폴백 미지원)"의 괄호 사유는 거짓이다** — r185 WebGL2 백엔드에서 실측으로 조명된다(R2 vs R3). `docs/context/3d-scene.md:49`, `frontend/src/three/CLAUDE.md:18`의 사유를 "그림자 불가 + `setLTC` 부트스트랩 필요 + PBR 재질 한정"으로 정정할 것(금지 유지 여부는 별개 판단).
2. 만약 도입한다면 `RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`를 반드시 먼저 호출하고(빠지면 **화면 전체 검정**), `castShadow`는 절대 켜지 말 것(**TypeError로 재질이 통째로 안 그려짐**).
3. `PCFSoftShadowMap` 설정에서 `shadow.radius`는 방 리그·램프 스팟 모두에서 **완전 무시**된다(체크섬 동일). 그림자 부드러움을 다루려면 `PCFShadowMap`/`VSM`으로 바꿔야 하고, PCSS는 r185에 아예 없다.
4. 그림자 캐스터 상한의 실체는 텍스처 유닛이다 — WebGL2/SwiftShader에서 **32개째에 링크 실패**(스펙 최소는 16). 현재 캡(스팟 2)은 여유롭지만, WebGPU 기본 한도가 스테이지당 샘플드 텍스처 16이라 오히려 WebGPU 쪽이 더 빡빡할 수 있다(미확인).
5. 발광 메쉬를 광원의 **자식**으로 붙이는 현재 구조는 three 공식 예제와 동일한 표준 관행이고, `TiledLightsNode`는 r185에서 삭제되었으니 다광원 확장을 검토할 땐 `ClusteredLighting`(WebGPU 전용 가드) 또는 `DynamicLighting`(재컴파일 회피)을 봐야 한다.
