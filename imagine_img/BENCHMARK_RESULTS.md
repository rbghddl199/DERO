# BENCHMARK_RESULTS

측정 일자: 2026-07-31 (새 지시문 반영 후 재측정)
원본 데이터: `outputs/_benchmark/all.json`, `outputs/comparison-*/metadata.json`

## 측정 환경

```text
GPU            : NVIDIA GeForce RTX 4070 Laptop GPU, 8188 MiB, WDDM
드라이버        : 591.74 (CUDA 13.1)
OS             : Windows 11 Enterprise 10.0.26200
Python         : 3.12.13
torch          : 2.6.0+cu124
diffusers      : 0.39.0 / transformers 5.14.1 / accelerate 1.14.0 / peft 0.20.0
모델 프로필     : sdxl_lightning
                 stabilityai/stable-diffusion-xl-base-1.0
                 + ByteDance/SDXL-Lightning sdxl_lightning_8step_unet.safetensors
scheduler      : EulerDiscreteScheduler, timestep_spacing=trailing
steps          : 9   guidance_scale: 0.0   dtype: float16
메모리 정책      : model CPU offload + VAE tiling, attention=SDPA (xformers 미설치)
양자화 / LoRA   : none / OFF
네거티브        : compact 프로필이지만 CFG 가 꺼져 있어 **적용되지 않음**
seed           : 42 고정
측정 명령       : scripts\benchmark.py --suite all --repeat 10
```

## 1. 기동 비용

| 항목 | 값 |
|---|---|
| 모델 로드 | **11,781 ms** |
| Warm-up 512x512 1회 | **6,373 ms** |
| 모델 가중치 다운로드 (최초 1회) | SDXL Base fp16 1.7 GB + Lightning 8-step 4.78 GiB |

모델은 요청 사이에 상주하며 재로드하지 않는다.

## 2. 10회 연속 생성 (NIGHT / 조명 ON / strength 0.35)

**10/10 성공. OOM 없음. 모든 출력 1328x1184. 실제 3 step.**

| # | inference ms | total ms | peak torch VRAM | peak reserved | peak nvidia-smi |
|---|---|---|---|---|---|
| 1 | 8179 | 8292 | 5355 | 7680 | 7589 |
| 2 | 8214 | 8319 | 5355 | 7684 | 7529 |
| 3 | 8115 | 8206 | 5355 | 7684 | 7529 |
| 4 | 8174 | 8276 | 5355 | 7684 | 7529 |
| 5 | 8257 | 8353 | 5355 | 7684 | 7529 |
| 6 | 8353 | 8444 | 5355 | 7684 | 7529 |
| 7 | 8287 | 8391 | 5355 | 7684 | 7529 |
| 8 | 8474 | 8578 | 5355 | 7684 | 7529 |
| 9 | 8413 | 8516 | 5355 | 7684 | 7529 |
| 10 | 8433 | 8540 | 5355 | 7684 | 7529 |

```text
inference : min 8115 / median 8272 / max 8474 ms
total     : min 8206 / median 8372 / max 8578 ms
peak torch allocated : 5355 MB  (10회 내내 동일 — 증가 없음)
peak torch reserved  : 7684 MB
peak nvidia-smi      : 7589 MB / 8188 MB  → 여유 약 600 MB
peak process RAM     : 9133 MB
```

단계별 내역(중간값): preprocess 약 9 ms, promptBuild 약 2 ms, inference 약 8.3 s,
resize(Lanczos+crop) 약 35 ms, save(PNG) 약 65 ms.
**전체 왕복의 98% 이상이 추론이다.** 후처리는 사실상 무료다.

## 3. strength 비교 (§17 테스트 A·B·C, 동일 seed)

`outputs/comparison-20260731-163332/`

| 파일 | strength | 요청/실제 step | inference ms | total ms | peak VRAM |
|---|---|---|---|---|---|
| `lightning-strength-025.png` | 0.25 | 9 / **2** | 7729 | 7827 | 5355 |
| `lightning-strength-035.png` | 0.35 | 9 / **3** | 8121 | 8231 | 5355 |
| `lightning-strength-045.png` | 0.45 | 9 / **4** | 8533 | 8640 | 5355 |

