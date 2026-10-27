"""파이프라인 조립 (설계서 §7).

순서:
1. 양자화 환경 검증 (12GB 로드 전에 fail-fast)
2. Lightning UNet 준비
3. SDXL Base pipeline 에 주입
4. Euler + trailing scheduler
5. Img2Img pipeline 으로 components 공유
6. 양자화 적용
7. LoRA 적용
8. MemoryPolicy 적용

설계서 §7 의 번호와 달리 MemoryPolicy 를 마지막에 둔다.
enable_model_cpu_offload() 가 모듈에 hook 을 설치하므로, 그 뒤에 UNet 을 양자화하거나
adapter 를 붙이면 hook 이 가리키는 모듈과 실제 모듈이 어긋난다. (DESIGN_GAP_REPORT G-1 이후 결정)
"""

from __future__ import annotations

import gc

import torch
from diffusers import StableDiffusionXLImg2ImgPipeline, StableDiffusionXLPipeline

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger
from app.models.lightning_loader import (
    build_lightning_unet,
    fuse_lightning_lora,
    make_scheduler,
    torch_dtype,
)
from app.models.ip_adapter_manager import IpAdapterManager
from app.models.lora_manager import LoraManager
from app.models.memory_policy import apply_memory_policy
from app.models.quantization import QuantizationStrategy, build_strategy

log = get_logger(__name__)


def _load_controlnet(settings: Settings, dtype: torch.dtype):
    """ControlNet 모델을 로드한다 (새로 추가, 기본 OFF).

    구조를 조건 이미지로 고정해 높은 strength 를 쓸 수 있게 한다
    (docs/QUALITY_GAP_ANALYSIS.md 2순위 대응).
    """
    from diffusers import ControlNetModel

    try:
        controlnet = ControlNetModel.from_pretrained(
            settings.controlnet_model_id,
            torch_dtype=dtype,
            variant="fp16" if dtype is torch.float16 else None,
            use_safetensors=True,
            cache_dir=str(settings.model_cache_dir),
        )
    except Exception as exc:
        raise WorkerError(
            ErrorCode.MODEL_LOAD_FAILED,
            f"Failed to load ControlNet '{settings.controlnet_model_id}': {exc}",
            cause=exc,
        ) from exc
    log.info(
        "ControlNet loaded: %s (type=%s, conditioning_scale=%s)",
        settings.controlnet_model_id,
        settings.controlnet_type,
        settings.controlnet_conditioning_scale,
    )
    return controlnet


def _build_img2img(
    text2img: StableDiffusionXLPipeline, dtype: torch.dtype
) -> StableDiffusionXLImg2ImgPipeline:
    """components 를 공유해 Img2Img pipeline 을 만든다 (VRAM 을 두 배로 쓰지 않는다).

    from_pipe 가 1순위. 없거나 실패하면 생성자 주입으로 폴백한다 (G-4).

    torch_dtype 을 반드시 다시 넘겨야 한다. diffusers 0.39 의 from_pipe 는
    `torch_dtype = kwargs.pop("torch_dtype", torch.float32)` 후 `new_pipeline.to(dtype=...)` 를
    호출한다(`pipeline_utils.py:2125,2224`). 생략하면 fp16 파이프라인이 조용히 fp32 로 올라가
    UNet 이 9.6GiB 가 되고, 8GB 카드에서는 공유 메모리로 밀려나 추론이 약 45배 느려진다.
    (DESIGN_GAP_REPORT G-16 — 실측 130s/장 → 2.9s/장)
    """
    from_pipe = getattr(StableDiffusionXLImg2ImgPipeline, "from_pipe", None)
    if from_pipe is not None:
        try:
            return from_pipe(text2img, torch_dtype=dtype)
        except Exception as exc:  # pragma: no cover - 버전별 폴백 경로
            log.warning("from_pipe() failed (%s); falling back to component injection.", exc)

    import inspect

    accepted = set(inspect.signature(StableDiffusionXLImg2ImgPipeline.__init__).parameters)
    components = {k: v for k, v in text2img.components.items() if k in accepted}
    return StableDiffusionXLImg2ImgPipeline(**components)


def _assert_component_dtypes(pipe, expected: torch.dtype) -> None:
    """구성요소가 의도한 dtype 인지 확인한다.

    fp32 로 조용히 올라가면 8GB 에서 OOM 없이 "그냥 아주 느려지기만" 한다.
    벤치마크가 fp16 을 측정했다고 믿으면 안 되므로 여기서 기동을 실패시킨다.
    """
    wrong: dict[str, str] = {}
    for name in ("unet", "vae", "text_encoder", "text_encoder_2"):
        component = getattr(pipe, name, None)
        dtype = getattr(component, "dtype", None)
        if dtype is not None and dtype != expected:
            wrong[name] = str(dtype)

    if wrong:
        raise WorkerError(
            ErrorCode.MODEL_LOAD_FAILED,
            f"Pipeline components are not {expected}: {wrong}. "
            "On an 8GB GPU an fp32 SDXL UNet (9.6GiB) spills into shared system memory and "
            "inference becomes roughly 45x slower instead of failing outright.",
        )
    log.info("all components are %s", expected)


