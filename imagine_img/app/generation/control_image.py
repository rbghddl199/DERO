"""ControlNet 조건 이미지 생성.

## 왜 ControlNet 인가

img2img 만으로는 "제품 보존"과 "실사 재질"이 strength 하나의 축에서 배타적이다
(docs/QUALITY_GAP_ANALYSIS.md 원인 B). strength 0.9 에서 모델은 사진급 재질을 만들지만
모니터가 iMac 으로 바뀌는 등 제품이 전부 교체된다.

ControlNet 은 구조를 **프롬프트가 아니라 조건 이미지로 고정**하므로, 배치·형태를 유지한 채
strength 를 올릴 수 있다. 두 축을 분리하는 것이 목적이다.

## canny 를 먼저 쓰는 이유

depth 는 깊이 추정 모델이 추가로 필요하다(또는 시뮬레이터가 depth 버퍼를 내보내야 한다).
canny 는 입력 이미지만으로 만들 수 있고, **제품의 실루엣과 내부 형태를 픽셀 단위로 고정**한다.
모니터가 다른 기기로 바뀌는 것을 막는 데는 depth 보다 canny 가 강하다.

시뮬레이터가 depth 버퍼를 줄 수 있으면 그것이 더 낫다 — 추정 오차가 없고 조명·재질에
영향받지 않는다. `control_image_path` 로 직접 넣을 수 있게 열어두었다.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)


def build_canny(image: Image.Image, settings: Settings) -> Image.Image:
    """Canny 엣지 맵 (흑백 3채널). ControlNet canny 가 기대하는 형식이다."""
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover
        raise WorkerError(
            ErrorCode.CONFIGURATION_ERROR,
            "CONTROLNET_TYPE=canny requires opencv (uv pip install opencv-python-headless).",
            cause=exc,
        ) from exc

    array = np.asarray(image.convert("RGB"))
    edges = cv2.Canny(array, settings.canny_low_threshold, settings.canny_high_threshold)
    stacked = np.stack([edges] * 3, axis=-1)
    return Image.fromarray(stacked)


def build_control_image(
    prepared: Image.Image, settings: Settings, provided: Image.Image | None = None
) -> Image.Image:
    """조건 이미지를 만든다. 크기는 생성 크기와 정확히 같아야 한다.

    provided 를 주면(시뮬레이터가 낸 depth/edge 버퍼 등) 그것을 리사이즈해서 쓴다.
    """
    if provided is not None:
        control = provided.convert("RGB")
        if control.size != prepared.size:
            control = control.resize(prepared.size, resample=Image.Resampling.LANCZOS)
        log.info("using the provided control image (%s)", settings.controlnet_type)
        return control

    match settings.controlnet_type:
        case "canny":
            return build_canny(prepared, settings)
        case "depth":
            # depth 추정 모델을 이 POC 에 추가하지 않았다. 조용히 canny 로 대체하지 않는다.
            raise WorkerError(
                ErrorCode.CONFIGURATION_ERROR,
                "CONTROLNET_TYPE=depth needs a depth map: either pass one via "
                "controlImagePath (the simulator's depth buffer is ideal) or add a depth "
                "estimator. Refusing to silently fall back to canny.",
            )
        case other:  # pragma: no cover - Literal 로 걸러진다
            raise WorkerError(
                ErrorCode.CONFIGURATION_ERROR, f"Unknown CONTROLNET_TYPE '{other}'."
            )


def describe(control: Image.Image) -> dict:
    """조건 이미지가 실제로 구조를 담고 있는지 확인할 수 있는 값."""
    array = np.asarray(control.convert("L"), dtype=np.float32)
    return {
        "size": [control.width, control.height],
        "edgePixelPercent": round(float((array > 127).mean() * 100), 3),
    }
