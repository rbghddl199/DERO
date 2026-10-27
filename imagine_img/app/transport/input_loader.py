"""입력 이미지 로딩. bytes / 파일 경로 두 진입점을 같은 검증으로 모은다."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.core.config import Settings
from app.core.errors import ErrorCode, WorkerError


def load_bytes(data: bytes, settings: Settings) -> Image.Image:
    if not data:
        raise WorkerError(ErrorCode.INVALID_IMAGE, "Uploaded image is empty.")
    if len(data) > settings.input_max_bytes:
        raise WorkerError(
            ErrorCode.INVALID_IMAGE,
            f"Image is {len(data) / 1024**2:.1f} MB, over the "
            f"{settings.input_max_bytes / 1024**2:.0f} MB limit.",
        )
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise WorkerError(ErrorCode.INVALID_IMAGE, "Cannot decode the uploaded image.", cause=exc) from exc
    except OSError as exc:
        raise WorkerError(ErrorCode.INVALID_IMAGE, f"Corrupt image data: {exc}", cause=exc) from exc
    return image


def load_path(path: str | Path, settings: Settings) -> Image.Image:
    file_path = Path(path)
    if not file_path.exists():
        raise WorkerError(ErrorCode.INVALID_IMAGE, f"Input image not found: {file_path}")
    return load_bytes(file_path.read_bytes(), settings)


def load_simulator_view(path: str, settings: Settings) -> Image.Image:
    """새 지시문 §4 의 simulatorViewPath 로 들어온 로컬 경로를 읽는다.

    HTTP 로 임의 경로를 받아 그대로 읽으면 로컬 파일 읽기 취약점이 된다.
    그래서 INPUT_DIR 하위로만 제한한다. 밖을 가리키면 거부한다.
    """
    root = settings.input_dir.resolve()
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = (root / candidate)
    candidate = candidate.resolve()

    if not candidate.is_relative_to(root):
        raise WorkerError(
            ErrorCode.INVALID_REQUEST,
            f"simulatorViewPath must stay inside {root}; got {candidate}.",
        )
    return load_path(candidate, settings)
