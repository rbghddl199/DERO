# MODEL_PROFILE_GUIDE

모델 교체 구조 (새 지시문 §3). 정의는 `app/models/profiles.py`.

## 왜 프로필인가

모델마다 다르고 **서로 묶여 있는** 값이 네 개 있다.

```text
steps           distilled 모델은 checkpoint 와 step 수를 맞춰야 한다 (8-step ckpt ↔ 9 step)
guidance_scale  Lightning 은 0, 일반 SDXL 체크포인트는 5 전후
네거티브 지원    guidance_scale <= 1 이면 CFG 가 꺼져 네거티브 프롬프트가 무효다
scheduler       Lightning 은 Euler+trailing 이 공식 조건, RealVisXL 은 DPM++ Karras 를 권장한다
```

이 네 개를 전역 상수로 두면 Lightning 의 제약(`guidance_scale=0`, Euler+trailing)이
다른 모델에까지 전염된다. 그래서 프로필의 속성으로 묶었다.
모델을 바꿀 때 API·후처리·계측 코드는 건드리지 않는다.

경계는 `app/models/backend.py` 의 `ImageGenerationBackend` 다.

```python
class ImageGenerationBackend(Protocol):
    def load(self) -> None: ...
    def generate(self, request, image) -> GenerationResult: ...
    def describe(self) -> dict: ...
```

## 프로필 목록

| 프로필 | steps | guidance | scheduler | 네거티브 | 기본 | 모델 ID 환경변수 |
|---|---|---|---|---|---|---|
| `sdxl_photoreal` | 16 | 5.0 | DPM++ 2M Karras | 작동 | **기본** | `SDXL_PHOTOREAL_MODEL_ID` |
| `sdxl_lightning` | 9 | 0.0 | Euler + trailing | **무효** | 비활성 | (SDXL Base 고정) |
| `sdxl_juggernaut` | 30 | 5.5 | DPM++ 2M Karras | 작동 | 비활성 | `SDXL_JUGGERNAUT_MODEL_ID` |

세 프로필 모두 strength 후보는 0.25 / 0.35 / 0.45 (기본 0.35)로 같다.

### sdxl_lightning (빠른 대안)

```text
base : stabilityai/stable-diffusion-xl-base-1.0
unet : ByteDance/SDXL-Lightning sdxl_lightning_8step_unet.safetensors (주입)
scheduler : EulerDiscreteScheduler + timestep_spacing="trailing"
```

- `steps=9` 는 strength 0.25/0.35/0.45 를 2/3/4 step 으로 갈라내기 위한 값이다.
  8-step checkpoint 의 설계점(8)에서 1 만큼 벗어난다. `steps=8` 이면 0.25 와 0.35 가
  둘 다 2 step 이 되어 구별되지 않는다.
- `guidance_scale=0` 이므로 **네거티브 프롬프트가 결과에 영향을 주지 않는다.**
  `NEGATIVE_PROMPT_PROFILE` 을 무엇으로 두든 응답에 `negativePromptEffective: false` 와
  경고가 남는다.
- 실측: 8.3초/장, torch peak 5355 MB.

### sdxl_photoreal / sdxl_juggernaut

`sdxl_photoreal` 이 **출하 기본값**이다 (2026-08-01). RealVisXL V5.0 을 검증하고 ID 를 기본으로 넣었다.
`sdxl_juggernaut` 는 아직 ID 가 비어 있어 고르면 `CONFIGURATION_ERROR` 로 즉시 실패한다 —
검증되지 않은 모델을 자동으로 내려받지 않는다(§21).

이 프로필들은 CFG 가 켜져 있어 **네거티브 프롬프트가 실제로 작동한다.** 대신 UNet 호출이 2배다.

실측(ControlNet 포함, 1125x1449 입력): **18.7초/장**, torch peak 6004 MB.
Lightning(11.0초)보다 느리지만 사진 품질은 이쪽에서만 나온다.

#### 라이선스 확인 결과 (2026-07-31, HF API 조회)

```text
SG161222/RealVisXL_V5.0         gated=False, license 태그 openrail++,            diffusers 형식 O
RunDiffusion/Juggernaut-XL-v9   gated=False, license 태그 creativeml-openrail-m,  diffusers 형식 O
```

