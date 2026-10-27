# 점이 아닌 광원(선·면·링)을 실시간 렌더에서 표현하는 법 — 조사 결과

조사일: 2026-07-28 / 대상 렌더러: three.js **r185.1** (`frontend/node_modules/three` 실측) WebGPURenderer + WebGL2 폴백
표기 규칙: **[확인]** = 1차 출처로 검증 / **[추정]** = 내 추론(출처 없음) / **[미확인]** = 확인 못 함

---

## 요약 (먼저 읽을 것)

1. 실시간에서 "선/면 광원"은 **광원 개수를 늘려서** 만들지 않는다. **셰이딩 수식 1개**로 만든다. (Karis 2013이 다중 점 샘플링을 "완전히 비실용적"이라 못 박음)
2. 표준 기법은 둘뿐이다: **대표점(MRP)** — 싸고 근사, **LTC 해석적 적분** — 정확하고 조금 비쌈. three.js `RectAreaLight`가 이미 LTC다.
3. **그림자는 광원 형상과 이미 분리돼 있다.** Unreal·Godot·three.js 전부 "중심에서 그림자 1장 + 소프트니스 파라미터"다. 이건 타협이 아니라 업계 표준이다.
4. **램프 셰이드 메쉬로 빔을 깎는 방식은 업계가 안 쓴다.** IES 배광 선언 또는 라이트 함수/쿠키로 우회한다. three.js에서는 특히 위험하다(그림자 패스가 머티리얼과 반대 면을 렌더).
5. 데스크 스케일에서 "개별 LED가 보이는가"는 **발광면 룩(emissive/bloom)의 문제**이지 광원 개수의 문제가 아니다.

---

## Q1. 선형 광원(tube / line light) — 실시간 표준 기법

> **결론 한 줄: 표준은 (c) 대표점 근사(MRP)이고, 고품질이 필요하면 (b) LTC 선적분이다. (a) N개 점광원 샘플링은 오프라인 기법이며 원저자가 명시적으로 실시간에 부적합하다고 썼다.**

### (a) N개 점광원 샘플링 — 실시간에서는 탈락

Karis 2013 원문 (Area Lights 절):

> "In offline rendering, the common solution is to light from many points on the surface of the light source—either using uniform sampling or importance sampling. **This is completely impractical for real-time rendering.**"
> — https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf **[확인]**

### (b) LTC — Linearly Transformed Cosines

- 원논문(면광원): Heitz, Dupuy, Hill, Neubelt, *Real-Time Polygonal-Light Shading with Linearly Transformed Cosines*, ACM TOG 35(4):41, 2016. https://eheitzresearch.wordpress.com/415-2/ **[확인]**
- **선광원 확장**: Heitz & Hill, *Linear-Light Shading with Linearly Transformed Cosines*, GPU Zen (2017). https://hal.science/hal-02155101v1/file/LTC_linearlights_GPUZen.pdf **[확인]**
  - 저자 주장: "Linear lights are **cheaper to shade than polygons** and they provide a good approximation for thin emitting cylinders."
  - 저자가 밝힌 한계: "this approximation works well in many cases (**with the exception of wide cylindrical lights or highly specular materials**)"
  - 핵심 성질: LTC는 선적분 불변성(line-integral invariance)을 가져 선분에 대해 **상수 시간 해석적 적분**이 된다. 폐형식은 런타임에 쓰지 않고, **오프라인 피팅으로 만든 LUT**를 셰이더에서 룩업한다.
- 레퍼런스 구현: https://github.com/selfshadow/ltc_code **[확인]**

### (c) 대표점(Representative Point / MRP) — Karis 2013, UE4

- Sphere light: 반사 광선에 **가장 가까운 점**을 광원으로 삼는다.
- Tube light(capsule) = 선분 + 구의 합성. **확산(diffuse)은 선분에 대해 해석적 적분식이 존재**(Karis Eq. 15/16, 지평선 위 조건):
  `irradiance = 2·saturate( n·L0/(2|L0|) + n·L1/(2|L1|) ) / ( |L0||L1| + (L0·L1) + 2 )`
- Specular는 대표점 + **에너지 보존 정규화** (분포가 한 방향으로만 넓어지므로 anisotropic GGX 정규화 사용, `LineNormalization = α/α′`).
- **원저자가 인정한 결함**: "since both Equation 18 and 19 treat r as a **line instead of ray**, neither solution properly handles rays pointing away from the line segment. This can cause an **abrupt change from one end point to the other even for perfectly flat surfaces**. ... At the moment we simply accept the artifact." **[확인]**

### 프로덕션 사례 (실제 게임)

- elopezr(Star Wars Jedi 시리즈 라이트세이버), *Rendering Line Lights*: https://www.elopezr.com/rendering-line-lights/ **[확인]**
  - **확산 MRP와 스페큘러 MRP는 서로 다른 점**이다. 확산 MRP는 각 이등분선 정리로 `x = a/(b+a)`, 스페큘러 MRP는 반사 벡터 최근접점.
  - horizon handling 필수: 선분이 셰이딩 점의 접평면을 뚫으면 평면 교점으로 선분을 잘라야 한다.
  - 엔진 현황 정리(같은 글): UE4 = point light의 `Source Length`로 늘림 / Frostbite = tube light(원기둥+구 2개 해석적) / Unity HDRP = LTC 기반 tube / Guerrilla Decima = 늘린 quad light (GPU Pro 5, Drobot "Physically Based Area Lights")
- Frostbite(Lagarde & de Rousiers 2014, *Moving Frostbite to PBR*): sphere/disk/rectangle/tube 4형상 지원. **point·spot만 punctual 경로**, 나머지는 전부 area 경로 — 성능 때문에 분리. 스페큘러에 대해: "none of them stand up to comparison with the reference. **We have chosen to use the approach presented by Karis because it is fast** and still has good-looking results." https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf **[확인]**

### 비용·품질 요약 (Q1)

| | 품질 | 런타임 비용 | 비고 |
|---|---|---|---|
| N개 점광원 | 나쁨(하이라이트 N개로 분리) | O(N) 픽셀당 | 원저자가 실시간 부적합 선언 |
| MRP | 좋음(레퍼런스와 "convincingly matches") | 점광원 + dot/normalize 몇 개 | 반사광선이 선분 반대편일 때 튐 |
| LTC line | 매우 좋음 | LUT 페치 + 선적분 | 굵은 원통·매우 반짝이는 재질에서 붕괴 |

