# IMPLEMENTATION_REPORT

> **Part 2 (2026-07-31 추가)**: 새 지시문 "DERO 데스크 셋업 실사화 POC 개선" 반영 결과는
> 이 문서 맨 아래 [Part 2](#part-2--새-지시문-반영-2026-07-31) 절에 있다.
> 아래 Part 1 은 구 설계서(`DERO_SDXL_LIGHTNING_POC_DESIGN.md`) 기준 기록이며,
> **strength 정책(0.25/0.50/0.75 → 0.25/0.35/0.45)과 steps(4 → 9), 응답 스키마가 Part 2 에서 바뀌었다.**


`DERO_SDXL_LIGHTNING_POC_DESIGN.md` 를 `imagine_img/` 에 구현한 결과.
작업 절차는 `CLAUDE_GRILL_THE_DOCS_PROMPT.md` 를 따랐다 (문서 검토 → DESIGN_GAP_REPORT → Phase 순 구현).

작업 일자: 2026-07-31
결론: **설계서 §19 의 완료 조건 18개를 모두 충족한다.** 실제 GPU 에서 총 30회 이상 생성했다.
단, 품질 측면에서 **낮/밤·조명 상태가 기본 설정으로는 결과에 반영되지 않는다**는 사실을 확인했다
(§5, BENCHMARK_RESULTS 3·5절). 이것은 구현 결함이 아니라 설계서 확정값의 귀결이다.

---

## 1. 변경한 파일

전부 신규 생성이며 모두 `imagine_img/` 안에 있다. 저장소의 다른 파일은 하나도 수정하지 않았다.

```text
imagine_img/
├─ pyproject.toml, requirements-lock.txt, .env.example
├─ README.md, NOTICE.md
├─ DESIGN_GAP_REPORT.md, IMPLEMENTATION_REPORT.md, BENCHMARK_RESULTS.md, KNOWN_LIMITATIONS.md
├─ app/
│  ├─ main.py, cli.py
│  ├─ api/          routes_health.py, routes_generation.py
│  ├─ core/         config.py, errors.py, logging.py, metrics.py, env_check.py
│  ├─ models/       pipeline_factory.py, lightning_loader.py, lora_manager.py,
│  │                quantization.py, memory_policy.py, model_service.py
│  ├─ generation/   schemas.py, prompt_builder.py, image_preprocessor.py,
│  │                generator.py, postprocessor.py
│  └─ transport/    input_loader.py, output_store.py
├─ scripts/         check_environment.py, download_models.py, benchmark.py,
│                   smoke_test.py, make_fixture_capture.py
└─ tests/           conftest.py, unit/ (4), integration/ (3), fixtures/desk_capture.png
```

설계서 §4 는 `ai-worker/` 를 제안했지만 지시에 따라 `imagine_img/` 로 만들었다.
책임 분리(api/core/models/generation/transport)는 설계서를 그대로 따랐다.
`env_check.py` 만 설계서에 없는 추가 모듈이다 — CLI(`app.cli env`)와 스크립트가 같은 검사를
공유해야 해서 `app/core/` 로 올렸다.

## 2. Phase 별 결과

### Phase 1 — 환경과 기본 생성

- 저장소·환경 조사 → DESIGN_GAP_REPORT §1~5. 이 저장소에는 프론트/백엔드가 없고
  독립 파이썬 프로젝트 5개뿐임을 확인했다. 새 Worker 를 기존 것과 붙이지 않았다.
- `uv venv --python 3.12` 로 독립 venv. 기존 venv 에 패키지를 추가하지 않았다.
- `scripts/check_environment.py` — torch/CUDA/GPU/VRAM/디스크/패키지 버전 검사, 문제 시 exit 1.
- `scripts/download_models.py` — SDXL Base 는 **fp16 variant 만, unet 가중치 제외**(config.json 만)
  받는다. Lightning full UNet 이 UNet 을 대체하므로 5 GB 를 헛되게 받지 않는다.
- `app/models/lightning_loader.py` — `load_config` → `from_config` → `load_state_dict(strict=True)`
  → `to(fp16)`. strict=True 라 4-step 이외 checkpoint 를 넣으면 즉시 실패한다.

실행 명령과 결과:

```text
scripts/check_environment.py        → 확인된 문제 없음 (torch 2.6.0+cu124, CUDA available, 8188 MiB)
scripts/download_models.py          → 6.46 GB, 약 5분 20초
scripts/smoke_test.py               → 성공 (아래 Phase 2 참고)
```

### Phase 2 — Img2Img 와 후처리

- **설계서 §13 의 `width=`/`height=` 인자를 사용하지 않았다.** diffusers 0.39 의 SDXL Img2Img
  `__call__` 에는 그 파라미터가 없고, `**kwargs` 로 흘러들어가 조용히 무시된다.
  크기는 `image_preprocessor.prepare()` 가 정확히 1152x1024 로 보장하고, 생성 직후 단정한다.
  (DESIGN_GAP_REPORT G-1)
- 입력 검증: PNG/JPEG, 최소 512, 비율 오차 2% 초과 시 거부(자동 crop 금지),
  EXIF 방향 보정, 알파 → 흰 배경 합성, NaN·단색 거부.
- PromptBuilder: 결정적. **CLIP 77 토큰 한도에 맞춘 우선순위 방식**으로 다시 만들었다.
  설계서 §10 예시는 실측 101 토큰이라 "제품을 추가/삭제하지 말라"는 문장이 잘려나가고 있었다.
  (DESIGN_GAP_REPORT G-15)
- 후처리: 1152x1024 → Lanczos 1332x1184 → 좌우 2px 중앙 crop → 1328x1184.
  `intermediate_size` 는 하드코딩이 아니라 `final_height/generation_height` 배율로 계산한다.
- sharpen 은 기본 OFF, 요청별로 켤 수 있다.

첫 GPU 성공 시점의 값:

```text
size 1328x1184 / steps 4 요청, 2 실제 / inference 8257 ms / peak torch VRAM 5355 MB
```

### Phase 3 — 서비스화

- `POST /v1/generations` (multipart: image + request_json). **`def` 엔드포인트**로 두어
  동기 추론이 이벤트 루프를 막지 않게 했다 (그렇지 않으면 `/health/live` 까지 멈춘다).
- single-job lock: `threading.Lock` 비차단 획득 → 두 번째 요청은 대기 없이 `409 JOB_ALREADY_RUNNING`.
- metadata JSON: 모델명·checkpoint·step(요청/실제)·scheduler·timestep_spacing·strength·seed·
  dtype·메모리 모드·양자화·LoRA·단계별 시간·peak VRAM/RAM·경고 목록·요청 원문 전체.
- `/health/live`, `/health/ready`, `/health/model`.
- 오류 코드 11종 + `CONFIGURATION_ERROR`. HTTP 상태와 `retryable` 을 코드별로 매핑했다.
- CLI: `generate`, `serve`, `env`. Windows cp949 콘솔에서 죽지 않도록 stdout 을 UTF-8 로 강제한다
  (이걸 안 하면 `--help` 조차 UnicodeEncodeError 로 죽었다).
- 같은 jobId 재요청은 덮어쓰지 않고 `result_002.png` 로 번호를 올린다.

### Phase 4 — 최적화 슬롯

- MemoryPolicy: `cuda` / `model_cpu_offload`(기본) / `sequential_cpu_offload`.
  offload 전에 `.to("cuda")` 를 호출하지 않는다. VAE tiling 동시 적용.
- LoraManager: 기본 OFF, SDXL 계열 검사, 실패 시 `LORA_LOAD_FAILED` 로 기동 실패(조용한 fallback 없음),
  fuse 기본 false, scale 변경·unload 지원.
- QuantizationStrategy: `none`(기본) / `torchao_int8` / `bnb_nf4`. 실험 모드는 opt-in 플래그 필요.
  미지원은 `QUANTIZATION_NOT_SUPPORTED` 로 즉시 실패한다.
- **여기서 가장 중요한 발견**: `from_pipe()` 에 `torch_dtype` 을 다시 넘기지 않으면
  파이프라인 전체가 조용히 fp32 로 올라간다. 실측 130초/장, torch peak 10.6 GB.
  8 GB 카드에서 OOM 이 아니라 공유 메모리로 밀려나 **느려지기만** 하므로
  "OOM 없이 10회 성공" 조건만으로는 잡히지 않는다.
  → 고정 + `_assert_component_dtypes()` 로 fp16 이 아니면 기동 실패.
  결과: 130초 → **8.3초**, peak 10.6 GB → **5.36 GB**. (DESIGN_GAP_REPORT G-16)
- MemoryPolicy 는 설계서 §7 의 순서와 달리 **마지막**에 적용한다. offload 훅을 먼저 걸면
  그 뒤의 양자화·adapter 적용이 훅이 가리키는 모듈과 어긋난다.

### Phase 5 — 검증

`scripts/benchmark.py --suite all --repeat 10` 으로 17회 + GPU 테스트 12개 + probe 4회 실행.
수치는 `BENCHMARK_RESULTS.md`.

## 3. 실행한 명령

```powershell
# 설치
$env:UV_PYTHON_INSTALL_DIR='<PROJECT_ROOT>\.uv-python'
uv venv --python 3.12 .venv
uv pip install --python .\.venv\Scripts\python.exe torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124
uv pip install --python .\.venv\Scripts\python.exe diffusers==0.39.0 transformers==5.14.1 ...

# 환경·모델
.\.venv\Scripts\python.exe scripts\check_environment.py
.\.venv\Scripts\python.exe scripts\download_models.py
.\.venv\Scripts\python.exe scripts\make_fixture_capture.py

# 생성
.\.venv\Scripts\python.exe scripts\smoke_test.py --preset BALANCED
.\.venv\Scripts\python.exe scripts\benchmark.py --suite all --repeat 10

# 테스트
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pytest -m gpu -q
```

## 4. 테스트 결과

```text
pytest -q          → 66 passed, 12 deselected   (GPU·가중치 불필요, 약 7초)
pytest -m gpu -q   → 12 passed, 66 deselected   (실제 GPU, 211초)
```

단위/CPU 통합 (66개) 이 고정하는 것:

- PromptBuilder 결정성, 보존 지시 3문장이 어떤 입력에서도 살아남음, productId 비노출,
  버려진 문장 보고, 실제 토크나이저 기준 77 토큰 이하(4가지 조명 조합)
- strength 프리셋 매핑(0.25/0.50/0.75)과 임의값 거부, 실제 step 수 계산(1/2/3)
- Lanczos 결과 1328x1184, 중앙 crop 좌표, sharpen OFF 시 무변경, 불가능한 크기 조합 거부
- 입력 비율·최소 크기·단색·알파 처리
- jobId 안전성(`../escape`, `CON`, 공백, 65자 등 거부)
- 잘못된 양자화 모드 거부, 실험 모드 opt-in 강제, NF4 NOT_SUPPORTED
- LoRA: 경로 없음/파일 없음/비 SDXL 거부, scale 반영, fuse 기본 false
- API: 요청 → 결과 저장 → metadata 전체 흐름, **파이프라인에 width/height 를 넘기지 않음**,
  오류 응답 4종, 동일 jobId 비덮어쓰기, job lock 409, 모델 미준비 503 과 live 200 공존

GPU 통합 (12개):

- 모델 상태(scheduler=EulerDiscreteScheduler, timestep_spacing=trailing, steps=4, guidance=0,
  memoryMode=model_cpu_offload, quantization=none, loraEnabled=false)
- 1152x1024 생성 → 1328x1184
- **같은 seed 재현성: 두 결과가 픽셀 단위로 완전히 동일** (`ImageChops.difference` bbox=None)
- strength 3종, 조명 4조합
- 10회 연속 생성 후 peak VRAM 이 첫 회의 1.5배를 넘지 않음
- 회귀 속성(크기/손상/유한값/평균 밝기/표준편차)

## 5. 최대 VRAM 과 생성 시간

```text
peak torch VRAM      : 5356 MB      (10회 연속 내내 동일, 증가 없음)
peak nvidia-smi VRAM : 7589 MB / 8188 MB   (여유 약 600 MB)
peak process RAM     : 9130 MB
모델 로드            : 11,887 ms
warm-up (512x512)    : 6,513 ms
inference            : median 8,165 ms (min 8,032 / max 8,323)
전체 왕복            : median 8,297 ms (min 8,156 / max 8,465)
후처리(Lanczos+crop) : 약 35 ms
저장(PNG)            : 약 85 ms
```

## 6. 설계서 §19 완료 조건

```text
[x] Windows + RTX 4070 Laptop 8GB 에서 실행된다.
[x] Worker 가 127.0.0.1 에만 바인딩된다.            (기본값, 벗어나면 경고 로그)
[x] SDXL-Lightning 4-step Full UNet 가 로드된다.     (strict=True 로 확인)
[x] scheduler 가 Euler + trailing 으로 설정된다.     (GPU 테스트가 단정)
[x] inference steps 가 4로 고정된다.                 (실제 denoise step 은 별도 기록 — G-2)
[x] guidance scale 이 0으로 고정된다.
[x] Img2Img 입력 한 장으로 결과 한 장을 만든다.
[x] 1152x1024 생성에 성공한다.
[x] Lanczos 후 최종 1328x1184 가 된다.
[x] AI 업스케일러를 사용하지 않는다.
[x] sharpen 은 기본 OFF 다.
[x] FP16 + model CPU offload + VAE tiling 이 동작한다. (dtype 검사로 fp32 회귀를 차단)
[x] LoRA 옵션이 설정 파일과 AdapterManager 로 준비된다.
[x] 양자화 전략이 설정 파일과 Strategy 로 분리된다.
[x] 지원되지 않는 4bit 양자화를 조용히 적용하지 않는다.
[x] OOM 오류를 식별 가능한 코드로 반환한다.          (OutOfMemoryError + 메시지 기반 양쪽)
[x] 10회 연속 생성 테스트 결과가 기록된다.
[x] inference, postprocess, total time 과 peak VRAM 이 기록된다.
[x] README 에 설치와 실행 방법이 있다.
```

## 7. 설계서와 다르게 구현한 곳 (전부 근거 있음)

| 위치 | 설계서 | 구현 | 이유 |
|---|---|---|---|
| §13 생성 호출 | `pipe(..., width=1152, height=1024)` | width/height 미전달 | 해당 파라미터가 존재하지 않고 조용히 무시된다 (G-1) |
| §7 순서 | MemoryPolicy(6) → LoRA(7) → 양자화(8) | 양자화 → LoRA → MemoryPolicy | offload 훅을 먼저 걸면 이후 모듈 교체와 어긋난다 |
| §7 img2img 생성 | `Img2ImgPipeline(**components)` | `from_pipe(..., torch_dtype=fp16)` | dtype 을 안 넘기면 전체가 fp32 로 올라간다 (G-16) |
| §10 프롬프트 | 예시 문장 그대로 | 압축 + 우선순위 + 초과 보고 | 예시는 101 토큰이라 뒤가 잘린다 (G-15) |
| §4 디렉터리 | `ai-worker/` | `imagine_img/` | 사용자 지시 |
| §13 generator device | (미지정) | 기본 `cpu` | 메모리 모드를 바꿔도 같은 seed 가 재현되게 |

## 8. 남은 위험

1. **낮/밤·조명 프롬프트가 기본 설정에서 작동하지 않는다** (MAE 0.20/255).
   strength 를 0.75 로 올리면 10배 개선되지만(2.06) 그 대가로 제품이 교체될 수 있다
   (머그컵 → 책 더미 관측). step 을 4로 보정해도 개선되지 않는다. `guidance_scale=0` 이라
   CFG 로 강제할 수도 없다. **이 POC 의 목표 중 "상태 반영" 부분은 현재 설정으로 미달이다.**
   다음 수단은 (a) strength 상향, (b) guidance_scale > 0 실험(Lightning 권장값에서 이탈),
   (c) ControlNet/IP-Adapter 도입(POC 범위 밖) 중 하나이며, 모두 설계서 확정값을 건드린다.
2. **VRAM 여유가 약 600 MB 뿐이다.** 브라우저 등 다른 GPU 앱이 붙으면 공유 메모리로 밀려나
   OOM 없이 수십 배 느려진다. 이 상태는 오류로 잡히지 않으므로 `nvidiaSmiVramMb` 를 봐야 한다.
3. 실제 시뮬레이터 캡처로 검증하지 못했다. fixture 는 합성 도형 이미지이고,
   실제 3D 렌더는 그라데이션·그림자가 있어 반응이 다를 수 있다(좋은 쪽일 가능성이 높다).
4. 양자화 C~F 조합과 LoRA ON 조합은 미검증이다(BENCHMARK_RESULTS 7절).
5. `enable_vae_tiling()` / `upcast_vae` 는 diffusers 0.40 에서 제거 예정 경고가 뜬다.
   업그레이드 시 `pipe.vae.enable_tiling()` / `pipe.vae.to(torch.float32)` 로 옮겨야 한다.
6. transformers 5.x 는 최신 메이저다. 지금 조합은 동작하지만 `requirements-lock.txt` 를 벗어나
   올리면 텍스트 인코더 로딩이 깨질 수 있다.

---

# Part 2 — 새 지시문 반영 (2026-07-31)

대상: 22절 작업 지시문 "DERO 데스크 셋업 실사화 POC 개선".
절차는 §19 를 따랐다: 저장소 분석 → 기존 코드 확인 → 버전 확인 → 충돌 확인 →
`DESIGN_GAP_REPORT.md` Part 2 작성 → **사용자 결정 수령** → 구현 → 테스트 → 측정 → 문서화.

## P2-1. 구현 전에 받은 결정

C2·C3·C4 는 지시문 내부의 확정값들이 서로 충돌하는 항목이라 임의로 정하지 않고 확인받았다.

| 항목 | 결정 |
|---|---|
| strength 기본값 (직전 구두 지시 0.75 vs 새 문서 0.35) | **새 문서 0.35 채택** |
| 0.25/0.35/0.45 가 4-step 에서 동일 이미지가 되는 문제 | **8-step checkpoint + steps=9** |
| 네거티브 프롬프트 vs `guidance_scale=0` | **모델 프로필별로 분리** |
| 프롬프트 156 토큰 (한도 75) | **압축 + 우선순위 유지** (compel 도입 안 함) |

## P2-2. 변경한 파일

`ai-worker/` 를 새로 만들지 않고 기존 `imagine_img/` 구조에 넣었다 (§20, §21).

```text
신규
  app/models/profiles.py            모델 프로필 3종 (§3)
  app/models/backend.py             ImageGenerationBackend Protocol + SDXL 구현 (§3)
  scripts/compare.py                strength 비교 + §18 평가표 생성 (§17)
  docs/DERO_REALISTIC_IMAGE_POC.md
  docs/MODEL_PROFILE_GUIDE.md
  docs/LORA_AND_QUANTIZATION_GUIDE.md
  tests/unit/test_profiles_and_strength.py
  tests/fixtures/desk_capture_{day,night}_{on,off}.png   조명이 구워진 입력 4종

수정
  app/core/config.py                프로필 합성, 새 env 이름, strength 정책, WebP, INPUT_DIR
  app/core/metrics.py               max_memory_reserved 추가 (§16)
  app/generation/prompt_builder.py  §6 의 5개 빌더로 재구성, 네거티브 2프로필, 색 이름 변환
  app/generation/schemas.py         §4 요청 / §15 응답으로 교체
  app/generation/generator.py       프로필 값 사용, 네거티브 전달, timing 키, 경고 3종
  app/models/pipeline_factory.py    비 Lightning 프로필 지원, scheduler 조건부 교체
  app/models/lightning_loader.py    SDXL_LIGHTNING_UNET_PATH 지원
  app/models/memory_policy.py       xFormers auto 검사 (§14)
  app/models/quantization.py        bnb_nf4_experimental 이름 (별칭 유지)
  app/models/model_service.py       describe() 에 프로필 정보
  app/api/routes_generation.py      업로드 또는 simulatorViewPath
  app/transport/input_loader.py     INPUT_DIR 하위 제한
  app/transport/output_store.py     선택적 WebP 저장 (§11)
  app/cli.py                        strength 를 값으로 받음
  scripts/{benchmark,download_models,make_fixture_capture}.py
  .env.example, README.md, DESIGN_GAP_REPORT.md, BENCHMARK_RESULTS.md, KNOWN_LIMITATIONS.md
  tests/ (기존 3개 파일 갱신)
```

기존 프로젝트(`deskterior/`, `img2fbx/`, `Hunyuan3D-2/`, `recommend_sys/`, `docs/adr/`)는
하나도 건드리지 않았다. 착수 전 Part 1 코드 전체를 백업했다(§P2-9 되돌리기 계획).

## P2-3. 실행한 명령

```powershell
# 8-step 가중치 (4.78 GiB)
.\.venv\Scripts\python.exe -c "from huggingface_hub import hf_hub_download; hf_hub_download('ByteDance/SDXL-Lightning','sdxl_lightning_8step_unet.safetensors', cache_dir='model-cache')"

# 조명 4조합 fixture
.\.venv\Scripts\python.exe scripts\make_fixture_capture.py --all

# 테스트
.\.venv\Scripts\python.exe -m pytest -q          # 104 passed
.\.venv\Scripts\python.exe -m pytest -m gpu -q   # 14 passed (235초)

# 측정
.\.venv\Scripts\python.exe scripts\compare.py --time-of-day NIGHT --room-light on --image tests\fixtures\desk_capture_night_on.png
.\.venv\Scripts\python.exe scripts\benchmark.py --suite all --repeat 10
```

## P2-4. 테스트 결과

```text
pytest -q          → 104 passed, 12 deselected   (GPU·가중치 불필요, 약 11초)
pytest -m gpu -q   →  14 passed, 104 deselected  (실제 GPU, 235초)
```

새로 고정한 것 중 중요한 것:

- **strength 0.25/0.35/0.45 가 2/3/4 step 으로 갈라진다** — 그리고 회귀 방지용으로
  "steps 를 4로 되돌리면 세 값이 모두 1 step 이 되어 비교가 무의미해진다"는 사실도 테스트로 못박았다.
- 0.5 이상 strength 는 API·CLI·설정 어디서든 거부된다 (§5).
- GPU 테스트가 세 strength 결과의 MAE > 0.05 를 단정한다 — "비교했다"가 거짓이 될 수 없게.
- 조명 4조합에서 출력 평균 밝기가 입력 평균 밝기와 12 이내로 일치한다 (§8 원칙 검증).
- 네거티브 프롬프트가 무효인 프로필에서 `negativePromptEffective: false` + 경고가 남는다.
- `simulatorViewPath` 가 `INPUT_DIR` 밖을 가리키면 400.
- productId 가 프롬프트에 절대 노출되지 않고, 색은 hex 가 아니라 색 이름으로 들어간다.

## P2-5. 최대 VRAM 과 생성 시간

```text
모델 로드            : 11,781 ms
warm-up (512x512)    : 6,373 ms
inference            : median 8,272 ms (min 8,115 / max 8,474)   [strength 0.35, 3 step]
전체 왕복            : median 8,372 ms
strength별 inference : 0.25 → 7,939 ms / 0.35 → 8,492 ms / 0.45 → 8,870 ms
peak torch allocated : 5,355 MB (10회 내내 동일)
peak torch reserved  : 7,684 MB
peak nvidia-smi      : 7,589 MB / 8,188 MB  → 여유 약 600 MB
peak process RAM     : 9,133 MB
OOM                  : 없음 (10/10)
```

## P2-6. 지시문과 다르게 구현한 곳 (전부 근거 있음)

| 위치 | 지시문 | 구현 | 이유 |
|---|---|---|---|
| §2 steps | `num_inference_steps=4` | **9** (+ 8-step ckpt) | 4에서는 0.25/0.35/0.45 가 픽셀 단위로 동일한 이미지가 된다 (P2-3, 사용자 결정) |
| §2 guidance / §10 네거티브 | 둘 다 고정 요구 | 프로필 속성으로 분리 | `guidance_scale<=1` 이면 CFG 가 꺼져 네거티브가 무효다 (P2-4, 사용자 결정) |
| §7 공통 프롬프트 | 원문 85 토큰 | 압축 3문장 약 30 토큰 | 원문 조합이 156 토큰으로 한도의 2.1배 (P2-5, 사용자 결정) |
| §10 full 프로필 | 전문 사용 | 우선순위대로 잘림 + 보고 | 128 토큰이라 CFG 를 켜도 77 을 넘는다 |
| §4 moodTags | `WHITE`,`BLUE`,`MINIMAL` | §9 의 5종으로 정규화 | 지시문 §4 와 §9 가 서로 다르다. §9 를 정본으로 삼고 §4 표기를 매핑 |
| §4 productLights color | `#6FA8FF` | `cool blue` 로 변환 | CLIP 은 hex 를 색으로 해석하지 못하고 토큰만 6개 이상 쓴다 |
| §4 참조 이미지 | 선택 입력 | 기록만, 미사용 | IP-Adapter 가 범위 밖. 조용히 무시하지 않고 경고로 알린다 |
| §20 디렉터리 | `ai-worker/`, `docs/` | `imagine_img/`, `imagine_img/docs/` | 중복 디렉터리 금지(§20), 최상위 `docs/` 는 ADR 전용 |
| §15 `resultUrl` | URL | `file://` 경로 | 로컬 POC 라 업로드 대상이 없다 |

## P2-7. 남은 위험

1. **실사 재질 개선이 약하다.** strength 상한 0.45(4 step)에서는 입력에서 크게 벗어나지 않는다.
   §1 의 "AI 일러스트가 아닌 실제 사진처럼" 은 현재 fixture 기준으로 미달이다.
   원인이 두 개 섞여 있다 — (a) 정책 상한, (b) fixture 가 평면 도형이라 모델이 참고할 질감이 없음.
   **실제 시뮬레이터 캡처로 재측정하기 전에는 어느 쪽이 지배적인지 판정할 수 없다.**
   실사 특화 프로필(`sdxl_photoreal`)이 이 문제의 정면 해법이지만 모델 ID·라이선스 확인이 필요하다.
2. **기본 프로필에서 §10 네거티브가 무효다.** CGI·플라스틱·중복 객체 억제 목표는
   CFG 를 켠 프로필로 가야 달성된다. 그 경우 생성 시간이 약 2배 이상 늘어난다(미측정).
3. **VRAM 여유 약 600 MB.** 다른 GPU 앱이 붙으면 오류 없이 수십 배 느려진다.
   `nvidiaSmiVramMb` 를 봐야 알 수 있다.
4. `steps=9` 는 8-step checkpoint 설계점에서 1 벗어난 값이다. 품질 영향은 육안으로 확인되지 않았다.
5. LoRA ON 조합, TorchAO INT8 은 미검증이다. BnB NF4 는 이 경로에서 지원 불가로 확정.
6. `enable_vae_tiling()` / `upcast_vae` 는 diffusers 0.40 에서 제거 예정 경고가 뜬다.
7. 실제 시뮬레이터 캡처가 없어 §18 의 육안 평가는 합성 fixture 기준이다.