**태그만으로 상업 사용 가능이라고 판단하지 말 것.** RAIL 계열은 사용 제한 조항(Attachment A)이
붙고 모델 카드 본문에 추가 조건이 있을 수 있다. DERO 서비스에 넣기 전에 사람이 원문을 확인해야 한다.
이 POC 는 두 프로필을 준비만 해두고 기본 비활성으로 둔다.

## 프로필 값 덮어쓰기

환경변수를 채우면 프로필 값을 덮어쓴다(실험용). 비우면 프로필 값을 쓴다.

```dotenv
INFERENCE_STEPS=12      # 프로필의 steps 를 무시
GUIDANCE_SCALE=2.0      # CFG 를 켠다 → 네거티브 프롬프트가 작동하기 시작한다
IMG2IMG_STRENGTH=0.45
```

우선순위는 `환경변수 > 프로필` 이고, 최종값은 응답과 metadata 의 `steps`/`guidanceScale` 에 기록된다.
`GUIDANCE_SCALE` 을 1 보다 크게 올리면 Lightning 프로필에서도 네거티브가 작동하지만,
Lightning 이 학습된 조건(guidance 0)에서 벗어나므로 품질은 별도로 측정해야 한다.

## ControlNet 과 함께 쓰기

`ENABLE_CONTROLNET=true` 는 프로필과 **직교**한다. 어느 프로필에도 붙일 수 있고,
켜지면 strength 상한이 0.45 에서 `CONTROLNET_MAX_STRENGTH`(기본 0.9)로 올라간다.

이유는 [QUALITY_GAP_ANALYSIS.md](QUALITY_GAP_ANALYSIS.md) 원인 B 다 — img2img 만으로는
"제품 보존"과 "실사 재질"이 strength 한 축에서 배타적이고, ControlNet 이 그 두 축을 분리한다.

```dotenv
MODEL_PROFILE=sdxl_photoreal
SDXL_PHOTOREAL_MODEL_ID=SG161222/RealVisXL_V5.0
ENABLE_CONTROLNET=true
CONTROLNET_TYPE=canny
CONTROLNET_MODEL_ID=diffusers/controlnet-canny-sdxl-1.0-small
CONTROLNET_CONDITIONING_SCALE=0.6
IMG2IMG_STRENGTH=0.75
```

**VRAM 주의 — small 변형을 반드시 쓸 것.** 표준 ControlNet SDXL 은 fp16 로 2.4GB 를 더 쓰고,
UNet 5GB 와 합쳐 8GB 를 넘겨 공유 메모리로 밀려난다. OOM 이 아니라 **오류 없이 느려진다**:

```text
controlnet-canny-sdxl-1.0        2.4 GB   129~180초   nvidia-smi 7923/8188 (한계)
controlnet-canny-sdxl-1.0-small  0.30 GB   18.7초     nvidia-smi 7546/8188
```

`MEMORY_MODE=cuda`(전체 GPU 상주)도 쓰면 안 된다 — torch 가 10.9GB 를 요구해
공유 메모리로 밀려나며 **301초**가 걸렸다(실측). 이 카드에서는 `model_cpu_offload` 가 정답이다.

`CONTROLNET_TYPE=depth` 는 깊이 맵이 필요하다. 추정 모델을 넣지 않았으므로
조용히 canny 로 대체하지 않고 명확히 실패한다. **시뮬레이터가 depth 버퍼를 내보내는 것이 최선**이다 —
추정 오차가 없고 조명·재질에 영향받지 않는다.

## 새 프로필 추가하기

1. `app/models/profiles.py` 에 `ModelProfile` 을 하나 더 정의하고 `PROFILES` 에 등록한다.
2. 모델 ID 를 담을 설정 필드를 `app/core/config.py` 에 추가한다(`model_id_env` 와 이름을 맞춘다).
3. Lightning 계열이 아니면 `lightning_variant="none"` 으로 둔다 —
   그러면 scheduler 를 강제로 Euler+trailing 으로 바꾸지 않고 체크포인트의 것을 쓴다.
4. 아키텍처 자체가 다르면(SD3, FLUX 등) `ImageGenerationBackend` 구현체를 추가하고
   `build_backend()` 에 분기를 넣는다. API·후처리·계측은 그대로 재사용된다.
