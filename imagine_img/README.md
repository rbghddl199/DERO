# imagine_img

DERO 시뮬레이터 화면 1장을 실사화 이미지 1장으로 바꾸는 **로컬 AI Worker**.

```text
시뮬레이터 캡처 (실제 제품 GLB 배치 + 조명 상태가 적용된 렌더)
 → ControlNet(canny) 로 구조 고정 + SDXL Img2Img (RealVisXL, strength 0.75)
 → 생성: 입력 비율에 맞춘 SDXL 친화 크기 (예: 1125x1449 입력 → 896x1152)
 → Lanczos 로 확대 + 남는 쪽 중앙 크롭
 → 출력: 입력과 같은 크기 (+ 선택적 약한 선명화)
 → outputs/<jobId>/result.png + metadata.json
```

**출력 크기는 입력 크기를 따릅니다** (`SIZE_MODE=follow_input`).
구 규격(1152×1024 → 1328×1184 고정)이 필요하면 `SIZE_MODE=fixed`.

**캡처는 2048×1152 로 보내세요.** 생성 픽셀 예산이 `2048*1152`라 그 크기면 확대가 없습니다.
다르게 보내면 그만큼 흐려집니다(실측: 2400×1350 입력에서 선명도 68 → 34).
자세한 것은 [SIMULATOR_CAPTURE_SPEC §3](docs/SIMULATOR_CAPTURE_SPEC.md).

문서:

- **[docs/OPERATIONS_LOCAL_WORKER.md](docs/OPERATIONS_LOCAL_WORKER.md) — 로컬 GPU 를 운영에 붙일 때 무엇이 오가고 무엇이 깨질 수 있는지. 팀 공유용. 붙이기 전에 정할 것 5가지 포함**
- **[docs/FINDINGS_2026-08-02.md](docs/FINDINGS_2026-08-02.md) — 품질을 올리려고 시도한 것들의 실측 결과. 무엇이 되고 무엇이 안 되는지. 생성 1회에 GPU 수십 초가 드니 같은 실험을 반복하기 전에 여기부터 본다**
- **[docs/SIMULATOR_CAPTURE_SPEC.md](docs/SIMULATOR_CAPTURE_SPEC.md) — 시뮬레이터가 무엇을 렌더해서 보내야 하는지 (연동 담당자는 여기부터)**
- **[docs/simulator/](docs/simulator/README.md) — three.js 캡처 모듈 (`captureForAI.ts`). 복사해서 쓴다**
  - ⚠️ 이 파일은 **WebGL + EffectComposer** 를 전제로 쓰였는데 실제 시뮬레이터는
    `three/webgpu` + TSL `RenderPipeline` 이다. 동작하는 구현은 프론트 레포의
    `src/store/simulatorStore.ts`(`captureForAI`) + `src/three/scene/roomDressing.ts` 다.
- [docs/DERO_REALISTIC_IMAGE_POC.md](docs/DERO_REALISTIC_IMAGE_POC.md) — POC 전체 설명
- [docs/MODEL_PROFILE_GUIDE.md](docs/MODEL_PROFILE_GUIDE.md) — 모델 교체 구조
- [docs/LORA_AND_QUANTIZATION_GUIDE.md](docs/LORA_AND_QUANTIZATION_GUIDE.md) — LoRA·양자화 상태
- [DESIGN_GAP_REPORT.md](DESIGN_GAP_REPORT.md) — 지시문과 실제 라이브러리의 충돌 (Part 1 / Part 2)
- [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) · [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md) · [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)

**먼저 알아둘 것 세 가지**

1. **제품 정체성·조명·배치는 시뮬레이터가 3D 로 정한다.** 이 Worker 는 재질과 조명을 사진처럼
   바꾸는 일만 한다. 캡처가 갖춰야 할 조건은 [SIMULATOR_CAPTURE_SPEC](docs/SIMULATOR_CAPTURE_SPEC.md).
2. **조명은 프롬프트가 만들지 않는다.** 조명 상태마다 렌더해서 보내야 한다
   (실측: 프롬프트만으로는 출력 밝기 193.6 → 186.4, 육안 구별 불가).
3. **기본값은 RealVisXL + ControlNet 이다.** 생성 18.7초/장 (steps 16).
   되돌리려면 `.env` 에 `MODEL_PROFILE=sdxl_lightning`, `ENABLE_CONTROLNET=false` (11초, 대신 실사화 약함).

---

## 1. 요구 환경

측정된 개발 환경:

```text
Windows 11, NVIDIA RTX 4070 Laptop GPU 8GB, 시스템 RAM 64GB
드라이버 591.74 / torch 2.6.0+cu124 / Python 3.12.13
디스크 여유 15GB 이상 (가중치 약 7GB)
```

## 2. 설치

이 저장소는 파이썬을 프로젝트 안(`../.uv-python`)에 두는 규칙을 쓴다.