def build_pipeline(settings: Settings) -> tuple[StableDiffusionXLImg2ImgPipeline, dict]:
    """Img2Img 파이프라인과 런타임 설명을 돌려준다."""
    strategy: QuantizationStrategy = build_strategy(settings)
    strategy.validate_environment()

    lora = LoraManager(settings)
    dtype = torch_dtype(settings)

    profile = settings.profile
    variant = profile.lightning_variant
    model_id = settings.resolved_model_id

    try:
        if variant == "unet":
            unet = build_lightning_unet(settings)
            text2img = StableDiffusionXLPipeline.from_pretrained(
                model_id,
                unet=unet,
                torch_dtype=dtype,
                variant="fp16" if dtype is torch.float16 else None,
                use_safetensors=True,
                cache_dir=str(settings.model_cache_dir),
                add_watermarker=False,
            )
        else:
            # variant="none" : 실사 특화 체크포인트를 그대로 쓴다 (프로필 sdxl_photoreal 등).
            # variant="lora" : 파생 Base + Lightning LoRA fuse.
            # fp16 variant 파일이 없는 커뮤니티 체크포인트가 많아 variant 지정을 시도한 뒤
            # 실패하면 기본 파일로 다시 시도한다.
            try:
                text2img = StableDiffusionXLPipeline.from_pretrained(
                    model_id,
                    torch_dtype=dtype,
                    variant="fp16" if dtype is torch.float16 else None,
                    use_safetensors=True,
                    cache_dir=str(settings.model_cache_dir),
                    add_watermarker=False,
                )
            except Exception:
                log.info("no fp16 variant for %s; retrying without variant", model_id)
                text2img = StableDiffusionXLPipeline.from_pretrained(
                    model_id,
                    torch_dtype=dtype,
                    use_safetensors=True,
                    cache_dir=str(settings.model_cache_dir),
                    add_watermarker=False,
                )
            if variant == "lora":
                fuse_lightning_lora(text2img, settings)
    except WorkerError:
        raise
    except Exception as exc:
        raise WorkerError(
            ErrorCode.MODEL_LOAD_FAILED, f"Failed to build the SDXL pipeline: {exc}", cause=exc
        ) from exc

    # scheduler 는 프로필이 정한다. Euler+trailing 은 Lightning 의 공식 조건이고,
    # 실사 체크포인트는 자기 모델 카드가 권장하는 sampler(DPM++ Karras 등)를 쓴다.
    scheduler = make_scheduler(text2img.scheduler.config, profile.scheduler)
    if scheduler is not None:
        text2img.scheduler = scheduler
    else:
        log.info("profile %s keeps the checkpoint's own scheduler", profile.name)
    log.info(
        "scheduler=%s timestep_spacing=%s",
        type(text2img.scheduler).__name__,
        text2img.scheduler.config.get("timestep_spacing"),
    )

    if settings.enable_controlnet:
        from diffusers import StableDiffusionXLControlNetImg2ImgPipeline

        controlnet = _load_controlnet(settings, dtype)
        components = {k: v for k, v in text2img.components.items() if k != "image_encoder"}
        pipe = StableDiffusionXLControlNetImg2ImgPipeline(
            **{
                k: v
                for k, v in components.items()
                if k
                in {
                    "vae",
                    "text_encoder",
                    "text_encoder_2",
                    "tokenizer",
                    "tokenizer_2",
                    "unet",
                    "scheduler",
                    "feature_extractor",
                }
            },
            controlnet=controlnet,
            add_watermarker=False,
        )
    else:
        pipe = _build_img2img(text2img, dtype)
    # text2img 자체는 더 필요 없다. components 는 새 pipeline 이 참조하므로 해제되지 않는다.
    del text2img
    gc.collect()

    _assert_component_dtypes(pipe, dtype)

    pipe = strategy.apply_after_pipeline_creation(pipe)
    lora.load_optional_adapter(pipe)
    # LoRA 와 같은 이유로 MemoryPolicy **앞**이다 — offload hook 이 설치된 뒤에 UNet 의
    # 어텐션 프로세서를 갈아끼우면 hook 이 가리키는 모듈과 실제 모듈이 어긋난다.
    ip_adapter = IpAdapterManager(settings)
    ip_adapter.load(pipe)
    memory = apply_memory_policy(pipe, settings)

    pipe.set_progress_bar_config(disable=True)

    runtime = {
        "modelProfile": profile.name,
        "profile": profile.describe(),
        "model": settings.lightning_repo_id if variant == "unet" else model_id,
        "baseModel": model_id,
        "checkpoint": settings.lightning_checkpoint if variant == "unet" else model_id,
        "lightningVariant": variant,
        "steps": settings.resolved_steps,
        "guidanceScale": settings.resolved_guidance_scale,
        "supportsNegativePrompt": settings.supports_negative_prompt,
        "scheduler": type(pipe.scheduler).__name__,
        "timestepSpacing": pipe.scheduler.config.get("timestep_spacing"),
        "dtype": settings.torch_dtype,
        "memory": memory,
        "quantization": strategy.describe(),
        "lora": lora.describe(),
        "ipAdapter": ip_adapter.describe(),
        "controlnet": {
            "enabled": settings.enable_controlnet,
            "type": settings.controlnet_type if settings.enable_controlnet else None,
            "modelId": settings.controlnet_model_id if settings.enable_controlnet else None,
            "conditioningScale": (
                settings.controlnet_conditioning_scale if settings.enable_controlnet else None
            ),
        },
    }
    return pipe, runtime
