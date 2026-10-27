# DESIGN_GAP_REPORT

`DERO_SDXL_LIGHTNING_POC_DESIGN.md` 를 이 저장소의 실제 상태와 대조한 결과.
`CLAUDE_GRILL_THE_DOCS_PROMPT.md` 4번 항목에 따라 구현 전에 작성했다.

측정 시각 기준: 2026-07-31, `<PROJECT_ROOT>`.
아래 모든 수치는 이 장비에서 직접 실행해 얻은 값이며, 확인하지 못한 것은 "확인 불가"로 남겼다.

---

## 1. 확인된 실제 기술 스택

이 저장소에는 **프론트엔드도 백엔드도 없다.** 설계서 §21-1(프론트/백엔드 스택), §22(Java/Spring 백엔드
가정)는 이 저장소에서 검증할 대상이 존재하지 않는다. 저장소는 서로 독립적인 파이썬/툴링 프로젝트 5개다.

| 디렉터리 | 정체 | 파이썬 | 비고 |
|---|---|---|---|
| `deskterior/` | 제품 규격 크롤링 파이프라인 (typer CLI) | 3.12.13 | httpx/bs4/anthropic |
| `img2fbx/` | 이미지 폴더 → FBX 변환 (3.12 CUDA + 3.11 bpy) | 3.12/3.11 | 유일한 기존 "이미지 입력" 흐름 |
| `Hunyuan3D-2/` | 이미지 → 3D 생성 (업스트림 clone) | 3.12.13 | torch CUDA 동작 확인된 venv |
| `recommend_sys/` | 제품 태깅 FastAPI POC | 3.12.13 | **포트 8000** 사용 |
| `docs/adr/`, `CONTEXT.md` | 도메인 용어집·ADR | — | 제품/리스팅/확정값 용어 정의 |

- 패키지 관리: **uv 0.11.32**. 시스템 파이썬 없음. 인터프리터는 저장소 로컬 `.uv-python/`
  (`cpython-3.11.15`, `cpython-3.12.13`)에 설치되어 있고, 각 프로젝트가 자기 `.venv` 를 갖는다.
- 테스트 프레임워크: pytest (`recommend_sys/.pytest_cache`, `deskterior/tests`).

## 2. 현재 관련 파일 목록

설계서가 말하는 "기존 이미지 생성/업로드 API"에 해당하는 것은 **없다**. 가장 가까운 것:

- `img2fbx/run.py`, `img2fbx/stages/` — `input/` 폴더의 이미지를 읽어 `output*/` 로 산출물을 쓴다.
  HTTP API 가 아니라 폴더 기반 배치다.
- `Hunyuan3D-2/api_server.py` — 업스트림이 제공하는 이미지→3D HTTP 서버 (이 POC 와 무관).
- `recommend_sys/app/main.py` — 저장소 내 유일한 FastAPI 앱. 포트 8000.

## 3. 기존 이미지 처리 흐름

```text
img2fbx/input/*.png ──> Hunyuan3D-2 (GLB) ──> bpy (FBX) ──> img2fbx/output*/
deskterior ──> 제품 규격 DB / 이미지 URL 수집
```

즉 기존 흐름은 **제품 1개 → 3D 에셋 1개**다. 이번 POC 는 **씬 캡처 1장 → 실사 이미지 1장**으로
입출력 단위 자체가 다르다. 두 흐름은 공유할 코드가 없으므로 붙이지 않는다.

## 4. 새 AI Worker 를 넣을 위치

- 설계서 §4 는 `ai-worker/` 를 제안하지만, 사용자 지시에 따라 **`imagine_img/`** 를 새로 만든다.
  디렉터리 이름만 다르고 책임 분리(`api/ core/ models/ generation/ transport/`)는 설계서를 그대로 따른다.
- 기존 프로젝트의 venv·의존성·산출물 폴더는 건드리지 않는다. `imagine_img/.venv` 를 새로 만든다.
- 포트는 설계서 기본값 **8010** 을 유지한다. `netstat` 확인 결과 80xx 대역 리스너 없음,
  `recommend_sys` 의 8000 과도 충돌하지 않는다.

## 5. GPU / CUDA / Python 환경 확인 결과

```text
GPU            : NVIDIA GeForce RTX 4070 Laptop GPU (WDDM)
VRAM           : 8188 MiB (사용 중 0 MiB, 실행 프로세스 없음)
드라이버       : 591.74 / 드라이버 CUDA 13.1
OS             : Windows 11 Enterprise 10.0.26200
디스크 여유    : C: 1.8 TB
기존 HF 캐시   : ~/.cache/huggingface = 25 GB (Hunyuan3D-2, Hunyuan3D-2mini, CLIP-ViT)
```

`Hunyuan3D-2/.venv` 에서 직접 확인한 조합 (이 POC 의 버전 근거):

