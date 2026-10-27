"""환경 검사 (설계서 §15-1, §20 Phase 1-3).

확인한 사실만 출력한다. 추측하지 않는다.
"""

from __future__ import annotations

import importlib.metadata as md
import platform
import shutil
import sys

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.metrics import cuda_available, gpu_name, nvidia_smi_used_mb, total_vram_mb

WATCHED = (
    "torch",
    "diffusers",
    "transformers",
    "accelerate",
    "safetensors",
    "huggingface-hub",
    "peft",
    "pillow",
    "fastapi",
    "uvicorn",
    "torchao",
    "bitsandbytes",
)


def collect() -> dict:
    settings = get_settings()

    packages: dict[str, str] = {}
    for name in WATCHED:
        try:
            packages[name] = md.version(name)
        except md.PackageNotFoundError:
            packages[name] = "MISSING"

    torch_info: dict[str, object] = {"available": False}
    try:
        import torch

        torch_info = {
            "available": True,
            "version": torch.__version__,
            "compiledCuda": torch.version.cuda,
            "cudaAvailable": torch.cuda.is_available(),
            "deviceCount": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        }
    except Exception as exc:  # pragma: no cover
        torch_info["error"] = str(exc)

    free_bytes = shutil.disk_usage(settings.model_cache_dir.parent).free

    return {
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "platform": platform.platform(),
        "packages": packages,
        "torch": torch_info,
        "gpu": {
            "name": gpu_name() if cuda_available() else None,
            "totalVramMb": round(total_vram_mb()),
            "currentlyUsedMb": nvidia_smi_used_mb(),
        },
        "settings": {
            "memoryMode": settings.memory_mode,
            "quantization": settings.quantization_mode,
            "loraEnabled": settings.enable_dero_lora,
            "generationSize": list(settings.generation_size),
            "intermediateSize": list(settings.intermediate_size),
            "finalSize": list(settings.final_size),
            "modelCacheDir": str(settings.model_cache_dir),
            "outputDir": str(settings.output_dir),
            "bind": f"{settings.host}:{settings.port}",
        },
        "diskFreeGb": round(free_bytes / 1024**3, 1),
    }


def report() -> int:
    """사람이 읽을 형태로 출력하고, 치명적 문제가 있으면 1 을 돌려준다."""
    # Windows 콘솔 기본 코드페이지에서 한글이 깨지지 않게 stdout 을 UTF-8 로 맞춘다.
    setup_logging(get_settings().log_level)
    info = collect()
    print(f"python      : {info['python']}  ({info['executable']})")
    print(f"platform    : {info['platform']}")
    print(f"torch       : {info['torch']}")
    print(f"gpu         : {info['gpu']}")
    print(f"disk free   : {info['diskFreeGb']} GB")
    print("packages    :")
    for name, version in info["packages"].items():
        print(f"  - {name:<16} {version}")
    print("settings    :")
    for key, value in info["settings"].items():
        print(f"  - {key:<16} {value}")

    problems: list[str] = []
    if not info["torch"].get("cudaAvailable"):
        problems.append("torch.cuda.is_available() is False — generation would run on CPU.")
    if info["gpu"]["totalVramMb"] and info["gpu"]["totalVramMb"] < 7000:
        problems.append(f"VRAM {info['gpu']['totalVramMb']} MB is below the assumed 8 GB.")
    if info["diskFreeGb"] < 15:
        problems.append(f"Only {info['diskFreeGb']} GB free; the weights need about 7 GB.")

    if problems:
        print("\n문제:")
        for problem in problems:
            print(f"  ! {problem}")
        return 1
    print("\n확인된 문제 없음.")
    return 0


if __name__ == "__main__":
    raise SystemExit(report())
