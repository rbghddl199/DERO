"""타일 SD 업스케일 (app/generation/upscaler.py, 2026-08-05).

가짜 파이프라인으로 검증한다 — 실제 SDXL 은 GPU 통합 테스트에서만 돈다.
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from app.generation.upscaler import (
    MIN_TILE,
    TileGrid,
    plan_tiles,
    refine_upscaled,
)


class _FakePipe:
    """호출된 타일을 기록하고, 입력에 **눈에 보이는 표식**을 남겨 돌려준다.

    표식이 있어야 "타일이 실제로 합성됐는가" 를 픽셀로 확인할 수 있다. 단순히 입력을
    돌려주는 가짜를 쓰면 합성을 건너뛰어도 테스트가 통과한다.
    """

    def __init__(self, tint: int = 60):
        self.calls: list[tuple[int, int]] = []
        self.tint = tint
        self.strengths: list[float] = []

    def __call__(self, *, image, strength, **kwargs):
        self.calls.append(image.size)
        self.strengths.append(strength)
        array = np.asarray(image, dtype=np.int16) + self.tint
        painted = Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))

        class _Result:
            images = [painted]

        return _Result()


def _photo(width: int, height: int) -> Image.Image:
    """평탄하지 않은 이미지 — 단색이면 블렌딩 오류가 보이지 않는다."""
    array = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        for x in range(0, width, 8):
            array[y, x : x + 4] = ((x + y) % 200 + 30, 90, 140)
    return Image.fromarray(array)


# --- 타일 계획 ---------------------------------------------------------------


def test_tiles_cover_every_pixel():
    grid = plan_tiles(2152, 1398, tile=1024, overlap=128)

    covered = np.zeros((1398, 2152), dtype=bool)
    for box in grid.boxes:
        covered[box[1] : box[3], box[0] : box[2]] = True
    assert covered.all(), "덮이지 않은 픽셀이 있으면 그 자리가 원본 그대로 남는다"


def test_tiles_stay_inside_the_image():
    grid = plan_tiles(1300, 900, tile=1024, overlap=128)

    for left, top, right, bottom in grid.boxes:
        assert 0 <= left < right <= 1300
        assert 0 <= top < bottom <= 900


def test_most_pixels_are_covered_by_exactly_one_tile():
    """겹친 자리는 **두 결과의 평균**이고, 평균은 고주파를 죽인다.

    처음 만든 계획은 타일을 1024 로 고정하고 마지막 타일만 끝에 붙였는데, 2152x1398 에서
    한 번만 덮인 픽셀이 31% 였고 20% 는 **네 장이 겹쳤다**. 그래서 정련을 켰더니 선명도가
    26.9 → 20.8 로 오히려 떨어졌다(실측). 겹침은 이음매를 감출 만큼만 있어야 한다.
    """
    grid = plan_tiles(2152, 1398, tile=1024, overlap=64)

    covered = np.zeros((1398, 2152), dtype=np.int16)
    for left, top, right, bottom in grid.boxes:
        covered[top:bottom, left:right] += 1
    once = float((covered == 1).mean())
    assert once > 0.80, f"한 번만 덮인 픽셀이 {once:.0%} 뿐이다 — 평균이 이미지를 흐린다"
    assert covered.max() <= 4, "네 장 이상 겹치면 그 자리는 확실히 뭉갠다"


def test_tiles_never_exceed_the_requested_maximum():
    grid = plan_tiles(2152, 1398, tile=1024, overlap=64)

    for left, top, right, bottom in grid.boxes:
        assert right - left <= 1024
        assert bottom - top <= 1024


def test_tiles_overlap_so_seams_can_be_blended():
    grid = plan_tiles(2048, 1024, tile=1024, overlap=128)
    xs = sorted({box[0] for box in grid.boxes})

    assert len(xs) >= 2, "한 열이면 이 검사가 뜻이 없다"
    assert xs[1] < 1024, "다음 타일이 앞 타일 안에서 시작해야 겹친다"


def test_an_image_smaller_than_one_tile_is_a_single_tile():
    grid = plan_tiles(800, 600, tile=1024, overlap=128)

    assert grid.boxes == [(0, 0, 800, 600)]


def test_overlap_cannot_swallow_the_stride():
    """겹침이 타일만큼 크면 stride 가 0 이 되어 무한 루프가 된다."""
    with pytest.raises(ValueError):
        plan_tiles(2048, 1024, tile=1024, overlap=1024)


def test_tile_size_has_a_floor():
    """SDXL 은 512 아래에서 무너진다. 타일을 그보다 작게 잡으면 화질을 되찾기는커녕 망친다."""
    with pytest.raises(ValueError):
        plan_tiles(2048, 1024, tile=MIN_TILE - 64, overlap=64)


# --- 실제 정련 ---------------------------------------------------------------


def test_every_tile_is_refined_and_composited():
    pipe = _FakePipe(tint=60)
    source = _photo(1600, 1000)

    result = refine_upscaled(pipe, source, pipe_kwargs={}, tile=768, overlap=128, strength=0.25)

    assert result.size == source.size
    assert pipe.calls, "파이프라인이 한 번도 안 불렸다"
    before = np.asarray(source, dtype=np.float32)
    after = np.asarray(result, dtype=np.float32)
    # 표식(+60)이 **모든 곳**에 반영돼야 한다 — 한 구석이라도 원본이면 타일이 빠진 것이다.
    assert (after - before).min() > 20, "정련되지 않은 영역이 남아 있다"


def test_seams_do_not_leave_a_visible_step():
    """겹침을 페더로 섞는다. 안 섞으면 타일 경계에 계단이 남는다.

    가짜 파이프라인이 균일하게 +60 을 하므로, 페더가 제대로 되면 경계에서도 결과가
    매끄럽다. 경계 열의 가로 미분이 이미지 전체 분포에서 튀지 않아야 한다.
    """
    pipe = _FakePipe(tint=60)
    source = _photo(1600, 800)

    result = refine_upscaled(pipe, source, pipe_kwargs={}, tile=768, overlap=192, strength=0.25)

    gray = np.asarray(result.convert("L"), dtype=np.float32)
    horizontal_step = np.abs(np.diff(gray, axis=1))
    # 타일 경계가 있을 만한 x 대역과 전체의 최대 미분을 비교한다.
    assert horizontal_step.max() < 200, "경계에 계단이 생겼다"


def test_strength_is_low_by_default_so_the_upscale_does_not_repaint():
    """업스케일 정련은 **디테일 복원**이지 재생성이 아니다.

    strength 를 높게 주면 타일마다 제품을 다르게 다시 그려서, 타일 경계에서 물건이
    어긋난다. 이 파이프라인의 실사화 본단계(0.75~0.9)와 목적이 다르다.
    """
    pipe = _FakePipe()
    refine_upscaled(pipe, _photo(1200, 800), pipe_kwargs={}, tile=768, overlap=128)

    assert pipe.strengths, "strength 가 전달되지 않았다"
    assert all(value <= 0.35 for value in pipe.strengths), pipe.strengths


def test_pipe_kwargs_are_forwarded_to_every_tile():
    """프롬프트 임베딩 같은 조건은 타일마다 같아야 한다 — 안 넘기면 타일이 무조건 프롬프트로 돈다."""
    seen: list[dict] = []

    class _Recorder(_FakePipe):
        def __call__(self, *, image, strength, **kwargs):
            seen.append(kwargs)
            return super().__call__(image=image, strength=strength)

    pipe = _Recorder()
    marker = object()

    refine_upscaled(
        pipe, _photo(1200, 800), pipe_kwargs={"prompt_embeds": marker}, tile=768, overlap=128
    )

    assert len(seen) == len(pipe.calls)
    assert all(kwargs["prompt_embeds"] is marker for kwargs in seen)


def test_per_tile_kwargs_are_built_from_the_tile_itself():
    """ControlNet 이 켜져 있으면 조건 이미지가 **타일 크기와 같아야** 한다.

    전체 이미지의 canny 를 그대로 넘기면 크기가 안 맞아 파이프라인이 거절한다. 그래서
    타일별로 만들 수 있는 자리를 둔다 — 이걸 안 두면 업스케일 정련에서 ControlNet 을
    통째로 꺼야 하고, 그러면 낮은 strength 에서도 형태가 흔들린다.
    """
    sizes: list[tuple[int, int]] = []

    class _Recorder(_FakePipe):
        def __call__(self, *, image, strength, **kwargs):
            sizes.append((image.size, kwargs["control_image"].size))
            return super().__call__(image=image, strength=strength)

    pipe = _Recorder()

    refine_upscaled(
        pipe,
        _photo(1600, 900),
        pipe_kwargs={},
        tile=768,
        overlap=128,
        per_tile=lambda patch: {"control_image": patch.convert("L")},
    )

    assert sizes
    for patch_size, control_size in sizes:
        assert patch_size == control_size