```text
torch 2.6.0+cu124   torch.version.cuda=12.4   torch.cuda.is_available()=True
diffusers 0.39.0    transformers 5.14.1       accelerate 1.14.0
safetensors 0.8.0   huggingface-hub 1.25.1    pillow 12.2.0
peft / fastapi / uvicorn / bitsandbytes / torchao : 없음
```

드라이버 CUDA 13.1 > torch cu124 이므로 하위 호환으로 동작한다(이미 동작 확인됨).
설계서 §21-9(모델 저장 용량)는 문제없다. 이 POC 가 받는 가중치는 약 7 GB.

## 6. 설계와 저장소·라이브러리의 충돌

### G-1 (치명적) — SDXL Img2Img 는 `width`/`height` 인자를 받지 않는다

설계서 §13 의사코드는 `pipe(..., width=1152, height=1024)` 를 호출한다.
`diffusers 0.39.0` 의 `StableDiffusionXLImg2ImgPipeline.__call__` 파라미터를 직접 조사한 결과
**`width`/`height` 가 없다.** `**kwargs` 는 `callback`/`callback_steps` 만 꺼내 쓰고 나머지는 버린다
(`pipeline_stable_diffusion_xl_img2img.py:1180`). 즉 예외도 안 나고 **조용히 무시**되며,
출력 크기는 입력 이미지 크기를 그대로 따른다.

→ 대응: 크기는 전처리에서만 결정한다. 전처리가 정확히 1152×1024 를 보장하고,
`width`/`height` 는 절대 넘기지 않으며, 생성 직후 `generated.size == (1152, 1024)` 를 단정한다.
설계서의 고정값(1152×1024)은 그대로 지킨다 — 지키는 위치만 바뀐다.

### G-2 (중요) — img2img 에서 실제 denoise step 은 4가 아니다

`get_timesteps()` 는 `init_timestep = min(int(num_inference_steps * strength), num_inference_steps)`
(`...img2img.py:650`). `num_inference_steps=4` 고정 하에서:

```text
strength 0.25 (PRESERVE)  -> 실제 1 step
strength 0.50 (BALANCED)  -> 실제 2 step
strength 0.75 (REALISTIC) -> 실제 3 step
```

설계서 §2.2 는 "4-step checkpoint 와 `num_inference_steps=4` 를 반드시 함께 쓴다"고 하는데,
img2img 경로에서는 그 4가 실제 실행 step 수가 아니다. 특히 PRESERVE 는 1 step 이라
"실사화 변화가 약할 수 있다"(§2.3)를 넘어 **거의 입력 복사**가 될 가능성이 높다.

→ 대응: 고정값은 계약이므로 **바꾸지 않는다**. 대신
(a) `effectiveSteps` 를 계산해 metadata·응답에 기록하고,
(b) `COMPENSATE_STEPS_FOR_STRENGTH` 플래그(기본 OFF)로 `steps = round(4/strength)` 보정 경로만
열어두고, (c) Phase 5 strength 비교에서 이 수치를 함께 보고한다.
플래그를 켜는 판단은 실제 결과를 보고 사용자가 한다.

### G-3 — `UNet2DConditionModel.from_config(base, subfolder="unet")`

0.39.0 의 시그니처는 `from_config(config=None, return_unused_kwargs=False, **kwargs)` 로,
첫 인자에 저장소 ID 를 넘기는 것은 deprecated 경로다. 공식 모델 카드 코드가 그 형태라 동작은 하지만
경고에 의존하지 않기 위해 `load_config(base, subfolder="unet")` → `from_config(config)` 로 명시한다.

### G-4 — `StableDiffusionXLImg2ImgPipeline(**text2img.components)`

두 생성자 파라미터를 대조한 결과 t2i components 가 img2img 생성자에 그대로 들어가긴 한다
(`image_encoder`, `feature_extractor` 포함). 다만 `requires_aesthetics_score` 등 config 전파를
직접 다루게 되므로, 0.39.0 에 존재가 확인된 **`from_pipe()`** 를 1순위로 쓰고
실패 시 생성자 주입으로 폴백한다. 설계서 §7 이 요구한 "components 공유"는 두 경로 모두 만족한다.

### G-5 — fp16 VAE 는 SDXL 에서 NaN/검은 이미지 위험이 있다

SDXL Base 의 VAE config 는 `force_upcast=true` 라 diffusers 가 디코드 시 fp32 로 올린다.
1152×1024 디코드를 8 GB 안에서 버티게 해주는 것이 `enable_vae_tiling()` 이므로
**둘을 동시에 유지**해야 한다. `force_upcast` 를 끄거나 VAE 를 fp16 강제로 두지 않는다.
검은 이미지가 재현되면 `madebyollin/sdxl-vae-fp16-fix` 가 대안이지만 POC 범위 밖이다.

### G-6 — offload 와 generator 디바이스