결과 간 실제 차이:

| 비교 | MAE (0~255) | 최대 픽셀차 | 완전 동일 |
|---|---|---|---|
| 0.25 vs 0.35 | 0.4329 | 150 | 아니오 |
| 0.35 vs 0.45 | 0.6291 | 158 | 아니오 |
| 0.25 vs 0.45 | 0.9978 | 176 | 아니오 |

### 왜 steps=9 인가 — steps=4 였다면 이 비교는 무의미했다

같은 세 값을 `num_inference_steps=4` 로 측정한 결과:

| 비교 | MAE | 최대 픽셀차 | 완전 동일 |
|---|---|---|---|
| 0.25 vs 0.35 | 0.0000 | 0 | **예** |
| 0.25 vs 0.45 | 0.0000 | 0 | **예** |
| 0.35 vs 0.45 | 0.0000 | 0 | **예** |

`int(4 × 0.25) = int(4 × 0.35) = int(4 × 0.45) = 1` 이라 세 값이 같은 1 step, 같은 시작
timestep 을 쓴다. 8-step checkpoint + steps=9 로 바꿔 2/3/4 step 으로 갈랐다.
(DESIGN_GAP_REPORT P2-3)

## 4. 조명 4조합 — 조명이 구워진 입력 사용 (§8)

`tests/fixtures/desk_capture_{day,night}_{on,off}.png`, strength 0.35, 동일 seed.

| 조합 | inference ms | total ms | 입력 평균 밝기 | 출력 평균 밝기 |
|---|---|---|---|---|
| DAY / 조명 ON | 8322 | 8426 | 196.3 | 195.3 |
| DAY / 조명 OFF | 8455 | 8554 | 177.2 | 176.1 |
| NIGHT / 조명 ON | 8450 | 8559 | 115.1 | 115.1 |
| NIGHT / 조명 OFF | 8490 | 8605 | 55.4 | 56.7 |

4조합 모두 성공. **조명 상태가 결과에 그대로 반영된다** — 출력 간 차이가 입력 간 차이와 거의 같다.

| 비교 | 출력 MAE | 입력 MAE |
|---|---|---|
| DAY/ON vs DAY/OFF | 19.47 | 19.12 |
| DAY/ON vs NIGHT/ON | 80.56 | 81.29 |
| DAY/ON vs NIGHT/OFF | 139.02 | 141.00 |
| DAY/OFF vs NIGHT/ON | 61.60 | 62.53 |
| DAY/OFF vs NIGHT/OFF | 119.78 | 121.88 |
| NIGHT/ON vs NIGHT/OFF | 58.78 | 59.74 |

### 대조: 조명이 구워지지 않은 입력 + 프롬프트만

같은 평면 fixture 에 프롬프트로만 낮/밤을 지시했을 때의 출력 MAE:

```text
strength 0.35~0.50 : DAY/OFF vs NIGHT/ON  MAE 0.20   ← 육안 구별 불가
실제 step 을 4로 보정 : MAE 0.20  (변화 없음)
strength 0.75       : MAE 2.06   (10배지만 여전히 작다)
```

**결론: 조명은 프롬프트가 만들지 못한다. 시뮬레이터가 조명을 적용한 화면을 캡처해서 보내야 한다.**
새 지시문 §8 의 마지막 문장이 요구한 바가 정확히 이것이며, 실측으로 확인했다.

## 5. 프롬프트 토큰 측정 (§7~§10 원문 vs 구현)

실제 SDXL CLIP 토크나이저 기준 (BOS/EOS 제외):

