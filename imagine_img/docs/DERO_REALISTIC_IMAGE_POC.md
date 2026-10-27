# DERO 데스크 셋업 실사화 POC

시뮬레이터 화면 1장 → 실제 촬영한 데스크 셋업 사진처럼 보이는 이미지 1장.

- 구현 위치: `imagine_img/` (새 `ai-worker/` 를 만들지 않고 기존 구조를 재사용했다)
- 설계 충돌 검토: [DESIGN_GAP_REPORT.md](../DESIGN_GAP_REPORT.md) — Part 2 가 이 지시문에 대한 검토다
- 측정값: [BENCHMARK_RESULTS.md](../BENCHMARK_RESULTS.md)
- 한계: [KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md)

---

## 1. 처리 흐름

```text
시뮬레이터 캡처 (임의 크기, 조명 상태가 이미 적용된 화면)
 → 입력 검증 (포맷·최소 크기·알파·NaN)
 → 크기 결정: 출력 = 입력 크기, 생성 = 입력 비율에 맞춘 SDXL 친화 크기
 → PromptBuilder (공통 실사 + 시간대 + 조명 + 무드 + 구조 보존 + 네거티브)
 → SDXL Img2Img (프로필이 steps/guidance/scheduler 를 정한다)
 → Lanczos 로 출력 크기를 덮는 배율까지 확대 → 남는 쪽 중앙 크롭
 → (선택) 약한 UnsharpMask
 → PNG 저장 (+ 선택적 WebP) + metadata.json
```

### 크기 정책 (SIZE_MODE)

**`follow_input` (기본): 출력 크기는 입력 이미지 크기를 그대로 따른다.**
생성 크기만 SDXL 이 다룰 수 있는 값으로 바꾼다 — 비율은 입력에 맞추고, 픽셀 수는 예산 안에 넣는다.

예산이 `2048*1152`(2026-08-02 상향)일 때:

| 입력 | 생성 (비율 오차) | 출력 | 확대 |
|---|---|---|---|
| **2048×1152 (권장 캡처)** | **2048×1152 (0%)** | 2048×1152 | **없음** |
| 1125×1449 (옛 캡처) | 1088×1408 (0.15%) | 1125×1449 | 1.03배 |
| 1152×1024 | 1152×1024 (0%) | 1152×1024 | 없음 |
| 2400×1350 | 2048×1152 (0%) | 2400×1350 | 1.17배 |

생성 크기가 입력과 다르면 그 차이만큼 Lanczos 확대되어 흐려진다 — 실측(2026-08-02):
2400×1350 캡처가 1344×768 로 생성되던 동안 선명도가 캡처 68 대 결과 34 였다.
**캡처를 2048×1152 로 보내면 확대가 사라진다**(`SIMULATOR_CAPTURE_SPEC.md` §3).

`generation_pixel_budget` 을 1.18M 에서 2.36M 으로 올린 근거는
`FINDINGS_2026-08-02.md` §1.9b 다 — 옛 값의 이유("8GB OOM 위험")가 실제로는
`long_prompt` 의 autograd 누수였고, 고친 뒤 2048×1152 에서 peak 6,819MB 로 여유가 있다.
**생성은 입력보다 커지지 않는다** — 예산이 남아도 입력 픽셀 수가 상한이다.
확대 배율이 1.6배를 넘으면 "Lanczos 는 디테일을 만들지 않는다"는 경고를 응답에 남긴다.

`fixed` 모드는 구 규격(생성 1152×1024 → 1332×1184 → 좌우 2px 크롭 → 1328×1184)을 그대로
재현하고, 비율이 2% 이상 다른 입력을 거부한다.

## 2. 확정 파라미터 (sdxl_lightning 프로필 기준)

```text
base            stabilityai/stable-diffusion-xl-base-1.0
unet            ByteDance/SDXL-Lightning  sdxl_lightning_8step_unet.safetensors
scheduler       EulerDiscreteScheduler, timestep_spacing="trailing"
steps           9
guidance_scale  0.0
strength        0.35 (기본) / 0.25 / 0.45
dtype           float16
batch           1, 동시 작업 1개
크기            SIZE_MODE=follow_input (출력 = 입력 크기)
sharpen         기본 OFF (radius 0.8 / percent 40 / threshold 3)
quantization    none
LoRA            OFF
```

### steps 가 4가 아니라 9인 이유

