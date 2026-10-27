"""GPU smoke test (설계서 §20 Phase 1-6, Phase 2).

모델을 실제로 로드해 이미지 1장을 끝까지 만든다.
--text2img 를 주면 Img2Img 전에 Lightning UNet 자체가 도는지만 먼저 확인한다.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.core.logging import setup_logging  # noqa: E402
from app.core.metrics import snapshot_memory  # noqa: E402

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "desk_capture.png"


def text2img_smoke(settings) -> int:
    """Lightning Full UNet 이 4 step 으로 실제 그림을 만드는지 확인 (1024x1024)."""
    import torch
    from diffusers import StableDiffusionXLPipeline

    from app.models.lightning_loader import build_lightning_unet, make_trailing_euler_scheduler
    from app.models.memory_policy import apply_memory_policy

    unet = build_lightning_unet(settings)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        settings.base_model_id,
        unet=unet,
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
        cache_dir=str(settings.model_cache_dir),
        add_watermarker=False,
    )
    pipe.scheduler = make_trailing_euler_scheduler(pipe.scheduler.config)
    apply_memory_policy(pipe, settings)
    pipe.set_progress_bar_config(disable=True)

    started = time.perf_counter()
    with torch.inference_mode():
        image = pipe(
            prompt="a photo of a wooden desk with a single monitor, product photography",
            num_inference_steps=settings.inference_steps,
            guidance_scale=settings.guidance_scale,
            width=1024,
            height=1024,
            generator=torch.Generator(device=settings.generator_device).manual_seed(settings.default_seed),
        ).images[0]
    elapsed = time.perf_counter() - started

    out = settings.output_dir / "_smoke" / "text2img_1024.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out)
    memory = snapshot_memory()
    print(f"text2img 1024x1024 in {elapsed:.2f}s -> {out}")
    print(f"peak torch VRAM {memory.peak_vram_mb:.0f} MB / nvidia-smi {memory.nvidia_smi_vram_mb:.0f} MB")
    return 0


def img2img_smoke(settings, image_path: Path, preset: str) -> int:
    from app.generation.generator import generate
    from app.generation.schemas import GenerationRequest
    from app.models.model_service import get_service
    from app.transport.input_loader import load_path

    service = get_service()
    service.load()

    request = GenerationRequest.model_validate(
        {
            "jobId": f"smoke-{preset.lower()}",
            "timeOfDay": "NIGHT",
            "roomLightOn": True,
            "moodTags": ["white", "metal"],
            "productSummary": ["single monitor", "compact keyboard", "desk lamp"],
            "strengthPreset": preset,
            "seed": settings.default_seed,
        }
    )
    response = generate(request, load_path(image_path, settings), service)

    print(f"output   : {response.output_path}")
    print(f"size     : {response.width}x{response.height}")
    print(f"steps    : {response.runtime['requestedSteps']} requested / {response.runtime['effectiveSteps']} effective")
    print(f"timings  : {response.timings_ms}")
    print(f"memory   : {response.memory}")
    print(f"modelLoad: {service.model_load_ms} ms, warmup: {service.warmup_ms} ms")
    for warning in response.warnings:
        print(f"warning  : {warning}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=FIXTURE)
    parser.add_argument("--preset", default="BALANCED", choices=["PRESERVE", "BALANCED", "REALISTIC"])
    parser.add_argument("--text2img", action="store_true", help="Img2Img 대신 Text2Img 만 확인")
    args = parser.parse_args()

    settings = get_settings()
    setup_logging(settings.log_level)

    if args.text2img:
        return text2img_smoke(settings)
    return img2img_smoke(settings, args.image, args.preset)


if __name__ == "__main__":
    raise SystemExit(main())
