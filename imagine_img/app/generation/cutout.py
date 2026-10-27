"""U2Net 누끼 — 방 배경에서도 제품을 갈라낸다 (2026-08-05).

## 왜 필요한가

`background.py` 의 마스크는 **흰 배경 전용**이다(테두리에 닿은 밝은 덩어리). 그래서 연출
컷에서는 배경과 제품을 못 가른다. 레퍼런스 게이트 실측에서 그 대가가 그대로 나왔다:

```text
1,076장 중 통과 461장 (42.8%)
  거부 363장  "배경과 제품을 가를 수 없다 (연출 컷이거나 제품이 없다)"  ← 여기
```

363장이 그 이유로 떨어진다. 방 배경에서 누끼를 뽑을 수 있으면 그 대부분이 살아난다.

## 왜 rembg 가 아니라 onnxruntime 을 직접 쓰는가

`rembg` 를 설치해 봤더니 `pymatting` → `numba` 를 끌어오고, **numba 가 numpy 2.4 이하를
요구한다**(이 환경은 2.5.1). numpy 를 내리면 torch 2.6 + cv2 가 올라앉은 환경을 건드리게
되고, 그 환경은 이 저장소에서 유일하게 GPU 가 도는 조합이다. rembg 의 alpha matting 은
우리가 쓰지 않는 기능인데 그것 때문에 환경을 흔들 이유가 없다.

그래서 rembg 가 하는 일 중 **필요한 부분만** 직접 한다: u2net.onnx 를 onnxruntime 으로
돌리고 마스크를 만든다. onnxruntime 은 numpy 버전 제약이 없고 CPU 로 돈다 — 8GB 카드의
VRAM 을 한 바이트도 쓰지 않는다(SDXL 이 6.5GB 를 잡고 있으므로 이게 중요하다).

## 규약

돌려주는 마스크는 `background.build_mask` 와 **같은 뜻**이다: **흰색(255) = 다시 그릴 배경.**
U2Net 은 반대로 내므로(제품이 1) 뒤집는다. 이걸 잊으면 제품만 다시 그려진다.
"""

from __future__ import annotations

import threading
from pathlib import Path

import numpy as np
from PIL import Image

from app.core.errors import ErrorCode, WorkerError
from app.core.logging import get_logger

log = get_logger(__name__)

#: U2Net 입력 한 변. 모델이 이 크기로 학습됐다.
MODEL_INPUT_SIZE = 320

#: ImageNet 정규화 상수. 0~255 를 그대로 넣으면 마스크가 전면 흰색이 된다.
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

#: 점수 지도의 최대-최소가 이보다 작으면 모델이 아무것도 못 찾은 것으로 본다.
FLAT_SCORE_RANGE = 0.05

#: 모델 파일 이름. `model_cache_dir` 아래에 둔다 — 다른 모델과 같은 자리다.
MODEL_FILENAME = "u2net.onnx"

#: rembg 가 쓰는 것과 같은 파일. 없으면 내려받는다.
MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"

_session = None
_session_lock = threading.Lock()


class CutoutUnavailable(RuntimeError):
    """누끼를 낼 수 없다 — 모델이 없거나 결과가 쓸 수 없다."""


def preprocess(image: Image.Image) -> np.ndarray:
    """`(1, 3, 320, 320)` float32.

    **비율을 유지하려고 자르지 않는다.** 자르면 제품 일부가 프레임 밖으로 나가 그 부분이
    배경으로 잡힌다. 늘려 넣고 마스크를 원래 크기로 되돌리는 쪽이 손실이 적다.
    """
    resized = image.convert("RGB").resize((MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), Image.LANCZOS)
    array = np.asarray(resized, dtype=np.float32) / 255.0
    array = (array - _MEAN) / _STD
    return np.transpose(array, (2, 0, 1))[None, ...].astype(np.float32)


