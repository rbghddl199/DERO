# GLB 렌더링·룩 가이드 (공유용)

> 대상: 에셋 제작자(Meshy/Blender) + 프론트 개발자. GLB를 만들거나 씬에 올리기 전에 여기부터 읽어라.
> 이 문서는 통합 안내서다. 상세·판정은 정본이 우선: 저작 `asset-pipeline.md` · 렌더 `3d-scene.md` · 결정 `../CONTEXT.md`(D5·D16·D18·D19·2026-07-20 아트디렉션).
> **다 구운 GLB를 관리자 콘솔에 올리는 절차는 `admin-asset-registration.md`다** — 갈래별 굽기 요약 + 발광 설정 입력 규칙이 거기 있다.

## 1. 룩 타겟 — "조금 카툰"(stylized-PBR)
- 완전 실사 아님. 레퍼런스 = three.js `webgl_animation_keyframes`(LittlestTokyo): 손그림 텍스처 + 베이크 라이팅 + 둥근 로우폴리 = painterly. **cel-shade·검은 외곽선이 아니다** — 텍스처·형태·베이크가 만드는 느낌.
- **full cel-shade 금지**: 재질 응답 평탄화가 D5 무드 시뮬(재질로 무드 달라짐)을 깨뜨린다. 런타임은 **약한 toon ramp**(diffuse 2~3밴드)만, specular·IBL 반사는 PBR 보존.
- **상시 컨투어 라인**(2026-07-20 재지시 — 프레넬 잉크 대체): 런타임이 depth+normal 엣지 검출로 모든 엣지(실루엣 + 내부 크리스)에 얇은 다크 라인을 상시 그린다. 저작 관점 시사점 = **깨끗한 실루엣·또렷한 면 분리(하드 엣지 노멀)**가 라인 품질을 올린다 — 과도한 스무딩은 크리스 라인을 지운다. 별도 저작물 불필요.
- 팔레트 따뜻함은 **제품별 albedo에 베이크**(per-material). 전역 색 그레이드 금지.

## 2. 런타임 렌더 계약 (에셋이 착지하는 환경)
저작 시 이 환경을 전제로 삼아라:
- 렌더러: WebGPURenderer + WebGL2 자동 폴백(헤드리스/e2e는 WebGL2).
- 톤매핑: ACESFilmic, **노출 1/20**(물리 루멘 캘리브 — 광원·emissive 값을 ×20으로 저작).
- 환경광: HDRI 스튜디오(PMREM IBL), 중립 고정.
- 조명: 중립 방 리그(key+fill+rim+hemi+ambient) + 배치 조명 per-lamp SpotLight. **그림자 캐스터 캡 3**(방 key 1 + 램프 2).
- 포스트: GTAO(접촉 AO) + denoise + SMAA. toon ramp·선택 outline은 TSL 노드. bloom은 2026-07-26 하드웨어 판정으로 승인 — 발광 MRT 항 0.75/0.6 + 핫스팟 글레어 0.4/50 (DERO-162 변형 시트, 정본 값은 `frontend/src/three/scene/lookVariants.ts` 'current').
- 셰이더: MeshPhysicalNodeMaterial. 커스텀은 **TSL 전용**(D5). 손 GLSL 금지.

## 3. GLB 저작 스펙 (필수)
**등록 대상 — 소품은 전량 GLB(D19)**
- 파라메트릭 프리미티브로 때우는 폴백은 폐지됐다. 모니터암·조명·키보드·소품류는 **예외 없이 GLB를 만든다**.
- 예외는 둘뿐: **책상과 모니터는 GLB가 없다**(규격값으로 런타임 절차 생성, D18 — 모니터는 2026-08-02 재개정으로 화면 패널·베젤·스탠드가 전부 절차 생성이다).

