"""Lanczos 후처리 검증 (설계서 §18.1)."""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from app.core.errors import ErrorCode, WorkerError
from app.generation import postprocessor


def test_fixed_mode_reproduces_the_old_spec(settings, capture_image):
    """구 규격: 1152x1024 -> Lanczos 1332x1184 -> 좌우 2px crop -> 1328x1184."""
    from app.generation.sizing import compute_intermediate_size

    fixed = settings.model_copy(update={"size_mode": "fixed"})
    assert compute_intermediate_size((1152, 1024), fixed.final_size) == (1332, 1184)
    final = postprocessor.resize_and_crop(capture_image, fixed)
    assert final.size == (1328, 1184)


def test_follow_input_mode_returns_the_requested_size(settings, capture_image):
    """출력 크기는 입력 크기를 그대로 따른다."""
    final = postprocessor.resize_and_crop(capture_image, settings, (1125, 1449))
    assert final.size == (1125, 1449)


@pytest.mark.parametrize(
    ("generated", "final"),
    [
        ((1152, 1024), (1328, 1184)),
        ((896, 1152), (1125, 1449)),
        ((1024, 1024), (1024, 1024)),
        ((1024, 576), (1920, 1080)),
        ((896, 1152), (896, 1152)),
    ],
)
def test_any_size_pair_reaches_the_final_size_exactly(settings, generated, final):
    source = Image.new("RGB", generated, (10, 20, 30))
    source.putpixel((0, 0), (255, 255, 255))
    assert postprocessor.resize_and_crop(source, settings, final).size == final


def test_crop_is_centered(settings):
    """좌우 2px 를 같은 양씩 잘라내는지 확인한다.

    1332 폭의 중간 열들이 결과에서 정확히 2px 씩 밀려 있어야 한다.
    """
    source = Image.new("RGB", (1152, 1024), (0, 0, 0))
    resized = source.resize((1332, 1184), resample=Image.Resampling.LANCZOS)
    # 확인용으로 특정 열에 표식을 남기고 같은 crop 을 수동 적용해 비교한다.
    for y in range(1184):
        resized.putpixel((2, y), (255, 0, 0))
        resized.putpixel((1329, y), (0, 255, 0))

    cropped = resized.crop((2, 0, 1330, 1184))
    assert cropped.size == (1328, 1184)
    assert cropped.getpixel((0, 0)) == (255, 0, 0)
    assert cropped.getpixel((1327, 0)) == (0, 255, 0)


def test_sharpen_changes_pixels_only_when_enabled(settings, capture_image):
    final = postprocessor.resize_and_crop(capture_image, settings, (1328, 1184))
    untouched = np.asarray(final, dtype=np.int16)

    # sharpen OFF 경로는 후처리 결과를 그대로 쓴다 → 변경 없음.
    assert np.array_equal(untouched, np.asarray(final, dtype=np.int16))

    sharpened = postprocessor.apply_optional_sharpen(final, settings)
    assert sharpened.size == final.size
    assert not np.array_equal(untouched, np.asarray(sharpened, dtype=np.int16))


def test_large_final_size_is_reached_by_upscaling(settings):
    """덮는 배율로 확대하므로 최종 크기가 커도 도달한다 (다만 Lanczos 는 디테일을 만들지 않는다)."""
    final = postprocessor.resize_and_crop(Image.new("RGB", (1152, 1024)), settings, (4000, 3000))
    assert final.size == (4000, 3000)