`enable_model_cpu_offload()` 는 구성요소를 요청마다 이동시킨다. `torch.Generator("cuda")` 로 seed 를
고정하면 MEMORY_MODE 를 바꿨을 때 같은 seed 가 다른 결과를 낸다.
→ `GENERATOR_DEVICE=cpu` 를 기본값으로 하여 메모리 모드와 무관하게 재현되게 한다(설정으로 변경 가능).
설계서 §13 의 `model_service.generator_device` 를 그대로 쓰는 것이므로 계약 위반이 아니다.

### G-7 — `guidance_scale=0.0` 과 negative prompt

`do_classifier_free_guidance` 는 `self._guidance_scale > 1` (`...img2img.py:951`)이다.
0.0 이면 CFG 가 완전히 꺼지고 negative prompt 는 **아무 영향이 없다**.
설계서 §2.2 요구대로, negative prompt 가 요청에 들어오면 무시되었다는 경고를 로그와 metadata 에 남긴다.

### G-8 (미확인 위험) — transformers 5.14.1 × diffusers 0.39.0

transformers 5.x 는 메이저 업그레이드다. SDXL 의 `CLIPTextModel`/`CLIPTextModelWithProjection`
로딩이 이 조합에서 정상인지는 **가중치를 실제로 로드해봐야 판정된다**. Hunyuan3D-2 는 SDXL 텍스트
인코더를 쓰지 않으므로 기존 동작이 근거가 되지 않는다. → Phase 1 첫 모델 로드가 이 위험의 판정 지점.

### G-9 — 양자화 의존성이 없다

`torchao`, `bitsandbytes` 미설치. Windows 에서 bitsandbytes 는 휠 사정이 까다롭다.
설계서 §9.4 대로 `QUANTIZATION_FALLBACK=fail` 고정, 기본 `none`.
미지원 경로는 `QUANTIZATION_NOT_SUPPORTED` 로 즉시 실패하고 fp16 으로 조용히 돌지 않는다.

### G-10 — LoRA 는 peft 가 필요하다

`load_lora_weights` + `set_adapters` 조합은 peft 를 요구한다. 새 venv 에 설치했다.
로드 실패 시 `LORA_LOAD_FAILED` 로 기동 자체를 실패시키고 기본 모델로 넘어가지 않는다(설계서 §8.3).

### G-11 — 모델 캐시 위치

설계서는 `./model-cache`. 기존 25 GB 캐시는 `~/.cache/huggingface` 에 있는데 SDXL 은 거기에 없으므로
중복 저장은 발생하지 않는다. 설계서를 따라 `imagine_img/model-cache` 로 격리한다.
SDXL Base 저장소는 fp32/fp16 가 함께 있어 통째로 받으면 13 GB 이상이므로
**fp16 variant + unet 은 config.json 만** 받는다(UNet 가중치는 Lightning 것으로 대체되므로 불필요).

### G-12 — 서비스화 관련 실무 충돌

- FastAPI 엔드포인트를 `async def` 로 만들면 동기 추론이 이벤트 루프를 막아 `/health/live` 까지 죽는다.
  → 생성 엔드포인트는 `def` 로 두어 threadpool 에서 돌린다. 단일 작업 락은 `threading.Lock` 비차단 획득.
- `jobId` 가 출력 디렉터리 이름이 된다. Windows 예약어(`CON`, `NUL`, `AUX`…)와 경로 구분자를
  거부해야 한다(설계서 §18.2 "파일명 안전성").

## 7. 누락된 필수 정보 (확인 불가)

1. **DERO 시뮬레이터 캡처의 실제 크기와 비율** (§21-7). 시뮬레이터가 이 저장소에 없다.
   → POC 는 "파일을 받아 비율을 검증"하는 쪽으로 구현하고, 1152×1024 가 아니면
   비율 오차 2% 안에서만 Lanczos 리사이즈하고 그 밖은 `INVALID_IMAGE` 로 거부한다(자동 crop 금지).
2. **결과 파일 저장 규칙**(§21-8) / **라이선스 고지 파일 위치**(§21-11) — 저장소에 규칙이 없다.
   → `outputs/<jobId>/result.png` + `metadata.json` 으로 설계서 §11.2 예시를 그대로 따르고,
   모델 라이선스 고지는 `imagine_img/NOTICE.md` 로 새로 만든다.
3. **DERO LoRA 파일** — 존재하지 않는다. 인터페이스만 구현하고 기본 OFF.
4. **품질 목표 SLA** — 설계서 §16 이 "근거 없는 고정 SLA 금지"라 했으므로 측정값만 남긴다.

## 8. 변경 예정 파일

전부 **신규 생성**이며 모두 `imagine_img/` 안에 있다.

```text
imagine_img/pyproject.toml, requirements-lock.txt, .env.example, README.md, NOTICE.md
imagine_img/DESIGN_GAP_REPORT.md, IMPLEMENTATION_REPORT.md, BENCHMARK_RESULTS.md, KNOWN_LIMITATIONS.md
imagine_img/app/**  (main, cli, api/, core/, models/, generation/, transport/)
imagine_img/scripts/{check_environment,download_models,benchmark,smoke_test}.py
imagine_img/tests/{unit,integration,fixtures}/**
imagine_img/.venv/**, imagine_img/model-cache/**, imagine_img/outputs/**  (생성물)
```

