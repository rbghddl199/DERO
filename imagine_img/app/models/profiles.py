"""모델 프로필 (새 지시문 §3).

모델을 바꿀 때 API·후처리 코드를 건드리지 않기 위해, 모델마다 다른 값들을
**프로필의 속성**으로 모았다. 특히 다음 세 개는 모델마다 다르며 서로 묶여 있다.

```text
steps           4-step / 8-step distilled 모델은 step 수를 checkpoint 와 맞춰야 한다
guidance_scale  distilled Lightning 은 0, 일반 SDXL 체크포인트는 5 전후
negative        guidance_scale <= 1 이면 CFG 가 꺼져 네거티브 프롬프트가 아무 효과가 없다
```

Lightning 의 제약(`guidance_scale=0`)을 다른 모델에 전염시키지 않기 위해 프로필로 분리했다.
(DESIGN_GAP_REPORT P2-4 의 선택지 (c))
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.errors import ConfigurationError

#: 이름 → 프로필. 환경변수 MODEL_PROFILE 로 고른다.
PROFILE_NAMES = ("sdxl_lightning", "sdxl_photoreal", "sdxl_juggernaut")


@dataclass(frozen=True)
class ModelProfile:
    name: str

    #: Lightning full UNet 을 주입할지(unet) / Base 를 그대로 쓸지(none) / Lightning LoRA(lora)
    lightning_variant: str
    #: distilled checkpoint 와 짝을 맞춘 step 수
    steps: int
    guidance_scale: float
    #: 이 프로필에서 비교할 strength 값들 (첫 값이 기본값)
    strengths: tuple[float, ...]
    #: 기본 활성 여부. 실사 특화 체크포인트는 모델 ID 를 받아야 하므로 기본 비활성이다.
    enabled_by_default: bool
    #: 모델 ID 를 담는 환경변수 이름 (없으면 BASE_MODEL_ID 를 쓴다)
    model_id_env: str | None = None
    #: scheduler 지정. None 이면 체크포인트가 들고 있는 것을 그대로 쓴다.
    #: "euler_trailing"(Lightning 공식 조건) | "dpmpp_2m_karras" | "dpmpp_sde_karras"
    scheduler: str | None = None
    notes: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def supports_negative_prompt(self) -> bool:
        """CFG 가 켜져 있어야(guidance_scale > 1) 네거티브 프롬프트가 계산에 들어간다.

        diffusers 의 게이트가 `self._guidance_scale > 1` 이다
        (pipeline_stable_diffusion_xl_img2img.py:951).
        """
        return self.guidance_scale > 1.0

    @property
    def default_strength(self) -> float:
        return self.strengths[0]

    def describe(self) -> dict:
        return {
            "name": self.name,
            "lightningVariant": self.lightning_variant,
            "steps": self.steps,
            "guidanceScale": self.guidance_scale,
            "strengths": list(self.strengths),
            "supportsNegativePrompt": self.supports_negative_prompt,
            "modelIdEnv": self.model_id_env,
            "notes": self.notes,
        }


# strength 0.25/0.35/0.45 를 구별하려면 steps >= 9 여야 한다.
# init_timestep = int(steps * strength) 이므로 steps=4 에서는 세 값이 모두 1 step 이 되어
# 픽셀 단위로 완전히 같은 이미지가 나온다(실측 maxdiff=0, DESIGN_GAP_REPORT P2-3).
# steps=9 + 8-step checkpoint 면 2/3/4 step 으로 갈라지고 checkpoint 설계점에서 크게 벗어나지 않는다.
SDXL_LIGHTNING = ModelProfile(
    name="sdxl_lightning",
    lightning_variant="unet",
    steps=9,
    guidance_scale=0.0,
    strengths=(0.35, 0.25, 0.45),
    enabled_by_default=True,
    scheduler="euler_trailing",
    notes=(
        "SDXL Base + Lightning 8-step Full UNet. guidance_scale=0 이므로 네거티브 프롬프트는 "
        "무효다. steps=9 는 strength 0.25/0.35/0.45 를 2/3/4 step 으로 구별하기 위한 값이다."
    ),
)

# DPM++ Karras 는 RealVisXL 모델 카드의 권장 sampler 다.
# 카드는 30+ step 을 권하지만, **측정 결과 그만큼 필요하지 않아 16 으로 낮췄다** (2026-08-01).
#
#   steps  실제  inference  국소대비  30step 대비 MAE
#      30    22     27.0s     75.7      —
#      20    15     22.0s     77.3     1.66
#      16    12     18.7s     78.2     1.35   ← 채택
#      12     9     16.1s     84.0     1.88
#
# 품질 저하가 측정되지 않는다(모델 교체 시 MAE 2.64 와 비교하면 미미). 16 은 12 보다 여유를 둔 값이다.
# 실제 GLB 렌더가 들어오면 12/16/30 을 다시 비교해 확정할 것.
#
# 카드에 CFG 값 명시가 없어 SDXL 일반 관행인 5.0 을 쓴다.
# img2img 이므로 실제 step 은 int(16 x 0.75) = 12 다.
# 2026-08-03: steps 16 → 30. 실측(test6 캡처, strength 0.75, cn 0.6, guidance 5.0):
#
#   steps  선명도  구조상관  시간
#     16     269    0.891   35s
#     30     277    0.891   52s
#
# 선명도가 오르고 **구조 보존은 그대로**다. 위 주석이 "실제 GLB 렌더가 들어오면 12/16/30 을
# 다시 비교해 확정할 것" 이라고 남겼던 그 비교이고, 30 으로 확정한다.
#
# 같이 올린 conditioning_scale 0.45 · guidance 7.0 은 **채택하지 않았다** — 선명도는 335 까지
# 갔지만 모니터가 벽에 걸린 액자로 바뀌었다(구조 0.857, FINDINGS §1.10 과 같은 실패).
SDXL_PHOTOREAL = ModelProfile(
    name="sdxl_photoreal",
    lightning_variant="none",
    steps=30,
    guidance_scale=5.0,
    strengths=(0.35, 0.25, 0.45),
    enabled_by_default=False,
    model_id_env="SDXL_PHOTOREAL_MODEL_ID",
    scheduler="dpmpp_2m_karras",
    notes=(
        "RealVisXL 등 실사 특화 SDXL 체크포인트. CFG 가 켜져 있어 네거티브 프롬프트가 작동한다. "
        "모델 ID 를 환경변수로 직접 넣어야 하며 자동 다운로드하지 않는다. "
        "라이선스(RAIL 계열 사용 제한 조항 포함)를 모델 카드 원문에서 확인한 뒤 쓸 것."
    ),
)

SDXL_JUGGERNAUT = ModelProfile(
    name="sdxl_juggernaut",
    lightning_variant="none",
    steps=30,
    guidance_scale=5.5,
    strengths=(0.35, 0.25, 0.45),
    enabled_by_default=False,
    model_id_env="SDXL_JUGGERNAUT_MODEL_ID",
    scheduler="dpmpp_2m_karras",
    notes="JuggernautXL 계열 비교용. 기본 비활성. 라이선스 확인 필요.",
)

PROFILES: dict[str, ModelProfile] = {
    SDXL_LIGHTNING.name: SDXL_LIGHTNING,
    SDXL_PHOTOREAL.name: SDXL_PHOTOREAL,
    SDXL_JUGGERNAUT.name: SDXL_JUGGERNAUT,
}


def get_profile(name: str) -> ModelProfile:
    try:
        return PROFILES[name]
    except KeyError:
        raise ConfigurationError(
            f"Unknown MODEL_PROFILE '{name}'. Available: {', '.join(PROFILES)}."
        ) from None
