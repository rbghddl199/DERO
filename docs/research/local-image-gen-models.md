# 로컬 이미지 생성 모델 조사 — 제품 실사 이미지 저작권 교체

> 관련: [ai-image-provider.md](ai-image-provider.md)(API provider 선행 조사) · [asset-pipeline.md](../context/asset-pipeline.md) · `product_image` 테이블(`docs/context/erd.md`)
> **조사 시점: 2026-08-03.** 모델 카드·라이선스·diffusers 문서는 주 단위로 바뀐다. 특히 라이선스는 리포지토리에서 조용히 교체될 수 있어 **결정 직전 재확인이 필수**다.
> **표기 규칙**: 1차 출처(공식 모델 카드, Hub의 LICENSE 파일, upstream GitHub, diffusers 공식 문서, NVIDIA·Microsoft 문서)에서 확인한 것만 수치로 적었다. 확인 못 한 것은 **확인 불가**, 우리가 추론한 것은 **[추론]**, 실측 없는 어림값은 **[추정]**으로 표시했다.
> **이 문서는 판단한다.** §8이 1순위·폴백을 지목한다 — `ai-image-provider.md`와 다른 점이다(그 문서는 사실만 모았다).

---

## 0. 조사 대상과 경계

- **왜 하는가**: `product_image`에 들어간 제품 실사 이미지에 저작권 문제가 있어 AI 생성물로 교체하려 한다. `source = CATALOG` 제품은 이미지 최소 1장이 WAS 강제이므로(`erd.md` `product_image` 절) **비우는 것은 답이 아니다** — 대체물이 있어야 한다.
- **하드웨어는 고정이다**: RTX 4070 **Laptop** GPU / Core Ultra 9 185H / 시스템 RAM 64 GB / Linux 6.18 (WSL2).
- **로컬 실행만 본다.** 클라우드 API는 선행 조사(`ai-image-provider.md`)가 이미 덮었고, 이번 요구는 "내 기계에서 돈 안 내고 돌린다"다.
- **요구 능력은 참조 이미지 조건부 생성이다.** 두 입력 시나리오 둘 다 되어야 한다.
  - (A) 흰 배경 컷아웃 제품 사진 → 사실적 제품 사진 생성
  - (B) 제품이 여럿 섞인 복잡한 사진 → 그중 특정 물체만 재구성
  - 즉 text2img는 대상이 아니다. **정체성(생김새) 보존이 판정 축이다.**
- **범위 밖**: 3D 씬 스크린샷 → AI 상상도(REQ-IMG-01, 그건 `ai-image-provider.md` 소관), GLB 생성(Meshy 등, `asset-pipeline.md` 소관).

### ⚠️ 먼저 짚어야 하는 것 — 이 교체가 저작권 문제를 자동으로 해소하지 않는다 [추론]

**저작권 문제가 있는 사진을 그 사진 자체를 입력으로 넣어 "정체성 보존"하며 재생성하면, 산출물은 원본에서 파생된 것이다.** 이 조사가 다루는 기법 전부(편집 모델·IP-Adapter·ControlNet·LoRA)가 "원본을 최대한 닮게" 만드는 기법이라 목적과 위험이 같은 방향을 본다. 모델 라이선스가 상업적 사용을 허락하는지와, **입력 사진을 쓸 권리가 있는지는 완전히 별개 축**이다. 이 문서는 전자만 답한다 — 후자는 법률 판단이고 우리가 근거를 댈 수 없다.

실무적 회피 경로는 세 가지이며 뒤에서 다시 나온다.
1. **권리 있는 입력을 쓴다** — 우리가 직접 찍은 사진, 또는 우리 3D 에셋 렌더. 이러면 파생 논란이 없어지고 기법 선택은 순수 품질 문제가 된다.
2. **제품을 특정하지 않는 제네릭 이미지를 생성한다** — 정체성 보존을 포기한다. 대신 REQ-REC-06("3D 형상이 단순화된 제품의 실제 모습을 보완")의 목적이 약해진다.
3. **`product_image`를 0장으로 두고 폴백 아이콘을 쓴다**(`source = USER` 경로가 이미 이렇게 동작한다). `source = CATALOG`의 최소 1장 강제를 손봐야 하므로 기획 변경이다.

---

## 1. 하드웨어 천장 — 8 GB가 모든 결정을 지배한다

### 1-1. VRAM은 8 GB다 (데스크톱 4070의 12 GB가 아니다)

NVIDIA 공식 랩톱 비교 페이지의 스펙 표기:

| GPU | 메모리 | 버스 |
|---|---|---|
| RTX 4090 Laptop | 16 GB GDDR6 | 256-bit |
| RTX 4080 Laptop | 12 GB GDDR6 | 192-bit |
| **RTX 4070 Laptop** | **8 GB GDDR6** | **128-bit** |
| RTX 4060 Laptop | 8 GB GDDR6 | 128-bit |