---

## Q2. 면 광원(rect / disk / sphere) — 같은 축

> **결론 한 줄: rect 면광원의 실시간 표준은 LTC이고 three.js `RectAreaLight`가 바로 그 구현이다. 구현 난도는 낮다(LUT가 addon으로 제공됨). 진짜 문제는 그림자가 아예 없다는 것.**

### 표준 = LTC

- Heitz et al. 2016 초록: "Our technique is **robust, fast, accurate and simple to implement**." **[확인]**
- 프로덕션화 후속 발표: Hill & Heitz, *Real-Time Area Lighting: a Journey from Research to Production*, SIGGRAPH 2016 Advances. https://advances.realtimerendering.com/s2016/s2016_ltc_rnd.pdf **[확인]**
  - 이 발표의 p.102 "horizon-clipped rectangle form factor 근사"가 **three.js 셰이더에 그대로 들어가 있다** (three.js `LTC_ClippedSphereFormFactor` 함수 주석이 이 페이지를 인용) **[확인]**
- Disk light: *Real-Time Line- and Disk-Light Shading*, SIGGRAPH 2017 shading course. ltc_code 저장소에 포함 **[확인]**

### 구현 난도 — 낮다 (LUT만 있으면 됨)

three.js r185 실측:
- 셰이더 측: `LTC_Uv` + `LTC_ClippedSphereFormFactor` + `LTC_EdgeVectorFormFactor` + `LTC_Evaluate` — 약 130줄.
- 데이터 측: **64×64 LUT 2장**(`LTC_FLOAT_1`/`LTC_FLOAT_2`, float32 필터링 미지원 기기는 half float 폴백). 이걸 addon이 제공한다:
  - WebGL: `RectAreaLightUniformsLib.init()`
  - WebGPU: `THREE.RectAreaLightNode.setLTC( RectAreaLightTexturesLib.init() )`
  - 로컬 확인: `frontend/node_modules/three/examples/jsm/lights/` 에 두 파일 모두 존재 **[확인]**
- 런타임 비용: 픽셀당 LUT 텍스처 페치 2회 + 사각형 4변 form factor.

### 진짜 문제 — 그림자 부재는 기법의 본질적 한계

LTC는 **셰이딩 적분만** 푼다. 가시성 항(V)은 적분에 들어가 있지 않다. 그래서 모든 엔진에서 area light의 그림자는 별도 문제다.

- three.js `src/lights/RectAreaLight.js` 소스 주석 **[확인]**:
  > "Important Notes: - **There is no shadow support.** - **Only PBR materials are supported.** - You have to include `RectAreaLightUniformsLib` (`WebGLRenderer`) or `RectAreaLightTexturesLib` (`WebGPURenderer`)"
- Unity: **Area 라이트는 realtime 자체가 불가**. URP 문서: "Mode — Note: If Type is set to Area, **this property is automatically set to Baked**." / Built-in 문서: "Because this lighting calculation is quite processor-intensive, **Area Lights aren't available at runtime and can only be baked into lightmaps**." https://docs.unity3d.com/Manual/urp/light-component.html , https://docs.unity3d.com/6/Documentation/Manual/Lighting.html **[확인]**
- Godot 4.7(dev)은 `AreaLight3D`를 새로 넣었고 그림자를 **지원한다** — 단 다음 조건으로 (Q4 참조).

### three.js RectAreaLight의 실제 제약 (r185 소스 실측) **[확인]**

- `MeshStandardMaterial` / `MeshPhysicalMaterial` 전용. Phong/Lambert/Basic 무시.
- 그림자 없음.
- 단면 발광(한쪽 면만 비춤). 뒷면은 어둡다.
- 광속 관계가 API에 박혀 있다: `power = intensity × width × height × π` — 즉 **크기를 키우면 자동으로 총 광속이 커진다**. 크기를 바꿔도 밝기를 유지하려면 `power`를 세팅해야 한다.
- 원형(디스크/링)은 없다. 사각형만.

---

## Q3. N개 점광원으로 스트립을 근사할 때의 실무 규칙

> **결론 한 줄: 렌더링 기법으로는 틀린 접근이다(품질도 2안보다 나쁘고 비용은 N배). 다만 "광학적으로 몇 mm 간격이면 밴딩이 사라지는가"에는 정량 공식이 있고, 그건 조명 제품 설계용이지 렌더러 설계용이 아니다.**

### 렌더링 측 — 왜 무너지는가

1. **원저자가 부적합 선언**. Karis 2013(위 인용) **[확인]**
2. **three.js WebGL 경로에서 라이트 개수는 셰이더 프로그램 캐시 키다.** r185 `build/three.module.js` 실측: `array.push( parameters.numPointLights )`, 그리고 셰이더 전처리에서 `.replace( /NUM_POINT_LIGHTS/g, parameters.numPointLights )`. → **라이트를 하나 추가/제거할 때마다 씬 전체 머티리얼의 셰이더가 재컴파일된다.** 사용자가 조명 제품을 드래그로 놓는 UX에서는 이게 프레임 스파이크로 직결된다. **[확인]**
3. 각 라이트가 forward 경로에서 픽셀당 BRDF 평가를 1회씩 추가한다(루프 언롤).
4. 품질: 러프니스가 낮은 표면에서 **하이라이트가 N개의 분리된 점으로 보인다**. 이건 샘플 수를 늘려야만 사라지는데, 늘리면 (2),(3)이 터진다.
5. 대안이 이미 three.js에 있다: r185 addon **`ClusteredLightsNode`** (`examples/jsm/tsl/lighting/ClusteredLightsNode.js`) — Forward+ 클러스터드 셰이딩. 단 **WebGPU 전용**(`import ... from 'three/webgpu'`). WebGL2 폴백에서는 못 쓴다. **[확인]**

### 광학 측 — 간격 공식은 존재한다 (하지만 용도가 다르다)

