# 빛 마스크(쿠키/고보) 빌드타임 베이크 → 런타임 투영 — three.js r185.1 사실 조사

조사일 2026-07-28 · 대상 `frontend/node_modules/three@0.185.1` 소스 직접 확인 + three.js PR/이슈/공식 문서 + 게임엔진 저작 문서.
경로 표기: `T/` = `/home/dong99u/DERO/frontend/node_modules/three/`, `F/` = `/home/dong99u/DERO/frontend/`.

**한 줄 결론: 된다. 그것도 예상보다 훨씬 잘 된다 — 2D 스팟 쿠키는 코어 API로 그냥 되고(`castShadow` 없이도), 절차 마스크용 TSL 훅(`light.colorNode`)까지 정식으로 있다. 360° 큐브 쿠키만 코어에 없어서 커스텀 노드가 필요하다.**

> ⚠️ 브리프 정정 2건
> - `frontend/scripts/asset-pipeline.sh`는 **존재하지 않는다.** 실제 스크립트는 `F/scripts/build-library-assets.mjs`(gltfpack 압축)와 `F/scripts/generate-thumbnails.mjs`(Playwright 캡처) 2개뿐이다.
> - "IES 로더가 수평 대칭 폴딩을 해서 좌우 비대칭을 잃는다"는 **과소평가**다. three.js `IESLoader`는 폴딩 정도가 아니라 방위각을 **전부 버린다**(§7).

---

## 1. `SpotLight.map` 쿠키

### (a) WebGPURenderer 지원? → **YES. 정식 지원.**

`T/src/nodes/lighting/SpotLightNode.js:140-160` — `setupDirect()`가 `light.map`을 받아 투영 UV로 샘플링한다.

```js
142  if ( light.colorNode ) {
145      projected = light.colorNode( lightCoord );
147  } else if ( light.map ) {
150      projected = texture( light.map, lightCoord.xy ).onRenderUpdate( () => light.map );
152  }
```