| 대상 | 원문 | 구현(압축 후) |
|---|---|---|
| §7 공통 실사 | 85 | 약 30 (3문장) |
| §8 조건별 (최대) | 34 | 약 13 |
| §9 무드 (최대) | 21 | 약 8 |
| 긍정 프롬프트 합계 | **156** (한도 75의 2.1배) | **한도 이내** |
| §10 네거티브 full | **128** | 잘림 + 버린 항목 보고 |
| §10 네거티브 compact | 44 | 잘리지 않음 |

`tests/integration/test_prompt_fits_clip.py` 가 조명 4조합 × 무드 5종 × 긴 제품 목록에서
77 토큰을 넘지 않음을 실제 토크나이저로 검증한다.

## 6. 육안 평가 (§18)

합성 fixture 기준이며 실제 시뮬레이터 캡처가 아니다. 1~5점 대신 관찰 사실로 적는다.
`outputs/comparison-*/comparison-report.md` 에 사람이 점수를 채울 빈 표가 생성된다.

| 항목 | 0.25 | 0.35 | 0.45 |
|---|---|---|---|
| 시뮬레이터 원본 배치 유지 | 유지 | 유지 | 유지 |
| 모니터 개수·위치 유지 | 1대 유지 | 1대 유지 | 1대 유지 |
| 키보드·마우스 형태 유지 | 유지 | 유지 | 유지 |
| 제품 색상 유지 | 유지 | 유지 | 유지 |
| 책상·벽 구조 유지 | 유지 | 유지 | 유지 |
| 낮/밤 차이 | 반영 | 반영 | 반영 |
| 조명 ON/OFF 차이 | 반영 | 반영 | 반영 |
| 실제 사진 같은 재질 | 약함 | 약함 | 약간 개선 |
| CGI/플라스틱 느낌 감소 | 거의 없음 | 거의 없음 | 거의 없음 |
| 제품 삭제/교체 | 없음 | 없음 | 없음 |

**실사 재질 개선이 약하다.** 입력 fixture 가 평면 도형이라 모델이 참고할 그라데이션·그림자·질감이
없고, strength 상한이 0.45(4 step)이라 입력에서 크게 벗어나지 않기 때문이다.
strength 0.75 에서는 재질이 뚜렷하게 개선되지만 제품 교체가 발생했다(머그컵 → 책 더미).

> **갱신**: 이후 실제 시뮬레이터 렌더로 재측정했다. 아래 **10절**을 보라 —
> fixture 문제는 실재했고, 모델 교체(RealVisXL)로 디테일 손실이 절반으로 줄었지만,
> 남은 병목은 img2img 자체(strength 상한)로 확인됐다.

## 7. 양자화 검증 매트릭스 (§13)

| 조합 | 결과 |
|---|---|
| FP16 / LoRA OFF | **검증 완료** — 위 모든 수치 |
| FP16 / LoRA ON | 미검증 (DERO LoRA 파일 없음) |
| TorchAO INT8 / LoRA OFF·ON | 미검증 (`torchao` 미설치, opt-in 시 fail-fast) |
| BnB NF4 / LoRA OFF·ON | **NOT_SUPPORTED** — full-UNet 경로에 quantization_config 진입점이 없다 |

fp16 이 8GB 에서 여유 600 MB 로 도므로 §13 방침대로 양자화는 OOM 시에만 검토 대상이다.

## 8. §22 완료 조건 대조

```text
[x] RTX 4070 Laptop 8GB 에서 이미지 1장 생성          10/10 연속 성공
[x] 1152x1024 생성 성공                              전 17회
[x] 1328x1184 Lanczos 후처리 성공                    전 17회, 약 35 ms
[x] 낮/밤 및 조명 ON/OFF 조건 입력 가능               4조합 측정, 결과에 반영됨
[x] strength 0.25 / 0.35 / 0.45 비교 가능            2/3/4 step, MAE 0.43~1.00
[x] 프롬프트와 네거티브 프롬프트 분리                 PromptBuilder 5개 빌더
[x] 모델 프로필 교체 가능                            3종, 기본 1종 활성
[x] LoRA 인터페이스 구현, 기본 OFF                    계약 3종 + 계열 검사
[x] 양자화 인터페이스 구현, 기본 OFF                   Strategy 3종, fail-fast
[x] 모델 로딩 실패와 OOM 이 명확히 표시                MODEL_LOAD_FAILED / CUDA_OUT_OF_MEMORY
[x] 전체 생성 시간과 최대 VRAM 측정 가능               allocated/reserved/nvidia-smi 3종
[x] 동일 seed 기반 결과 비교 스크립트 제공             scripts\compare.py
[x] 실행 방법과 제한사항 문서화                        docs/ + KNOWN_LIMITATIONS.md
```