```powershell
$env:UV_PYTHON_INSTALL_DIR='<PROJECT_ROOT>\.uv-python'
cd <PROJECT_ROOT>\imagine_img
uv venv --python 3.12 .venv
uv pip install --python .\.venv\Scripts\python.exe torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124
uv pip install --python .\.venv\Scripts\python.exe -r requirements-lock.txt
```

`.env` 는 선택이다. 없으면 `.env.example` 과 같은 기본값으로 돈다.

```powershell
Copy-Item .env.example .env
```

## 3. 환경 확인

```powershell
.\.venv\Scripts\python.exe scripts\check_environment.py
```

`torch.cuda.is_available()` 이 False 면 여기서 멈춘다. CPU 로는 사실상 못 쓴다.

## 4. 모델 다운로드

```powershell
.\.venv\Scripts\python.exe scripts\download_models.py
```

기본 프로필(`sdxl_photoreal`) 기준으로 받는 것:

```text
RealVisXL V5.0 (fp16)                        약 6.9 GB
ControlNet canny SDXL small                  0.30 GB
SDXL Base 1.0 (fp16, 토크나이저·VAE·인코더)   1.7 GB
```

`sdxl_lightning` 프로필로 되돌리려면 Lightning 8-step UNet(4.78 GiB)도 필요하다.

## 5. 실행

### CLI 한 장

```powershell
.\.venv\Scripts\python.exe -m app.cli generate inputs\image.png --job-id demo --time-of-day NIGHT --room-light --seed 42
```

조명 4조합 fixture 를 먼저 만들어 둔다:

```powershell
.\.venv\Scripts\python.exe scripts\make_fixture_capture.py --all
```

### REST API

```powershell
.\.venv\Scripts\python.exe -m app.cli serve
```

`http://127.0.0.1:8010/docs` 에서 눌러볼 수 있다. 기동 시 모델을 1회 로드하고 상주시킨다.

```bash
curl -X POST http://127.0.0.1:8010/v1/generations \
  -F "image=@tests/fixtures/desk_capture_night_on.png" \
  -F 'request_json={"jobId":184,"mode":"REALISTIC","timeOfDay":"NIGHT","roomLightOn":true,"productLights":[{"productId":501,"enabled":true,"color":"#6FA8FF"}],"moodTags":["WHITE_MINIMAL","BLUE"],"productSummary":["single monitor","compact keyboard","desk lamp"],"strength":0.35,"seed":42}'
```

Health:

```text
GET /health/live    프로세스 생존 (모델 로딩 중에도 200)
GET /health/ready   모델 준비 여부 (준비 전 503)
GET /health/model   GPU, VRAM, 메모리 모드, 양자화, LoRA, 로드 시간
```

## 6. 테스트

```powershell
.\.venv\Scripts\python.exe -m pytest -q                    # 단위 + CPU 통합 (GPU 불필요)
.\.venv\Scripts\python.exe -m pytest -m gpu -q             # 실제 GPU 통합 (가중치 필요)
.\.venv\Scripts\python.exe -m pytest -m gpu -q -k "not slow"
```

## 7. 벤치마크

```powershell
.\.venv\Scripts\python.exe scripts\benchmark.py --suite all
.\.venv\Scripts\python.exe scripts\benchmark.py --suite consecutive --repeat 10
```

결과는 `outputs/_benchmark/<suite>.json` 과 `<suite>_summary.md`.

## 8. 요청 필드

| 필드 | 기본값 | 의미 |
|---|---|---|
| `jobId` | (필수) | 정수/문자열. 출력 폴더 이름이 되므로 `[A-Za-z0-9][A-Za-z0-9._-]{0,63}` 를 지켜야 한다 |
| `mode` | `REALISTIC` | 현재 이 값만 유효 |
| `timeOfDay` | `DAY` | `DAY` \| `NIGHT` |
| `roomLightOn` | `true` | 실내 조명 |
| `productLights` | `[]` | `{productId, enabled, color}` 배열. **색만** 프롬프트에 반영되고 id 는 노출되지 않는다 |
| `cameraMode` | `PERSPECTIVE` | 카메라 프레이밍 유지 지시에 쓰인다 |
| `moodTags` | `[]` | `WHITE_MINIMAL` \| `BLUE` \| `PINK` \| `BLACK` \| `WOOD` (`WHITE`·`MINIMAL` 은 매핑됨) |
| `productSummary` | `[]` | 일반 제품 설명. 프롬프트에는 최대 3개까지 들어간다 |
| `strength` | `0.75` (ControlNet ON) | ControlNet ON: 0.6/0.75/0.9 · OFF: 0.25/0.35/0.45. 모드 밖 값은 400 |
| `strengthPreset` | — | `PRESERVE`/`BALANCED`/`REALISTIC` 또는 `CN_LOW`/`CN_BALANCED`/`CN_HIGH` |
| `seed` | `42` | 고정 시 재현된다 (픽셀 단위 동일) |
| `enableSharpen` | 설정값(false) | 약한 UnsharpMask (radius 0.8 / percent 40) |
| `simulatorViewPath` | `null` | 업로드 대신 로컬 경로. **`INPUT_DIR` 하위만 허용** |
| `productReferencePaths` | `[]` | `ENABLE_IP_ADAPTER=true` 면 이 사진들이 조건으로 실린다. **기본은 OFF** (§13) — 꺼져 있으면 기록만 하고 경고한다. `INPUT_DIR` 하위만 허용 |