**포맷·압축** — GLB 전용. **지오메트리·텍스처 둘 다 압축한다** — 지오메트리는 meshopt(`-cc` = `EXT_meshopt_compression`), 텍스처는 KTX2. **손으로 gltfpack 돌리지 말고 `scripts/asset-pipeline.sh <in.glb>` 한 줄을 쓴다** — 크기 구간에서 해상도·코덱을 자동 산출·검증한다. 배포 코덱은 **normal만 UASTC + 해상도 절반, 나머지 ETC1S**(normal이 ETC1S 손실의 100%라 실측 확정). 정본·근거: `asset-pipeline.md` 배포 코덱 설정.
- **"meshopt vs DRACO"는 지오메트리 압축 기법 선택이다** — DRACO도 지오메트리를 압축하지만 meshopt이 GPU 캐시 친화·디코딩 속도·스트리밍에서 우위라 meshopt을 쓴다(네이버 D2 실측). "DRACO 아님"이 "지오메트리 최적화 안 함"이 아니다 — 헷갈리기 쉬운 지점.
- **폴리곤 수 감소(decimation, `-si`)는 파이프라인에 없다** — 우리 에셋은 텍스처가 ~94%라 지오메트리 절감 여지가 구조적으로 작다(0011 실측: `-si 0.5`가 삼각형 11%만 줄이고 파일 1.5%만 절감 — simplifier가 UV seam에서 막힘). 게다가 비가역 손실이고 상시 컨투어 라인의 하드엣지 크리스를 뭉갠다. **폴리곤이 과하면 decimation이 아니라 저작 단계 로우폴리(아래 모델링 규칙)로 해결한다.**
**단위·스케일** — 미터, Apply Scale=1. **규격 DB(mm)가 정본** — 로드 후 Box3 실측 → DB값 균일 스케일. 비균일 스케일 금지, 내부 비율 오차 >5% = 재생성. Meshy auto_size 신뢰 금지.
**용량 예산 — 물체 크기별** (2026-07-24 개정, "에셋당 100~500KB 일괄"은 폐기): ≤150mm 소품 1024²/500KB · 150~400mm 중형 2048²/1MB · ≥400mm 대형 2048²/2.5MB. 초기 로드 ≤3MB · 씬 ≤10MB. **해상도는 줌인 상한(화면 폭 25%)에서 유도한 공식으로 정한다** — 정본: `asset-pipeline.md` 용량 예산.
**검수 게이트(통과 못하면 등록 불가)** — Khronos glTF-Validator 오류 0 · Asset Auditor DB mm 공차 · 크기 구간 파일 상한. `asset-pipeline.sh`가 전부 자동 검증.
**머티리얼·텍스처 — "내 GLB에 텍스처를 구워 넣어야 하나?"**
먼저 답부터: **보통은 그렇다. 굽지 않는 예외는 관절 에셋(part-segmentation)뿐이다.** "제품마다 머티리얼 스킨 1세트" 규칙은 폐기됐고, 지금은 재질 정본이 갈래마다 다르다.

| 갈래 | 재질 정본 | 저작자가 할 일 |
|---|---|---|
| 일반 GLB(TEXTURE 모드) — 소품 대부분 | GLB 자신 | albedo·roughness·metalness·AO를 **GLB에 구워 넣는다** |
| 관절 에셋(part-segmentation, D16) — 모니터암·마이크암·노트북/휴대폰 거치대 | 에셋 등록 때 고르는 **마감 1종**(`finish`: 투명 아크릴 / 메탈릭 / 화이트 / 블랙) | **텍스처를 굽지 않는다.** 세그먼트만 분리해 납품하고, 마감은 등록 화면에서 4종 중 하나를 고른다. 색·거칠기 수치는 코드가 갖는다 — 적을 칸이 없다. 에셋 하나에 마감 하나라 투톤은 안 된다 |
| 책상 상판 | 상판 텍스처 목록(`desk_texture`) | GLB 없음. **타일러블 텍스처만** 납품 |
| 모니터(화면 패널·베젤·스탠드) | 코드 상수 | GLB 없음. 손댈 것 없다(제품별 데이터 아님) |

- 색공간: baseColor·emissive = sRGB / normal·roughness·metalness·AO = linear.
- 스타일라이즈드: albedo 손그림 flat 톤(사진 grunge 최소) + painted AO.
  - **고정 UV 전용 GLB — 이게 기본값이다.** 제품 단위로 치수가 변하는 에셋은 없으므로(D19) painted AO/디테일 UV를 마음껏 써서 charm을 최대로 올려라.
  - **치수 가변은 책상 상판·모니터 둘뿐**이고, 이 둘은 GLB가 아니라 런타임 절차 생성이다. 여기 쓰는 텍스처만 **triplanar 또는 vertex-position 매핑**을 전제로 타일러블하게 납품한다(고정 UV는 상판이 늘어날 때 나뭇결이 스트레치). 런타임 toon ramp 의존.
