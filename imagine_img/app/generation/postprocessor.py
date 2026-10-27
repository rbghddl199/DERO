"""Lanczos 후처리 (설계서 §14).

1152x1024 -> 높이 기준 1.15625배 -> 1332x1184 -> 좌우 2px 중앙 crop -> 1328x1184.
AI 업스케일러를 쓰지 않는다. 새 디테일을 만들지 않는 것이 요점이다.
"""

from __future__ import annotations

from PIL import Image, ImageFilter

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError


def resize_and_crop(
    image: Image.Image, settings: Settings, final_size: tuple[int, int] | None = None
) -> Image.Image:
    """최종 크기를 덮는 최소 배율로 Lanczos 확대한 뒤 중앙 crop 한다.

    final_size 를 주면 그것을 쓴다(follow_input 모드에서 입력 크기가 들어온다).
    주지 않으면 설정의 고정 크기를 쓴다.

    가로·세로를 서로 다른 비율로 늘리지 않는다. 남는 쪽만 중앙에서 잘라낸다.
    고정 규격에서의 동작은 그대로다: 1152x1024 -> 1332x1184 -> 좌우 2px crop -> 1328x1184.
    """
    from app.generation.sizing import compute_intermediate_size

    final_w, final_h = final_size if final_size is not None else settings.final_size
    inter_w, inter_h = compute_intermediate_size(image.size, (final_w, final_h))

    if inter_w < final_w or inter_h < final_h:  # pragma: no cover - 계산이 보장한다
        raise WorkerError(
            ErrorCode.POSTPROCESS_FAILED,
            f"Intermediate size {(inter_w, inter_h)} does not cover the final size "
            f"{(final_w, final_h)}; center-cropping cannot reach it.",
        )

    source = image.convert("RGB")
    resized = source.resize((inter_w, inter_h), resample=Image.Resampling.LANCZOS)

    # 남는 쪽을 같은 양씩 잘라낸다. 홀수 차이면 왼쪽/위를 1px 더 남긴다.
    left = (inter_w - final_w) // 2
    top = (inter_h - final_h) // 2
    final = resized.crop((left, top, left + final_w, top + final_h))

    if final.size != (final_w, final_h):  # pragma: no cover - 위 계산이 보장한다
        raise WorkerError(
            ErrorCode.POSTPROCESS_FAILED,
            f"Postprocess produced {final.size}, expected {(final_w, final_h)}.",
        )
    return final


def apply_optional_sharpen(image: Image.Image, settings: Settings) -> Image.Image:
    """기본 OFF. 로고·키캡·포트 같은 작은 요소에 링잉이 생길 수 있다 (설계서 §2.5)."""
    return image.filter(
        ImageFilter.UnsharpMask(
            radius=settings.sharpen_radius,
            percent=settings.sharpen_percent,
            threshold=settings.sharpen_threshold,
        )
    )