## 9. 오류 코드

`INVALID_IMAGE` `INVALID_REQUEST` `MODEL_NOT_READY` `MODEL_LOAD_FAILED` `LORA_LOAD_FAILED`
`IP_ADAPTER_LOAD_FAILED` `QUANTIZATION_NOT_SUPPORTED` `CUDA_OUT_OF_MEMORY` `INFERENCE_FAILED`
`POSTPROCESS_FAILED` `OUTPUT_WRITE_FAILED` `JOB_ALREADY_RUNNING`

## 10. 바꾸면 안 되는 값

```text
출력 크기 = 입력 크기 (SIZE_MODE=follow_input)
batch size 1, 동시 작업 1개
sharpen 기본 OFF, quantization 기본 none, LoRA 기본 OFF
HOST=127.0.0.1

프로필별로 묶여 있어 따로 바꾸면 안 되는 조합:
  sdxl_photoreal  steps 16 / guidance 5.0 / DPM++ 2M Karras / ControlNet scale 0.6
  sdxl_lightning  steps 9  / guidance 0   / Euler trailing  / 8-step checkpoint
```

## 11. 알아둘 것

- **strength 는 실제 step 수를 바꾼다.** diffusers img2img 는 `int(steps × strength)` 만큼만 돈다.
  응답의 `effectiveSteps` 로 확인한다. `steps` 를 임의로 낮추면 서로 다른 strength 가
  같은 step 으로 뭉개져 결과가 픽셀 단위로 동일해진다(실측, DESIGN_GAP_REPORT P2-3).
- **입력 비율은 거부하지 않는다** (`follow_input`). 생성 크기를 입력 비율에 맞춰 계산한다.
  `SIZE_MODE=fixed` 에서만 2% 초과 시 거부한다.
- 같은 `jobId` 로 다시 요청하면 덮어쓰지 않고 `result_002.png` 로 번호가 올라간다.
- 동시에 두 개를 요청하면 두 번째는 기다리지 않고 `409 JOB_ALREADY_RUNNING` 이다.
- VRAM 여유가 약 500 MB 뿐이다(6004/7677 of 8188). 브라우저 등 다른 GPU 앱이 붙으면
  **오류 없이 수십 배 느려진다.** 응답의 `peakNvidiaSmiVramMb` 로 확인한다.

## 12. IP-Adapter — 레퍼런스 사진 (기본 OFF)

`inputs/references/<카테고리>/` 의 실제 제품 사진을 생성 조건으로 건다. `gate-references`
가 만들어 둔 783장이 여기서 쓰인다.

```powershell
.\.venv\Scripts\python.exe -m app.cli generate inputs\captures\test09\image.png `
  --job-id ipa --ip-adapter --ip-adapter-scale 0.3 --category CHAIR,DESK_MAT,KEYBOARD
```

**기본이 OFF 인 이유는 실측이다** (2026-08-06, test09 · seed 42 · 레퍼런스 3장):

```text
scale  laplacianVar  edgeDensity  밝기    육안
 0.0        167.75        3.124  69.67   나무 바닥결·러그 질감·가죽 의자 스티치·램프 발광
 0.3        116.33        2.916  74.70   바닥결이 사라지고 전체가 평평해진다
 0.5         98.41        2.782  79.85   플라스틱처럼 매끈. 스피커·마우스가 형태를 잃는다
```

동작은 한다 — 데스크매트가 레퍼런스(가죽 장패드)의 색으로 바뀐다. 다만 레퍼런스가 **흰
스튜디오 배경 컷**이라 제품의 재질만 오지 않고 그 사진의 평평함·밝기까지 따라온다.
실사화가 목표라면 지금은 손해다. 재측정은 `scripts/compare_ip_adapter.py`.

켤 만해지는 조건은 **영역을 좁히는 것**이다: 시뮬레이터가 제품별 바운딩 박스를 보내면
`ip_adapter_masks` 로 제품 영역에만 걸 수 있고 벽·바닥·조명은 건드리지 않는다.
지금 요청에는 `screenAreaPercent`(면적)만 있고 좌표가 없다.

**모니터는 레퍼런스가 0장이다** — 크롤링 10장이 전부 화면이 켜진 컷이라 게이트가 거부했다.
정체성이 가장 많이 흔들리는 제품에 쓸 재료가 없다.

## 13. 라이선스 고지

모델 가중치의 라이선스는 [NOTICE.md](NOTICE.md) 를 본다.
