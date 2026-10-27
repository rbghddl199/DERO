"""양자화 전략 (설계서 §9).

기본값은 none 이고, 실험 경로는 feature flag 뒤에 있다.
핵심 규칙: 지원되지 않는 양자화를 적용된 것처럼 처리하지 않는다.
적용에 실패하면 fp16 으로 조용히 계속 돌지 않고 QUANTIZATION_NOT_SUPPORTED 로 즉시 실패한다.
그래야 벤치마크와 VRAM 기록을 믿을 수 있다 (설계서 §9.4).
"""

from __future__ import annotations

import importlib.util
from typing import Protocol, runtime_checkable

from app.core.config import Settings
from app.core.errors import ConfigurationError, ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)


def _installed(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


@runtime_checkable
class QuantizationStrategy(Protocol):
    name: str

    def validate_environment(self) -> None: ...

    def apply_before_pipeline_creation(self, components: dict) -> dict: ...

    def apply_after_pipeline_creation(self, pipe): ...

    def describe(self) -> dict: ...


class NoQuantization:
    name = "none"

    def validate_environment(self) -> None:
        return None

    def apply_before_pipeline_creation(self, components: dict) -> dict:
        return components

    def apply_after_pipeline_creation(self, pipe):
        return pipe

    def describe(self) -> dict:
        return {"mode": self.name, "applied": False, "detail": "FP16, no quantization."}


class TorchAoInt8Quantization:
    """실험 경로. SDXL UNet 의 Linear 레이어만 int8 weight-only 로 바꾼다.

    ## 2026-08-05: 이 기계(RTX 4070 Laptop 8GB · Windows · torch 2.6.0+cu124)에서 **안 된다**

    절감량 자체는 크다. UNet 이 2.57B params 라 fp16 4,897MB → int8 2,449MB 로 **약
    2,450MB** 가 빈다. 그리고 peak VRAM 은 해상도가 아니라 가중치가 지배한다(실측: 생성
    픽셀 5.1배를 올려도 peak 는 765MB 만 늘었다). 그래서 방향은 맞다.

    그런데 실제로 돌리면 세 곳에서 막힌다. `torchao==0.9.0` 설치(`--no-deps`, torch 는
    그대로) 후 실측:

    1. **`enable_model_cpu_offload` 와 충돌.** 오프로드 훅이 가중치를 CPU↔GPU 로 옮길 때
       `aten._has_compatible_shallow_copy_type` 를 부르는데, torchao 의
       `AffineQuantizedTensor` 에 그 연산이 구현돼 있지 않아 `NotImplementedError` 가 난다.
    2. **오프로드를 끄면(`MEMORY_MODE=cuda`) 결과가 완전 검정**이다 —
       `_assert_usable_output` 가 잡는다. int8 로 바뀐 Linear 와 fp16 Conv 가 섞인 UNet 의
       출력 스케일이 VAE 에서 무너지는 것으로 보인다.
    3. **Windows 에 triton 이 없다.** int8 weight-only 는 matmul 마다 역양자화를 하는데
       그 커널이 triton 경로다. 없으면 폴백이 매우 느려서, UNet forward **한 번**을
       10분 안에 끝내지 못했다(격리 프로브).

    즉 `quantization_fallback="fail"` 이 옳게 동작했고, 이 경로를 쓰려면 그중 하나가
    풀려야 한다: triton 이 되는 환경(Linux/WSL), 또는 오프로드를 대신할 메모리 전략,
    또는 이 연산을 구현한 상위 torchao. 지금은 **켜지 말 것.**
    """

    name = "torchao_int8"

    def __init__(self) -> None:
        self._applied = False

    def validate_environment(self) -> None:
        if not _installed("torchao"):
            raise WorkerError(
                ErrorCode.QUANTIZATION_NOT_SUPPORTED,
                "QUANTIZATION_MODE=torchao_int8 requires the torchao package "
                "(pip install -e .[quant]). Refusing to run FP16 silently.",
            )

    def apply_before_pipeline_creation(self, components: dict) -> dict:
        return components

    def apply_after_pipeline_creation(self, pipe):
        from torchao.quantization import int8_weight_only, quantize_

        # Conv 까지 건드리면 SDXL 품질이 크게 흔들린다. Linear 만 대상으로 한다.
        quantize_(pipe.unet, int8_weight_only())
        self._applied = True
        log.info("torchao int8 weight-only quantization applied to UNet Linear layers.")
        return pipe

    def describe(self) -> dict:
        return {
            "mode": self.name,
            "applied": self._applied,
            "detail": "torchao int8_weight_only on UNet nn.Linear layers (experimental).",
        }


class BitsAndBytesNF4Experimental:
    """4bit NF4 경로.

    diffusers 의 bnb 양자화는 from_pretrained 시점에 quantization_config 로 들어가야 한다.
    이 POC 의 기본 경로는 Lightning full checkpoint 의 state_dict 를 직접 주입하므로
    그 진입점이 없다. 그래서 LIGHTNING_VARIANT=unet 에서는 NOT_SUPPORTED 를 명확히 남긴다.
    설계서 §9.1 이 요구한 "지원 확인 전 구현 완료로 간주하지 않음" 을 그대로 지킨 것이다.
    """

    name = "bnb_nf4_experimental"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._applied = False

    def validate_environment(self) -> None:
        if not _installed("bitsandbytes"):
            raise WorkerError(
                ErrorCode.QUANTIZATION_NOT_SUPPORTED,
                "QUANTIZATION_MODE=bnb_nf4 requires bitsandbytes, which is not installed. "
                "Refusing to run FP16 silently.",
            )
        if self._settings.lightning_variant == "unet":
            raise WorkerError(
                ErrorCode.QUANTIZATION_NOT_SUPPORTED,
                "bnb_nf4 cannot be applied to the Lightning full-UNet path: the UNet is built "
                "from a raw state_dict, so there is no from_pretrained call to pass "
                "quantization_config into. Result: NOT_SUPPORTED (not silently downgraded). "
                "Use LIGHTNING_VARIANT=lora if you need to evaluate 4bit.",
            )

    def apply_before_pipeline_creation(self, components: dict) -> dict:
        return components

    def apply_after_pipeline_creation(self, pipe):  # pragma: no cover - validate 에서 막힌다
        raise WorkerError(
            ErrorCode.QUANTIZATION_NOT_SUPPORTED,
            "bnb_nf4 post-hoc application to an already built SDXL UNet is not supported.",
        )

    def describe(self) -> dict:
        return {
            "mode": self.name,
            "applied": self._applied,
            "detail": "NOT_SUPPORTED on the full-UNet path (see DESIGN_GAP_REPORT G-9).",
        }


def build_strategy(settings: Settings) -> QuantizationStrategy:
    def require_experimental() -> None:
        if not settings.allow_experimental_quantization:
            raise ConfigurationError(
                f"QUANTIZATION_MODE={settings.quantization_mode} is experimental; "
                "set ALLOW_EXPERIMENTAL_QUANTIZATION=true to opt in."
            )

    match settings.quantization_mode:
        case "none":
            return NoQuantization()
        case "torchao_int8":
            require_experimental()
            return TorchAoInt8Quantization()
        # bnb_nf4 는 구 설계서의 이름이다. 별칭으로 계속 받는다.
        case "bnb_nf4_experimental" | "bnb_nf4":
            require_experimental()
            return BitsAndBytesNF4Experimental(settings)
        case other:
            raise ConfigurationError(f"Unknown QUANTIZATION_MODE '{other}'.")