- **Moreno, Avendaño-Alejo, Tzonchev, "Designing light-emitting diode arrays for uniform near-field irradiance", Applied Optics 45(10):2265 (2006)** **[확인]**
  - 각 LED를 불완전 Lambertian(cos^m)으로 모델링하고, **Sparrow 기준(maximally flat condition)** 으로 최적 LED 간격 d₀를 유도한다. 이계도함수를 0으로 놓아 두 패턴 사이의 골을 없애는 방식.
  - 선형 배열 실측 예: FWHM 반각 θ₁/₂ = 8.44° → m = 64.66 → **d₀ = 0.189 z** (z = 광원–타깃 거리). 즉 배광이 좁을수록 촘촘히, 넓을수록 성기게.
  - 원문 PDF: https://www.hydrotekhydroponics.com/img/ApplOpt2006.pdf
- **제조사 경험칙**: 확산 거리 D ≥ **1.5 × 다이오드 피치 P**. 미달하면 "ladder effect / tiger striping"(사다리 무늬). https://www.adledlights.com/achieving-perfect-uniformity-in-ultra-thin-stretch-ceilings-...html **[확인]** (단 상업 블로그 출처 — 학술 검증은 아님)
- **실측 사례(SMD3528 스트립)**: 표면에서 **10~15 mm** 이격 또는 함몰시키면 불균일이 눈에 안 띔. https://www.xopc.net.ua/en/korysna-informatsiia-3/... **[확인]** (제조사 자료)

> ⚠️ 이 공식들은 **실제 조명 제품이 벽/확산판에 만드는 조도 균일도**에 대한 것이다. 렌더러에서 N개 `PointLight`를 놓는 것과 1:1 대응하지 않는다. 렌더에서는 (a) 폴오프 자체는 각 점광원마다 여전히 1/r²이고 (b) 그림자가 N겹으로 겹치는 별개 문제가 생긴다. **[추정 — 대응 관계를 다룬 출처는 못 찾았다]**

### 광속을 N으로 나누는 게 맞나 — 맞다, 정규화는 업계 표준이다

- three.js `RectAreaLight`: `power = intensity × width × height × π` (면적으로 정규화가 API에 명시) **[확인]**
- Godot `AreaLight3D.area_normalize_energy` (기본 `true`): "Defines whether the energy is **normalized (divided) by the surface area** of the light. If set to `true`, changing the size does not affect the total energy output." **[확인]**
- Unreal point light `Source Length`: "It **spreads the intensity along the length** so a longer light becomes perceptually dimmer." (elopezr 정리) **[확인]**

→ N개로 쪼개면 **각 광원에 φ/N**을 주는 것이 맞다. 다만 **그림자를 N개 다 켜면 밝기는 맞아도 penumbra가 N겹 계단으로 보인다** — 그래서 실무는 "그림자는 1개만" (Q4). **[추정 — 계단 현상 자체를 명시한 출처는 못 찾았으나, Q4의 엔진 관행이 이를 뒷받침]**

---

## Q4. 그림자를 광원 개수와 분리하는 패턴

> **결론 한 줄: 그렇다. "중심에서 그림자 맵 1장 + 소프트니스 파라미터(PCSS/거리장)"가 Unreal·Godot의 명시된 표준이고, Unity는 아예 area 그림자를 런타임에 안 만든다.**

### Godot — 문서에 대놓고 써 있다

`AreaLight3D` (4.7 dev) **[확인]** https://docs.godotengine.org/en/latest/classes/class_arealight3d.html
> "Area lights can cast soft shadows using PCSS, which you can control by tweaking the `size` parameter. **The shadow map is drawn from the center of the light.**"
> "Performance: Area lights are more demanding on the GPU compared to omni and spot lights. In Forward+, **there is an additional GPU cost on all rendered objects as soon as one area light is present in the view frustum** (due to the nature of clustered lighting). Consider using them only for cinematics or when targeting high-end devices."
> "In Compatibility, **area lights cannot cast shadows**."

`Light3D.light_size` **[확인]** https://docs.godotengine.org/en/latest/classes/class_light3d.html
> "The **simulated** size of the light in Godot units, affecting shading and shadows. For OmniLight3D s and SpotLight3D s, increasing this value **simulates a spherical area light**, expanding the size of specular highlights. If shadows are enabled, a penumbra is rendered... **For AreaLight3D s, only the shadows are affected.** Penumbras are simulated with percentage-closer soft shadows, or PCSS, which has a noticeable performance cost for values above 0.0."

→ Godot의 설계가 정확히 "**형상 파라미터 하나가 셰이딩과 그림자 소프트니스를 동시에 구동, 그림자 맵은 중심에서 1장**"이다.

### Unreal — 같은 패턴, 문서 곳곳에 흔적

- elopezr(위 글) **[확인]**: "For shadow mapping there is a simple option which is to treat it like a point light, and make **shadows emanate from the center**, using a cubemap or dual paraboloid which are popular shadowing methods. **This is what Unreal Engine does.**"
- Distance Field Soft Shadows 문서 **[확인]** https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/RayTracedDistanceFieldShadowing/
  > "For Point and Spot Lights, the **Source Radius** is used to determine how large shadow penumbras are on a light. Area shadows are computed with sharp contacts that get softer over long distances."
- Rect Light `Use Area Shadows for Stationary Light` **[확인]**: "causes the shadows to get softer as the distance from the caster increases"
- **결정적 증거**: `PointLightComponent`/`SpotLightComponent`/`RectLightComponent` API 문서가 `source_radius`, `source_length`, `source_width`, `source_height` 전부에 같은 경고를 단다 **[확인]**:
  > "Note that **light sources shapes which intersect shadow casting geometry can cause shadowing artifacts**."
  → 광원 "형상"과 그림자 투영이 **독립적으로 계산**되기 때문에 생기는 부작용이다. 분리돼 있다는 직접 증거.

### Unity — 분리가 아니라 포기

- URP: Area 라이트는 Mode가 Baked로 자동 고정 **[확인]**
- `GraphicsSettings.realtimeDirectRectangularAreaLights`: "If it is false, direct lighting for rectangular area Lights is **assumed to be baked**." **[확인]** https://docs.unity3d.com/ScriptReference/Rendering.GraphicsSettings-realtimeDirectRectangularAreaLights.html
- HDRP는 LTC 기반 area light를 실시간 지원(Heitz 본인이 Unity 소속) — 다만 이 조사에서 HDRP의 area 그림자 방식 문서를 직접 확인하지 못했다 **[미확인]**

### three.js — 그림자는 라이트 타입에 묶여 있다 (r185 실측) **[확인]**