## 9. 변경하지 않을 파일

`deskterior/`, `img2fbx/`, `Hunyuan3D-2/`, `recommend_sys/`, `docs/`, `CONTEXT.md`,
`skills-lock.json`, `.claude/`, `.agents/`, `.uv-python/`(인터프리터 재사용만),
그리고 원본 설계 문서 2개. 기존 venv 에 패키지를 추가하지 않는다.

## 10. 단계별 구현 계획

설계서 §20 Phase 순서를 유지한다.

```text
Phase 1  환경 검사 스크립트 / 모델 다운로드 / Lightning Full UNet 로딩 / smoke test
Phase 2  Img2Img 구성 / 입력 검증 / PromptBuilder / 1152x1024 생성 / Lanczos+crop / sharpen
Phase 3  FastAPI 생성 API / single-job lock / metadata / health / 오류코드 / CLI
Phase 4  MemoryPolicy / LoraManager / QuantizationStrategy / fp16 벤치마크
Phase 5  조명 4조합·strength 3종 검증 / 10회 연속 안정성 / 보고서 3종
```

Phase 1 끝에서 G-8(transformers 5 호환)이 판정된다. 여기서 막히면 그 시점에
`transformers 4.x` 로 내리는 것을 제안하고, 조용히 우회하지 않는다.

## 11. 테스트 계획

- 단위(GPU 불필요): PromptBuilder 결정성, strength 프리셋 매핑, effective step 계산,
  입력 비율 검증, Lanczos 결과 1328×1184, crop 좌표, sharpen OFF 시 무변경,
  잘못된 양자화 모드 거부, LoRA 파일 부재 오류, jobId 안전성, job lock.
- CPU 통합: fake pipeline 주입 → API 요청부터 metadata 저장까지, 오류 응답, 동일 jobId 충돌.
- GPU 통합(`-m gpu`): 모델 로드 → warm-up → 1152×1024 1회 → 10회 연속 →
  낮/밤 × 조명 ON/OFF 4조합 → strength 0.25/0.50/0.75 → peak VRAM 기록.
- 회귀: 고정 fixture + seed. 픽셀 일치가 아니라 크기·손상·평균 밝기·히스토그램 범위로 검사.

## 12. 되돌리기 계획

`imagine_img/` 디렉터리 하나만 지우면 저장소는 이전 상태로 완전히 돌아온다.
저장소 밖 상태 변경은 없다 — 모델은 `imagine_img/model-cache/` 에만 받고,
공유 HF 캐시(`~/.cache/huggingface`)와 기존 venv 는 수정하지 않는다. 새로 여는 포트도 8010 뿐이다.

## 13. 구현 중 실측으로 드러난 추가 충돌

아래 둘은 문서만 읽고는 알 수 없었고, 실제로 돌려서 계측한 뒤에 드러났다.
설계서 의사코드를 그대로 옮겨 적었다면 둘 다 **오류 없이 조용히 잘못 동작**했다.

### G-15 (중요) — 설계서 §10 의 프롬프트는 CLIP 77 토큰을 넘는다

설계서 §10 의 출력 예시를 실제 SDXL 토크나이저로 세면 **101 토큰**이다. CLIP 은 77 만 보고
나머지를 자른다. 첫 실행 로그에 실제로 이렇게 남았다.

```text
Token indices sequence length is longer than the specified maximum sequence length (126 > 77)
The following part of your input was truncated because CLIP can only handle sequences up to 77 tokens:
['... do not add , remove , duplicate , replace , or relocate any desk product .']
```

즉 **"제품을 추가/삭제하지 말라"는 지시가 통째로 잘려나가고 있었다.** 설계서 §10 이
"배치 보존 지시를 앞부분에 둔다"고 한 이유가 여기 있지만, 앞에 두는 것만으로는 뒤가 잘리는 것을
막을 수 없다.

→ 대응: 문장을 압축하고(뜻은 유지) 문장마다 우선순위를 부여했다.
우선순위 0(보존 지시 3문장)은 어떤 경우에도 남기고, 예산을 넘으면 낮은 우선순위부터 버리며
**무엇을 버렸는지 응답·metadata 에 남긴다.** 토큰 계산은 파이프라인의 실제 토크나이저로 한다.
`tests/integration/test_prompt_fits_clip.py` 가 4가지 조명 조합에서 77 토큰 이하임을 검증한다.

### G-16 (치명적) — `from_pipe()` 가 fp16 파이프라인을 조용히 fp32 로 올린다

설계서 §7 은 `text2img.components` 를 공유해 Img2Img 파이프라인을 만들라고 한다.
diffusers 0.39.0 의 `from_pipe` 는 내부에서 이렇게 한다.