img2img 의 실제 denoise step 은 `int(steps × strength)` 다.
`steps=4` 에서는 0.25/0.35/0.45 가 **모두 1 step** 이 되어 세 결과가 픽셀 단위로 동일해진다
(실측 maxdiff=0). 새 지시문 §5·§17 이 요구한 세 값 비교가 성립하지 않는다.

`steps=9` + 8-step checkpoint 면 **2 / 3 / 4 step** 으로 갈라진다. 실측 결과:

```text
0.25 vs 0.35  MAE 0.43
0.35 vs 0.45  MAE 0.63
0.25 vs 0.45  MAE 1.00     (steps=4 에서는 세 쌍 모두 0.00 이었다)
```

자세한 근거는 DESIGN_GAP_REPORT P2-3.

## 3. 조명 상태를 반영하는 방법

**프롬프트로 낮/밤을 만들어내지 않는다.** 시뮬레이터가 조명을 적용한 화면을 캡처해 넣고,
낮은 strength 가 그것을 보존한다 (새 지시문 §8).

조명이 구워진 입력 4종으로 실측한 결과:

| 입력 | 입력 평균 밝기 | 출력 평균 밝기 |
|---|---|---|
| DAY / 조명 ON | 196.3 | 195.3 |
| DAY / 조명 OFF | 177.2 | 176.1 |
| NIGHT / 조명 ON | 115.1 | 115.1 |
| NIGHT / 조명 OFF | 55.4 | 56.7 |

출력 간 차이가 입력 간 차이와 거의 같다(예: DAY/ON vs NIGHT/OFF 출력 MAE 139.0, 입력 MAE 141.0).
즉 조명 상태가 그대로 유지·반영된다.

반대로 **조명이 구워지지 않은 평면 입력**에 프롬프트만으로 낮/밤을 지시하면 출력 MAE 가 0.20
(육안 구별 불가)이다. 이 차이가 §8 의 지시가 옳았음을 보여준다.

## 4. 실행

```powershell
# 환경 확인
.\.venv\Scripts\python.exe scripts\check_environment.py

# 가중치 (약 11 GB: SDXL Base fp16 + Lightning 8-step)
.\.venv\Scripts\python.exe scripts\download_models.py

# 조명 4조합 fixture 생성
.\.venv\Scripts\python.exe scripts\make_fixture_capture.py --all

# 이미지 1장
.\.venv\Scripts\python.exe -m app.cli generate tests\fixtures\desk_capture_night_on.png `
  --job-id demo --time-of-day NIGHT --room-light --strength 0.35 --seed 42

# API
.\.venv\Scripts\python.exe -m app.cli serve      # http://127.0.0.1:8010/docs

# strength 비교 (§17)
.\.venv\Scripts\python.exe scripts\compare.py --time-of-day NIGHT --room-light on

# 벤치마크
.\.venv\Scripts\python.exe scripts\benchmark.py --suite all --repeat 10
```

## 5. 요청 예시 (§4)

```json
{
  "jobId": 184,
  "mode": "REALISTIC",
  "timeOfDay": "NIGHT",
  "roomLightOn": true,
  "productLights": [{ "productId": 501, "enabled": true, "color": "#6FA8FF" }],
  "moodTags": ["WHITE_MINIMAL", "BLUE"],
  "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
  "strength": 0.35,
  "seed": 42
}
```

- `jobId` 는 정수/문자열 모두 받고 내부에서 문자열로 정규화한다(폴더 이름이 되므로 경로 검사를 통과해야 한다).
- `productLights[].color` 는 프롬프트에서 **색 이름으로 변환**된다(`#6FA8FF` → `cool blue`).
  CLIP 은 hex 를 색으로 해석하지 못하고 토큰만 6개 이상 먹는다. `productId` 는 프롬프트에 절대 노출하지 않는다.
- `moodTags` 는 §9 의 5종(`WHITE_MINIMAL`/`BLUE`/`PINK`/`BLACK`/`WOOD`)이다.
  §4 예시의 `WHITE`·`MINIMAL` 은 `WHITE_MINIMAL` 로 매핑된다.
- `strength` 는 0.25/0.35/0.45 만 허용한다. 0.5 이상은 400 으로 거부한다.
- `simulatorViewPath` 를 쓰면 업로드 없이 로컬 파일을 읽는다. **`INPUT_DIR` 하위로만 허용**한다.
- `productReferencePaths` 는 기록만 되고 사용되지 않는다(IP-Adapter 가 범위 밖). 응답 경고로 알린다.

## 6. 프롬프트 구성 (§6~§10)

`app/generation/prompt_builder.py` 의 `PromptBuilder` 가 §6 의 5개 빌더를 그대로 나눠 갖는다.