| 라이트 | 그림자 | 씬 렌더 패스 |
|---|---|---|
| `DirectionalLight` | 정사영 1장 | 1 |
| `SpotLight` | 원근 1장 | 1 |
| `PointLight` | 큐브 6면 | **6** (`WebGLShadowMap`이 `_cubeDirections[face]` 6방향 루프) |
| `RectAreaLight` | **없음** | 0 |
| `IESSpotLight`(WebGPU) | 스팟 그림자 1장 | 1 |

→ **`RectAreaLight`로 셰이딩하고 그림자는 별도 `SpotLight`가 담당하는 조합이 three.js에서 "대표 그림자 1장" 패턴을 구현하는 유일한 길**이다. 두 라이트의 intensity를 나눠 이중 계상을 피해야 한다. **[추정 — three.js 공식 권장 패턴은 아니다. 문서에 이런 조합을 안내한 곳을 못 찾았다]**

---

## Q5. 광도 저작(photometric) — IES 배광 프로파일

> **결론 한 줄: 실시간에서 널리 쓰이는 1급 기능이고 three.js에도 있다(단 WebGPU 전용). 하지만 IES는 "방향별 세기"만 기술한다 — 광원의 물리적 크기(penumbra·면 하이라이트)는 표현하지 못하므로 면광원의 대체재가 아니라 보완재다.**

### 개념 — 정확히 "형상 시뮬레이션 없이 광원 모양을 선언"하는 것

Unreal IES 문서 **[확인]** https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/IESLightProfiles/
> "IES Photometric files, or IES Profiles, are a lighting industry standard method of diagramming the brightness and falloff of light as it exits a particular real world light fixture. **It enables them to account for reflective surfaces in the light fixture, the shape of the light bulb, and any lensing effects that happens.**"
> "In UE4, IES Light Profiles are a **1D texture (gradient)**. ... The curve works like a multiplier for the overall brightness of the light, **as if you were projecting a texture from a light, but without the overhead of using a texture**."
> "**IES Profiles render very fast and do not have a significant effect on performance, making them a more ideal option for shaping your light than a Light Function.**"
> 적용 가능 라이트: **Point, Spot, Rect**

### 실시간 채택 현황

- **Unreal**: 위. 제조사 배포 관행도 명시 — "almost all major lighting manufacturers provide them free of charge" **[확인]**
- **Unity HDRP**: 전용 `.ies` 임포터 존재. Point / Spot(Cone·Pyramid·Box) / **Area(Rectangular)** 지원. **[확인]** https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.5/manual/IES-Importer.html
  > "The main benefit of using IES profiles over cookies is that **light manufacturers provide the profiles**. This means that they are **physically accurate to the real-world light they represent** and also artists do not need to dedicate time authoring them."
  - 구현: Point는 큐브맵 쿠키, Spot/Area는 Gnomonic 투영 2D 쿠키로 굽는다.
- **Frostbite**: "An IES profile can be attached to our punctual lights... available from manufacturers' websites" **[확인]**

### three.js에서 가능한가 — 가능하다, 단 WebGPU 전용

r185 로컬 실측 **[확인]**:
- `examples/jsm/loaders/IESLoader.js` 존재 → `.ies` 파싱 → `DataTexture(180×1, RedFormat)` 생성
- `THREE.IESSpotLight` + `spotLight.iesMap = texture`
- **`build/three.webgpu.js`에 `IESSpotLight` 6건, `build/three.module.js`(WebGL)에 0건** → **WebGL2 폴백에서는 쓸 수 없다.** 이 프로젝트에 직결되는 제약.
- 공식 예제: https://threejs.org/examples/webgpu_lights_ies_spotlight.html (4개 IES 스팟, `castShadow = true`로 그림자도 정상)
- 구현 방식: `IESSpotLightNode.getSpotAttenuation()`이 기본 원뿔 감쇠를 **IES 텍스처 룩업으로 교체**한다. 즉 **감쇠 커브를 배광 커브로 갈아끼우는 것**이고, 그림자는 기존 스팟 그림자 1장 그대로.

### 한계 (중요)

- **IESLoader는 수직각 180개 샘플의 1D 텍스처만 만든다** — 수평 방향은 대칭 처리된다(파서 코드에서 horizontal 각도 대칭 폴딩). **좌우 비대칭 배광(벽등, 편측 조사 모니터라이트)은 손실된다.** **[확인, 코드 실측]**
- IES는 **세기 분포**만 준다. 발광면 크기가 없으므로 **penumbra 크기도, 길쭉한 스페큘러 하이라이트도 나오지 않는다.** LTC/MRP의 대체재가 아니다.
- **제품 스펙시트와의 대응**: 조명 제조사가 `.ies`를 배포하는 것은 업계 관행이지만, **국내 데스크 조명 제품(모니터라이트·LED 스탠드)이 IES를 공개하는지는 확인하지 못했다** **[미확인]**. 일반 스펙시트에는 보통 광속(lm)·색온도(K)·CRI·거리별 조도(lux)만 있고 배광 곡선은 없는 경우가 많다 **[추정]**. → IES 없이 **조도 스펙(예: 40cm에서 500lux)만으로 스팟 감쇠 커브를 역산**하는 것이 현실적 대안일 수 있다 **[추정]**.

---

## Q6. 기하 차폐로 빔을 만드는 접근의 실무 함정

> **결론 한 줄: 업계는 이 방식을 쓰지 않는다. 램프 형상은 IES 배광 또는 (라이트 함수/쿠키용으로) 오프라인에 구운 마스크로 "선언"하고, 램프 메쉬 자체의 그림자 투영은 끈다. three.js에서 직접 하면 (a)~(d) 전부 터진다.**

### (a) 메쉬가 닫혀 있지 않으면

그림자 맵은 깊이만 기록한다. 열린 면 방향으로는 차폐 정보가 없어 빛이 그대로 샌다. 반구 셰이드 껍데기면 아래로 향하는 빛이 전혀 차단되지 않는다. → 원뿔이 안 깎인다. **[추정 — 그림자 맵 원리상 자명. 명시 출처는 못 찾음]**

### (b) 단면(single-sided) 재질이면 — three.js의 구조적 함정

