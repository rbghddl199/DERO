"""메모리 정책 (설계서 §6).

8GB VRAM 기본값: FP16 + enable_model_cpu_offload() + enable_vae_tiling() + batch 1 + 1 job.
정책 분기는 전부 여기 한 곳에 있다. 생성 코드에는 조건문을 두지 않는다.
"""

from __future__ import annotations

from app.core.config import Settings
from app.core.errors import ConfigurationError
from app.core.logging import get_logger

log = get_logger(__name__)


def _resolve_attention_backend(pipe, settings: Settings) -> str:
    """xFormers 를 요청받았을 때만 시도하고, 실패하면 사실대로 SDPA 라고 기록한다."""
    import importlib.util

    installed = importlib.util.find_spec("xformers") is not None

    if settings.enable_xformers == "false":
        return "sdpa"
    if settings.enable_xformers == "true" and not installed:
        raise ConfigurationError(
            "ENABLE_XFORMERS=true but the xformers package is not installed. "
            "Set ENABLE_XFORMERS=auto to use PyTorch SDPA instead."
        )
    if not installed:
        # auto: 조용히 SDPA 로 간다. PyTorch 2 에서는 이게 정상 경로다.
        return "sdpa"

    try:
        pipe.enable_xformers_memory_efficient_attention()
        return "xformers"
    except Exception as exc:  # pragma: no cover - 설치돼 있어도 실패할 수 있다
        log.warning("xformers is installed but could not be enabled (%s); using SDPA.", exc)
        return "sdpa"


def apply_memory_policy(pipe, settings: Settings) -> dict:
    """파이프라인에 메모리 정책을 적용하고 적용 내역을 돌려준다."""
    applied: dict[str, object] = {"mode": settings.memory_mode}

    match settings.memory_mode:
        case "cuda":
            # 8GB 에서는 기본값으로 쓰지 않는다. 명시적으로 골랐을 때만 온다.
            pipe.to("cuda")
        case "model_cpu_offload":
            # 주의: offload 전에 pipe.to("cuda") 를 호출하면 안 된다 (설계서 §6.1).
            pipe.enable_model_cpu_offload()
        case "sequential_cpu_offload":
            # 최후 수단. 자동 진입 금지 — 환경변수로만 들어온다.
            log.warning("sequential_cpu_offload is very slow; use it only as a last resort.")
            pipe.enable_sequential_cpu_offload()
        case other:  # pragma: no cover - Literal 로 이미 걸러진다
            raise ConfigurationError(f"Unknown MEMORY_MODE '{other}'.")

    # 새 지시문 §14 — xFormers 사용 가능 여부를 검사한다.
    # PyTorch 2 의 SDPA(AttnProcessor2_0)가 이미 기본이고 xformers 는 미설치이므로
    # auto 는 SDPA 로 귀결된다. 없는 것을 켠 척하지 않는다.
    applied["attention"] = _resolve_attention_backend(pipe, settings)

    if settings.enable_vae_tiling:
        pipe.enable_vae_tiling()
        applied["vaeTiling"] = True
    if settings.enable_vae_slicing:
        pipe.enable_vae_slicing()
        applied["vaeSlicing"] = True
    if settings.enable_attention_slicing:
        # PyTorch 2 SDPA 환경에서는 함께 켜지 말라는 것이 설계서 §6.1 의 지시다.
        log.warning(
            "attention slicing is enabled together with PyTorch 2 SDPA; "
            "this usually makes things slower, not smaller."
        )
        pipe.enable_attention_slicing()
        applied["attentionSlicing"] = True

    if settings.enable_torch_compile:
        # offload 와 함께 쓰면 재컴파일이 반복될 수 있어 실험 플래그로만 둔다.
        log.warning("ENABLE_TORCH_COMPILE=true is experimental for this POC.")
        pipe.unet = __import__("torch").compile(pipe.unet, mode="reduce-overhead", fullgraph=False)
        applied["torchCompile"] = True

    log.info("memory policy applied: %s", applied)
    return applied