```text
build_base_prompt()          §7  공통 실사
build_environment_prompt()   §8  시간대 + 조명 + 제품 조명 색
build_mood_prompt()          §9  무드 5종
build_structure_prompt()     구조 보존 + 제품 목록
build_negative_prompt()      §10 full / compact / none
```

**CLIP 77 토큰 한도가 이 설계의 실질적 제약이다.** §7~§9 원문을 그대로 이으면 156 토큰이라
절반이 잘려나간다. 그래서 문장을 압축하고 우선순위를 매겨 예산을 넘으면 낮은 우선순위부터 버리고,
버린 문장을 응답 `warnings` 와 metadata 에 남긴다.

```text
우선순위 0 (항상 유지)  구조 보존 2문장 + 조명 상태 1문장
우선순위 1              공통 실사 1문장
우선순위 2              제품 조명 색, 무드
우선순위 3              제품 목록 (최대 3개)
우선순위 4~5            나머지 실사 수식어
```

§7 이 경계한 `ultra realistic` / `masterpiece` / `best quality` / `cinematic` 은 쓰지 않는다.

### 네거티브 프롬프트는 프로필에 따라 무효다

`guidance_scale <= 1` 이면 diffusers 가 CFG 를 끄고 네거티브 프롬프트를 계산에 넣지 않는다.
기본 프로필 `sdxl_lightning` 은 `guidance_scale=0` 이므로 **§10 의 목록은 아무 효과가 없다.**
이 사실을 숨기지 않고 매 요청 응답에 경고로 남기며, `negativePromptEffective: false` 로 표시한다.
네거티브를 실제로 쓰려면 CFG 가 켜진 프로필(`sdxl_photoreal`)을 쓰거나 `GUIDANCE_SCALE` 을 올려야 한다.
자세한 내용은 [MODEL_PROFILE_GUIDE.md](MODEL_PROFILE_GUIDE.md).

## 7. 응답 (§15)

```json
{
  "jobId": "184", "status": "COMPLETED",
  "modelProfile": "sdxl_lightning",
  "checkpoint": "sdxl_lightning_8step_unet.safetensors",
  "strength": 0.35, "strengthPreset": "BALANCED",
  "seed": 42, "steps": 9, "effectiveSteps": 3, "guidanceScale": 0.0,
  "generationSize": { "width": 1152, "height": 1024 },
  "outputSize": { "width": 1328, "height": 1184 },
  "quantizationMode": "none", "loraEnabled": false,
  "negativePromptProfile": "compact", "negativePromptEffective": false,
  "timing": { "downloadMs": 0, "preprocessMs": 9, "promptBuildMs": 2,
              "inferenceMs": 8272, "resizeMs": 35, "saveMs": 65,
              "uploadMs": 0, "totalMs": 8372 },
  "peakVramMb": 5355, "peakVramReservedMb": 5606, "peakNvidiaSmiVramMb": 7589,
  "resultUrl": "file:///...", "outputPath": "...", "metadataPath": "...",
  "warnings": ["..."]
}
```

## 8. 오류 코드

`INVALID_IMAGE` `INVALID_REQUEST` `MODEL_NOT_READY` `MODEL_LOAD_FAILED` `LORA_LOAD_FAILED`
`QUANTIZATION_NOT_SUPPORTED` `CUDA_OUT_OF_MEMORY` `INFERENCE_FAILED` `POSTPROCESS_FAILED`
`OUTPUT_WRITE_FAILED` `JOB_ALREADY_RUNNING` `CONFIGURATION_ERROR`

## 9. 8GB VRAM 정책 (§14)

```text
float16 + batch 1 + model CPU offload + VAE tiling + 동시 작업 1개
attention slicing : 기본 OFF (PyTorch SDPA 와 함께 켜면 보통 더 느려진다)
xFormers          : auto → 미설치이므로 SDPA 로 귀결. 없는 것을 켠 척하지 않는다
sequential offload: 자동 진입 금지 (매우 느림)
```

실측 peak: torch 5355 MB, nvidia-smi 7589 MB / 8188 MB — **여유 약 600 MB**.
다른 GPU 앱이 붙으면 공유 메모리로 밀려나 오류 없이 수십 배 느려진다.

VRAM 부족 시 순서는 §14 를 따른다: 다른 GPU 프로그램 종료 → VAE tiling 확인 →
offload 확인 → 해상도 임시 축소 → 양자화 실험 → 최후에 sequential offload.
**출력 해상도를 자동으로 낮추지 않는다** (§21).