```python
torch_dtype = kwargs.pop("torch_dtype", torch.float32)   # pipeline_utils.py:2125
...
new_pipeline.to(dtype=torch_dtype)                       # pipeline_utils.py:2224
```

`torch_dtype` 을 다시 넘기지 않으면 **기본값 float32 로 전체를 캐스팅한다.**
경고도 예외도 없다. 실측 결과:

| | UNet 크기 | torch peak VRAM | 추론 시간 | 모델 로드 |
|---|---|---|---|---|
| `from_pipe(text2img)` (fp32) | 9.56 GiB | 10606 MB | **약 130초/장** | 45.0초 |
| `from_pipe(text2img, torch_dtype=fp16)` | 4.78 GiB | 5356 MB | **약 8.3초/장** | 12.5초 |

8GB 카드에서 fp32 UNet 은 OOM 으로 죽지 않는다. WDDM 이 공유 시스템 메모리로 밀어내기 때문에
**"OOM 없이 45배 느려질" 뿐**이다. 설계서 §19 의 완료 조건("OOM 없이 10회 연속 성공")만 보면
이 상태도 통과해버린다.

→ 대응: `from_pipe(..., torch_dtype=dtype)` 로 고정하고, 그 뒤에
`_assert_component_dtypes()` 로 unet/vae/text_encoder 2개의 dtype 을 검사해
fp16 이 아니면 `MODEL_LOAD_FAILED` 로 기동을 실패시킨다. 조용한 fp32 회귀를 두 번 겪지 않기 위해서다.

## 14. 판정

**치명적 차단 요소 없음.** G-1 은 설계서 의사코드를 그대로 베끼면 조용히 깨지는 문제라
구현 위치를 옮겨 해결했고, G-2 는 설계서 고정값과 실제 동작이 어긋나는 사실이므로
값을 바꾸지 않고 계측·보고로 처리했다. G-8 만 실행으로 판정되는 위험으로 남는다.
→ 구현을 시작한다.

---

# Part 2 — 새 지시문 "DERO 데스크 셋업 실사화 POC 개선" 검토

대상: 2026-07-31 수신한 22절 작업 지시문.
이 절은 그 지시문의 §19 순서(저장소 분석 → 기존 코드 확인 → 버전 확인 → 충돌 확인 → 이 보고서)에 따라
**코드를 수정하기 전에** 작성했다. 모든 수치는 이 장비에서 직접 실행해 얻었다.

## P2-1. 저장소 분석 결과 (§19-1~3)

기존 AI 이미지 생성 코드는 **이미 존재한다** — 이 세션에서 만든 `imagine_img/` 다.
새 지시문 §20 이 요구한 `ai-worker/` 를 새로 만들면 중복 디렉터리가 되므로 만들지 않는다
(§20 "기존 구조가 다르면 별도 중복 디렉터리를 만들지 않는다", §21 "기존 기능을 대규모로 재작성하지 않는다").

| 새 지시문 §20 요구 파일 | 재사용할 기존 파일 | 상태 |
|---|---|---|
| `model_loader.py` | `app/models/pipeline_factory.py`, `lightning_loader.py` | 존재. 프로필 추상화만 추가 필요 |
| `generation_service.py` | `app/generation/generator.py`, `app/models/model_service.py` | 존재 (단일 작업 락·상주 로딩 포함) |
| `prompt_builder.py` | `app/generation/prompt_builder.py` | 존재. 네거티브·무드 블록 추가 필요 |
| `postprocess.py` | `app/generation/postprocessor.py` | 존재. Lanczos 1332→crop 완료 |
| `lora_manager.py` | `app/models/lora_manager.py` | 존재. 계약 3종 + 계열 검사 완료 |
| `quantization.py` | `app/models/quantization.py` | 존재. Strategy 3종, fail-fast 완료 |
| `schemas.py` | `app/generation/schemas.py` | 존재. 필드 확장 필요 |
| `benchmark.py` | `scripts/benchmark.py` | 존재. 비교 스크립트 별도 추가 필요 |
| `docs/*.md` 5종 | `imagine_img/*.md` 4종 | 3종은 내용상 이미 있음 (아래 P2-8) |

즉 새 지시문의 요구 중 **구조·후처리·LoRA·양자화·계측·단일작업·오류코드는 이미 구현·검증되어 있고**,
새로 필요한 것은 (a) 모델 프로필 추상화, (b) 네거티브 프롬프트, (c) 무드 블록,
(d) strength 비교 스크립트, (e) 참조 이미지 입력 처리다.

## P2-2. 버전 확인 (§19-4)