근거 PR: [#29989 "WebGPURenderer: Add `SpotLight.map` support"](https://github.com/mrdoob/three.js/pull/29989) (sunag, 2024-11-28 머지). PR 본문 원문:
> Add `SpotLight.map` support for `WebGPURenderer`. **Unlike `WebGLRenderer`, turning on `.castShadow` should be optional.**
> - [x] Add `Light.colorNode` optional usage
> - [x] TSL: Add `lightShadowMatrix( light )`, `lightProjectionUV( light )`

공식 예제 `examples/webgpu_lights_spotlight.html`이 이걸 쓴다(`spotLight.map = textures['disturb.jpg']`).
※ npm 패키지에는 `examples/jsm/`만 들어있어 예제 HTML은 로컬에 없다 — 확인은 GitHub `dev`로 했다.

**`light.colorNode`가 이번 조사의 최대 수확이다.** `map` 텍스처 대신 TSL 함수를 꽂으면 투영 UV(vec3)를 받아 임의 색/마스크를 돌려줄 수 있다. `map`과 상호배타이고 `colorNode`가 이긴다.

### (b) WebGPURenderer의 WebGL2 백엔드에서도? → **구조적으로 YES. 단 이 레포에서 실측 미검증.**

- `SpotLightNode`는 백엔드 무관한 노드 코드다. WebGL2 백엔드는 `T/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js`(46.5KB)가 GLSL로 트랜스파일한다 — `generateTexture()` `:583`, `generateTextureLevel()` `:612`, `generateTextureBias()` `:637`, `samplerCube` 선언 `:861-873`.
- 공식 매뉴얼 <https://threejs.org/manual/en/webgpurenderer.html> 원문:
  > Shader code written in TSL can be transpiled to WGSL or GLSL depending on the available backend.
- **미확인**: `SpotLight.map`/`ProjectorLight`가 WebGL2 백엔드에서 실제로 올바르게 렌더되는지 명시한 문서·이슈는 없다. 간접 증거로 Mugen87이 PR #31396에서 프로젝터+비디오텍스처를 두고 *"there are still WebGPU warnings in the console… **WebGL reports no warnings.**"*라고 적었다 — WebGL 백엔드에서 돌려봤다는 뜻. **`forceWebGL: true`로 10분짜리 스모크 테스트를 반드시 먼저 할 것.**

### (c) 텍스처 포맷·색공간 요구사항

- **색공간**: `T/src/nodes/accessors/TextureNode.js:633-635` — `builder.needsToWorkingColorSpace(texture)`면 `colorSpaceToWorking(...)`로 디코딩한다. 즉 마스크를 `SRGBColorSpace`로 태깅하면 중간 회색이 EOTF로 어두워진다. **마스크는 `THREE.NoColorSpace`(= linear 취급)로 태깅해야 값이 그대로 곱해진다.**
- **알파**: `T/src/nodes/math/OperatorNode.js:183-187` — `mul`의 타입 승격은 "더 긴 쪽"이다. `lightColor`(vec3) `.mul(projected)`(vec4)면 vec4로 승격된다. 하류에서 무슨 일이 나는지는 추적 안 했다(**미확인**). **마스크는 알파 1.0 불투명 RGB로 저작해서 이 문제를 우회하는 게 안전하다.** (참고: 클래식 WebGL 경로는 `spotColor.rgb`로 명시적으로 잘라 쓴다 — `T/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js:115`.)
- **필터/랩**: 밉 블러(§6)를 쓰려면 `generateMipmaps = true` + `minFilter/magFilter = Linear*` 필수(안 그러면 `.blur()`가 경고 찍고 무력화된다 — `TextureNode.js:714-720`). 랩은 `ClampToEdgeWrapping` + **테두리를 순검정으로** 저작(Unity 공식 가이드 권고, §8).

### (d) 그림자(`castShadow`)와 동시에? → **YES. 게다가 `castShadow` 없이도 쿠키가 나온다.**

`T/src/nodes/accessors/Lights.js:29-55`, `lightShadowMatrix()`:
```js
38   if ( light.castShadow !== true || frame.renderer.shadowMap.enabled === false ) {
...
47       light.shadow.updateMatrices( light );   // 그림자 렌더링 밖에서도 행렬을 직접 갱신
49   }
```
주석(`:35-37`)이 의도를 못박는다: *"normally, shadow matrices are updated in ShadowNode. However, if the shadow matrix is used outside of shadow rendering (like in ProjectorLightNode), the shadow matrix still requires an update."*

**이건 이 프로젝트에 결정적이다.** `F/src/three/scene/lighting.ts:80`의 `LAMP_SHADOW_CAP = 2` 때문에 3번째 램프부터는 `castShadow = false`가 된다(`F/src/three/scene/scene.ts:1201-1207`). 쿠키는 그 캡과 **무관하게** 모든 램프에 붙는다 — 그림자 없는 램프도 특색 있는 무늬를 낸다.

> **문서 모순 주의**: `T/src/lights/SpotLight.js:110` JSDoc과 <https://threejs.org/docs/pages/SpotLight.html>은 아직도 *"This property is disabled if `castShadow` is set to `false`"*라고 쓴다. **r185 소스는 두 렌더러 경로 모두에서 이걸 반박한다** — 클래식 WebGL조차 `T/src/renderers/shaders/ShaderChunk/shadowmap_vertex.glsl.js:59`에 `// spot lights can be evaluated without active shadow mapping (when SpotLight.map is used)` 주석과 함께 `NUM_SPOT_LIGHT_COORDS` 블록이 `#ifdef USE_SHADOWMAP` **바깥**에 있다. 문서가 낡았다는 게 내 판정이지만, 클래식 경로는 실측 안 했으므로 **미확인**으로 둔다. 우리는 WebGPURenderer라 무관하다(PR #29989가 명시).

### (e) 조명을 회전시키면 무늬도 도나? → **부분적으로만. 여기 함정이 있다.**

쿠키 UV는 `lightProjectionUV()` = `lightShadowMatrix(light) * positionWorld` (`Lights.js:67-74`)이고, 그 행렬은 `LightShadow.updateMatrices()` (`T/src/lights/LightShadow.js:201-215`)가 매 프레임 만든다:
```js
209  _lookTarget.setFromMatrixPosition( light.target.matrixWorld );
210  shadowCamera.lookAt( _lookTarget );
```

즉 쿠키의 방향은 **광원 월드 위치 + 타깃 월드 위치**로만 결정되고, **`light.rotation`(빔 축 둘레의 롤)은 전혀 안 쓴다.** `lookAt`의 up은 월드 `(0,1,0)` 고정이다.

**이 프로젝트에서 곧장 터진다**: `F/src/three/scene/scene.ts:803-805`가 램프 스팟을 `position (0, shadeLocalY, 0)` → `target (0,0,0)`, 즉 **정확히 수직 아래**로 쏜다. 그러면
1. `lookAt`의 up과 시선이 평행 → `T/src/math/Matrix4.js`의 degenerate 분기가 `_z.z += 0.0001`로 살짝 밀어 임의 기준축을 만든다.
2. 두 점 모두 그룹의 회전축 위에 있어서, **램프를 yaw로 돌려도 두 월드 위치가 안 변한다 → 쿠키 무늬가 안 돈다.**

→ 대책: `light.colorNode` 안에서 yaw 유니폼으로 UV를 직접 회전시킨다. (`map` 직접 대입으로는 못 고친다.)

---

## 2. PointLight 큐브 쿠키(360° 마스크)

**결론: three.js 코어에 없다. 확정.**

- `T/src/lights/PointLight.js` — `map`/`iesMap` 속성 없음(전 파일 grep 무매치).
- `T/src/nodes/lighting/PointLightNode.js:89-98` — `setupDirect()`가 색·거리감쇠만 계산. map/colorNode 훅 없음.
- `T/src/nodes/lighting/LightsNode.js:158-166` — 캐시키 계산이 `light.isSpotLight`만 본다.

### 우회법 3가지

| 우회법 | WebGPU | WebGL2 백엔드 | 그림자 | 비용/리스크 |
|---|---|---|---|---|
| **A. 커스텀 TSL 라이트 노드** (`PointLightNode` 서브클래싱 + `cubeTexture` 곱) | ✅ | ✅ (samplerCube 지원 `GLSLNodeBuilder.js:861-873`) | ✅ (`setupShadowNode()`가 `pointShadow(light)` 상속) | 유지보수. 캐시키 미포함(아래) |
| **B. 스팟 N개로 방향 분할** | ✅ | ✅ | ✅ | 광원 6배. `EMITTER_LIGHT_CAP`(백엔드별)에 즉사 |
| **C. `ProjectorLight`** | ✅ | ✅(추정) | ✅ | **360° 아님** — 사각 프러스텀 1개. 360° 대체 불가 |

**A 실행법 (소스로 확인한 API)**
```js
class CookiePointLight extends THREE.PointLight { cookie = null }          // 새 클래스여야 한다
class CookiePointLightNode extends PointLightNode {
  setupDirect(builder) {
    const { lightColor, lightDirection } = super.setupDirect(builder);
    const dir = this.getLightVector(builder).normalize().negate();          // AnalyticLightNode.js:161
    return { lightDirection, lightColor: lightColor.mul(cubeTexture(this.light.cookie, dir)) };
  }
}
renderer.library.addLight(CookiePointLightNode, CookiePointLight);          // NodeLibrary.js:142
```
- 반드시 **새 라이트 클래스**여야 한다. `NodeLibrary.addClass()` (`:178-186`)는 이미 등록된 base class를 다시 넣으면 `Redefinition of node …` 경고만 찍고 **조용히 무시**한다. `PointLight` 자체를 덮어쓸 수 없다.
- **함정**: `LightsNode.customCacheKey()`가 스팟만 보므로 쿠키 텍스처를 런타임에 갈아끼우면 셰이더가 재컴파일 안 될 수 있다(`SpotLight.map`도 같은 이유로 PR #31396에서 고쳐졌다). 램프 인스턴스당 텍스처 고정으로 쓰거나 `customCacheKey`를 같이 오버라이드할 것.

**웹 선례**: PlayCanvas는 omni 라이트에 큐브맵 쿠키를 정식 지원한다 (<https://developer.playcanvas.com/tutorials/light-cookies/> — *"For an omni light the cookie needs to be a cubemap so that it can be projected in 6 directions"*). three.js는 없다.

---

## 3. `ProjectorLight`

**결론: r185에 있다. `three/webgpu` 전용. `colorNode`·그림자 둘 다 된다. 추가 속성은 `.aspect` 하나뿐.**

| 항목 | 사실 | 근거 |
|---|---|---|
| 존재 | ✅ | `T/src/lights/webgpu/ProjectorLight.js`, `T/src/nodes/lighting/ProjectorLightNode.js` |
| 렌더러 경로 | `three/webgpu` 빌드에서만 export. `three` 코어엔 없음 | `T/src/Three.WebGPU.js:27`, `T/src/Three.WebGPU.Nodes.js:21` / 등록: `StandardNodeLibrary.js:86`, `BasicNodeLibrary.js:53` |
| 클래스 doc | *"Can only be used with `WebGPURenderer`"* — **렌더러 클래스** 이야기지 WebGPU 백엔드 전용이란 뜻이 아니다 | `ProjectorLight.js:4-6` |
| `colorNode` TSL 마스크 | ✅ (`SpotLightNode.setupDirect` 상속) | `SpotLightNode.js:142-145` |
| 그림자 | ✅ | 예제가 `castShadow`/`shadow.mapSize`/`shadow.focus` 전부 사용 |
| 추가 API | `.aspect` (null이면 `map.width/map.height`에서 유도) | `ProjectorLight.js:30`, `ProjectorLightNode.js:38-54` |
| 모양 | 원뿔이 아니라 **사각 프러스텀** — `getSpotAttenuation()`이 원뿔 smoothstep을 box SDF로 교체 | `ProjectorLightNode.js:64-87` |
| 역투영 방지 | ✅ `If(spotLightCoord.w > 0, …)` | `ProjectorLightNode.js:76` |

PR [#31022](https://github.com/mrdoob/three.js/pull/31022) (sunag, 2025-04-30 머지, +467−48/15파일, 마일스톤 r177). N8python의 WebGL PR #24589 기반. 예제 `examples/webgpu_lights_projector.html` — 절차(`mx_worley_noise_float`)·비디오·텍스처 3모드 전환.

**PR 본문의 절차 마스크 예시** (그대로 우리 케이스에 쓸 수 있다):
```js
projectorLight.colorNode = Fn( ( [ projectorUV ] ) => { ... return caustic; } );
```

**알아둘 것**
- `ProjectorLightHelper`가 **없다**. 공식 예제도 `SpotLightHelper`를 쓰는데 그건 원뿔을 그려서 실제 사각 빔과 안 맞는다. WestLangley가 리뷰에서 지적했으나 미구현(`src/helpers/ProjectorLightHelper.js` 404).
- mrdoob이 **머지 후에** API 이름에 이의를 제기했다: *"How about we add a new property to `SpotLight` instead? `light.shape = THREE.RectShape;`"* → sunag *"I don't have a strong opinion on this"* → 스레드 종료. **API가 확정 상태가 아니다.** 나중에 갈아엎힐 수 있다.
- 후속 버그가 여럿 있었고 대부분 수정됨: #31461 역투영(→#31473), #31396 캐시키에 map 버전 누락(→r179), #31430 VideoTexture 프레임 드랍(→#31440).

---

## 4. 커스텀 TSL로 라이트 감쇠 갈아끼우기

**결론: `getSpotAttenuation()` 훅은 확인했고 실재한다. 하지만 임의 2D/큐브 마스크에는 이 훅이 아니라 `light.colorNode`가 정답이다.**

`T/src/nodes/lighting/IESSpotLightNode.js:44-66`:
```js
getSpotAttenuation( builder, angleCosine ) {
    const angle = angleCosine.acos().mul( 1.0 / Math.PI );     // 축에서 벗어난 각 → [0,1]
    this._iesTextureNode = texture( iesMap, vec2( angle, 0 ), 0 );
    spotAttenuation = this._iesTextureNode.r;                   // 원뿔 smoothstep을 텍스처 룩업으로 대체
}
```
기본형(`SpotLightNode.js:94-100`)은 `smoothstep(coneCos, penumbraCos, angleCos)`.

**판정**
- 훅이 받는 건 `angleCosine`(스칼라) 하나뿐 → **이 훅만으로는 방사대칭 마스크밖에 못 만든다.** IES가 그래서 1D인 것.
- 단 `ProjectorLightNode.getSpotAttenuation(builder)`가 증명하듯, `angleCosine`을 무시하고 `builder.context.positionWorld` + `lightShadowMatrix`로 직접 계산하면 **비대칭도 가능하다.** 다만 서브클래싱 + NodeLibrary 등록이 필요하다.
- **2D 마스크는 서브클래싱 없이 `light.colorNode` 한 줄이면 끝난다.** 서브클래싱이 필요한 건 (a) 큐브 마스크(PointLight)와 (b) 감쇠 자체의 모양을 바꿀 때뿐이다.
- **TSL의 WebGL2 트랜스파일**: 된다(§1b). `IESSpotLightNode`/`ProjectorLightNode`가 쓰는 프리미티브(`Fn`, `If`, `acos/saturate/min/max/length`, `texture`, `lightShadowMatrix`, `positionWorld`)에 WebGPU 전용은 없다.

---

## 5. 마스크를 굽는 실제 방법

**결론: `CubeCamera` + `CubeRenderTarget` + `readRenderTargetPixelsAsync(…, faceIndex)`로 된다. 두 백엔드 모두 6면 리드백을 지원한다. 다만 이 레포의 헤드리스 환경이 지뢰밭이라 거기가 진짜 리스크다.**

### 소스로 확인된 API

| 필요한 것 | API | 근거 |
|---|---|---|
| WebGPURenderer 호환 큐브 RT | `CubeRenderTarget` (= `WebGLCubeRenderTarget`의 WebGPU판) | `T/src/renderers/common/CubeRenderTarget.js:15-21` |
| 6면 렌더 | `CubeCamera.update(renderer, scene)` — 6× `setRenderTarget(rt, face)` + `render`, 좌표계(WebGL/WebGPU) 자동 전환 | `T/src/cameras/CubeCamera.js:178-255`, `:107-157` |
| 픽셀 리드백 | `renderer.readRenderTargetPixelsAsync(rt, x,y,w,h, textureIndex=0, faceIndex)` | `T/src/renderers/common/Renderer.js:3063-3068` |
| WebGL2 구현 | `gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex` 바인딩 → PIXEL_PACK_BUFFER + `_clientWaitAsync` | `T/src/renderers/webgl-fallback/utils/WebGLTextureUtils.js:1221-1262` |
| WebGPU 구현 | `backend.copyTextureToBuffer(texture, …, faceIndex)` | `T/src/renderers/webgpu/WebGPUBackend.js:2242` |

**어안(fisheye)/등장방형 카메라는 없다.** `src/`·`examples/jsm/` 전체 grep에서 `fisheye`·`paraboloid` 무매치. 등장방형이 필요하면 큐브를 굽고 풀스크린 패스로 리샘플하면 된다 — `T/src/nodes/utils/EquirectUV.js`의 `equirectDirection(uv)`가 UV→방향을 주므로 `cubeTexture(cubeRT.texture, equirectDirection(uv))` 한 줄.

### 굽는 씬 구성 (Unity/Unreal 공식 워크플로와 동일, §8)

1. 램프 GLB 로드 → **모든 머티리얼을 불투명 순검정으로 치환** (`MeshBasicNodeMaterial({color: 0x000000})`).
2. **배경 흰색** (`scene.background = new Color(0xffffff)`). Unity 가이드는 "노멀 뒤집은 구"를 쓰라지만, 씬에 램프밖에 없으면 배경색이 동치이고 더 싸다.
3. **전구/발광 메쉬와 무의미한 대형 차폐물은 숨긴다** (Unity 가이드: *"hide very large occluding elements of the lamp that are irrelevant"*).
4. 카메라를 **광원 좌표**에 둔다.
   - **2D 스팟 쿠키**(대부분의 케이스): 큐브 필요 없음. `PerspectiveCamera(fov = 2·angle·RAD2DEG, aspect = shadow.aspect, near, far)` 1장 → 평범한 `RenderTarget` → 리드백. **훨씬 싸다.**
   - **360°**: `CubeRenderTarget(N)` + `CubeCamera` → 6면 리드백.
5. 해상도: Unity 가이드 권고 **128~512**, 8비트. 큐브는 2D의 6배 용량이라는 점 유의.

### 헤드리스 실행 — **여기가 실제 리스크다**

`F/e2e/CLAUDE.md`에 이 레포의 실사고 기록이 있고, 그대로 적용된다:
- **헤드리스 크롬 `page.screenshot`은 SwiftShader 리드백에서 30초 타임아웃**(2026-07-21 실사고). 그래서 `F/scripts/generate-thumbnails.mjs:4,16`이 `headless: false`를 쓴다.
- **WSL에서 headed를 WSLg(`DISPLAY=:0`)로 띄우면 안 된다** — stale 프레임을 돌려줘 "렌더가 안 바뀐다"고 오판하게 된다. **`xvfb-run` 필수.** 대신 Xvfb+SwiftShader는 프레임당 ~1초.
- **`next dev`로 돌리면서 레포에 파일을 쓰면 그 회차는 무효** — HMR 리로드로 씬이 초기화된다. `next build && next start`에 붙일 것.
- **미확인**: `readRenderTargetPixelsAsync`는 `page.screenshot`이 아니라 `readPixels`+`clientWaitAsync` 경로라, 위 30초 타임아웃이 여기서도 재현되는지는 **모른다.** 재현되면 파이프라인 자체가 안 돈다 → **파이프라인 착수 전에 이걸 먼저 검증해야 한다.**
  - 회피책: `page.screenshot`을 아예 안 쓰고 `page.evaluate`로 타입드어레이를 base64로 반환받는다. 또는 WebGPU 경로(`--enable-unsafe-webgpu`)로 굽는다.

### 기존 스크립트 재사용 지점

| 기존 자산 | 재사용 방식 |
|---|---|
| `F/scripts/generate-thumbnails.mjs` | **드라이버 형태를 통째로 복사**: `goto` → `waitForFunction(dataset.*Ready === '1')` → 아이템 루프. `page.screenshot` 부분만 `page.evaluate` 리드백으로 교체 |
| `F/src/app/simulator/thumbnail-render` 라우트 | **베이크 라우트의 템플릿**. 같은 방식으로 `?id=`를 받아 캔버스에 굽고 ready 플래그를 세운다 |
| `F/scripts/build-library-assets.mjs` | `assets-raw/library/*.glb` 순회 + `slugFor()`(`:14-18`, `001-Y-ytb-0001.glb` → `glb-0001`)를 **그대로 재사용**해 쿠키 파일명을 모델 파일명과 정렬시킨다 |
| `productAssets.ts` 로더 스택 | 베이크 라우트에서 동일 로더로 GLB를 읽어야 압축/스케일이 런타임과 일치한다 |

### 파이프라인 초안

```
입력: assets-raw/library/{lamp}.glb  +  광원 로컬 좌표
      └ 좌표 출처 결정 필요(택1): ① GLB 안의 빈 노드 `light_origin`  ② 스펙 DB의 optical.originMm
                                   → ①이 저작자 손에 있어 낫다. GLB 저작 규약에 넣을 것.

1. [Next 라우트] /simulator/cookie-bake?id=glb-0001
   ├ GLB 로드(런타임과 동일 로더)
   ├ 전 머티리얼 → 불투명 검정 / scene.background = white
   ├ 전구·대형 무의미 차폐물 숨김 (네이밍 규약 또는 스펙 플래그 필요)
   ├ 카메라를 light_origin에 배치
   │   ├ 2D:  PerspectiveCamera(fov=2·angle) → RenderTarget(512²)
   │   └ 360°: CubeRenderTarget(256) + CubeCamera.update(renderer, scene)
   ├ readRenderTargetPixelsAsync(rt, 0,0,N,N, 0, face)  ×1 또는 ×6
   └ window.__bake = { faces: [base64…] }; canvas.dataset.bakeReady = '1'

2. [Node] scripts/bake-light-cookies.mjs   ← generate-thumbnails.mjs 복사
   xvfb-run playwright(headless:false) → next start(:3100) 에 접속
   → 램프 id 순회 → page.evaluate(() => window.__bake)
   → PNG 인코딩 → public/assets/cookies/{slug}.png (360°은 {slug}_{px|nx|…}.png)

3. [런타임] 텍스처 로드 시 규약
   tex.colorSpace = THREE.NoColorSpace        // §1c — sRGB 태깅 금지
   tex.generateMipmaps = true                 // §6 블러용
   tex.minFilter = LinearMipmapLinearFilter; tex.magFilter = LinearFilter
   tex.wrapS = tex.wrapT = ClampToEdgeWrapping
   spot.map = tex                              // 단순 케이스
   // 또는 spot.colorNode = Fn(([uvw]) => texture(tex, rotate(uvw.xy, yaw)).blur(dist))
   램프 메쉬는 이 광원에 대해 그림자를 끈다 (Unreal 랜턴 튜토리얼 권고)
```

---

## 6. penumbra 흉내

**결론: 밉맵으로 된다. 그리고 three.js는 Unreal 랜턴의 "두 장 lerp"보다 나은 걸 이미 갖고 있다 — 거리로 **연속** 밉 바이어스를 먹이면 된다.**

`T/src/nodes/accessors/TextureNode.js:706-724`:
```js
blur( amountNode ) {
    textureNode.biasNode = nodeObject( amountNode ).mul( maxMipLevel( textureNode ) );
    // generateMipmaps === false || NearestFilter 면 경고 후 비활성화
}
```
+ `.level(n)` (`:732-740`, 명시 밉), `.bias(n)` (`:760-768`, 원시 바이어스).

```js
light.colorNode = Fn( ( [ uvw ] ) => texture( mask, uvw.xy ).blur( softness ) );
// softness = clamp((distToSurface - near) / (far - near), 0, 1) 같은 노드
```

이건 ARM Ice Cave 기법과 동일하다 (<https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/dynamic-soft-shadows-based-on-local-cubemap>):
> The softness filtration is calculated in hardware (via the texture pipeline) so the smoothness comes almost for free.

Unreal 랜턴 튜토리얼(<https://blog.nameless.zanity.net/?p=145>)의 두 장 lerp도 물론 가능하다:
> The idea here is to fade between two different cube maps based on the distance from the light, so that the shadows close to the light will be sharp, while those farther away will be much softer.
> 권장 기본값: LightRadius 1000, NearDistance 100, FarDistance 500 / NearMinimumLight 0.01, FarMinimumLight 0.10

**주의**
- 밉 체인은 박스 필터라 가우시안이 아니다 — penumbra "흉내"로는 충분하지만 정확한 소프트섀도는 아니다.
- **베이크 시점에 이미 penumbra를 넣는 게 더 물리적이다.** Unity 가이드 원문: *"The distance between the light source and the sphere also impacts the softness of the shadows: the closer the sphere, the sharper the shadows. For this reason, scale the sphere so that it is representative of the usual distance the light source is placed away from other shadow receivers."* → 베이크 구 반경 = 대표 수광 거리(책상 상판까지).
- 그림자 바닥을 순검정으로 두지 말 것(랜턴 튜토리얼의 `MinimumLight` 가산).

---

## 7. 비대칭 배광(스크린바)

**결론: 쿠키는 비대칭을 온전히 담는다. IES는 절대 못 담는다. 단 쿠키에는 "프러스텀 밖은 못 깎는다"는 결정적 제약이 있다.**

### 쿠키 = 비대칭 OK
`lightCoord`는 라이트 클립공간의 투영 UV(`Lights.js:67-74`)라, 그 안의 2D 패턴은 완전히 자유롭다. 좌우/상하 비대칭 전부 표현된다.

### ⚠️ 결정적 제약 — 쿠키는 프러스텀 **안에서만** 곱해진다

`T/src/nodes/lighting/SpotLightNode.js:154-160`:
```js
const inSpotLightMap = lightCoord.mul( 2. ).sub( 1. ).abs().lessThan( 1. ).all();
lightColor = inSpotLightMap.select( lightColor.mul( projected ), lightColor );
```
UV [0,1] 박스 **밖에서는 마스크가 적용되지 않고 광원이 그대로 풀세기로 남는다.** 0이 되는 게 아니다.

→ **"뒤(화면 쪽)로 안 가게" 하는 걸 쿠키의 검은 영역으로 처리할 수 없다.** 원뿔/박스 감쇠 자체가 이미 그쪽에서 0이어야 한다. 실무 규칙: **라이트의 `angle`/`aspect`를 의도한 조사 범위의 바깥 경계로 잡고, 마스크는 그 안쪽만 조각한다.**

### 스크린바 권장 구성
`ProjectorLight` + 앞쪽 아래로 기운 aim + 비대칭 마스크. 이유:
- 사각 프러스텀이 스크린바의 띠 모양 배광에 원뿔보다 맞다.
- `.aspect`로 가로로 긴 배광을 잡는다.
- `spotLightCoord.w > 0` 가드(`ProjectorLightNode.js:76`)가 뒤쪽 역투영을 막는다 — 화면 쪽 누출 방지의 실제 메커니즘이 **이것**이지 쿠키가 아니다.

### IES는 대안이 못 된다 — 소스로 이중 확인
1. **포맷은 잘못 없다.** IES LM-63 §5.18: 마지막 수평각이 `360`이면 *"the luminaire is assumed to exhibit no lateral symmetry"* — 완전 비대칭을 담을 수 있다.
2. **three.js `IESLoader`가 버린다.** `T/examples/jsm/loaders/IESLoader.js`: `height = 180` (`:54`)로 360×180 = 64,800개를 계산해놓고, 최종 출력은
   ```js
   181  const texture = new DataTexture( data, 180, 1, RedFormat, type );
   ```
   **180×1 = 180 텍셀.** 배열 앞 180개(= `theta === 0` 슬라이스)만 쓰이고 나머지 ~99.7%가 버려진다. 대칭 폴딩 코드(`:118-125`)는 있지만 그 결과가 폐기된다.
3. **소비 측도 1D다.** `IESSpotLightNode.js:54` — `texture(iesMap, vec2(angle, 0), 0)`, v가 하드코딩 0. 셰이더 경로에 방위각 항이 아예 없다.

Unreal도 같은 설계다(*"IES Light Profiles are a 1D texture (gradient)… sweeps around an axis"*). 즉 의도된 관례지 버그가 아니다. 결론은 같다 — **비대칭이 필요하면 IES가 아니라 쿠키다.**

---

## 8. 선례

### 웹/three.js: **GLB 기하에서 고보를 굽는 선례는 찾지 못했다.**
- 런타임 투영 선례는 있다: `SpotLight.map` (PR [#14621](https://github.com/mrdoob/three.js/pull/14621), mbredif 2018 — *"generalizes the single-channel cookie concept to a 4-channel texture"*), 예제 `webgpu_lights_spotlight`·`webgpu_lights_projector`.
- 검색 결과는 전부 셋 중 하나였다: ① 손으로 그린 고보 이미지 ② **반대 방향** — 투영 결과를 모델에 굽기(<https://discourse.threejs.org/t/bake-spotlight-texture/65143>) ③ 일반 프로젝티브 텍스처링(<https://tympanus.net/codrops/2020/01/07/playing-with-texture-projection-in-three-js/>).
- 가장 근접: 2019년 Elias Hasle의 jsfiddle이 PointLight를 `CubeTexture`로 변조 (<https://discourse.threejs.org/t/how-to-write-light-function-shader-for-point-light-like-unreal-engine4/10207>) — 단 큐브맵이 환경 HDR이고 램프에서 구운 게 아니다.
- **즉 우리가 하려는 건 웹에서 선례가 없다.** 게임엔진에서 확립된 기법을 three.js로 옮기는 작업이다.

### ⭐ 게임엔진 저작 워크플로 — 이 기법의 정본은 Unity 공식 가이드다

**"Create High-Quality Light Fixtures in Unity", Pierre Yves Donzallaz, Unity Technologies, 2019-01-18**
<https://docs.unity3d.com/2019.3/Documentation/uploads/ExpertGuides/Create_High-Quality_Light_Fixtures_in_Unity.pdf>

> Today's real-time rendering engines cannot render all the intricate shadow details produced by a light fixture… Furthermore, **real-time Point Light shadows are still a performance dilemma for modern hardware**… **This is why baked light cookies are crucial to generate high-quality lighting for real-time applications.**

우리가 PointLight 그림자 6패스를 기각한 근거와 **정확히 같은 이유**를 Unity가 공식 문서에 적어놨다.

베이크 레시피(요약, 전부 원문 확인):
- 큐브를 안쪽 노멀로 뒤집고 Spherify → 구. 램프 검정, 구 흰색. 광원 소켓 위치에서 캡처.
- **"hide very large occluding elements of the lamp that are irrelevant"**
- **"128 to 512 cookies usually provide enough detail"**, cubemap은 6배 크기. **"Unity only requires 8-bit cookies"**
- 시임: `Fixup Edge Seams` / `Replicate Border` 임포트 플래그
- 2D 스팟용: **"ensure that the borders of the texture are 100% black, to prevent any obvious clipping at the edge of the light volume"**
- IES 한계 인정: **"a vast majority of IES profiles do not store a large amount of angular information… this produces blurry cookies in practice"**
- 대안 경로: Reflection Probe로 굽기 (DCC 없이)

**Unreal 랜턴 튜토리얼** — 브리프가 말한 그 사례, 원본 확인:
<https://blog.nameless.zanity.net/?p=145> (Nameless Voice, 2018-11-01)
> **The cubemap will effectively be a 360° view from the position of the light source, with white for the angles at which the light escapes the lamp and black for the angles where is obstructed.**
> **I created the cubemap for the lantern by making a copy of the model and placing it inside a sphere with flipped normals. I painted the model itself with a pure black material, and the sphere with a pure white one.**
> **To make sure that the engine shadows don't interfere with the fake, masked ones, make sure to turn Casts Shadows off on the lamp mesh.**
> Raytraced Distance Field Soft Shadows **don't work very well if the light source is actually *inside* the model which is supposed to cast the shadow.**

블러 큐브맵 생성엔 AMD CubeMapGen(Gaussian, Base Filter Angle 10)을 썼다.
**미확인**: GDC 발표나 Epic 공식 문서는 없다. 댓글 0개, 인용 0의 개인 튜토리얼이다 — 업계 표준이 아니라 한 실무자의 글로 취급할 것.

### 360° 레이아웃은 엔진마다 다르다 (호환 불가)

| 엔진 | 스팟 | 포인트/omni | 출처 |
|---|---|---|---|
| Unity | 2D | **Cubemap** | <https://docs.unity3d.com/Manual/texture-type-cookie.html> |
| PlayCanvas | 2D | **Cubemap** | <https://developer.playcanvas.com/tutorials/light-cookies/> |
| Godot | 2D (자유) | **Equirect 파노라마** (+ `shadow_enabled` 필수) | <https://docs.godotengine.org/en/stable/tutorials/3d/lights_and_shadows.html> |
| Unreal | Light Function 머티리얼 — 레이아웃 자유 | 동상 | <https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/LightFunctions/> |
| **three.js** | **2D (`SpotLight.map`)** | **없음** | 소스 확인 |

---

## 가용성 표

| 기법 | WebGPU | WebGL2 백엔드 | 그림자 병행 | 비대칭 | 360° | 코어 API |
|---|---|---|---|---|---|---|
| `SpotLight.map` (2D 쿠키) | ✅ 확정 | ✅ 추정(트랜스파일 확인, 실측 미검증) | ✅ (그리고 `castShadow` **불필요**) | ✅ 프러스텀 안에서 | ❌ | ✅ |
| `SpotLight.colorNode` (TSL 절차/블러/회전) | ✅ 확정 | ✅ 추정 | ✅ | ✅ | ❌ | ✅ |
| `ProjectorLight` (+`map`/`colorNode`) | ✅ 확정 | ✅ 추정 | ✅ | ✅ 사각 프러스텀 | ❌ | ✅ (`three/webgpu` 전용) |
| `IESSpotLight` | ✅ | ✅ 추정 | ✅ | ❌ **방사대칭 강제** | ❌ | ✅ |
| 커스텀 `PointLightNode` + `cubeTexture` | ✅ | ✅ (samplerCube 확인) | ✅ | ✅ | ✅ | ❌ 직접 구현 |
| 스팟 N개 방향 분할 | ✅ | ✅ | ✅ | ✅ | △ 이음매 | ✅ |
| `CubeCamera`+`CubeRenderTarget` 베이크 | ✅ | ✅ (면별 리드백 확인) | — | — | ✅ | ✅ |

---

## 이 방식이 무너지는 조건 (정직한 목록)

1. **쿠키는 빛을 "빼지" 못한다.** `inSpotLightMap.select(...)` (`SpotLightNode.js:156-158`) 때문에 프러스텀 밖은 마스크가 아예 적용되지 않고 풀세기로 남는다. 라이트의 원뿔/박스 감쇠가 이미 0인 영역에서만 마스크가 의미 있다. **"쿠키로 배광 모양을 만든다"가 아니라 "감쇠가 만든 모양 안을 쿠키로 조각한다"** — 설계가 이걸 헷갈리면 스크린바 요구사항이 바로 깨진다.
2. **수직 아래로 쏘는 램프는 회전해도 무늬가 안 돈다.** 쿠키 기저는 `lookAt(target)` + 월드 up으로 만들어지고 `light.rotation`을 안 본다(`LightShadow.js:209-210`). 현재 코드(`scene.ts:803-805`)의 램프 스팟은 광원과 타깃이 둘 다 그룹 회전축 위에 있어 yaw가 월드 위치를 안 바꾼다 → **무늬 고정.** `colorNode`에서 UV를 직접 회전시켜야 한다.
3. **베이크된 마스크는 각도 정보뿐, 거리를 모른다.** 무한 원방 가정이다. 셰이드에 아주 가까운 표면(램프 밑동 주변 책상)에서 원근 오차가 난다. Unity 가이드가 "구 반경 = 대표 수광 거리"를 강조하는 이유.
4. **동적 차폐를 못 한다 — 이 프로젝트에서 가장 아플 수 있는 항목.** 마스크는 램프 자기 기하만 안다. 사용자가 램프 옆에 다른 소품을 놓으면 그 소품이 만드는 그림자는 마스크에 없다. **배치 시뮬레이터라 "램프 옆에 물건 놓기"가 핵심 조작이다.** `castShadow`가 켜진 램프는 실시간 그림자로 이걸 잡지만, `LAMP_SHADOW_CAP=2`를 넘어간 램프는 무늬만 있고 실제 차폐가 없는 상태가 된다.
5. **램프 메쉬 그림자 끄기의 부작용.** Unreal 튜토리얼 권고대로 램프 메쉬의 `castShadow`를 끄면, **룸 키 라이트(`DirectionalLight`)가 만드는 램프의 정상 그림자도 같이 사라진다.** `Object3D.castShadow`는 메쉬 단위 플래그라 광원별로 못 끈다. `light.layers`로 분리 가능한지는 **미확인**. 이게 안 되면 램프의 접지 그림자를 잃거나, 자기 광원에서 셀프섀도 아티팩트를 감수해야 한다.
6. **360° 큐브 쿠키는 코어 밖이다.** 커스텀 노드 + `NodeLibrary` 등록 + `customCacheKey` 오버라이드까지 우리가 유지보수한다. three.js 라이팅 노드 내부 API는 안정 보장이 없다(r185만 해도 프로젝터 관련 회귀가 4건 있었다).
7. **`ProjectorLight` API가 확정이 아니다.** mrdoob이 머지 후 `light.shape = RectShape` 대안을 제시했고 스레드가 미결로 끝났다. `ProjectorLightHelper`도 없다. 나중에 마이그레이션 비용이 발생할 수 있다.
8. **WebGL2 폴백 실측 미검증 + SwiftShader 예산.** 쿠키 텍스처는 램프마다 샘플러 슬롯을 먹고, e2e 게이트가 소프트웨어 래스터다. 현재도 풀스위트가 누적 열화로 죽는 기록이 있다(`e2e/CLAUDE.md`). 램프 3~4개에 쿠키를 다 붙였을 때의 프레임 예산은 **재본 적 없다.**
9. **베이크 하네스가 SwiftShader 리드백에 걸리면 파이프라인 자체가 안 돈다.** `page.screenshot` 30초 타임아웃 전례가 있고, `readRenderTargetPixelsAsync`가 같은 운명인지 **모른다.** 착수 전에 이것부터 스파이크할 것.
10. **KTX2/gltfpack 압축은 마스크에 안 맞을 수 있다.** ETC1S/UASTC 블록 아티팩트가 부드러운 그라디언트에서 두드러지고, 밉 바이어스 블러(§6)가 그걸 증폭한다. 쿠키는 GLB 밖 별도 PNG로 두고 압축을 따로 판단하는 게 안전하다.
11. **IES는 백업 플랜이 못 된다.** `IESLoader`가 180×1로 축소해버려(§7) 방위각 구조가 원리적으로 불가능하다.

---

## 권고 (조사 결과 기반, 결정은 박동규)

1. **먼저 30분짜리 스파이크 2개**: ① `forceWebGL: true`에서 `SpotLight.map`이 도는가 ② `readRenderTargetPixelsAsync`가 xvfb+SwiftShader에서 리드백되는가. 둘 다 실패하면 계획 전체를 다시 짜야 한다.
2. **1차 범위는 2D 스팟 쿠키로 좁힌다.** 코어 API로 끝나고, 큐브 대비 6배 싸고, 박스 스탠드·아티초크·스크린바 4개 사례 중 3개를 커버한다. 360° 커스텀 노드는 큐브가 정말 필요한 제품이 나왔을 때.
3. **`map` 직접 대입 대신 `light.colorNode`를 기본 경로로.** 회전 보정(§1e 함정)과 거리 블러(§6)가 여기서만 가능하다. 비용은 같다.
4. **GLB 저작 규약에 `light_origin` 빈 노드를 추가**해야 베이크가 자동화된다. 조명 GLB가 아직 0장이니 지금이 정할 타이밍이다.