r185 `build/three.module.js:9100` 실측 **[확인]**:
```js
const shadowSide = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };
```
→ three.js는 self-shadow acne를 피하려고 **머티리얼과 반대쪽 면을 그림자 맵에 렌더**한다.
- 램프 셰이드(법선 바깥, `FrontSide`) 안에 점광원을 두면, 그림자 패스에서는 `BackSide`(= 셰이드 **내벽**)만 그려진다.
- 두께가 0인 껍데기면 앞뒤 면이 같은 위치라 z-fighting / 자기 그림자가 난다.
- `material.shadowSide`를 수동 지정할 수 있으나 `DoubleSide`로 강제하면 self-shadowing acne가 나고, 이를 `shadow.bias`로 밀면 **Peter-panning**(그림자가 물체에서 떨어짐)이 생긴다. three.js 이슈에 반복 보고된 패턴:
  - https://github.com/mrdoob/three.js/issues/8692 — "Shadows on materials with THREE.DoubleSide rendered badly" / WestLangley: "It appears to be **self-shadowing artifacts**. Try `light.shadow.bias = -0.001`" / mrdoob: "the trade-off is **Peter-panning**" **[확인]**
  - https://github.com/mrdoob/three.js/issues/3544 — "By default, **front faces are culled when rendering shadows**... **Give your petals some depth.**" **[확인]**
  - https://discourse.threejs.org/t/shadows-intersecting-on-flat-2-sided-objects/36824 — "the wall is **too thin**" **[확인]**

### (c) 내부 지오메트리 없는 에셋 (AI 생성 GLB는 겉면만)

(b)의 최악 케이스다. **두께 0 껍데기 + 단면 재질**이면 위 이슈들이 전부 동시에 터진다. 그리고 이건 에셋 파이프라인으로 강제할 수 없는 성질이다 — GLB 제작자에게 "셰이드 안쪽 면도 만들어 주세요"를 요구해야 하는데, 그게 되면 애초에 이 방식을 쓸 이유가 줄어든다. **[추정 — 근거는 (b)의 확인된 이슈들]**

### (d) 큐브 섀도우 비용

- `PointLight` 그림자는 **씬을 6번 렌더**한다. r185 `WebGLShadowMap`이 `_cubeDirections[face]` 6방향 루프를 돈다 **[확인, 소스 실측]**. 원리 설명: https://ogldev.org/www/tutorial43/tutorial43.html ("Since the same scene is rendered six times in the first rendering pass we call this **Multipass** Shadow Mapping") **[확인]**
- 메모리도 같은 해상도의 스팟 대비 6배.
- **SwiftShader(소프트웨어 래스터) e2e에서는 이 6패스가 CPU 시간으로 그대로 실린다.** 조명 제품 3개면 그림자 패스만 18회다.
- 참고: r185 `WebGLShadowMap`은 VSM을 PointLight에 아예 금지한다("VSM shadow maps are not supported for PointLights") **[확인]**

### 업계는 어떻게 우회하나

1. **IES 배광 선언** — Unreal 문서가 직접 비교: "IES Profiles render very fast ... **a more ideal option for shaping your light than a Light Function**" **[확인]**
2. **오프라인에 구운 큐브맵 마스크 + 라이트 함수** — 랜턴 사례가 정확히 이것 **[확인]** https://blog.nameless.zanity.net/?p=145
   - 램프 모델을 **순검정**, 감싸는 뒤집힌 구를 **순백**으로 칠해 광원 위치에서 큐브맵을 렌더 → 그게 마스크.
   - 거리에 따라 **sharp 큐브맵과 blurred 큐브맵을 lerp**해 penumbra까지 흉내낸다.
   - 그리고 **"To make sure that the engine shadows don't interfere with the fake, masked ones, make sure to turn Casts Shadows off on the lamp mesh."** ← 램프 메쉬의 그림자 투영을 끈다. 기하 차폐를 명시적으로 버린다.
3. 라이트 함수의 제약도 문서화돼 있다 **[확인]**: Static 라이트 불가, **Rect Light 미지원**("Light functions are supported within VolumetricFog, but only for Directional, Point and Spot lights. **Rect lights are not supported.**"), forward 렌더러에선 shadow map 채널 때문에 cast shadows가 켜져 있어야 동작.

### three.js의 대응물 **[확인, r185 실측]**

- `SpotLight.map` — 쿠키 텍스처. WebGL/WebGPU 둘 다.
- `ProjectorLight` — 사각형 투영 라이트. **WebGPU 전용**(`three.webgpu.js`에만 존재). `colorNode`로 TSL 절차적 마스크 가능. https://github.com/mrdoob/three.js/pull/31022
- `IESSpotLight` — WebGPU 전용 (Q5).

---

## Q7. 여러 발광 포인트를 가진 실제 LED 조명의 광학

> **결론 한 줄: "개별 LED가 보이는가"에는 far-field 시작 거리라는 명확한 물리 기준(대략 최대 치수의 3~5배)이 있다. 데스크 스케일에서 모니터라이트는 이 기준상 far-field가 아니지만, 그건 "점광원 1개가 틀렸다"는 뜻이지 "점광원 N개를 놔야 한다"는 뜻이 아니다 — 면광원 1개가 정답이다. 렌더에서 개별 LED 구분은 조명 계산이 아니라 발광면 룩의 문제다.**

### 정량 기준 — far-field 시작 거리

- **IES LM-79-2019**: 근-Lambertian 배광은 최소 측정 거리 = **광원 최대 치수의 5배** ("five times rule") **[확인]** — CIE x051 2025 논문 P0217이 인용. https://files.cie.co.at/x051_2025/P0217_ID241GuillaumeDotreppe_OA_with_cover.pdf
- **CIE S 025:2015** 권고 (같은 논문 표) **[확인]**:

  | 조건 | 최소 측정 거리 |
  |---|---|
  | cos(Lambertian) 배광 | ≥ 5 × |
  | 넓은 비-cos 배광 | ≥ 10 × (beam) |
  | 좁은 배광 / 급경사 배광 | ≥ 15 × |
  | **발광부 사이에 큰 비발광 공간이 있는 배열** | **≥ 15 × (발광부 + 간격)** |