```text
torch 2.6.0+cu124 (CUDA available) / diffusers 0.39.0 / transformers 5.14.1
peft 0.20.0 / accelerate 1.14.0 / pillow 12.2.0
xformers      : 미설치  → PyTorch SDPA 사용 가능 (AttnProcessor2_0 확인). ENABLE_XFORMERS=auto 는 SDPA 로 귀결
torchao       : 미설치  → torchao_int8 은 opt-in 시 fail-fast
bitsandbytes  : 미설치  → bnb_nf4 는 NOT_SUPPORTED
compel        : 미설치  → 77토큰 초과 프롬프트를 임베딩으로 이어붙일 수단이 없다
```

## P2-3. (치명적) C4 — strength 0.25 / 0.35 / 0.45 는 **완전히 같은 이미지**를 만든다

새 지시문 §5 는 기본 0.35, 비교군 0.25/0.35/0.45 를 요구하고 §17 은 그 세 값의 비교 테스트
A·B·C 를 요구한다. **이 비교는 원리적으로 불가능하다.**

diffusers 는 `init_timestep = min(int(num_inference_steps × strength), num_inference_steps)` 로
시작 지점을 정한다(`...img2img.py:650`). `num_inference_steps=4` 고정(§2, §22)에서:

```text
strength 0.25 -> int(1.00) = 1 step
strength 0.35 -> int(1.40) = 1 step
strength 0.45 -> int(1.80) = 1 step
```

세 값 모두 **1 step** 이고, 시작 timestep 도 같으므로 초기 노이즈 주입량까지 동일하다.
실제로 돌려서 픽셀 단위로 확인했다 (seed 42, 동일 입력, 4 step):

```text
strength 0.25 vs 0.35 : MAE 0.0000  maxdiff 0  → 완전히 동일
strength 0.25 vs 0.45 : MAE 0.0000  maxdiff 0  → 완전히 동일
strength 0.35 vs 0.45 : MAE 0.0000  maxdiff 0  → 완전히 동일
strength 0.45 vs 0.50 : MAE 0.9421  maxdiff 175 → 여기서 처음 달라진다
```

`num_inference_steps=4` 를 유지하는 한 §5 의 "0.25 구조 보존 / 0.35 균형 / 0.45 실사화 증가"라는
의미 구분은 존재하지 않는다. 세 값을 구별하려면 step 수를 올려야 한다.

```text
steps= 4 -> [1, 1, 1]  충돌
steps= 7 -> [1, 2, 3]  구별 가능
steps= 8 -> [2, 2, 3]  충돌
steps= 9 -> [2, 3, 4]  구별 가능   ← 8-step checkpoint 의 설계점에 가장 가깝다
steps=12 -> [3, 4, 5]  구별 가능
```

ByteDance/SDXL-Lightning 에 **`sdxl_lightning_8step_unet.safetensors` 가 존재한다**(확인함).
8-step checkpoint + `num_inference_steps=9` 면 2/3/4 step 으로 갈라지고 학습 조건에서 크게 벗어나지 않는다.
대안은 비교군을 0.25/0.50/0.75 로 두는 것이다(4-step 유지, 1/2/3 step, 이미 측정 완료).

## P2-4. (치명적) C2 — 네거티브 프롬프트와 `guidance_scale=0` 은 동시에 성립하지 않는다

§2·§22 는 `guidance_scale=0` 을 고정값으로 요구하고, §10·§22 는 네거티브 프롬프트 분리와
`full`/`compact` 두 프로필의 비교를 요구한다. 이 둘은 함께 성립할 수 없다.

diffusers 의 CFG 게이트는 `self._guidance_scale > 1` 이다(`...img2img.py:951`).
`guidance_scale=0` 이면 CFG 가 꺼지고 **네거티브 프롬프트는 계산에 전혀 들어가지 않는다.**
즉 §10 의 128 토큰짜리 네거티브 목록도, compact 44 토큰도 결과에 0의 영향을 준다.
`full` vs `compact` 비교는 항상 "차이 없음"으로 나온다.

§10 의 목적(일러스트·CGI·플라스틱 느낌 억제, 중복 객체 억제)은 §1 의 핵심 목표와 직결되므로
이 충돌은 그냥 넘길 수 없다. 선택지는 세 가지뿐이다.

| 선택 | 효과 | 대가 |
|---|---|---|
| (a) `guidance_scale=0` 유지 | 네거티브는 인터페이스만 존재, 무효임을 metadata 에 기록 | §10 의 품질 목표를 포기 |
| (b) `guidance_scale` 1.5~2.5 로 올림 | 네거티브가 실제로 작동 | Lightning 권장 조건 이탈, UNet 호출 2배(시간 약 2배) |
| (c) 모델 프로필마다 다르게 | lightning=0, photoreal=CFG ON | 프로필 간 결과 비교의 변수가 늘어난다 |

권장은 (c) 다. §3 이 이미 모델 프로필 추상화를 요구하므로 `guidance_scale`·`steps`·권장 strength 를
**프로필의 속성**으로 두면 구조적으로 깔끔하고, Lightning 의 제약을 다른 모델에 전염시키지 않는다.

## P2-5. (치명적) C3 — 새 프롬프트는 CLIP 한도의 2.1배다