- **emissive**: 전구·LED 같은 고정 발광면은 emissive 필수(발광 소스), 값 ×20 캘리브. **예외 — 가변 발광(리컬러) 파트는 emissive를 굽지 않는다**: 발광 메쉬를 분리하고 노드 extras `emitterSurface: true`만 표시하면 색·세기는 런타임이 주입한다(키보드 백라이트 등, 정본 `asset-pipeline.md` 발광 세그먼트 GLB 저작 규약). **조명 제품도 이 예외에 속한다** — 사용자가 밝기 배율·색온도를 조절하므로(D5·REQ-SIM-08 개정) 갓·전구 발광면에 emissive를 굽지 않는다. 즉 갈래는 물체 종류가 아니라 **조절 가능한가**로 갈린다.
- 모델링: 모서리 챔퍼/베벨 + 로우폴리 → 빛 부드럽게 걸림(장난감 느낌).
**관절 에셋(모니터암 등, D16)** — 세그먼트별 분리 메쉬(융합 금지) · 각 원점 관절 축 정렬 · 부모-자식 체인 · **안정 노드명**(개명=파괴적 변경) · Apply Scale=1 · **한계각은 메쉬에 넣지 않음(DB 정본)** · **스키닝 금지**. 런타임 FK 클램프.
**조명 에셋(D5 · 2026-07-30 DERO-228)** — 광학 규격(색온도 K·밝기·배광 분포 3종)은 규격 DB. **AI 생성 금지**(광학 규격 못 만듦). 저작 필수 3개:
1. **광원 자리에 `light_origin` 빈 노드** — 메쉬·자식 없는 Empty, 이름은 정확히 그대로. 등록 도구가 이걸 읽어 mm로 옮겨 DB에 넣는다(**개명 = 파괴적 변경**). 갓·격자 같은 차폐 기하가 있으면 필수 — 없으면 bbox 중심 폴백이 걸려 램프에서는 폴대 중간이 광원이 된다.
2. **갓이 빛을 깎으려면 `atan(갓 아랫테 반경 / 광원~아랫테 깊이) < 빔 반각`** — 안 지켜도 등록은 되지만 **빛 무늬가 안 나온다.** 현행 절차 램프가 61.5°로 3배 위반이라 지금 갓은 순수 장식물이다.
3. **조명 발광면에 emissive를 굽지 않는다** — 아래 가변 발광 규칙과 같은 집합이다(사용자가 밝기·색온도를 조절한다).

**빛 무늬(쿠키) 마스크는 납품하지 않는다** — 런타임이 갓 기하에서 직접 굽는다. 정본·수치는 `asset-pipeline.md` 조명 GLB 저작 규약.
**선택 outline** — 런타임 기능(별도 저작 불필요). 깨끗한 실루엣·매니폴드 지향 지오메트리가 outline 품질을 올린다.

## 4. 로더 계약 (코드)
- `GLTFLoader` + `KTX2Loader`(`renderer.init()` 후 `detectSupport(renderer)`) + `MeshoptDecoder`.
- 로드 후 Box3 → DB값 `scale.setScalar` 균일 스케일. shadow 플래그 스탬프.
- 관절: 리그 매니페스트(파트→세그먼트 · 축/점 · 한계각)로 피벗 노드를 세워 FK 구성, 한계각 클램프.

## 5. Do / Don't
| Do | Don't |
|---|---|
| GLB + meshopt(지오메트리) + KTX2(텍스처) | DRACO(우린 meshopt — 성능·스트리밍 우위) |
| 폴리곤 과하면 저작 단계 로우폴리 | 런타임/빌드 decimation(`-si`)에 기대기(효과 미미·엣지 훼손) |
| 미터 · Apply Scale 1 | 비균일 스케일 · 임의 리사이즈 |
| painterly albedo + painted AO | 사진 실사 grunge 과다 |
| per-material 팔레트 베이크 | 전역 색 그레이드 |
| 약한 toon ramp(런타임) | full cel-shade(D5 붕괴) |
| emissive ×20 저작 | emissive 방치(발광 안 됨) |
| 관절 세그먼트 분리 · 노드명 고정 | 융합 단일 메쉬 관절 · 스키닝 |
| 소품은 전량 GLB(D19) | 파라메트릭 프리미티브로 때우기(폐지) |
| 관절 에셋은 재질 4칸으로 등록 | 관절 에셋에 텍스처 굽기 |
| 조명은 광원 자리에 `light_origin` 빈 노드 | 노드 없이 광원 mm만 손으로 재서 넣기(갓 옮기면 낡는다) |
| 갓 깊이 `atan(rBot/H) < 빔 반각` | 얕은 갓에 빛 무늬를 기대하기 |
| 쿠키 마스크는 런타임이 굽는다 | 마스크 PNG를 GLB에 넣거나 따로 납품하기 |
| TSL 커스텀 셰이더 | 손 GLSL |

## 6. 검증·테스트
- e2e는 픽셀 베이스라인 없음 — 바이트 크기 + `window.__sim.sampleRegion` RGB readback + 프레임차 게이트.
- 새 이펙트(toon ramp/outline/bloom)는 sampleRegion 값을 흔든다 → `frontend/e2e/lighting.spec.ts` threshold 재베이스 필요.