출처: [NVIDIA — Compare GeForce RTX Laptops](https://www.nvidia.com/en-us/geforce/laptops/compare/)

**데스크톱 GeForce RTX 4070은 12 GB GDDR6X다** — 같은 이름이지만 다른 제품이고, 이 조사의 모든 판정은 8 GB 기준이다. 참고: 랩톱 4070의 SM 아키텍처는 Ada(`sm_89`)이며, 이는 nunchaku INT4 커널 지원 목록에 들어가고 NVFP4에는 들어가지 않는다(§5-4).

### 1-2. WSL2가 시스템 RAM 64 GB를 절반으로 자른다 — 오프로딩의 실질 천장

Microsoft 공식 문서의 `.wslconfig` `[wsl2]` 기본값:

| 키 | 기본값 |
|---|---|
| `memory` | **"50% of total memory on Windows"** |
| `swap` | "25% of memory size on Windows rounded up to the nearest GB" |
| `processors` | "The same number of logical processors on Windows" |

출처: [Microsoft Learn — Advanced settings configuration in WSL](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)

즉 **아무 설정도 안 했으면 WSL2 안에서 쓸 수 있는 RAM은 64 GB가 아니라 약 32 GB다.** CPU 오프로딩은 "GPU에 안 들어가는 가중치를 시스템 RAM에 둔다"는 기법이라(§5) 이 32 GB가 곧 오프로딩의 상한이다. diffusers는 **"Flux is a very large model and requires ~50GB of RAM/VRAM to load all the modeling components"**라고 명시한다([Flux 파이프라인 문서](https://huggingface.co/docs/diffusers/main/en/api/pipelines/flux)) — **기본 WSL2 설정에서는 FLUX급 모델을 bf16 그대로는 오프로딩으로도 못 올린다.** 두 가지 대응이 있다.

- `%UserProfile%\.wslconfig`에 `memory=56GB`를 넣어 상한을 올린다(위 문서의 예시 문법 그대로).
- 또는 양자화로 애초에 작게 만든다(§5-3, §5-4). 이쪽이 본류다.

또한 group offloading의 CUDA stream 옵션에 대해 diffusers는 **"It can increase CPU memory significantly so ensure you have 2x the amount of memory as the model size"**라고 경고한다([메모리 문서](https://huggingface.co/docs/diffusers/main/en/optimization/memory)). 32 GB 천장에서 이 2배 규칙이 바로 걸린다.

> **확인 불가**: WSL2의 CUDA 파라버추얼라이제이션이 8 GB VRAM 초과분을 호스트 RAM으로 자동 스필하는지(윈도우 네이티브 드라이버의 shared memory fallback과 동일하게 동작하는지)는 1차 출처에서 확인하지 못했다. **이걸 전제로 용량 계획을 세우면 안 된다** — 계획은 8 GB 하드 리밋으로 세운다.

---

## 2. 라이선스 — 실격 판정을 먼저 한다

저작권 문제 때문에 하는 작업이므로, **상업적 사용이 막힌 모델은 품질과 무관하게 실격**이다. 아래는 Hub 메타데이터(`license` 태그)와 실제 라이선스 본문에서 확인한 것이다.

| 모델 | 라이선스 | 상업적 사용 | 산출물(Output) 조항 | 게이팅 |
|---|---|---|---|---|
| [FLUX.2 [klein] 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) · [base 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B) · [4b-fp8](https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8) · [4b-nvfp4](https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-nvfp4) | **Apache-2.0** | **○** — 카드 표기 "Open weights available for commercial use under the Apache 2.0 license" | Apache-2.0에 산출물 제한 조항 없음 | **없음**(gated=false) |
| [FLUX.2 [klein] 9B](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B) | `other` = FLUX NCL(비상업) | **✕** | — | auto |
| [FLUX.2 [dev]](https://huggingface.co/black-forest-labs/FLUX.2-dev) | `other`(비상업) | **✕** | — | auto |
| [FLUX.1 Kontext [dev]](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev) | `other` = FLUX.1 [dev] Non-Commercial License | **✕ (모델 사용)** / **○ (산출물)** — 아래 §2-1 정독 필요 | BFL "claim[s] no ownership rights in and to the Outputs", 산출물 상업적 사용 허용, 단 경쟁 모델 학습 금지 | auto |
| [FLUX.1 [schnell]](https://huggingface.co/black-forest-labs/FLUX.1-schnell) | **Apache-2.0** | **○** | 없음 | auto(동의 필요) |
| [FLUX.1 Fill [dev]](https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev) | `other`(비상업) | **✕** | — | auto |
| [Qwen-Image-Edit](https://huggingface.co/Qwen/Qwen-Image-Edit) · [2509](https://huggingface.co/Qwen/Qwen-Image-Edit-2509) · [2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) | **Apache-2.0** — 카드 원문 "Qwen-Image is licensed under Apache 2.0" | **○** | 없음 | **없음** |
| [Step1X-Edit](https://huggingface.co/stepfun-ai/Step1X-Edit) | **Apache-2.0** — README "Step1X-Edit is licensed under the Apache License 2.0" | **○** | 없음 | 없음 |
| [OmniGen2](https://huggingface.co/OmniGen2/OmniGen2) | **Apache-2.0** | **○** | 없음 | 없음 |
| [SDXL base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) | **CreativeML Open RAIL++-M** | **○ (사용 제한 조건부)** | "Licensor claims no rights in the Output You generate using the Model. You are accountable for the Output you generate and its subsequent uses." | 없음 |
| [SDXL Inpainting 0.1](https://huggingface.co/diffusers/stable-diffusion-xl-1.0-inpainting-0.1) · [ControlNet depth/canny SDXL](https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0) | **openrail++** | **○ (조건부)** | 위와 동일 | 없음 |
| [SD 3.5 Large](https://huggingface.co/stabilityai/stable-diffusion-3.5-large) | **Stability Community License** | **△ 연매출 조건부** — "Free for research, non-commercial, and commercial use for organizations or individuals with **less than $1M in total annual revenue**". 초과 시 Enterprise License 필요 | 카드에서 확인 불가 | **있음**(동의 필요) |
| [h94/IP-Adapter](https://huggingface.co/h94/IP-Adapter) | **Apache-2.0** | **○** | 없음 | 없음 |
| [nunchaku-tech/nunchaku-qwen-image-edit-2509](https://huggingface.co/nunchaku-tech/nunchaku-qwen-image-edit-2509) | **Apache-2.0** | **○** | 없음 | 없음 |
| [nunchaku-tech/nunchaku-flux.1-kontext-dev](https://huggingface.co/nunchaku-tech/nunchaku-flux.1-kontext-dev) | `other` | **✕ — 양자화해도 원본 라이선스를 상속한다** | — | 없음 |

### 2-1. FLUX.1 [dev] / Kontext [dev] 비상업 라이선스의 정확한 구조

`black-forest-labs/FLUX.1-Kontext-dev/raw/main/LICENSE.md`는 게이팅 때문에 익명 요청이 **HTTP 401**로 막힌다. 대신 upstream 리포지토리의 동일 라이선스 본문에서 확인했다 — 출처: [github.com/black-forest-labs/flux · model_licenses/LICENSE-FLUX1-dev](https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-dev)

- **권리 부여 범위**: "a non-exclusive, worldwide, non-transferable, non-sublicensable, revocable, royalty free and limited license to access, use, create Derivatives of, and Distribute the FLUX.1 [dev] Models and Derivatives **solely for your Non-Commercial Purposes**".
- **Non-Commercial Purpose 정의**: "…**but only so far as you do not receive any direct or indirect payment arising from the use of the** FLUX.1 [dev] **Model**" — 개인 연구, **상업 주체의 비프로덕션 환경 테스트**, 자선 목적을 포함하고, 매출 발생 활동·엔드유저 대상 서비스·상업 목적 모델 학습을 명시적으로 제외한다.
- **산출물은 다르다**: BFL은 "claim[s] no ownership rights in and to the Outputs"라고 하고, 이용자는 "use Output for any purpose (**including for commercial purposes**), except as expressly prohibited"할 수 있다. 다만 **"may not use the Output to train, fine-tune or distill a model that is competitive with the FLUX.1 [dev] Model or the FLUX.1 Kontext [dev] Model"**이고, 콘텐츠 필터링과 AI 생성물 표시(법이 요구하는 범위)를 요구한다.

**우리 상황에 대입한 독해 [추론]** — 지금 이 프로젝트는 매출이 없는 학습 프로젝트다. 위 정의를 문자 그대로 읽으면 "모델 사용으로 직·간접 지급을 받지 않는" 상태이고, "비프로덕션 환경 테스트"에 가깝다. 그렇다면 Kontext [dev]를 지금 쓰고 산출물을 서비스에 넣는 것이 이 라이선스와 충돌하지 않는다고 읽을 수는 있다. **그러나 두 개의 지뢰가 남는다.**

1. **서비스가 언제든 "엔드유저 대상"이 된다.** 배포된 웹서비스에 이미지가 실려 사용자가 본다면 이미 비프로덕션이 아니고, 라이선스는 endpoint 노출을 비상업 정의에서 뺀다.
2. **이 라이선스는 `revocable`이다.** BFL이 철회하면 이미 DB에 들어간 이미지의 근거가 사라진다. 저작권 문제를 피하려고 시작한 작업이 다른 종류의 라이선스 리스크로 이동하는 셈이다.

→ **판정: FLUX.1 Kontext [dev] 계열(Fill [dev], FLUX.2 [dev], klein 9B 포함)은 이 작업의 후보에서 뺀다.** 법률 검토 없이 "괜찮게 읽힌다"에 기대는 것은, 저작권 문제 해결이 목적인 작업에서 자기모순이다. 이 판단은 법률 의견이 아니라 위험 회피 방침이다.

> **주의 — 양자화본은 라이선스를 상속한다.** nunchaku의 4-bit Kontext(`svdq-int4_r32-flux.1-kontext-dev`, 6.77 GB)는 8 GB에 들어가는 유일한 Kontext 형태지만 Hub의 `license` 필드가 `other`다. **"양자화했으니 다른 모델"은 성립하지 않는다** — 원본 라이선스의 Derivative 조항이 그대로 걸린다.

### 2-2. Stability 계열의 갈림

- **SDXL 1.0·SDXL Inpainting·SDXL ControlNet은 CreativeML Open RAIL++-M이고 상업적 사용이 열려 있다.** 라이선스 §III 원문: "You may host for Third Party remote access purposes (e.g. software-as-a-service), reproduce and distribute copies of the Model or Derivatives of the Model thereof in any medium, with or without modifications." 산출물에 대해서는 "Licensor claims no rights in the Output You generate using the Model." 단 Attachment A의 **사용 제한(불법 행위·미성년자 착취·허위정보·개인정보 유출·차별·자동화 의사결정 금지)이 따라붙고, 하위 이용자에게도 전달할 의무가 있다.** 출처: [SDXL LICENSE.md](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/raw/main/LICENSE.md)
- **SD 3.5 계열은 매출 문턱형이다.** 연 총매출 $1M 미만이면 상업적 사용 무료, 넘으면 Enterprise License. 우리는 현재 문턱 아래지만 **"성공하면 라이선스가 바뀌는 구조"라 자산 DB에 박아 넣는 결정과 궁합이 나쁘다.** 게이팅도 걸려 있다.

---

## 3. 기법 계열별 정체성 보존 능력

이 절은 "어느 모델"이 아니라 "어느 방식"을 판정한다. 우리 요구 시나리오 (A) 컷아웃, (B) 복잡한 사진에서 물체 하나 추출을 각각 본다.

### 3-1. 네이티브 지시형 편집 모델 (FLUX.2 klein, Qwen-Image-Edit, Step1X-Edit, OmniGen2)

참조 이미지 + 자연어 지시를 한 모델이 함께 먹는다. 어댑터·마스크·컨트롤맵이 필요 없다.

- **FLUX.2 [klein] 4B**: 카드 원문 "unifies generation and editing in a single compact architecture", "supports multi-reference editing capabilities". diffusers `Flux2KleinPipeline.__call__`이 `image: list[PIL.Image.Image] | PIL.Image.Image`를 받아 **다중 참조 이미지를 그대로 인자로 받는다**([Flux2 파이프라인 문서](https://huggingface.co/docs/diffusers/main/en/api/pipelines/flux2)). 별도 `Flux2KleinKVPipeline`은 "reference image tokens ... their attention K/V are cached"로 참조 이미지 조건을 **4스텝 기본값**에서 빠르게 재사용한다.
- **Qwen-Image-Edit-2509**: "further trained via image concatenation to enable multi-image editing"이며 지원 조합을 "person + person", **"person + product"**, "person + scene"으로 명시한다. 2511은 "mitigate image drift, improved character consistency"를 개선점으로 들고 **입력 이미지 2장**을 받는다.
- **Step1X-Edit**: "A unified image editing model performs impressively on various genuine user instructions."
- **OmniGen2**: Apache-2.0 · transformer 15.87 GB + mllm 15.02 GB(bf16 디스크 실측, §4).

**정체성 보존 판정**: 이 계열이 우리 요구에 **구조적으로 가장 맞다**. 시나리오 (B)가 특히 그렇다 — "여러 제품이 있는 사진에서 이 물체만"은 자연어 지시로 표현되는 문제이고, 마스크를 사람이 그리지 않아도 된다. **다만 "얼마나 닮는가"의 정량 수치를 어느 모델 카드도 제시하지 않는다.** Qwen은 "preserving the identity and visual characteristics of the subject"라고 주장하고 2511이 "character consistency has been significantly improved"라고 하지만, 이건 인물(character) 문맥의 서술이고 **공업 제품의 로고·비율·재질 보존에 대한 벤치마크 수치는 확인 불가**다. 판정은 우리가 실제 제품 사진으로 직접 해야 한다.

### 3-2. IP-Adapter / IP-Adapter-Plus (이미지 프롬프트 어댑터)

- 22M 파라미터의 경량 어댑터로, 이미지 인코더가 뽑은 특징을 UNet의 신설 cross-attention에 넣는다. **"IP-Adapter files are typically ~100MBs"**라 베이스 모델(SDXL 등) 위에 거의 공짜로 얹힌다. 출처: [diffusers IP-Adapter 가이드](https://huggingface.co/docs/diffusers/main/en/using-diffusers/ip_adapter)
- 강도는 `set_ip_adapter_scale()`로 조절하며 문서 표기: "A value of `1.0` means the model is only conditioned on the image prompt, and `0.5` typically produces balanced results".
- **Plus 변형**: "The Plus variant uses patch embeddings and the ViT-H image encoder." 모델 카드는 plus 계열이 **"closer to the reference image"**라고 한다([h94/IP-Adapter](https://huggingface.co/h94/IP-Adapter)).
- ControlNet과 조합 가능("For structural control, combine IP-Adapter with ControlNet"), 인페인팅 파이프라인과도 조합 가능(문서에 `mask_image` + `ip_adapter_image` 예제 존재), 마스크로 참조 이미지별 적용 영역 지정 가능(`IPAdapterMaskProcessor`).
- ⚠️ 함정(문서 명시): `enable_model_cpu_offload()`는 **IP-Adapter를 로드한 뒤에** 호출해야 한다 — 먼저 하면 이미지 인코더까지 CPU로 내려가 에러가 난다.

**정체성 보존 판정**: **부족하다.** 어댑터가 전달하는 것은 CLIP 이미지 임베딩이고, 이건 "무엇처럼 보이는지"의 의미 수준 정보다. 로고 글자·버튼 배치·케이블 개수 같은 픽셀 수준 동일성을 보장하는 기법이 아니다. 모델 카드·diffusers 문서 어디에도 정체성 보존 정량 수치가 없고(원문에 그런 절이 없다), 우리가 실측 없이 "닮는다"고 쓸 근거가 없다. **얼굴 전용 계열(FaceID)이 별도로 존재한다는 사실 자체가, 일반 IP-Adapter로는 동일성이 약하다는 방증이다 [추론].** 제품에는 그 전용 계열이 없다.

### 3-3. ControlNet (canny / depth / segmentation)

- **하는 일은 구조 고정이다.** 윤곽·깊이가 같은 이미지를 만든다. 즉 **실루엣은 보존하고 색·재질·로고는 보존하지 않는다.**
- SDXL용 공식 체크포인트가 openrail++로 있다: [controlnet-depth-sdxl-1.0](https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0), [controlnet-canny-sdxl-1.0](https://huggingface.co/diffusers/controlnet-canny-sdxl-1.0) — fp16 가중치 **2.50 GB**(디스크 실측, §4 방법).

**정체성 보존 판정**: **단독으로는 실격, 조합용으로는 유효.** 우리 시나리오에 이게 정확히 맞는 자리가 하나 있다 — **우리 GLB를 렌더한 스크린샷에서 depth/canny를 뽑아 "우리가 권리를 가진 형상"을 고정하고 재질·라이팅만 생성하는 경로**다(§0의 회피 경로 1). 이 경우 입력이 저작권 문제가 없는 자산이라 §0의 파생 논란도 같이 사라진다. `ai-image-provider.md` §2가 API 쪽에서 정리한 "명시적 구조 컨디셔닝" 논점의 로컬 대응물이다.

### 3-4. LoRA / DreamBooth 제품별 파인튜닝

정체성 보존이 가장 강한 계열이지만, **이 하드웨어에서 비용이 가장 먼저 터지는 계열**이기도 하다.

diffusers 공식 학습 예제가 밝힌 수치 — 출처: [examples/dreambooth/README_flux.md](https://github.com/huggingface/diffusers/blob/main/examples/dreambooth/README_flux.md)

- **"a LoRA with a rank of 16 (w/ all components trained) can exceed 40GB of VRAM for training"**
- 문서가 제시하는 감축 수단: `--gradient_accumulation_steps`, `--gradient_checkpointing`("saves memory ... though it slows backward pass"), `--use_8bit_adam`(bitsandbytes 필요), `--cache_latents`(VAE로 미리 인코딩 후 VAE 삭제), `--mixed_precision="bf16"`, `--resolution` 하향(LoRA 기본값 512).

**판정: 8 GB에서 FLUX급 LoRA 학습은 문서 수치와 3배 이상 어긋난다.** 감축 플래그를 다 켰을 때 8 GB에 들어가는지 **1차 출처가 없다 → 확인 불가**이고, 우리가 숫자를 만들어 넣지 않는다. 더 결정적인 문제는 **비용 구조**다.

- 제품마다 LoRA 하나면, 등록 제품 수 × (데이터 준비 + 학습 + 검수)다. **제품 1종에 학습 이미지 여러 장이 필요한데, 그 이미지가 바로 저작권 문제가 있는 사진들이다.** 문제를 해결하려고 문제를 학습 데이터로 쓰는 구조가 된다.
- FLUX dev 라이선스는 산출물로 경쟁 모델을 학습·파인튜닝·증류하는 것을 금지한다(§2-1) — LoRA 경로를 FLUX dev 계열로 짜면 조항 해석 부담이 하나 더 붙는다.

→ **제품별 파인튜닝은 이 작업 규모에 맞지 않는다.** 카탈로그 전체가 아니라 "간판 제품 1~2종만 특별히 잘 보여야 한다"는 요구가 생기면 그때 다시 본다.

### 3-5. 인페인팅 / 배경 교체 (제품 픽셀을 지키고 배경만 재생성)

- **정체성 보존율이 원리적으로 100%다** — 마스크 밖 픽셀을 그대로 두기 때문이다. 생성 모델이 정체성을 "기억"할 필요가 없다.
- 라이선스가 깨끗한 조합이 존재한다: [SDXL Inpainting 0.1](https://huggingface.co/diffusers/stable-diffusion-xl-1.0-inpainting-0.1)(openrail++) — fp16 가중치 unet **5.14 GB** + text_encoder_2 **1.39 GB**(디스크 실측). diffusers는 VAE 타일링·슬라이싱 API를 제공한다(§5-2).
- FLUX.1 Fill [dev]가 같은 일을 더 잘 할 수 있으나 **비상업 라이선스라 실격**이다(§2).

**판정: 이 계열은 "저작권 교체"라는 목적을 달성하지 못한다.** 제품 픽셀을 그대로 남기는 것이 곧 원본 사진을 그대로 남기는 것이라, 문제가 되는 부분이 그대로 살아 있다. **다만 §0 회피 경로 1과 결합하면 최고의 도구다** — 우리가 찍은/렌더한 제품 픽셀은 지키고 배경만 스튜디오 룩으로 바꾸는 것. 즉 이 계열의 위치는 "교체 수단"이 아니라 "권리 있는 소재의 마감 수단"이다.

---

## 4. 후보별 정량 — 파라미터·디스크 용량·문서화된 VRAM

디스크 용량은 **Hugging Face Hub API(`/api/models/{id}?blobs=true`)의 blob 크기를 2026-08-03에 직접 집계한 값**이다(단위 GB = 10⁹ B). 여러 dtype·포맷이 함께 올라온 리포지토리는 컴포넌트 디렉터리 기준으로 합산했다.

| 모델 | 파라미터 | dtype·디스크 용량 (실측 집계) | 문서화된 추론 VRAM | 8 GB 적합 | 라이선스 |
|---|---|---|---|---|---|
| **FLUX.2 [klein] 4B** | 4B | bf16: transformer **7.75** + text_encoder(Qwen3) **8.04** + vae 0.17 = **15.96 GB** | **"fits in ~13GB VRAM"**, "runs on consumer GPUs like the RTX 3090/4070" (모델 카드·BFL 블로그) | **△ — 양자화 또는 오프로딩 필수** | Apache-2.0 |
| FLUX.2 [klein] 4B fp8 (BFL 공식) | 4B | fp8 단일 파일 **4.07 GB** | 위와 동일 문구 | **○ [추론]** — 아래 주의 | Apache-2.0 |
| FLUX.2 [klein] 4B nvfp4 (BFL 공식) | 4B | nvfp4 **2.46 GB** | — | **✕ — NVFP4는 Blackwell 이상 필요**(§5-4). 4070 Laptop은 Ada | Apache-2.0 |
| FLUX.2 [klein] 4B GGUF (unsloth) | 4B | Q8_0 **4.30** / Q6_K **3.41** / Q5_K_M **3.07 GB** | 확인 불가 | ○ [추론] | Apache-2.0 |
| FLUX.2 [klein] 4B SDNQ 4bit (Disty0) | 4B | transformer **2.47** + text_encoder **2.82 GB** | 확인 불가 | ○ [추론] | Apache-2.0 |
| FLUX.2 [klein] 9B | 9B | transformer 18.16 + text_encoder 16.38 GB | 확인 불가 | — | **비상업 → 실격** |
| FLUX.2 [dev] | 확인 불가 | transformer **64.45** + text_encoder **48.02 GB** | 확인 불가 | **✕ 물리적 불가** | **비상업 → 실격** |
| FLUX.1 Kontext [dev] | 12B | bf16: transformer **23.80** + T5 **9.52** + CLIP 0.25 + vae 0.17 = **33.74 GB** | Flux 계열 일반: **"~50GB of RAM/VRAM to load all the modeling components"** | 4-bit(6.77 GB)면 물리적으로는 가능 | **비상업 → 실격** |
| FLUX.1 [schnell] | 12B | transformer 23.78 + T5 9.52 GB | 위와 동일 | △ | Apache-2.0 — 단 **참조 이미지 조건 없음**(text2img) → 요구 미충족 |
| **Qwen-Image-Edit 2509 / 2511** | 20B | bf16: transformer **40.86** + text_encoder(Qwen2.5-VL) **16.58** + vae 0.25 = **57.69 GB** | 모델 카드에 **없음**. upstream README는 DiffSynth-Studio 경유 "low-GPU-memory layer-by-layer offload (**inference within 4GB VRAM**)"와 FP8 양자화를 언급 | **✕ (diffusers 경로) / △ (전용 오프로드 스택)** — 아래 주의 | Apache-2.0 |
| Qwen-Image-Edit 2509 4-bit (nunchaku) | 20B | int4_r32 **11.52** / int4_r128 **12.65** / fp4_r32 11.95 GB | 확인 불가 | **✕ 단독으로는 8 GB 초과** | Apache-2.0 |
| Qwen-Image-Edit 2509 GGUF (QuantStack) | 20B | Q4_K_M **13.07** / Q4_0 **11.93** / Q3_K_S **9.04 GB** | 확인 불가 | **✕ 8 GB 초과** | Apache-2.0 |
| Step1X-Edit | 확인 불가 | 단일 파일 합계 **50.05 GB** + lora 2.45 GB | **공식 표 있음**: 기본 42.5/46.5/49.8 GB (512/786/1024px), FP8 31/31.5/34 GB, CPU offload 25.9/27.3/29.1 GB, **FP8+offload 18/18/18 GB**. 측정 환경 "one H800 GPU", 권고 "GPUs with 80GB of memory" | **✕ — 최소 구성 18 GB > 8 GB** | Apache-2.0 |
| OmniGen2 | 확인 불가 | transformer **15.87** + mllm **15.02** + vae 0.34 GB | 확인 불가 | ✕ [추론] | Apache-2.0 |
| SDXL base 1.0 + IP-Adapter Plus | 2.6B(UNet) + 22M | fp16: unet **5.14** + text_encoder_2 **1.39** + text_encoder 0.25 + vae 0.17 ≈ **7.0 GB**, 어댑터 "~100MBs" | 확인 불가 | **○ (여유 없음)** | openrail++ / Apache-2.0 |
| SDXL Inpainting 0.1 | 2.6B | fp16: unet **5.14** + text_encoder_2 **1.39** ≈ **7.0 GB** | 확인 불가 | ○ (여유 없음) | openrail++ |
| ControlNet depth/canny SDXL | — | fp16 **2.50 GB** (각) | 확인 불가 | ○ (SDXL과 합산 시 빠듯) | openrail++ |
| SD 3.5 Large | 8B | transformer 16.29 + text_encoder_3(T5) 19.05 GB | 확인 불가 | ✕ [추론] | Community(매출 문턱) |

> **표의 "○"는 가중치가 물리적으로 들어간다는 뜻이고, 실제 피크 VRAM은 활성값(activation)·attention·VAE 디코드가 더해진다.** 어느 후보에 대해서도 **RTX 4070 Laptop에서의 실측 피크 VRAM을 공개한 1차 출처를 찾지 못했다 → 확인 불가.** 우리가 숫자를 만들지 않는다. 유일하게 가까운 공식 실측은 §5-5의 RTX 4090(16 GB급 랩톱이 아니라 데스크톱 24 GB) 벤치마크다.

**주의 1 — BFL fp8 단일 파일의 diffusers 로딩 경로는 [미확인]이다.** `FLUX.2-klein-4b-fp8` 카드는 "No code snippets available yet for this library"라고 적혀 있다. diffusers 포맷으로 재패키징한 서드파티(`Photoroom/FLUX.2-klein-4b-fp8-diffusers`, transformer_fp8_static 4.07 GB)가 존재하지만 이 리포는 `license: other` 표기라 klein 본체의 Apache-2.0과 표기가 어긋난다 — **쓰기 전에 그 리포의 라이선스 근거를 확인해야 한다.**

**주의 2 — fp8 transformer만 줄여도 텍스트 인코더가 8 GB를 거의 다 먹는다.** klein의 text_encoder(Qwen3ForCausalLM, diffusers `Flux2KleinPipeline` 시그니처로 확인)는 bf16 **8.04 GB**다. transformer를 4 GB로 줄여도 두 컴포넌트를 동시에 GPU에 올릴 수 없다. **따라서 `enable_model_cpu_offload()`(컴포넌트를 번갈아 올린다)가 fp8과 함께 사실상 필수**이고, 텍스트 인코더도 4-bit로 같이 줄이는 조합(§5-3)이 더 안전하다. SDNQ 4bit 리포가 transformer 2.47 + text_encoder 2.82 = 5.29 GB인 이유가 이것이다.

**주의 3 — Qwen-Image-Edit의 "4GB VRAM" 문구는 diffusers 경로가 아니다.** upstream README가 말하는 것은 **DiffSynth-Studio의 layer-by-layer offload**이며, 우리가 diffusers 표준 파이프라인으로 얻는 수치가 아니다. 4-bit 가중치조차 11.5~13 GB라 **8 GB에 통째로 안 들어간다** — 오프로딩이 선택이 아니라 전제이고, 그 대가는 §5-1의 "extremely slow"다.

---

## 5. 메모리 축소 기법과 그 대가 (전부 diffusers 공식 문서)

출처: [Reduce memory usage](https://huggingface.co/docs/diffusers/main/en/optimization/memory) · [Compile and offloading quantized models](https://huggingface.co/docs/diffusers/main/en/optimization/speed-memory-optims) · [Quantization getting started](https://huggingface.co/docs/diffusers/main/en/quantization/overview) · [Nunchaku Lite](https://huggingface.co/docs/diffusers/main/en/quantization/nunchaku) · [Flux 파이프라인](https://huggingface.co/docs/diffusers/main/en/api/pipelines/flux)

### 5-1. 오프로딩 3단계 — 64 GB(실질 32 GB) 시스템 RAM이 있기에 성립한다

| 기법 | 동작 | 문서가 밝힌 대가 |
|---|---|---|
| `enable_model_cpu_offload()` (model offloading) | 컴포넌트(텍스트 인코더/트랜스포머/VAE) **단위**로 필요할 때만 GPU에 올린다 | "This eliminates the communication overhead of CPU offloading and makes model offloading a faster alternative. **The tradeoff is memory savings won't be as large.**" |
| `enable_sequential_cpu_offload()` (CPU offloading) | **서브모듈 단위**로 오간다 | "CPU offloading dramatically reduces memory usage, but it is also **extremely slow** because submodules are passed back and forth multiple times between devices. **It can often be impractical due to how slow it is.**" ⚠️ 문서 경고: 이 호출 **전에 파이프라인을 CUDA로 옮기면 절감 효과가 거의 사라진다** |
| `enable_group_offload()` (group offloading) | `ModuleList`/`Sequential` **그룹 단위**. `block_level` 또는 `leaf_level` | "It uses less memory than model offloading and it is **faster than CPU offloading**". `use_stream=True`로 프리페치 중첩 가능하나 **"ensure you have 2x the amount of memory as the model size"** |

**이미지 생성에서는 model offloading이 우선이다** — 문서가 명시한다: "For image generation, combining quantization and model offloading can often give the best trade-off between quality, speed, and memory. **Group offloading is not as effective for image generation** because it is usually not possible to *fully* overlap data transfer if the compute kernel finishes faster."

**시스템 RAM 64 GB가 이 전략을 가능하게 하는 자원이다.** 오프로딩은 VRAM 부담을 시스템 RAM으로 옮기는 것이므로, RAM이 작으면 아예 선택지가 아니다. 단 §1-2대로 **WSL2 기본 설정에서는 실질 32 GB**이므로 `.wslconfig`로 올리거나 양자화로 총량을 줄여야 한다.

### 5-2. VAE 슬라이싱·타일링

- `vae.enable_slicing()`: 배치를 1장씩 디코드. "You can expect a small increase in performance when decoding multi-image batches and **no performance impact for single-image batches**." → 우리는 1장씩 생성하므로 **이득이 거의 없다.**
- `vae.enable_tiling()`: 이미지를 겹치는 타일로 나눠 디코드. "The generated image may have some **tone variation from tile-to-tile**". 512×512 이하에선 자동 비활성. → **고해상도 출력에서 유효하다.**

### 5-3. 양자화 (bitsandbytes NF4 / GGUF / torchao / quanto / SDNQ)

- `PipelineQuantizationConfig`가 지원하는 백엔드: **`bitsandbytes_4bit`, `bitsandbytes_8bit`, `gguf`, `quanto`, `torchao`**. 사전 양자화 체크포인트 로딩은 bitsandbytes·torchao·GGUF(`from_single_file`만)·AutoRound·Nunchaku Lite·ModelOpt·SDNQ가 지원한다.
- 권고 대상: "you should quantize the most compute intensive components like the transformer. **The text encoder is another component to consider quantizing** if a pipeline has more than one".
- Flux 문서가 제시하는 **"less than 16GB of VRAM"** 경로는 optimum-quanto FP8 + `enable_model_cpu_offload()` 조합이다. 다만 경고가 붙는다: "**FP8 inference can be brittle** depending on the GPU type, CUDA version, and `torch` version".
- **4~32 GB VRAM용 공식 스니펫이 문서에 있다** — `enable_sequential_cpu_offload()` + `vae.enable_slicing()` + `vae.enable_tiling()` + `pipe.to(torch.float16)`, 대상은 FLUX.1-schnell 4스텝. 이게 diffusers가 "저VRAM에서 Flux 돌리는 법"으로 공식화한 형태다.

### 5-4. Nunchaku / SVDQuant 4-bit — 아키텍처 제약을 반드시 읽어야 한다

diffusers Nunchaku Lite 문서가 지원 아키텍처를 열거한다: `sm_75`(Turing) · `sm_80`(A100) · `sm_86`(RTX 3090) · **`sm_89`(Ada, 예: RTX 4090)** · `sm_120`(Blackwell). 그리고 **"`nvfp4` checkpoints require a Blackwell or newer NVIDIA GPU. `int4` checkpoints require a Turing or newer NVIDIA GPU."**

→ **RTX 4070 Laptop은 Ada(`sm_89`)이므로 INT4는 되고 NVFP4는 안 된다.** BFL이 올린 `FLUX.2-klein-4b-nvfp4`(2.46 GB)가 가장 작지만 우리 GPU에서 쓸 수 없다. nunchaku-tech 카드도 같은 갈림을 확인한다: "INT4 for non-Blackwell GPUs (pre-50-series), NVFP4 for Blackwell GPUs". 속도 참고치는 문서에 하나뿐이다 — "The compiled Nunchaku Lite NVFP4 pipeline runs 1.8x faster than the original BF16 pipeline (2.271s → 1.675s **on an RTX PRO 6000**)". **우리 GPU 수치가 아니다.**

### 5-5. 유일한 공식 실측 표 (RTX 4090, Flux 12B, transformer+text_encoder 양자화)

| 조합 | 지연 (s) | 메모리 (GB) |
|---|---|---|
| quantization | 32.602 | 14.9453 |
| quantization + torch.compile | 25.847 | 14.9448 |
| quantization + torch.compile + model CPU offloading | 32.312 | 12.2369 |

출처: [speed-memory-optims](https://huggingface.co/docs/diffusers/main/en/optimization/speed-memory-optims) — 문서 표기 "benchmarked on Flux with a RTX 4090".

**이 표에서 우리가 가져갈 사실 두 개.**
1. **12B 모델을 4-bit로 눌러도 12.2 GB다** → 8 GB에 안 들어간다. 12B급 편집 모델(Kontext)이 라이선스 이전에 성능·메모리에서도 이 GPU와 맞지 않는다는 뜻이다.
2. **model CPU offloading의 대가가 여기선 +25%다**(25.8s → 32.3s). 오프로딩이 "느려진다"는 것의 공식 수치 하나다 — 단 4090 기준이고 우리 GPU의 PCIe·메모리 대역폭이 다르다.

---

## 6. 학습(LoRA/DreamBooth) 비용 — 이 GPU에서의 현실

§3-4에 수치를 적었다. 요점만 다시 정리한다.

- 공식 문서 수치: **rank 16 LoRA 전체 컴포넌트 학습 시 40 GB VRAM 초과**(Flux 기준).
- 8 GB에서의 가능 여부는 **확인 불가**. 감축 플래그(8-bit Adam, gradient checkpointing, cache_latents, resolution 512)를 전부 켠 조합의 1차 출처 수치가 없다.
- **더 작은 베이스(SDXL LoRA)라면 문턱이 낮아지지만**, 그 경우 §3-2·§3-3의 판정(정체성 보존이 원리적으로 약함)이 그대로 따라온다. 즉 "학습 가능한 크기"와 "정체성이 보존되는 품질"이 반대 방향이다.
- **일정·인력 비용이 더 크다**: 제품 1종당 학습 데이터 수집 → 학습 → 검수 사이클. 등록 제품 수만큼 곱해진다.

→ **이번 작업에서는 채택하지 않는다.**

---

## 7. 우리 파이프라인과의 접점

권고가 일반론이 되지 않도록, 실제로 어디에 꽂히는지 적는다.

- **대상 테이블은 `product_image`다**(`erd.md`). `image_key`(object key), `display_order`, `is_primary`. 제품당 상한 8장, `source = CATALOG`은 최소 1장 WAS 강제, 대표 1장은 부분 유니크 인덱스가 DB에서 강제한다. **따라서 이 작업의 산출물 단위는 "제품당 1~8장의 이미지 파일"이고, 서버에 생성 파이프라인을 심는 것이 아니라 오프라인 배치 작업이다.**
- **파일은 presigned 방식이라 DB엔 object key만 들어간다.** 로컬에서 생성한 PNG/JPG를 버킷에 올리고 key를 넣는 것으로 끝난다 — 백엔드 코드 변경이 필요 없다.
- **`asset-pipeline.sh`에 스테이지를 추가하지 않는다.** 그 스크립트는 GLB(bash + python + gltfpack) 전용이고, 실사 이미지 생성은 축이 다르다. 조명 쿠키 베이크를 그 스크립트에 넣지 않기로 한 판단(`asset-pipeline.md`)과 같은 이유다.
- **§0 회피 경로 1과 우리 자산의 궁합**: 등록 제품 대부분이 `glb_export_mode = 'TEXTURE'`인 전용 GLB를 갖고 있고(`asset-pipeline.md` 재질 정본 ③), 프론트에 이미 KTX2·meshopt 로더와 조명 씬이 있다. **우리가 권리를 가진 형상·재질에서 렌더 이미지를 뽑을 수 있다는 뜻이다.** 그 렌더를 (a) 참조 이미지로 편집 모델에 넣거나 (b) depth/canny로 ControlNet에 물리면, 저작권 문제 있는 사진을 입력으로 쓰지 않고도 사실적 제품 컷을 만들 수 있다. **단 책상·모니터는 GLB가 없다**(D18 — 전량 절차 생성) — 이 둘은 절차 생성 지오메트리를 렌더해야 하고 룩이 "조금 카툰"으로 저작돼 있어(D17 아트 디렉션) 사실적 실사 참조로는 약하다 [추론].
- **REQ-REC-06의 목적**("3D 형상이 단순화된 제품의 실제 모습을 보완")과 충돌 지점: 우리 3D 렌더에서 만든 이미지는 정의상 "3D 형상만큼만 정확"하다. 실물 보완이라는 목적을 절반만 달성한다. **이건 기술로 못 메우는 구멍이고, 기획 판단 사항이다.**

---

## 8. 판정

### 8-1. 1순위 — FLUX.2 [klein] 4B (Apache-2.0), fp8 또는 4-bit + `enable_model_cpu_offload()`

- **왜**: 라이선스가 깨끗하고(Apache-2.0, 게이팅 없음, 산출물 제한 조항 없음), **다중 참조 이미지 편집이 모델 자체 기능**이며(`Flux2KleinPipeline`의 `image: list[PIL.Image.Image]`), **4B라 이 GPU 급에서 유일하게 여유가 생기는 크기**다. BFL이 직접 "runs on consumer GPUs like the RTX 3090/**4070**"이라고 적은 유일한 후보이기도 하다.
- **라이선스 근거**: [모델 카드](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) "Open weights available for commercial use under the Apache 2.0 license" + Hub `license: apache-2.0` + `gated: false`(API 확인). **9B 변형은 FLUX NCL이므로 절대 섞지 말 것** — 이름이 비슷해 실수하기 쉬운 지점이다.
- **필요한 메모리 기법**: bf16 원본은 transformer 7.75 + text_encoder 8.04 GB로 8 GB에 안 들어간다. 셋 중 하나를 고른다.
  1. **BFL 공식 fp8 transformer(4.07 GB) + `enable_model_cpu_offload()`** — 카드에 diffusers 스니펫이 없어 로딩 경로 [미확인], 확인 필요.
  2. **`bitsandbytes_4bit`(NF4)로 transformer·text_encoder 동시 양자화 + `enable_model_cpu_offload()`** — diffusers 공식 API(`PipelineQuantizationConfig`)만 쓰는 가장 안전한 경로.
  3. **사전 양자화 4-bit 리포**(SDNQ 4bit: transformer 2.47 + text_encoder 2.82 GB) — 가장 작지만 서드파티다.
  - 공통으로 `vae.enable_tiling()`을 켠다(고해상도 디코드).
  - **`nvfp4`는 쓸 수 없다**(Blackwell 전용, §5-4).
- **장당 소요 시간**: **확인 불가 — 실측 필요.** 참고할 수 있는 정박점은 두 개뿐이다. ① klein 4B 배포본은 **"step-distilled to 4 inference steps"**(BFL 블로그)이고 `Flux2KleinKVPipeline`의 기본 `num_inference_steps=4`가 이를 확인한다. ② diffusers 공식 실측에서 **12B Flux, 4-bit, 오프로딩, RTX 4090이 32.3초**(스텝 수 미표기)였다. **[추정]** 4B·4스텝은 12B·다스텝보다 연산량이 한 자릿수 배 적으므로 1024px 1장이 **수 초~수십 초** 범위에 들어갈 것으로 본다 — 오프로딩 전송 시간이 지배할 가능성이 크다. **이 숫자는 추정이며 실측으로 대체해야 한다.**
- **남는 위험**: 제품 정체성 보존 품질에 대한 정량 근거가 없다(§3-1). **10개 제품 파일럿으로 우리가 직접 재는 것이 유일한 답이다.**

### 8-2. 폴백 — SDXL(openrail++) + IP-Adapter Plus(Apache-2.0) + ControlNet depth, 우리 GLB 렌더를 입력으로

- **왜**: 라이선스가 상업적 사용을 명시적으로 허용하고(§2-2 인용), fp16 전체가 **약 7 GB + 어댑터 ~100 MB**로 8 GB에 **양자화 없이** 들어간다. 생태계가 오래돼 ControlNet·인페인팅·마스킹 API가 diffusers 문서에 전부 있다.
- **필요한 메모리 기법**: fp16 로딩 + `vae.enable_tiling()`. ControlNet(fp16 2.50 GB)을 함께 올리면 빠듯해지므로 그때 `enable_model_cpu_offload()`를 켠다. **어댑터 로드 후에 오프로딩을 켜야 한다**(문서 명시 함정, §3-2).
- **왜 폴백인가**: IP-Adapter는 의미 수준 조건이라 **로고·비율 동일성을 보장하지 않는다**(§3-2). 그래서 이 조합은 "제품 사진을 닮게 만드는" 용도가 아니라 **"우리 GLB 렌더의 구조를 depth로 고정하고 재질·라이팅만 사실적으로 바꾸는"** 용도로 쓴다. 정체성은 ControlNet이 구조로, 재질은 우리 GLB가 이미 갖고 있다.
- **장당 소요 시간**: **확인 불가.** SDXL 계열의 이 하드웨어 실측 1차 출처를 찾지 못했다. 숫자를 만들지 않는다.

### 8-3. 실격 명단과 사유 (헷갈리기 쉬운 것부터)

| 모델 | 실격 사유 |
|---|---|
| **FLUX.1 Kontext [dev]** | 비상업 라이선스(§2-1). 게다가 12B 4-bit도 12.2 GB로 8 GB 초과(§5-5) — **라이선스가 아니어도 이 GPU와 안 맞는다** |
| **FLUX.2 [klein] 9B**, **FLUX.2 [dev]**, **FLUX.1 Fill [dev]** | 비상업 라이선스. klein 4B와 이름이 한 글자 차이라 가장 위험한 혼동 |
| **Step1X-Edit** | 라이선스는 Apache-2.0로 깨끗하지만 **공식 표의 최소 구성이 FP8+offload 18 GB**다. 8 GB에 들어갈 경로가 문서에 없다 |
| **Qwen-Image-Edit 2509/2511** | 라이선스 최상급(Apache-2.0, 비게이팅)이고 "person + product" 다중 참조를 명시하는 유일한 후보인데, **20B라 4-bit·Q4 GGUF조차 11.5~13 GB**로 8 GB를 넘는다. 오프로딩 전제이고 문서가 그 대가를 "extremely slow"로 못 박는다. **VRAM 16 GB 이상 기계가 생기면 이게 1순위 후보다** |
| **SD 3.5 Large** | 매출 문턱형 라이선스 + 게이팅 + T5 19 GB. 자산 DB에 영구 박히는 산출물의 근거로 부적절 |
| **FLUX.1 [schnell]** | 라이선스는 Apache-2.0인데 **참조 이미지 조건부 생성 기능이 없다**(text2img). 요구 자체를 못 한다 |
| **제품별 LoRA/DreamBooth** | 학습 VRAM 문서 수치 40 GB 초과, 학습 데이터가 곧 문제의 사진들, 운영 비용이 제품 수에 비례(§3-4·§6) |

### 8-4. 정직한 결론 — 8 GB급에서 "정체성 보존"의 천장

**라이선스가 깨끗하면서 8 GB VRAM에 들어가고, 동시에 "이 제품이 바로 그 제품이다"를 픽셀 수준으로 재현하는 로컬 모델은 없다.** 사실 관계로 정리하면:

- 정체성 보존이 가장 강한 계열(20B 편집 모델, 제품별 LoRA)은 **메모리 또는 학습 비용에서 탈락**한다.
- 8 GB에 들어가는 계열(SDXL + 어댑터, klein 4B)은 **정체성 보존 정량 근거가 없고**, 원리상 의미 수준 조건이거나 구조 수준 조건이다.
- **트레이드오프는 셋 중 하나를 고르는 것이다.**
  1. **정체성을 낮춘다** — "실제 제품 사진"이 아니라 "제품군을 대표하는 이미지"로 요구를 낮춘다. REQ-REC-06의 목적이 약해진다. 기획 판단.
  2. **입력을 바꾼다** — 저작권 문제 있는 사진 대신 **우리 GLB 렌더**를 쓴다(§7). 정체성은 우리 3D 형상만큼 정확해지고, §0의 파생 위험이 사라진다. **기술적으로 가장 방어 가능한 경로이며 8-1·8-2 둘 다와 결합된다.**
  3. **하드웨어나 지갑을 바꾼다** — VRAM 16 GB 이상이면 Qwen-Image-Edit 2511(Apache-2.0)이 열린다. 또는 로컬을 포기하고 API로 간다(`ai-image-provider.md`의 표들. FLUX.1 Kontext [pro] $0.04/장 등). **API 경로는 "가중치 라이선스"가 아니라 "서비스 약관"이 지배하므로 조건이 전혀 다르다 — 상업적 이용·산출물 귀속을 provider별로 다시 확인해야 한다(선행 조사 §8-10에서 미확인으로 남겨둔 항목이다).**

---

## 9. 선행 조사(`ai-image-provider.md`)와의 관계

**확장이며, 결론을 뒤집는 곳이 두 군데 있다.**

- **확장**: 그 문서는 API provider의 단가·응답 방식·리전을 모았고 **로컬 실행은 다루지 않았다.** 이 문서가 그 빈칸을 채운다. 대상 요구도 다르다 — 그 문서는 REQ-IMG-01(3D 씬 → 상상도), 이 문서는 `product_image`(제품 실사 이미지 교체)다.
- **확장**: 그 문서 §8-10이 "각 provider의 콘텐츠 정책·상업적 이용 조건·생성물 저작권 귀속 — 이번 조사 범위 밖"으로 남긴 항목을, **오픈 웨이트 모델에 대해서는 이 문서 §2가 답했다.** API provider 쪽은 여전히 미확인이다.
- **뒤집히는 것 ①**: 그 문서 §2가 "BFL은 depth/canny 경로를 접었다 … 'FLUX + ControlNet'을 쓰려면 fal·Replicate 같은 호스팅 경유가 된다"고 결론냈다. **로컬에서는 그 전제가 안 걸린다** — 오픈 웨이트 ControlNet(openrail++ SDXL 계열)이 우리 기계에서 그대로 돌고, BFL의 엔드포인트 유지 정책과 무관하다. 다만 **FLUX 계열 ControlNet은 dev 라이선스에 묶여 우리에게 실격**이고, 우리가 쓸 수 있는 것은 SDXL 세대다. 즉 "구세대 품질" 지적(§2 갈림길)은 로컬에서도 유효하다.
- **뒤집히는 것 ②**: 그 문서 §7-2의 비용 통제 논의(하드캡·선불 크레딧·Redis 카운터)는 **로컬 경로에서 전부 무의미하다.** 한계 비용이 0이고 지갑 폭발 시나리오가 없다. 대신 **새 통제 대상은 사람 시간과 GPU 시간**이며, 이건 오프라인 배치라 서비스 SLA에 걸리지 않는다.
- **여전히 유효한 것**: 그 문서 §2의 "최신·최고품질 모델에는 depth/canny 컨디셔닝이 없고, 참조 이미지 + 자연어 지시로만 구조를 유지한다. **구조가 얼마나 보존되는지는 수치로 보장되지 않는다**"는 관찰은 로컬 네이티브 편집 모델(klein 4B, Qwen-Image-Edit)에도 **그대로 성립한다**(§3-1). 계열 전체의 성질이지 provider 문제가 아니었다는 것이 이 조사로 확인됐다.

---

## 10. 이 조사에서 확인하지 못한 것

1. **RTX 4070 Laptop(8 GB, Ada)에서의 실측 피크 VRAM·장당 시간** — 어느 후보도 1차 출처가 없다. **직접 재는 것 외에 답이 없다.** §8의 시간 값은 추정이다.
2. **BFL `FLUX.2-klein-4b-fp8` 단일 파일의 diffusers 로딩 경로** — 카드에 스니펫이 없다("No code snippets available yet for this library"). 서드파티 재패키징본의 라이선스 표기가 원본과 어긋난다(`license: other`).
3. **WSL2에서 VRAM 초과분의 호스트 RAM 스필 동작** — NVIDIA/Microsoft 1차 문서에서 확인하지 못했다.
4. **네이티브 편집 모델의 제품 정체성 보존 정량 지표** — 어느 모델 카드도 제품(비인물) 대상 벤치마크를 제시하지 않는다. Qwen의 "identity"·"character consistency" 서술은 인물 문맥이다.
5. **Step1X-Edit·OmniGen2의 파라미터 수** — 모델 카드·README에서 확인 불가.
6. **OmniGen2·SDXL 계열·SD 3.5의 문서화된 추론 VRAM** — 확인 불가(디스크 용량만 실측).
7. **`Qwen/Qwen-Image-Edit*` 리포에 LICENSE 파일이 없다** — Apache-2.0 근거는 Hub `license` 메타데이터와 README 문장("Qwen-Image is licensed under Apache 2.0")뿐이다. 상업 결정 전 Qwen 측 확인 권장.
8. **8 GB에서 감축 플래그 전부 켠 LoRA 학습 가능 여부** — 1차 출처 없음. 추정치를 적지 않았다.
9. **입력 사진의 저작권 문제가 생성물로 어떻게 승계되는지** — 법률 판단이며 이 조사 범위 밖이다(§0). 서비스 공개 전 별도 확인이 필요하다.
10. **API provider의 상업적 이용·산출물 귀속 조건** — 선행 조사에서 미확인으로 남은 항목이 그대로 남아 있다. §8-4의 선택지 3을 고르면 이걸 먼저 닫아야 한다.