- **Sun et al., Crystals 10(5):360 (2020), "Illuminance and Starting Distance of the Far Field of LED-Array Luminaire"** **[확인]** https://doi.org/10.3390/cryst10050360
  - "SDFF(far-field 시작 거리) is **at most five times** that of the luminaire dimension, even when the divergent angle of the hollow array is 30°. **When the divergent angle is >90°, SDFF is only three times** that of the luminaire dimension."
  - **핵심**: 실제 LED 모듈을 **점광원 또는 flat-extended source로 치환해도 정규화 상호상관(NCC) > 99%** — far-field에서는 단순 모델이 충분하다는 실증.
  - 그리고 "hotspot merges" 이후 중심 조도가 역제곱을 따른다.
- **반례 / 주의**: Skarżyński, Żagan, Krajewski, *Energies* 14(15):4646 (2021) **[확인]** https://doi.org/10.3390/en14154646
  - 다광원 LED luminaire의 측광 거리는 전체 치수뿐 아니라 **칩 배치 기하 + 개별 칩의 최소 발산각**에 좌우된다.
  - 거울/투광 광학이 있으면 5× 규칙이 크게 틀린다 — **직경 20cm 자동차 헤드램프의 측광 거리가 25 m**로 잡힌다.
  - 저자 제안: 조명 시각화(.ies 기반 시뮬레이션)를 개선하려면 **mid-field 광학 모델**이 필요하다.

### 확산판 앞의 거리

- SMD3528 스트립 실측: 표면에서 **10~15 mm** 이격/함몰이면 불균일이 사라짐 **[확인, 제조사 자료]**
- 제조사 경험칙: 확산 거리 D ≥ **1.5 × 다이오드 피치 P** **[확인, 제조사 자료]**

### 데스크 스케일 대입 **[추정 — 아래 산술은 내 계산]**

- 모니터라이트 발광부 폭 ≈ 400~500 mm, 책상까지 거리 ≈ 300~400 mm → 거리/치수 ≈ 0.7~1.0. **5× 기준의 far-field가 전혀 아니다.**
- LED 스트립 1 m를 벽에서 100 mm 띄우면 거리/길이 = 0.1. 더 심하다.
- → **역제곱 점광원 1개는 이 스케일에서 원리적으로 틀렸다.** 이건 "선/면 광원을 써야 한다"는 근거이지, "점광원을 여러 개 놔야 한다"는 근거가 아니다.

### 렌더에서 의미 있는 구분은 3가지 **[추정 — 위 근거들의 종합]**

| 실제 제품 | 광학적 성격 | 렌더 표현 |
|---|---|---|
| 백열구, 노출 소형 LED 벌브 | 진짜 점광원 | `PointLight` (+ 작은 source radius 개념) |
| 확산판 뒤 LED 배열 — 모니터라이트, LED 패널, 링라이트 | **하나의 균일 면/선 광원** (far-field 여부와 무관하게 발광면이 이미 균일) | `RectAreaLight` 1개 |
| 확산판 없는 노출 LED 스트립 | 근거리에서만 개별 다이오드 보임 | 조명은 **선광원 1개**, 개별 다이오드는 **emissive 텍스처 + bloom** |

**핵심**: "개별 LED가 보인다"는 것은 **관측자가 광원을 직접 볼 때의 겉모습**이지, **광원이 다른 물체를 비추는 방식**이 아니다. 전자는 발광 메쉬의 텍스처/블룸 문제, 후자는 셰이딩 적분 문제다. 두 문제를 하나의 "광원 개수"로 풀려는 게 현재 설계의 혼선이다.

---

## 기법 비교표

| 기법 | 품질 | 런타임 비용 | 그림자 가능 | three.js 가용성 (r185) | 이 프로젝트 적합도 |
|---|---|---|---|---|---|
| **점광원 1개** (현재 방식) | ✗ 선/면 광원에 원리적으로 틀림. 폴오프·하이라이트 모두 오류 | 최저. 그림자 켜면 **6패스** | ○ (큐브 6면) | 기본 | 장식 발광·전구형에만 |
| **스팟 1개** | △ 방향성만. 면 특성 없음 | 최저. 그림자 1패스 | ○ (1패스) | 기본 | **기본값으로 적합** |
| **스팟 + IES 배광** | ○ 실제 제품 배광 재현. 면 특성은 여전히 없음 | 스팟 + 1D 텍스처 페치 | ○ (1패스) | **WebGPU 전용** (`IESSpotLight`) | 조건부 — WebGL 폴백 필요 |
| **스팟 + 쿠키(`map`)** | ○ IES와 유사, 마스크를 직접 저작 | 스팟 + 2D 페치 | ○ (1패스) | ○ 양쪽 다 | IES의 WebGL 폴백으로 적합 |
| **N개 점광원** | ✗ 하이라이트 N개 분리, 그림자 N겹 | **O(N)** + **셰이더 재컴파일** | △ (전부 켜면 6N패스) | 기본 | **비권장** |
| **MRP 선광원** | ○○ 레퍼런스에 근접 | 점광원 + α | ✗ 직접 구현 필요 | ✗ **없음**. TSL 커스텀 필요 | 고비용 — WebGL 폴백 불가 |
| **LTC 면광원 (`RectAreaLight`)** | ○○ 면 특성 정확, wrap lighting·길쭉한 하이라이트 | LUT 페치 2회 + form factor | ✗ **없음** | ○ 양쪽 다 (LUT addon 초기화 필요) | **핵심 후보** |
| **LTC 선광원** | ○○○ 선광원 최고 품질 | LTC + 선적분 | ✗ | ✗ **없음**. TSL 커스텀 필요 | 오버엔지니어링 |
| **기하 차폐(셰이드 메쉬)** | ✗ 에셋 품질 의존, acne/Peter-panning | 큐브 6패스 | ○ (본질적으로 그림자) | 기본 | **비권장** — 업계도 안 씀 |

---

## 스트립 조명 하나를 렌더하는 현실적 방법 3안 (비용순)

### 1안 — 스팟 1개 + 배광 선언 + 발광 메쉬  ★가장 쌈

```
SpotLight × 1 (castShadow = true)
  + IES 또는 쿠키 텍스처로 배광 선언 (WebGPU: IESSpotLight, WebGL: SpotLight.map)
  + 발광면 Mesh (emissive) + bloom
```