def postprocess_mask(raw: np.ndarray, *, size: tuple[int, int]) -> Image.Image:
    """모델 출력 → **배경 마스크**(흰색 = 다시 그릴 곳), 원래 크기로.

    출력은 0~1 로 정규화돼 있지 않아서 최대-최소로 늘린다. 그 폭이 거의 없으면 모델이
    아무것도 못 찾은 것이므로 `CutoutUnavailable` 로 알린다 — 전면 단색 마스크를 조용히
    돌려주면 제품이 통째로 다시 그려지거나 배경이 그대로 남는다.
    """
    scores = np.asarray(raw, dtype=np.float32).reshape(
        -1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE
    )[0]
    low, high = float(scores.min()), float(scores.max())
    if high - low < FLAT_SCORE_RANGE:
        raise CutoutUnavailable(
            f"u2net score map is flat (range {high - low:.4f}) — nothing was separated"
        )
    product = (scores - low) / (high - low)
    # 뒤집는다: U2Net 은 제품을 1 로 내지만 우리 규약은 **배경이 흰색**이다.
    background = ((1.0 - product) * 255.0).clip(0, 255).astype(np.uint8)
    return Image.fromarray(background, mode="L").resize(size, Image.LANCZOS)


def _model_path(model_cache_dir: Path) -> Path:
    return Path(model_cache_dir) / MODEL_FILENAME


def ensure_model(model_cache_dir: Path, *, allow_download: bool = True) -> Path:
    """모델 파일 경로. 없으면 내려받는다."""
    path = _model_path(model_cache_dir)
    if path.exists():
        return path
    if not allow_download:
        raise CutoutUnavailable(f"{path} not found and downloads are disabled")
    import httpx

    path.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading %s (~176MB) → %s", MODEL_URL, path)
    # 임시 파일에 받고 마지막에 옮긴다 — 중간에 끊긴 파일이 "있는 모델" 로 남으면
    # 다음 실행이 onnxruntime 로딩에서 알 수 없는 에러로 죽는다.
    staging = path.with_suffix(".partial")
    with httpx.stream("GET", MODEL_URL, follow_redirects=True, timeout=300.0) as response:
        response.raise_for_status()
        with staging.open("wb") as handle:
            for chunk in response.iter_bytes():
                handle.write(chunk)
    staging.replace(path)
    return path


def _get_session(model_cache_dir: Path):
    """세션 하나를 공유한다. 요청마다 만들면 176MB 를 매번 다시 읽는다."""
    global _session
    with _session_lock:
        if _session is None:
            import onnxruntime as ort

            path = ensure_model(model_cache_dir)
            # CPU 로 돈다 — SDXL 이 VRAM 을 거의 다 쓰고 있어서 GPU 를 나눠 쓸 여유가 없다.
            _session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        return _session


def cutout_mask(image: Image.Image, model_cache_dir: Path) -> Image.Image:
    """배경 마스크(흰색 = 배경). 실패하면 `CutoutUnavailable`.

    호출부가 `background.build_mask` 로 폴백할 수 있게 **예외로** 알린다 — 쓸 수 없는
    마스크를 돌려주는 것보다 낫다.
    """
    try:
        session = _get_session(model_cache_dir)
        outputs = session.run(None, {session.get_inputs()[0].name: preprocess(image)})
    except CutoutUnavailable:
        raise
    except Exception as exc:
        raise CutoutUnavailable(f"u2net inference failed: {type(exc).__name__}: {exc}") from exc
    return postprocess_mask(outputs[0], size=image.size)


def require_available(model_cache_dir: Path) -> None:
    """설정이 누끼를 요구하는데 쓸 수 없으면 **조용히 넘기지 않는다.**"""
    try:
        _get_session(model_cache_dir)
    except CutoutUnavailable as exc:
        raise WorkerError(
            ErrorCode.CONFIGURATION_ERROR,
            f"ENABLE_CUTOUT_MASK=true 인데 u2net 을 쓸 수 없다: {exc}",
        ) from exc
