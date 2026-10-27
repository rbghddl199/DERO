"""배경 마스크 (app/generation/background.py, 2026-08-04)."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.generation.background import (
    MAX_SAFE_COVERAGE,
    build_mask,
    is_studio_white,
    to_opaque,
)


def _white_bg_product(size: int = 256) -> Image.Image:
    """흰 배경 + 어두운 테두리를 가진 제품 + **제품 안의 흰색**.

    안쪽 흰색이 이 모듈의 핵심 함정이다 — 흰 키캡, 흰 시계 몸통이 배경으로 잡히면
    제품 가운데에 방이 그려진다. 실제 사진처럼 음영을 준다: 완전히 평탄한 흰색은
    틈으로 보이는 배경과 구별할 수 없어서 일부러 배경으로 본다
    (`test_a_flat_white_gap_enclosed_by_the_product_is_treated_as_background`).
    """
    image = Image.new("RGB", (size, size), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 60, size - 60, size - 60), fill=(40, 40, 40))
    for offset in range(size - 180):
        value = 236 + offset % 12
        draw.line((90, 90 + offset, size - 90, 90 + offset), fill=(value, value, value))
    return image


def test_white_inside_the_product_is_not_masked():
    mask = np.asarray(build_mask(_white_bg_product(), bite=0, feather=0).mask)
    assert mask[10, 10] > 200, "테두리 흰 배경은 마스크에 들어가야 한다"
    assert mask[128, 128] < 50, "제품 안쪽 흰색은 마스크에서 빠져야 한다"


def test_alpha_is_used_when_present():
    image = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    ImageDraw.Draw(image).ellipse((32, 32, 96, 96), fill=(200, 30, 30, 255))

    result = build_mask(image, bite=0, feather=0)

    assert result.source == "alpha"
    mask = np.asarray(result.mask)
    assert mask[5, 5] > 200  # 투명한 자리 = 배경
    assert mask[64, 64] < 50  # 제품


def test_alpha_wins_even_though_the_pipeline_composites_onto_white():
    """알파를 흰색에 합성한 뒤에 마스크를 뽑으면 제품 안 흰색과 구별이 어려워진다.

    그래서 마스크는 **합성 전** 이미지에서 뽑고, 알파 경로에서는 구멍 채우기를 하지
    않는다 — 알파가 "제품" 이라고 말한 자리를 밝기 추측으로 덮으면 안 된다.
    """
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    ImageDraw.Draw(image).rectangle((16, 16, 48, 48), fill=(255, 255, 255, 255))  # 흰 제품

    result = build_mask(image, bite=0, feather=0)

    assert result.source == "alpha"
    assert np.asarray(result.mask)[32, 32] < 50, "흰 제품이 배경으로 잡히면 안 된다"


def test_a_mask_that_covers_almost_everything_is_not_usable():
    """마스크가 제품까지 먹으면 배경 단계가 제품을 다른 물건으로 바꾼다."""
    blank = Image.new("RGB", (64, 64), (255, 255, 255))

    result = build_mask(blank)

    assert result.coverage > MAX_SAFE_COVERAGE
    assert not result.usable


def test_a_photo_with_a_real_background_is_left_alone():
    """라이프스타일 사진은 배경이 이미 있다 — 손대면 잘 나오던 것을 망친다."""
    rng = np.random.default_rng(0)
    noisy = Image.fromarray(rng.integers(40, 200, (64, 64, 3), dtype=np.uint8), mode="RGB")

    assert not is_studio_white(noisy)
    assert not build_mask(noisy).usable


def test_studio_white_is_detected_on_the_corners_not_the_whole_frame():
    """제품이 프레임에 닿아 있으면 가장자리 한 줄에 제품이 걸린다. 모서리는 대개 비어 있다."""
    image = _white_bg_product()
    ImageDraw.Draw(image).rectangle((0, 120, 255, 140), fill=(20, 20, 20))  # 좌우로 관통하는 제품

    assert is_studio_white(image)


def test_to_opaque_matches_the_pipeline_behaviour():
    """파이프라인은 알파를 흰색에 합성한다 (image_preprocessor.to_rgb). 같아야 한다."""
    from app.generation.image_preprocessor import to_rgb

    image = Image.new("RGBA", (32, 32), (10, 20, 30, 0))

    assert np.array_equal(np.asarray(to_opaque(image)), np.asarray(to_rgb(image)))


def test_a_flat_white_gap_enclosed_by_the_product_is_treated_as_background():
    """의자 팔걸이와 좌판 사이 틈은 배경이다. 남기면 새 방 안에 흰 반점이 된다 (실측)."""
    image = Image.new("RGB", (256, 256), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 60, 196, 196), fill=(90, 90, 90))
    draw.rectangle((100, 100, 156, 156), fill=(255, 255, 255))  # 틈: 배경과 같은 색, 평탄

    result = build_mask(image, feather=0)

    assert result.holes_filled == 1
    assert np.asarray(result.mask)[128, 128] > 200


def test_a_shaded_white_part_of_the_product_is_kept():
    """흰 키캡·흰 몸통은 음영이 있다. 채우면 제품 가운데에 방이 그려진다."""
    image = Image.new("RGB", (256, 256), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 60, 196, 196), fill=(90, 90, 90))
    # 제품의 흰 부분: 세로로 밝기가 변한다 (음영)
    for offset in range(56):
        value = 236 + offset % 12
        draw.line((100, 100 + offset, 156, 100 + offset), fill=(value, value, value))

    result = build_mask(image, feather=0)

    assert result.holes_filled == 0
    assert np.asarray(result.mask)[128, 128] < 50


def test_bite_expands_the_mask_into_the_product():
    """제품 외곽의 반투명 흰 픽셀을 지우려고 일부러 먹는다 (없으면 흰 테두리가 남는다)."""
    image = _white_bg_product()

    tight = build_mask(image, bite=0, feather=0).coverage
    bitten = build_mask(image, bite=4, feather=0).coverage

    assert bitten > tight