실제 SDXL 토크나이저로 측정한 새 지시문의 프롬프트 블록 길이(내용 토큰, BOS/EOS 제외):

```text
§7  공통 실사 프롬프트                     85 토큰   ← 이것만으로 이미 한도(75) 초과
§8  DAY/OFF 26  DAY/ON 31  NIGHT/OFF 34  NIGHT/ON 32
§9  WHITE_MINIMAL 21  BLUE 17  PINK 17  BLACK 18  WOOD 18
    구조 보존(현행 3문장)                  15
§10 네거티브 full                        128 토큰
§10 네거티브 compact                      44 토큰

긍정 프롬프트 합계(§7+§8+§9+구조)         156 토큰 / 한도 75  → 81 토큰(52%)이 잘려나간다
```

`compel` 이 미설치이고 새 지시문 §21 이 검증되지 않은 자동 다운로드를 금지하므로,
현재 수단으로는 (a) 문장 압축 + 우선순위(지금 구현된 방식 확장) 또는 (b) `compel` 의존성 추가
둘 중 하나다. §7 의 어휘를 그대로 쓰면 §8·§9·구조 보존이 전부 잘려 **조명 상태와 배치 보존이
프롬프트에서 사라진다** — Part 1 의 G-15 와 같은 사고가 더 큰 규모로 반복된다.

## P2-6. C5 — "낮/밤 반영" 요구와 §5 strength 정책의 상충, 그리고 §8 이 제시한 해답

측정된 사실(Part 1 및 BENCHMARK_RESULTS):

```text
strength 0.50 (2 step) : DAY/OFF vs NIGHT/ON  MAE 0.20/255  → 육안 구별 불가
strength 0.75 (3 step) : DAY/OFF vs NIGHT/ON  MAE 2.06/255  → 10배 개선(그래도 작다)
step 을 4로 보정        : MAE 0.20 그대로     → step 은 원인이 아니다
```

새 지시문 §5 의 상한 0.45 는 실제로 **1 step** 이므로, 조명 반응은 0.50(0.20)보다 **더 약하다.**
그러므로 §1 의 "낮/밤 및 조명 ON/OFF 가 결과에 자연스럽게 반영" 을 프롬프트로 달성하는 것은
§5 정책 안에서는 불가능하다.

다만 **§8 의 마지막 문장이 이 문제를 이미 해결하고 있다**:
"시뮬레이터에서 조명 상태가 먼저 적용된 캡처 이미지를 입력으로 사용해야 한다.
프롬프트만으로 낮/밤 상태를 새로 만들어내도록 의존하지 않는다."

즉 조명은 **입력 캡처가 이미 갖고 있어야 하고**, 낮은 strength 는 그것을 보존하는 역할이다.
이 설계는 일관되고 옳다. 문제는 검증 쪽이다 — 현재 fixture(`tests/fixtures/desk_capture.png`)는
내가 그린 평면 도형이라 조명 상태가 구워져 있지 않다. 따라서
**§18 의 항목 6·7(낮/밤 차이, 조명 ON/OFF 차이)은 현재 자료로는 측정할 수 없다.**
필요한 것: 같은 뷰·같은 배치로 조명만 다른 실제 시뮬레이터 캡처 4장.
없으면 조명이 구워진 fixture 4장을 합성해 경로만 검증하고, 그 사실을 보고서에 명시한다.

## P2-7. 나머지 충돌과 누락 (요약)

| # | 항목 | 새 지시문 | 현재 구현 | 처리 방향 |
|---|---|---|---|---|
| C1 | strength 기본값 | 0.35 (§5) | 0.50, 프리셋 3종(0.25/0.50/0.75) | **직전 구두 지시(0.75)와 정면 충돌.** 사용자 확인 필요 |
| C6 | `jobId` 타입 | 정수 `184` | 문자열 + 경로 안전 정규식 | `int \| str` 수용, 문자열 검증 유지 |
| C7 | `strength` 전달 방식 | 요청에 실수 직접 (`0.35`) | 프리셋 이름만 허용 | 허용 목록 방식 유지 + 값 직접 입력 허용 |
| C8 | `mode: "REALISTIC"` | 필수 필드 | 없음 | 추가. 현재는 이 값 하나만 유효 |
| C9 | `productLights` 구조 | 배열 + `productId` + `color` | `dict[str,bool]` | 배열로 확장. **색상은 프롬프트에 반영되나 productId 는 계속 비노출** |
| C10 | `moodTags` 값 | `WHITE`,`BLUE`,`MINIMAL` (§4) vs `WHITE_MINIMAL`,`BLUE`,`PINK`,`BLACK`,`WOOD` (§9) | 자유 문자열 | **지시문 내부 불일치.** §9 의 5종을 열거형으로 채택 제안 |
| C11 | `simulatorViewPath` | 로컬 경로 입력 | multipart 업로드 | 둘 다 지원. 경로는 입력 디렉터리 하위로 제한(임의 파일 읽기 방지) |
| C12 | `productReferencePaths` | 참조 이미지 0~1장 | 없음 | **IP-Adapter 없이는 쓸 방법이 없다.** 받아서 저장·기록만 하고 "미사용" 명시 제안 |
| C13 | `resultUrl` | 응답 필드 | `outputPath` | 로컬 POC 이므로 `file://` 경로로 채우거나 필드 생략 |
| C14 | WebP 저장 | PNG 또는 고품질 WebP | PNG 만 | PNG 원본 유지 + WebP 선택 저장 추가 |
| C15 | `max_memory_reserved` | §16 요구 | `max_memory_allocated` + nvidia-smi | reserved 추가(3종 기록) |
| C16 | 선명화 파라미터 | radius 0.8 / percent 40 (§11) | 0.6 / 20 (구 설계서 §2.5) | 새 값으로 갱신. 기본 OFF 는 동일 |
| C17 | 양자화 모드 이름 | `bnb_nf4_experimental` | `bnb_nf4` | 새 이름 채택, 구 이름은 별칭 유지 |
| C18 | 모델 프로필 라이선스 | 실제 모델 카드 검증 요구 (§3) | 미검증 | 아래 확인 결과 |

