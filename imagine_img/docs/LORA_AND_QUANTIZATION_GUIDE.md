# LORA_AND_QUANTIZATION_GUIDE

새 지시문 §12·§13 의 구현 상태. 둘 다 **기본 OFF** 이고, 실패를 숨기지 않는다.

---

# 1. LoRA (§12)

```dotenv
ENABLE_LORA=false
LORA_PATH=
LORA_SCALE=0.6
DERO_LORA_WEIGHT_NAME=
FUSE_DERO_LORA=false
```

구현: `app/models/lora_manager.py` 의 `LoraManager`.

```python
load_optional_adapter(pipe)   # ENABLE_LORA=false 면 아무것도 하지 않는다
set_scale(pipe, scale)        # fuse 상태에서는 거부한다
unload(pipe)                  # fuse 상태에서는 거부한다
describe()                    # enabled / loaded / scale / fused / path
```

## 1.1 호환성 검사

`.safetensors` 키를 열어 **SDXL 계열인지** 확인한다. `text_encoder_2` / `add_embedding` /
`addition_embed_type` 계열 키가 하나도 없으면 다른 모델 계열로 보고 거부한다.

```text
검사 통과 실패 → LORA_LOAD_FAILED, 기동 자체가 실패한다
```

**호환되지 않는 LoRA 를 조용히 무시하지 않는다** (§12 요구). 로드 실패 후 기본 모델로 계속
실행하는 경로는 존재하지 않는다.

이 검사가 확인하는 것은 "계열이 맞는가" 뿐이다. 일반 SDXL Base 에 학습된 LoRA 가
**distilled Lightning UNet 에서 같은 품질을 내는지는 별개 문제**이고 검증되지 않았다.
DERO LoRA 를 실제로 쓸 때는 Lightning 기준으로 별도 POC 를 통과해야 한다.

## 1.2 fuse 정책

`FUSE_DERO_LORA=false` 가 기본이다. fuse 하면 scale 변경과 unload 가 불가능해지므로
개발·검증 중에는 fuse 하지 않는다. 품질을 확정한 고정 배포에서만 고려한다.

## 1.3 재로딩 정책

LoRA 는 **Worker 시작 시 1회만** 로드한다. 요청마다 교체하지 않는다(§12 금지 항목).
설정을 바꿨으면 Worker 를 재시작한다. 런타임 교체 API 는 제공하지 않는다 —
동시 작업이 1개뿐인 구조에서 adapter 를 갈아끼우면 진행 중인 작업의 결과가 오염된다.

## 1.4 현재 검증 상태

| 항목 | 상태 |
|---|---|
| 기본 OFF 로 아무것도 하지 않음 | 단위 테스트 통과 |
| 경로 미지정 → LORA_LOAD_FAILED | 단위 테스트 통과 |
| 파일 없음 → LORA_LOAD_FAILED | 단위 테스트 통과 |
| 비 SDXL LoRA 거부 | 단위 테스트 통과 |
| scale 반영, fuse=false 기본 | 단위 테스트 통과 |
| **실제 LoRA 로 생성한 결과** | **미검증 — DERO LoRA 파일이 존재하지 않는다** |

초기 범위에서 하지 않는 것: LoRA 학습, 여러 LoRA 동시 결합, 요청마다 교체, 자동 다운로드.

---

# 2. 양자화 (§13)

```dotenv
QUANTIZATION_MODE=none            # none | torchao_int8 | bnb_nf4_experimental
ALLOW_EXPERIMENTAL_QUANTIZATION=false
QUANTIZATION_FALLBACK=fail
```

구현: `app/models/quantization.py` 의 `QuantizationStrategy` (Protocol) + 3개 구현체.

```python
validate_environment()            # 지원 여부를 먼저 검사한다 (12GB 로드 전에 fail-fast)
apply_before_pipeline_creation()
apply_after_pipeline_creation()
describe()                        # mode / applied / detail
```

## 2.1 fail-fast 원칙

**양자화가 적용되지 않았는데 FP16 으로 조용히 실행하지 않는다.**
그러면 벤치마크와 VRAM 기록을 신뢰할 수 없다. 실패는 `QUANTIZATION_NOT_SUPPORTED` 로 올라간다.

또한 `"4bit 적용 성공"` 류의 로그를 실제 확인 없이 출력하지 않는다.
`describe()` 의 `applied` 는 실제 적용 함수가 끝난 뒤에만 true 가 된다.

## 2.2 모드별 상태 (이 환경에서 실측)

| 모드 | 패키지 | 상태 |
|---|---|---|
| `none` | — | **기본. 검증 완료** (BENCHMARK_RESULTS 의 모든 수치가 이 모드) |
| `torchao_int8` | `torchao` **미설치** | opt-in 시 `QUANTIZATION_NOT_SUPPORTED` 로 즉시 실패. 코드 경로만 존재 |
| `bnb_nf4_experimental` | `bitsandbytes` **미설치** | 설치해도 이 경로에서는 **원리적으로 불가** (아래) |

### bnb_nf4 가 full-UNet 경로에서 불가능한 이유

diffusers 의 bnb 양자화는 `from_pretrained(quantization_config=...)` 지점에서만 들어간다.
이 POC 의 기본 경로는 Lightning full checkpoint 의 `state_dict` 를 직접 주입하므로
그 진입점이 없다. 그래서 `validate_environment()` 가 명확한 이유와 함께 거부한다.

```text
"bnb_nf4 cannot be applied to the Lightning full-UNet path: the UNet is built from a raw
 state_dict, so there is no from_pretrained call to pass quantization_config into."
```

4bit 를 평가해야 하면 `LIGHTNING_VARIANT=lora` 또는 CFG 프로필(`sdxl_photoreal`)처럼
`from_pretrained` 로 UNet 을 만드는 경로에서 시도해야 한다.
**SDXL UNet 이 모든 환경에서 안정적으로 NF4 양자화된다고 가정하지 않는다** (§13).

## 2.3 검증 매트릭스 (§13 요구 항목)

| 조합 | 모델 로딩 | 최대 VRAM | 생성 시간 | 품질 | OOM |
|---|---|---|---|---|---|
| FP16 / LoRA OFF | 11.8초 | torch 5355 MB / smi 7589 MB | 8.3초 | 기준선 | 없음 (10/10) |
| FP16 / LoRA ON | 미검증 | 미검증 | 미검증 | 미검증 | 미검증 |
| TorchAO INT8 / LoRA OFF·ON | 미검증 (패키지 없음) | — | — | — | — |
| BnB NF4 / LoRA OFF·ON | **NOT_SUPPORTED** | — | — | — | — |

8GB 에서 FP16 이 OOM 없이 도는 것을 먼저 확인했으므로(여유 약 600 MB) 양자화는 필요하지 않다.
§13 의 방침대로 **OOM 이 발생할 때만** 비교 대상이 된다.

## 2.4 실험 모드를 실제로 켜보려면

```powershell
.\.venv\Scripts\python.exe -m uv pip install torchao      # 또는 pip install -e .[quant]
```

```dotenv
QUANTIZATION_MODE=torchao_int8
ALLOW_EXPERIMENTAL_QUANTIZATION=true
```

`ALLOW_EXPERIMENTAL_QUANTIZATION=false` 인 상태로 실험 모드를 고르면 기동이 실패한다 —
실험 기능은 feature flag 뒤에 있어야 한다.
