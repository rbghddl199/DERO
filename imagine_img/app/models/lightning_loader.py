"""SDXL-Lightning 로딩 (설계서 §7, §8.4).

기본 경로는 4-step **Full UNet checkpoint** 다 (LIGHTNING_VARIANT=unet).
LoRA variant 는 다른 SDXL 파생 Base 를 써야 할 때를 위한 대체 모드로만 남긴다.
"""

from __future__ import annotations

from pathlib import Path

import torch
from diffusers import EulerDiscreteScheduler, UNet2DConditionModel
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)

DTYPES = {"float16": torch.float16, "float32": torch.float32}


def torch_dtype(settings: Settings) -> torch.dtype:
    return DTYPES[settings.torch_dtype]


def build_lightning_unet(settings: Settings) -> UNet2DConditionModel:
    """SDXL Base 의 UNet config + Lightning 4-step full weights.

    from_config 에 저장소 ID 를 직접 넘기는 것은 deprecated 경로이므로
    load_config -> from_config 로 명시한다 (DESIGN_GAP_REPORT G-3).
    """
    log.info("loading UNet config from %s (subfolder=unet)", settings.base_model_id)
    config = UNet2DConditionModel.load_config(
        settings.base_model_id,
        subfolder="unet",
        cache_dir=str(settings.model_cache_dir),
    )
    unet = UNet2DConditionModel.from_config(config)

    # 로컬 경로가 주어지면 그것을 쓴다 (새 지시문 §2 의 SDXL_LIGHTNING_UNET_PATH).
    local = (settings.sdxl_lightning_unet_path or "").strip()
    if local:
        checkpoint_path = Path(local)
        if not checkpoint_path.is_absolute():
            checkpoint_path = (Path(__file__).resolve().parents[2] / checkpoint_path).resolve()
        if not checkpoint_path.exists():
            raise WorkerError(
                ErrorCode.MODEL_LOAD_FAILED,
                f"SDXL_LIGHTNING_UNET_PATH does not exist: {checkpoint_path}",
            )
        log.info("using local Lightning checkpoint %s", checkpoint_path)
        checkpoint_path = str(checkpoint_path)
    else:
        log.info(
            "downloading Lightning checkpoint %s/%s",
            settings.lightning_repo_id,
            settings.lightning_checkpoint,
        )
        checkpoint_path = hf_hub_download(
            settings.lightning_repo_id,
            settings.lightning_checkpoint,
            cache_dir=str(settings.model_cache_dir),
        )

    state_dict = load_file(checkpoint_path, device="cpu")
    try:
        # strict=True: 4-step checkpoint 가 아니면 여기서 터져야 한다.
        unet.load_state_dict(state_dict, strict=True)
    except RuntimeError as exc:
        raise WorkerError(
            ErrorCode.MODEL_LOAD_FAILED,
            f"{settings.lightning_checkpoint} does not match the SDXL UNet architecture: {exc}",
            cause=exc,
        ) from exc
    finally:
        del state_dict

    unet.to(dtype=torch_dtype(settings))
    log.info("Lightning full UNet ready (dtype=%s)", settings.torch_dtype)
    return unet


def make_trailing_euler_scheduler(scheduler_config) -> EulerDiscreteScheduler:
    """공식 사용 예시와 같은 Euler + trailing 조합 (설계서 §23-2)."""
    return EulerDiscreteScheduler.from_config(scheduler_config, timestep_spacing="trailing")


def make_scheduler(scheduler_config, kind: str | None):
    """프로필이 지정한 scheduler 를 만든다.

    kind=None 이면 체크포인트가 들고 있는 scheduler 를 그대로 쓴다 —
    모델마다 권장 sampler 가 다르므로 Lightning 의 조건을 다른 모델에 강제하지 않는다.
    """
    if kind is None:
        return None
    if kind == "euler_trailing":
        return make_trailing_euler_scheduler(scheduler_config)

    from diffusers import DPMSolverMultistepScheduler

    if kind == "dpmpp_2m_karras":
        # RealVisXL 모델 카드 권장: DPM++ 2M Karras.
        return DPMSolverMultistepScheduler.from_config(
            scheduler_config, use_karras_sigmas=True, algorithm_type="dpmsolver++"
        )
    if kind == "dpmpp_sde_karras":
        # DPM++ SDE Karras. SDE 계열은 generator 를 쓰므로 seed 재현에 영향이 있다.
        return DPMSolverMultistepScheduler.from_config(
            scheduler_config, use_karras_sigmas=True, algorithm_type="sde-dpmsolver++"
        )
    raise WorkerError(ErrorCode.MODEL_LOAD_FAILED, f"Unknown scheduler kind '{kind}'.")


def fuse_lightning_lora(pipe, settings: Settings) -> None:
    """LIGHTNING_VARIANT=lora 대체 모드. Lightning LoRA 는 fuse 한다 (설계서 §8.4).

    가속용 LoRA 이므로 fuse 해도 무방하고, 이후 DERO LoRA 를 별도 adapter 로 얹을 수 있다.
    """
    try:
        pipe.load_lora_weights(
            hf_hub_download(
                settings.lightning_repo_id,
                settings.lightning_checkpoint,
                cache_dir=str(settings.model_cache_dir),
            )
        )
        pipe.fuse_lora()
        pipe.unload_lora_weights()
    except Exception as exc:
        raise WorkerError(
            ErrorCode.MODEL_LOAD_FAILED,
            f"Failed to fuse the Lightning LoRA {settings.lightning_checkpoint}: {exc}",
            cause=exc,
        ) from exc
    log.info("Lightning LoRA fused (variant=lora)")
