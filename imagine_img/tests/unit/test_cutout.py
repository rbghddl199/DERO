"""U2Net 누끼 (app/generation/cutout.py, 2026-08-05).

모델을 내려받지 않고 검증한다 — 추론은 가짜로 두고 **전처리·후처리·연결 방식**만 본다.
실제 모델로 도는 것은 통합 테스트(느리고 176MB 다운로드)에서 확인한다.
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from app.generation.cutout import (
    MODEL_INPUT_SIZE,
    CutoutUnavailable,
    postprocess_mask,
    preprocess,
)


def _photo(width: int, height: int) -> Image.Image:
    array = np.zeros((height, width, 3), dtype=np.uint8)
    array[:, :, 1] = 120
    array[height // 4 : height // 2, width // 4 : width // 2] = (200, 30, 40)
    return Image.fromarray(array)


# --- 전처리 -----------------------------------------------------------------


def test_preprocess_produces_the_shape_u2net_expects():
    tensor = preprocess(_photo(640, 480))

    assert tensor.shape == (1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
    assert tensor.dtype == np.float32


def test_preprocess_normalises_into_a_small_range():
    """U2Net 은 ImageNet 정규화를 기대한다. 0~255 를 그대로 넣으면 마스크가 전면 흰색이 된다."""
    tensor = preprocess(_photo(320, 320))

    assert -3.0 < float(tensor.min()) < 3.0
    assert -3.0 < float(tensor.max()) < 3.0


def test_preprocess_accepts_a_non_square_image_without_cropping():
    """비율을 유지하려고 자르면 제품 일부가 사라진다 — 늘려 넣고 마스크를 되돌린다."""
    tensor = preprocess(_photo(1600, 400))

    assert tensor.shape[2:] == (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)


# --- 후처리 -----------------------------------------------------------------


def test_postprocess_returns_a_background_mask_at_the_original_size():
    """`build_mask` 와 같은 규약이다: **흰색(255) = 다시 그릴 배경.**

    U2Net 은 반대로 낸다(제품이 1). 뒤집는 것을 잊으면 제품만 다시 그려진다.
    """
    raw = np.zeros((1, 1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), dtype=np.float32)
    raw[..., 40:200, 40:200] = 1.0  # 제품

    mask = postprocess_mask(raw, size=(800, 600))

    assert mask.size == (800, 600)
    array = np.asarray(mask)
    assert array[10, 10] > 200, "테두리는 배경이므로 흰색이어야 한다"
    assert array[300, 400] < 60, "가운데 제품 자리는 검어야 한다"


def test_postprocess_rescales_the_score_map_to_zero_one():
    """U2Net 출력은 0~1 로 정규화돼 있지 않다. 그대로 쓰면 임계가 무의미해진다."""
    raw = np.full((1, 1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), 7.0, dtype=np.float32)
    raw[..., :100, :100] = 12.0

    mask = postprocess_mask(raw, size=(200, 200))
    array = np.asarray(mask)

    assert array.min() < 60 and array.max() > 200, "전면 단색이면 갈라내지 못한 것이다"


def test_a_flat_score_map_is_reported_not_silently_returned():
    """모델이 아무것도 못 찾으면 마스크가 전면 한 색이다. 조용히 넘기면 제품이 통째로
    다시 그려지거나 배경이 그대로 남는다 — 어느 쪽이든 사람이 알아야 한다."""
    raw = np.full((1, 1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), 0.5, dtype=np.float32)

    with pytest.raises(CutoutUnavailable):
        postprocess_mask(raw, size=(200, 200))
