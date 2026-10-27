"""입력 검증·스키마·strength 매핑 (설계서 §12, §18.1)."""

from __future__ import annotations

import pytest
from PIL import Image
from pydantic import ValidationError

from app.core.config import STRENGTH_PRESETS
from app.core.errors import ErrorCode, WorkerError
from app.generation import sizing
from app.generation.image_preprocessor import prepare
from app.generation.schemas import GenerationRequest
from tests.conftest import make_capture


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate({"jobId": "unit-002", **overrides})


# --- strength (새 지시문 §5) ---------------------------------------------
# 값 정책 자체는 tests/unit/test_profiles_and_strength.py 에서 자세히 검증한다.


def test_strength_preset_mapping(settings):
    assert STRENGTH_PRESETS == {"PRESERVE": 0.25, "BALANCED": 0.35, "REALISTIC": 0.45}
    assert _request(strengthPreset="PRESERVE").resolve_strength(settings) == 0.25
    assert _request().resolve_strength(settings) == 0.35  # 기본 운영값은 BALANCED
    assert _request(strengthPreset="REALISTIC").resolve_strength(settings) == 0.45


def test_arbitrary_strength_values_are_rejected():
    with pytest.raises(ValidationError):
        _request(strengthPreset="0.9")
    with pytest.raises(ValidationError):
        _request(strength=0.5)  # 허용 목록에 없는 값


# --- jobId 안전성 ---------------------------------------------------------


@pytest.mark.parametrize(
    "job_id",
    ["../escape", "a/b", "a\\b", "CON", "nul", "", "with space", "x" * 65, ".hidden"],
)
def test_unsafe_job_ids_are_rejected(job_id):
    with pytest.raises(ValidationError):
        GenerationRequest.model_validate({"jobId": job_id})


@pytest.mark.parametrize("job_id", ["local-test-001", "job.1", "A_b-9"])
def test_safe_job_ids_pass(job_id):
    assert GenerationRequest.model_validate({"jobId": job_id}).job_id == job_id


def test_unknown_fields_are_rejected():
    with pytest.raises(ValidationError):
        GenerationRequest.model_validate({"jobId": "ok", "unexpected": 1})


# --- 입력 이미지 ---------------------------------------------------------


def test_exact_capture_size_passes(settings, capture_image):
    prepared = prepare(capture_image, settings)
    assert prepared.size == sizing.compute_generation_size(capture_image.size, settings)
    assert prepared.mode == "RGB"


def test_same_ratio_different_size_is_resized(settings):
    """입력이 예산보다 크면 예산 안의 크기로 줄여 넣는다.

    기대값을 리터럴로 적지 않는다 — `generation_pixel_budget` 은 튜닝 대상이고
    (2026-08-02 에 1.18M → 2.36M) 리터럴로 박아 두면 예산을 올릴 때마다 깨진다.
    여기서 지키는 성질은 "비율은 유지, 픽셀 수는 예산 안" 이다.
    """
    source = make_capture(2304, 2048)
    prepared = prepare(source, settings)
    assert prepared.size == sizing.compute_generation_size(source.size, settings)
    assert prepared.width * prepared.height <= settings.generation_pixel_budget
    assert prepared.size != source.size, "예산보다 큰 입력인데 줄지 않았다"
    ratio_drift = abs(prepared.width / prepared.height - 2304 / 2048) / (2304 / 2048)
    assert ratio_drift <= settings.size_ratio_tolerance


def test_any_ratio_is_accepted_in_follow_input_mode(settings):
    """출력이 입력 크기를 따르므로 비율을 거부하지 않는다."""
    assert settings.size_mode == "follow_input"
    prepared = prepare(make_capture(1024, 1024), settings)
    # 정사각 입력이면 생성도 정사각이다.
    assert prepared.width == prepared.height


def test_portrait_input_keeps_its_ratio(settings):
    """실제 시뮬레이터 캡처(세로형)가 거부되지 않고 비율이 유지되어야 한다."""
    prepared = prepare(make_capture(1125, 1449), settings)
    input_ratio = 1125 / 1449
    drift = abs(prepared.width / prepared.height - input_ratio) / input_ratio
    assert drift < 0.02, (prepared.size, drift)
    # 픽셀 예산을 넘지 않는다.
    assert prepared.width * prepared.height <= settings.generation_pixel_budget


def test_wrong_ratio_is_rejected_in_fixed_mode(settings):
    """구 규격(fixed)에서는 여전히 비율이 다르면 거부한다 — 자동 crop 을 하지 않기 때문."""
    fixed = settings.model_copy(update={"size_mode": "fixed"})
    with pytest.raises(WorkerError) as exc:
        prepare(make_capture(1024, 1024), fixed)
    assert exc.value.code is ErrorCode.INVALID_IMAGE
    assert "aspect ratio" in exc.value.message


def test_too_small_is_rejected(settings):
    with pytest.raises(WorkerError) as exc:
        prepare(make_capture(288, 256), settings)
    assert exc.value.code is ErrorCode.INVALID_IMAGE
    assert "minimum" in exc.value.message


def test_flat_color_capture_is_rejected(settings):
    with pytest.raises(WorkerError) as exc:
        prepare(Image.new("RGB", (1152, 1024), (12, 12, 12)), settings)
    assert exc.value.code is ErrorCode.INVALID_IMAGE


def test_alpha_is_composited_on_white(settings):
    rgba = Image.new("RGBA", (1152, 1024), (255, 0, 0, 0))
    rgba.paste((0, 0, 255, 255), (0, 0, 100, 100))
    prepared = prepare(rgba, settings)
    assert prepared.mode == "RGB"
    assert prepared.getpixel((1000, 1000)) == (255, 255, 255)  # 투명 → 흰 배경
    assert prepared.getpixel((10, 10)) == (0, 0, 255)