## 9. 재측정 방법

```powershell
.\.venv\Scripts\python.exe scripts\benchmark.py --suite all --repeat 10
.\.venv\Scripts\python.exe scripts\compare.py --time-of-day NIGHT --room-light on
```

측정 중 브라우저 등 다른 GPU 사용 앱을 닫아야 한다. 여유가 600 MB 뿐이라
다른 앱이 VRAM 을 잡으면 공유 메모리로 밀려나 **오류 없이 수십 배 느려진다.**

---

# 10. 모델 프로필 비교 — RealVisXL V5.0 vs SDXL-Lightning (2026-07-31 추가)

**실제 시뮬레이터 렌더**(`inputs/image.png`, 1125×1449)로 측정했다. 합성 fixture 가 아니다.
원본 데이터: `outputs/profiles-20260731-173952/`

```text
입력       : 1125x1449 (비율 0.7764) → 생성 896x1152 (비율 0.7778, 오차 0.18%) → 출력 1125x1449
strength   : 0.35, seed 42, NIGHT / 조명 ON, 무드 WHITE_MINIMAL
SIZE_MODE  : follow_input
```

| 프로필 | scheduler | steps(요청/실제) | guidance | 네거티브 | inference | 모델 로드 | peak torch VRAM | nvidia-smi |
|---|---|---|---|---|---|---|---|---|
| sdxl_lightning | Euler trailing | 9 / 3 | 0.0 | **무효** | **10.2 s** | 11.4 s | 5332 MB | 6929 MB |
| sdxl_photoreal (compact) | DPM++ 2M Karras | 30 / 10 | 5.0 | 적용 | 18.5 s | 22.9 s | 5491 MB | 6921 MB |
| sdxl_photoreal (full) | DPM++ 2M Karras | 30 / 10 | 5.0 | 적용(16개 잘림) | 18.9 s | — | 5491 MB | 6921 MB |
| sdxl_photoreal (none) | DPM++ 2M Karras | 30 / 10 | 5.0 | 없음 | 18.3 s | — | 5491 MB | 6921 MB |

**CFG(batch 2)가 8GB 에 들어갔다.** 사전 계산으로는 8.05 GB 로 한계에 붙을 것으로 봤으나,
`follow_input` 이 생성 크기를 896×1152(1.03M px)로 잡아 기준선(1.18M px)보다 작아진 덕에
nvidia-smi 6921 MB / 8188 MB 로 여유 1.2 GB 가 남았다. OOM 없음.

## 10.1 실사 품질 대리 지표

평면 벡터 그림은 국소 대비·경계 밀도가 낮고, 사진 같은 질감이 생기면 올라간다.
`laplacianVar` 가 입력보다 낮으면 **모델이 디테일을 지웠다**는 뜻이다.

| 대상 | laplacianVar | colorStd | edgeDensity % | 평균 밝기 |
|---|---|---|---|---|
| **입력 (기준선)** | **46.50** | 58.38 | 2.510 | 193.64 |
| sdxl_lightning | 31.77 | 57.63 | 2.229 | 193.59 |
| sdxl_photoreal (none) | 38.17 | 57.98 | 2.507 | 193.33 |
| sdxl_photoreal (compact) | 39.26 | 58.07 | 2.532 | 193.26 |
| sdxl_photoreal (full) | 39.79 | 58.05 | 2.551 | 193.27 |

