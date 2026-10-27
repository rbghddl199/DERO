"""모델 가중치를 로컬 캐시로 내려받는다 (설계서 §20 Phase 1-4).

SDXL Base 저장소에는 fp32/fp16 가중치가 함께 들어 있어 통째로 받으면 13GB 이상이다.
이 Worker 는 fp16 만 쓰고 UNet 은 Lightning 것으로 교체하므로
- fp16 variant 파일만
- unet 가중치는 config.json 만 (가중치는 Lightning checkpoint 로 대체)
받는다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from huggingface_hub import hf_hub_download, snapshot_download  # noqa: E402

from app.core.config import get_settings  # noqa: E402

# unet/ 하위 가중치는 받지 않는다. UNet 은 Lightning full checkpoint 로 주입한다.
BASE_ALLOW = [
    "model_index.json",
    "scheduler/*.json",
    "tokenizer/*",
    "tokenizer_2/*",
    "text_encoder/config.json",
    "text_encoder_2/config.json",
    "vae/config.json",
    "unet/config.json",
    "text_encoder/*.fp16.safetensors",
    "text_encoder_2/*.fp16.safetensors",
    "vae/*.fp16.safetensors",
]


def download_ip_adapter(settings, cache: str) -> None:
    """IP-Adapter 가중치 + CLIP 비전 인코더 (2026-08-06).

    `ENABLE_IP_ADAPTER=false` 여도 받아 둔다 — 켜는 순간 3.2GB 를 기다리게 만드는 것보다
    낫고, 이 스크립트를 도는 시점은 어차피 준비 단계다. 디스크가 아까우면 이 함수만 건너뛴다.

    인코더가 어댑터와 **다른 폴더**에 있다(`models/image_encoder`). 같이 받지 않으면
    로드할 때 그때서야 2.5GB 를 내려받는다.
    """
    if not getattr(settings, "ip_adapter_repo_id", ""):
        return
    print(f"[+] IP-Adapter: {settings.ip_adapter_repo_id}")
    path = snapshot_download(
        settings.ip_adapter_repo_id,
        allow_patterns=[
            f"{settings.ip_adapter_subfolder}/{settings.ip_adapter_weight_name}",
            # `*` 로 받으면 안 된다 — 인코더 폴더에 `model.safetensors` 와
            # `pytorch_model.bin` 이 **같은 가중치로 둘 다** 있어서 2.5GB 를 헛으로 받는다.
            f"{settings.ip_adapter_image_encoder_subfolder}/config.json",
            f"{settings.ip_adapter_image_encoder_subfolder}/*.safetensors",
        ],
        cache_dir=cache,
    )
    size_gb = sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 1024**3
    print(f"      -> {path} ({size_gb:.2f} GB)")


def main() -> int:
    settings = get_settings()
    settings.model_cache_dir.mkdir(parents=True, exist_ok=True)
    cache = str(settings.model_cache_dir)

    print(f"[1/2] SDXL Base (fp16 variant, unet 가중치 제외): {settings.base_model_id}")
    base_path = snapshot_download(
        settings.base_model_id,
        allow_patterns=BASE_ALLOW,
        cache_dir=cache,
    )
    print(f"      -> {base_path}")

    if settings.profile.lightning_variant == "none":
        # 실사 특화 체크포인트. 사용자가 MODEL_PROFILE 로 명시적으로 고른 경우에만 여기 온다
        # (§21 의 "검증되지 않은 모델을 자동 다운로드하지 않는다" 는 기본 프로필에 대한 규칙이다).
        model_id = settings.resolved_model_id
        print(f"[2/2] 프로필 {settings.model_profile} 체크포인트: {model_id}")
        print("      fp16 variant 만 받는다 (단일 파일 통합 체크포인트는 제외).")
        path = snapshot_download(
            model_id,
            allow_patterns=[
                "model_index.json",
                "scheduler/*.json",
                "tokenizer/*",
                "tokenizer_2/*",
                "*/config.json",
                "*/*.fp16.safetensors",
            ],
            cache_dir=cache,
        )
        total_gb = sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 1024**3
        print(f"      -> {path} ({total_gb:.2f} GB)")
        download_ip_adapter(settings, cache)
        total = sum(f.stat().st_size for f in settings.model_cache_dir.rglob("*") if f.is_file())
        print(f"\n캐시 총 사용량: {total / 1024**3:.2f} GB  ({cache})")
        return 0

    print(f"[2/2] Lightning checkpoint: {settings.lightning_repo_id}/{settings.lightning_checkpoint}")
    ckpt = hf_hub_download(
        settings.lightning_repo_id,
        settings.lightning_checkpoint,
        cache_dir=cache,
    )
    size_gb = Path(ckpt).stat().st_size / 1024**3
    print(f"      -> {ckpt} ({size_gb:.2f} GB)")

    download_ip_adapter(settings, cache)

    total = sum(f.stat().st_size for f in settings.model_cache_dir.rglob("*") if f.is_file())
    print(f"\n캐시 총 사용량: {total / 1024**3:.2f} GB  ({cache})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