### 모델 프로필 후보 실측 확인 (§3 요구)

```text
SG161222/RealVisXL_V5.0        gated=False  license 태그: openrail++            diffusers 형식 O
RunDiffusion/Juggernaut-XL-v9  gated=False  license 태그: creativeml-openrail-m  diffusers 형식 O
```

둘 다 게이트 없이 접근 가능하고 diffusers 형식이다. 다만 **라이선스 태그만으로 상업 사용 가능이라고
단정하지 않는다** — RAIL 계열은 사용 제한 조항(Attachment A)이 붙고, 모델 카드 본문에 추가 조건이
있을 수 있다. 실제 도입 전에 사람이 모델 카드 원문을 확인해야 한다. 이 POC 는 두 프로필을
**기본 비활성 + 환경변수로 모델 ID 입력**으로만 준비한다(§3, §21 자동 다운로드 금지와 일치).

## P2-8. 산출물 매핑 (§20)

새로 만들 문서는 `imagine_img/docs/` 아래 둔다. 저장소 최상위 `docs/` 는 ADR 전용이므로 섞지 않는다.

```text
imagine_img/DESIGN_GAP_REPORT.md          ← 이 파일 (신규 생성하지 않고 Part 2 로 이어 씀)
imagine_img/docs/DERO_REALISTIC_IMAGE_POC.md   신규
imagine_img/docs/MODEL_PROFILE_GUIDE.md        신규
imagine_img/docs/LORA_AND_QUANTIZATION_GUIDE.md 신규 (현재 코드 기준으로 작성)
imagine_img/BENCHMARK_RESULTS.md          ← 기존. §20 의 BENCHMARK_REPORT.md 역할을 이미 함
imagine_img/KNOWN_LIMITATIONS.md          ← 기존 유지
```

## P2-9. 되돌리기 계획

Part 2 작업은 기존 `imagine_img/` 파일을 수정하므로, 착수 전 현재 상태를
`imagine_img/` 사본 하나로 백업한다(저장소가 git 이 아니다). 실패 시 사본으로 되돌린다.
저장소 밖 상태 변경은 없고, 모델 가중치는 `imagine_img/model-cache/` 에만 추가된다.

## P2-10. 판정

**C2·C3·C4 는 사용자 결정 없이 진행하면 반드시 잘못된 결과를 낳는 차단 요소다.**

- C4: 요구된 비교(0.25/0.35/0.45)가 픽셀 단위로 동일한 이미지를 만든다 → 비교 자체가 무의미
- C2: `guidance_scale=0` 과 네거티브 프롬프트 요구가 양립 불가 → §10 전체가 무효거나 확정값 이탈
- C3: 프롬프트가 한도의 2.1배 → 절반이 조용히 잘림

세 항목은 모두 새 지시문 내부의 확정값들이 서로 충돌하는 경우이고, 어느 쪽을 포기할지는
품질 목표에 대한 판단이므로 임의로 정하지 않는다. 결정을 받은 뒤 구현에 착수한다.
그 외 C1·C6~C18 은 위 표의 방향으로 처리 가능하다.

---

### Part 1 구현 후 갱신 (2026-07-31)

- **G-8 해소**: transformers 5.14.1 × diffusers 0.39.0 조합에서 SDXL 텍스트 인코더 로딩이
  정상 동작했다. 실제 생성 12회 이상 성공. 버전을 내릴 필요가 없었다.
- **G-15, G-16 추가**: 위 13절. 둘 다 실행 없이는 발견 불가능한 종류였다.
- 나머지 G-1~G-14 는 §6 에 적은 대응대로 구현되었고 테스트로 고정되었다.