- **Lightning 은 입력보다 디테일을 32% 지운다** (46.50 → 31.77). 결과가 손그림처럼 뭉개진다.
- **RealVisXL 은 그 손실을 절반으로 줄인다** (46.50 → 39.3, Lightning 대비 +24%).
  경계 밀도도 입력과 거의 같다(2.510 → 2.532).
- 밝기는 네 경우 모두 입력과 0.4 이내로 일치 — 조명 상태가 유지된다.

## 10.2 네거티브 프롬프트 full vs compact — 처음으로 측정 가능해진 항목

Lightning 은 `guidance_scale=0` 이라 이 비교가 원리적으로 불가능했다(§10 요구 항목).
CFG 가 켜진 photoreal 프로필에서 처음 측정했다.

| 비교 | MAE (0~255) | 최대 픽셀차 |
|---|---|---|
| compact vs full | 0.3791 | 70 |
| compact vs none | 0.5275 | 61 |
| full vs none | 0.4835 | 72 |
| lightning vs photoreal(compact) | **2.6358** | 157 |

- 네거티브 프롬프트는 **실제로 효과가 있지만 작다** (none → compact MAE 0.53).
  디테일 지표로는 none 38.17 → compact 39.26 → full 39.79 로 단조 증가한다.
- `full` 이 `compact` 보다 미세하게 낫지만(39.79 vs 39.26) 차이가 MAE 0.38 수준이다.
  **주의: `full` 은 77 토큰에서 16개 항목이 잘려나간다** — `duplicated objects`,
  `extra monitor`, `malformed keyboard`, `blurry` 같은 핵심 항목이 그 안에 있고,
  `compact` 에는 남아 있다. 구조 붕괴가 실제로 발생하는 장면에서는 `compact` 가 더 안전하다.
- **모델 교체 효과가 네거티브 프로필 효과보다 5~7배 크다** (MAE 2.64 vs 0.38~0.53).
  프롬프트를 다듬는 것보다 모델을 바꾸는 편이 훨씬 크게 작동한다.

## 10.3 strength 상한(0.45)에서의 천장

`outputs/profiles-20260731-174319/` — photoreal + compact, strength 0.45 (실제 13 step):

```text
laplacianVar 38.04  colorStd 58.08  edgeDensity 2.496  inference 20.5 s
```

0.35(39.26)와 사실상 같다. **strength 를 0.35 → 0.45 로 올려도 실사 재질이 더 좋아지지 않는다.**

육안으로도 0.45 에서 텀블러가 금속처럼, 머그가 제대로 된 손잡이로 정리되지만
**여전히 "깔끔한 3D 렌더"이고 사진이 아니다.** 벽은 평면이고 사진 특유의 노이즈·피사계심도가 없다.

### 이것으로 이전 보고서의 미해결 질문이 정리됐다

"실사 재질이 약한 것이 (a) 정책 상한 때문인지 (b) 합성 fixture 때문인지" 를 못 갈랐는데,
실제 렌더로 측정해 보니 **둘 다였고 지금 지배적인 것은 (a) 도 (b) 도 아니다**:

1. fixture 문제는 실재했다 — 실제 렌더에서는 램프 빛·그림자·재질 그라데이션이 보존되고,
   지표도 합성 fixture(20.5)보다 훨씬 높다(31.8~39.8).
2. 모델 문제도 실재했다 — Lightning → RealVisXL 로 디테일 손실이 절반으로 줄었다.
3. **남은 병목은 img2img 자체다.** strength ≤ 0.45 는 입력의 평면 셰이딩과 조명을 보존하는
   방향으로 작동하므로, 렌더를 사진으로 바꾸지 못한다. 0.35 와 0.45 의 차이가 없다는 것이 그 증거다.

사진 같은 결과가 필요하면 남은 수단은 **구조를 다른 방식으로 고정한 뒤 strength 를 크게 올리는 것**
(ControlNet depth/canny + strength 0.6~0.8)이며, ControlNet 은 현재 POC 범위 밖이다.