- **비용**: 라이트 1개, 그림자 1패스. SwiftShader에서 가장 안전.
- **대가**:
  - 면광원 특유의 **wrap lighting**(부드러운 명암 전이)이 안 나온다.
  - **길쭉한 스페큘러 하이라이트가 안 나온다** — 광택 있는 책상 표면에 스트립이 점으로 비친다. 데스크테리어의 핵심 룩을 잃는다.
  - IES는 WebGPU 전용이라 **두 경로에 다른 에셋을 유지**해야 한다(IES ↔ 쿠키 PNG).
- **적합**: MVP, 저사양 프리셋, e2e 기본 경로.

### 2안 — RectAreaLight(셰이딩) + SpotLight(대표 그림자 1장)  ★균형점, 권장

```
RectAreaLight × 1  → 셰이딩 담당 (그림자 없음)
SpotLight    × 1  → 그림자 담당 (castShadow = true), 같은 위치·방향
두 라이트의 intensity를 나눠 이중 계상 방지 (예: rect 0.7 / spot 0.3)
```

- **근거**: Q4에서 확인한 상용 엔진 표준(중심 그림자 1장 + 소프트니스)을 three.js 제약 안에서 재현하는 유일한 방법.
- **비용**: 라이트 2개, 그림자 1패스, 픽셀당 LUT 페치 2회. **1안 대비 그림자 패스는 늘지 않는다.**
- **대가**:
  - **intensity 분배가 수동**이다. 룰을 하나 정해 전 제품에 일관 적용해야 한다(예: 항상 0.7/0.3). 안 그러면 제품마다 밝기가 튄다.
  - `RectAreaLight`는 **`MeshStandardMaterial`/`MeshPhysicalMaterial` 전용**. 씬에 Phong/Lambert가 남아 있으면 그 물체만 안 비친다.
  - **LUT 초기화가 렌더러별로 다르다** — WebGL `RectAreaLightUniformsLib.init()`, WebGPU `RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`. 폴백 분기 필요.
  - 그림자 penumbra는 spot 그림자의 PCF 반경으로만 조절된다 — **광원 폭과 물리적으로 연동되지 않는다**. 폭을 파라미터로 받아 PCF 반경에 매핑하는 룰을 만들어야 한다.
  - **링라이트는 사각형 근사**가 된다(three.js에 디스크 area light 없음). 정면에서 볼 땐 큰 문제 없지만 반사에는 원형이 안 보인다.
  - `RectAreaLight`는 **단면 발광** — 뒷면은 안 비친다. 배치 시 방향을 반드시 관리해야 한다.
- **적합**: **모니터라이트·바 조명·LED 패널·링라이트를 전부 이 하나로 커버할 수 있다.** 제품 규격 DB의 `발광면 폭 × 높이(mm)`가 그대로 `width × height`로 들어간다 — 실측 규격 기반이라는 프로젝트 원칙과 정합한다.

### 3안 — N개 점광원(3~5개) + 그중 1개만 castShadow  ★가장 비쌈, 그리고 품질도 나쁨

```
PointLight × N  (각 intensity = φ/N)
  → 그중 1개만 castShadow = true, 나머지는 그림자 없음
```

- **비용**: 픽셀 비용 N배 + **라이트 개수 변동마다 셰이더 전체 재컴파일**(WebGL 경로, r185 실측 확인). 그림자는 6패스 1세트로 억제.
- **대가**:
  - **품질이 2안보다 명백히 나쁘다.** 스페큘러가 N개의 분리된 하이라이트로 보이고, 폴오프는 여전히 각각 1/r²이다. 원저자(Karis)가 "완전히 비실용적"이라 한 방식의 축소판이다.
  - 사용자가 제품을 드래그로 옮길 때 재컴파일 스파이크.
  - N을 몇으로 할지에 물리적 근거가 없다(Q3의 LED 간격 공식은 **조명 제품 설계용**이지 렌더러용이 아니다).
- **유일한 이득**: 기존 코드 구조(제품당 라이트 N개)를 그대로 쓴다.
- **권고**: **채택하지 말 것.** 굳이 한다면 N ≤ 3, φ/N 정규화 필수, 그림자는 반드시 1개만.

---

## 이 프로젝트에 대한 추가 메모

1. **WebGPU/WebGL2 두 경로의 기능 격차가 설계를 좌우한다** (r185 실측):

   | 기능 | WebGPU | WebGL2 폴백 |
   |---|---|---|
   | `RectAreaLight` (LTC) | ○ (`RectAreaLightTexturesLib`) | ○ (`RectAreaLightUniformsLib`) |
   | `IESSpotLight` | ○ | **✗** |
   | `ProjectorLight` | ○ | **✗** |
   | `ClusteredLightsNode` (Forward+) | ○ (addon) | **✗** |
   | `SpotLight.map` 쿠키 | ○ | ○ |

   → **`RectAreaLight` + `SpotLight` + `SpotLight.map`만이 양쪽에서 동일하게 동작한다.** 2안이 이 교집합 위에 서 있다는 게 큰 장점이다.

2. **그림자 패스 예산을 광원 개수와 분리해 관리하라.** 프레임당 그림자 패스 수 = Σ(스팟·디렉셔널 1) + Σ(포인트 6). SwiftShader e2e에서는 이게 프레임 타임의 지배 항이다. **"조명 제품 몇 개까지 그림자를 켤 것인가"를 개수 상한으로 명시**하고, 초과분은 그림자 없이 셰이딩만 하는 게 표준 접근이다(Unreal의 Shadow Map Caching도 같은 문제의식 — 캐싱으로 14.89ms → 0.9ms, 약 16배).

3. **규격 DB 정합성**: 2안은 제품 규격에서 **발광면 치수(mm)와 총 광속(lm)** 두 필드만 있으면 구동된다. `RectAreaLight.power`가 lm 단위를 직접 받으므로 `power = 제품 광속(lm)`, `width/height = 발광면 규격(mm→m)` 매핑이 1:1이다. 메쉬-규격 분리 원칙에 어긋나지 않는다.

4. **미확인으로 남은 것들**:
   - Unity HDRP의 area light **그림자** 처리 방식 (LTC 셰이딩은 확인, 그림자는 문서 미확인)
   - 국내 데스크 조명 제품의 IES 파일 공개 여부
   - three.js에서 "RectAreaLight 셰이딩 + SpotLight 그림자" 조합의 공식 권장 사례 (커뮤니티 사례도 못 찾았다 — 직접 검증이 필요하다)
   - N개 점광원 근사 시 그림자 penumbra 계단 현상을 정량화한 문헌

