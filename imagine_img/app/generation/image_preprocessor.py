"""입력 이미지 검증과 준비 (설계서 §12).

여기가 생성 크기를 결정하는 유일한 곳이다.
SDXL Img2Img 파이프라인은 width/height 인자를 받지 않고 입력 이미지 크기를 그대로 따른다
(DESIGN_GAP_REPORT G-1). 따라서 이 함수가 정확히 1152x1024 를 보장해야 한다.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageOps

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError

# 구 설계서 §12 는 PNG/JPEG 만 허용했으나 WEBP 를 추가했다 (2026-08-01).
# 시뮬레이터가 브라우저 캔버스에서 내보내므로 WebP 가 자연스럽고, 이미 손실 포맷인 JPEG 을
# 받고 있어 막을 근거가 없다. 업로드 용량도 줄어든다.
ALLOWED_FORMATS = {"PNG", "JPEG", "MPO", "WEBP"}  # MPO: 일부 카메라 JPEG


def _reject(message: str) -> None:
    raise WorkerError(ErrorCode.INVALID_IMAGE, message)


def validate_format(image: Image.Image) -> None:
    fmt = (image.format or "").upper()
    # 메모리에서 만든 이미지는 format 이 None 이다 (테스트/내부 경로).
    if fmt and fmt not in ALLOWED_FORMATS:
        _reject(f"Unsupported image format '{fmt}'. Allowed: PNG, JPEG.")


def to_rgb(image: Image.Image) -> Image.Image:
    """EXIF 방향 보정 후 RGB 로 만든다. 알파는 흰 배경에 명시적으로 합성한다."""
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, rgba).convert("RGB")
    elif image.mode != "RGB":
        image = image.convert("RGB")
    return image


def assert_not_corrupt(image: Image.Image) -> None:
    """NaN/손상 이미지 거부. 완전 단색(모든 픽셀 동일)도 캡처 실패로 본다."""
    array = np.asarray(image, dtype=np.float32)
    if array.size == 0:
        _reject("Image has no pixel data.")
    if not np.isfinite(array).all():
        _reject("Image contains non-finite pixel values.")
    if float(array.max() - array.min()) == 0.0:
        _reject("Image is a single flat color; the simulator capture likely failed.")


def prepare(image: Image.Image, settings: Settings) -> Image.Image:
    """검증 → RGB → 생성 크기로 리사이즈.

    follow_input 모드: 생성 크기를 입력 비율에 맞춰 계산하므로 비율 거부가 없다.
    fixed 모드: 비율이 목표와 크게 다르면 거부한다 (자동 crop 은 제품을 잘라낼 위험이 있어 안 한다).
    """
    from app.generation.sizing import compute_generation_size

    validate_format(image)

    width, height = image.size
    if width < settings.input_min_size or height < settings.input_min_size:
        _reject(
            f"Image {width}x{height} is smaller than the minimum "
            f"{settings.input_min_size}x{settings.input_min_size}."
        )

    if settings.size_mode == "fixed":
        target_w, target_h = settings.generation_size
        target_ratio = target_w / target_h
        ratio = width / height
        drift = abs(ratio - target_ratio) / target_ratio
        if drift > settings.aspect_ratio_tolerance:
            _reject(
                f"Image aspect ratio {ratio:.4f} differs from the required {target_ratio:.4f} "
                f"by {drift * 100:.1f}% (tolerance {settings.aspect_ratio_tolerance * 100:.0f}%). "
                "Capture the simulator at 1152x1024, or use SIZE_MODE=follow_input."
            )
    else:
        target_w, target_h = compute_generation_size((width, height), settings)

    prepared = to_rgb(image)
    assert_not_corrupt(prepared)

    if prepared.size != (target_w, target_h):
        prepared = prepared.resize((target_w, target_h), resample=Image.Resampling.LANCZOS)

    assert prepared.size == (target_w, target_h)
    return prepared