---

## 출처 목록

**논문 / 발표**
- Heitz, Dupuy, Hill, Neubelt (2016), *Real-Time Polygonal-Light Shading with Linearly Transformed Cosines*, ACM TOG 35(4):41 — https://eheitzresearch.wordpress.com/415-2/ , https://dl.acm.org/doi/10.1145/2897824.2925895
- Heitz & Hill (2017), *Linear-Light Shading with Linearly Transformed Cosines*, GPU Zen — https://hal.science/hal-02155101v1/file/LTC_linearlights_GPUZen.pdf
- Hill & Heitz (2016), *Real-Time Area Lighting: a Journey from Research to Production*, SIGGRAPH Advances — https://advances.realtimerendering.com/s2016/s2016_ltc_rnd.pdf
- LTC 레퍼런스 구현 — https://github.com/selfshadow/ltc_code/
- Karis (2013), *Real Shading in Unreal Engine 4*, SIGGRAPH course notes — https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf
- Lagarde & de Rousiers (2014), *Moving Frostbite to PBR 3.0* — https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
- elopezr (2019), *Rendering Line Lights* — https://www.elopezr.com/rendering-line-lights/
- Moreno, Avendaño-Alejo, Tzonchev (2006), *Designing LED arrays for uniform near-field irradiance*, Applied Optics 45(10):2265 — https://www.hydrotekhydroponics.com/img/ApplOpt2006.pdf
- Sun et al. (2020), *Illuminance and Starting Distance of the Far Field of LED-Array Luminaire*, Crystals 10(5):360 — https://doi.org/10.3390/cryst10050360
- Skarżyński, Żagan, Krajewski (2021), *LED Luminaires: Many Chips—Many Photometric and Lighting Simulation Issues to Solve*, Energies 14(15):4646 — https://doi.org/10.3390/en14154646
- Dotreppe et al. (CIE 2025), *Assessment of the Validity of the Current Minimal Test Distances of (O)LED Luminaires* — https://files.cie.co.at/x051_2025/P0217_ID241GuillaumeDotreppe_OA_with_cover.pdf

**엔진 문서**
- Unreal Rect Lights — https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/LightTypes/RectLights/
- Unreal `URectLightComponent` / `PointLightComponent` / `SpotLightComponent` API — https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/URectLightComponent , https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/SpotLightComponent
- Unreal Distance Field Soft Shadows — https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/RayTracedDistanceFieldShadowing/
- Unreal IES Light Profiles — https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/IESLightProfiles/
- Unreal Light Functions — https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/LightFunctions/
- Unreal Movable Lights / Shadow Map Caching — https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/LightMobility/DynamicLights/
- Godot `AreaLight3D` — https://docs.godotengine.org/en/latest/classes/class_arealight3d.html
- Godot `Light3D` (`light_size`) — https://docs.godotengine.org/en/latest/classes/class_light3d.html
- Godot 3D lights and shadows (PCSS) — https://docs.godotengine.org/en/stable/tutorials/3d/lights_and_shadows.html
- Unity Types of Light (Area = baked only) — https://docs.unity3d.com/6/Documentation/Manual/Lighting.html
- Unity URP Light component — https://docs.unity3d.com/Manual/urp/light-component.html
- Unity `realtimeDirectRectangularAreaLights` — https://docs.unity3d.com/ScriptReference/Rendering.GraphicsSettings-realtimeDirectRectangularAreaLights.html
- Unity HDRP IES profile / importer — https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.5/manual/IES-Profile.html , .../IES-Importer.html

**three.js**
- `RectAreaLight` 소스 — https://raw.githubusercontent.com/mrdoob/three.js/dev/src/lights/RectAreaLight.js
- `RectAreaLight` 문서 — https://threejs.org/docs/pages/RectAreaLight.html
- `IESLoader` 소스 — https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/IESLoader.js
- `IESSpotLightNode` 문서 — https://threejs.org/docs/pages/IESSpotLightNode.html
- IES 스팟 예제 — https://threejs.org/examples/webgpu_lights_ies_spotlight.html
- WebGPU RectAreaLight 지원 커밋(#28580) — https://github.com/mrdoob/three.js/commit/2f335437dfc013ae4fdc90ffc88280c0e7f98daf
- `ProjectorLight` PR(#31022) — https://github.com/mrdoob/three.js/pull/31022
- TiledLighting PR(#29642, 현재 `ClusteredLightsNode`) — https://github.com/mrdoob/three.js/pull/29642
- WebGPURenderer 매뉴얼 — https://threejs.org/manual/en/webgpurenderer.html
- 그림자/DoubleSide 이슈 — https://github.com/mrdoob/three.js/issues/8692 , https://github.com/mrdoob/three.js/issues/3544 , https://discourse.threejs.org/t/shadows-intersecting-on-flat-2-sided-objects/36824
- **로컬 실측**: `frontend/node_modules/three@0.185.1` — `build/three.module.js`(shadowSide 매핑 L9100, `numPointLights` 프로그램 캐시 키 L7846, `_cubeDirections` 6면 루프), `build/three.webgpu.js`(IESSpotLight·RectAreaLightNode·LTC_Evaluate·ProjectorLight 존재), `examples/jsm/lights/`, `examples/jsm/tsl/lighting/ClusteredLightsNode.js`

**기타 (제조사/블로그 — 학술 검증 아님)**
- LED 바 균일도 1:1.5 규칙 — https://www.adledlights.com/achieving-perfect-uniformity-in-ultra-thin-stretch-ceilings-a-guide-from-a-13-year-commercial-grade-led-bar-manufacturer.html
- SMD3528 스트립 이격 실측 — https://www.xopc.net.ua/en/korysna-informatsiia-3/pryntsypy-rozrakhunku-laitboksiv-abo-iak-pravylno-rozmistyty-svitlodiodni-moduli-u-reklami
- UE 라이트 함수로 랜턴 그림자 만들기 — https://blog.nameless.zanity.net/?p=145
- three.js 그림자 타입별 비용 정리 — https://www.ramijames.com/learn-threejs/lighting/types-of-shadows
- 점광원 큐브 섀도우 원리 — https://ogldev.org/www/tutorial43/tutorial43.html
