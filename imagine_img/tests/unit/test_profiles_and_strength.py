"""모델 프로필과 strength 정책 (새 지시문 §3, §5)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import MAX_ALLOWED_STRENGTH, STRENGTH_PRESETS, Settings
from app.core.errors import ConfigurationError
from app.generation.generator import resolve_steps
from app.generation.schemas import GenerationRequest
from app.models.profiles import PROFILES, get_profile


def _request(**overrides) -> GenerationRequest:
    return GenerationRequest.model_validate({"jobId": "unit-002", **overrides})


# --- §5 strength 정책 ----------------------------------------------------


def test_allowed_strength_values():
    assert STRENGTH_PRESETS == {"PRESERVE": 0.25, "BALANCED": 0.35, "REALISTIC": 0.45}
    assert MAX_ALLOWED_STRENGTH == 0.45


def test_default_is_035(settings):
    assert settings.resolved_strength == 0.35
    assert settings.default_strength_preset == "BALANCED"
    assert _request().resolve_strength(settings) == 0.35


@pytest.mark.parametrize("value", [0.5, 0.3, 0.0, 1.0, 0.55])
def test_values_outside_every_allowed_list_are_rejected(value):
    """허용 목록에 없는 값은 스키마에서 거부된다."""
    with pytest.raises(ValidationError):
        _request(strength=value)


@pytest.mark.parametrize("value", [0.6, 0.75, 0.9])
def test_controlnet_strengths_pass_the_schema_but_need_controlnet(value, settings):
    """0.5 초과 값은 스키마는 통과하고, ControlNet 이 꺼져 있으면 생성 시점에 거부된다.

    §5 의 "0.5 이상은 기본 UI 에서 제공하지 않는다" 는 이렇게 지켜진다 —
    ControlNet 이 구조를 고정할 때만 상한이 올라간다.
    """
    request = _request(strength=value)  # 스키마 통과
    assert request.strength == value
    assert settings.enable_controlnet is False
    assert value > settings.max_strength  # 기본 모드에서는 상한 초과

    with_cn = settings.model_copy(update={"enable_controlnet": True})
    assert value <= with_cn.max_strength  # ControlNet 모드에서는 허용


@pytest.mark.parametrize("value", [0.25, 0.35, 0.45])
def test_allowed_values_pass(value, settings):
    assert _request(strength=value).resolve_strength(settings) == value


def test_strength_and_preset_must_agree():
    with pytest.raises(ValidationError):
        _request(strength=0.25, strengthPreset="REALISTIC")
    # 일치하면 통과한다
    assert _request(strength=0.45, strengthPreset="REALISTIC").strength == 0.45


def test_out_of_policy_settings_default_fails_fast(settings):
    broken = settings.model_copy(update={"img2img_strength": 0.55})
    with pytest.raises(ConfigurationError):
        broken.default_strength_preset


def test_controlnet_mode_defaults(settings):
    """ControlNet 을 켜면 기본 strength 와 상한이 함께 올라간다."""
    cn = settings.model_copy(update={"enable_controlnet": True})
    assert cn.resolved_strength == 0.75
    assert cn.default_strength_preset == "CN_BALANCED"
    assert cn.max_strength == 0.9
    # 꺼져 있으면 §5 정책 그대로
    assert settings.resolved_strength == 0.35
    assert settings.max_strength == 0.45


# --- §17 비교군이 실제로 구별되는가 --------------------------------------


def test_three_strengths_are_distinguishable_at_the_default_steps(settings):
    """steps=9 에서 0.25/0.35/0.45 가 2/3/4 step 으로 갈라져야 한다.

    steps=4 였다면 세 값 모두 1 step 이 되어 픽셀 단위로 동일한 이미지가 나온다
    (DESIGN_GAP_REPORT P2-3 에서 실측 확인).
    """
    assert settings.resolved_steps == 9
    effective = [resolve_steps(settings, s)[1] for s in (0.25, 0.35, 0.45)]
    assert effective == [2, 3, 4]
    assert len(set(effective)) == 3


def test_four_steps_would_collapse_the_comparison(settings):
    """회귀 방지: steps 를 4로 되돌리면 비교가 무의미해진다는 사실을 고정한다."""
    four = settings.model_copy(update={"inference_steps": 4})
    effective = [resolve_steps(four, s)[1] for s in (0.25, 0.35, 0.45)]
    assert effective == [1, 1, 1]
    assert len(set(effective)) == 1


# --- §3 모델 프로필 ------------------------------------------------------


def test_default_profile_is_lightning(settings):
    assert settings.model_profile == "sdxl_lightning"
    profile = settings.profile
    assert profile.steps == 9
    assert profile.guidance_scale == 0.0
    assert profile.supports_negative_prompt is False
    assert settings.supports_negative_prompt is False


def test_photoreal_profile_supports_negative_prompt():
    profile = get_profile("sdxl_photoreal")
    assert profile.guidance_scale > 1.0
    assert profile.supports_negative_prompt is True
    assert profile.enabled_by_default is False


def test_unknown_profile_is_rejected():
    with pytest.raises(ConfigurationError):
        get_profile("stable-diffusion-9000")


def test_profile_without_model_id_fails_fast(settings):
    """검증되지 않은 모델을 자동 다운로드하지 않는다 (§21).

    sdxl_photoreal 은 검증을 마쳐 기본 ID 가 들어갔으므로, 아직 비어 있는
    sdxl_juggernaut 로 이 규칙을 확인한다.
    """
    selected = settings.model_copy(update={"model_profile": "sdxl_juggernaut"})
    with pytest.raises(ConfigurationError) as exc:
        selected.resolved_model_id
    assert "SDXL_JUGGERNAUT_MODEL_ID" in str(exc.value)


def test_photoreal_model_id_can_be_cleared(settings):
    """기본 ID 를 비우면 다시 fail-fast 로 돌아온다."""
    selected = settings.model_copy(
        update={"model_profile": "sdxl_photoreal", "sdxl_photoreal_model_id": ""}
    )
    with pytest.raises(ConfigurationError):
        selected.resolved_model_id


def test_photoreal_profile_with_model_id_resolves(settings):
    selected = settings.model_copy(
        update={"model_profile": "sdxl_photoreal", "sdxl_photoreal_model_id": "SG161222/RealVisXL_V5.0"}
    )
    assert selected.resolved_model_id == "SG161222/RealVisXL_V5.0"
    # 기대값을 리터럴로 적지 않는다 — steps 는 튜닝 대상이고(2026-08-03: 16 → 30) 리터럴이면
    # 프로필을 손볼 때마다 깨진다. 여기서 지키는 성질은 "요청이 없으면 프로필 값을 쓴다" 다.
    assert selected.resolved_steps == get_profile("sdxl_photoreal").steps
    assert selected.inference_steps is None, "요청 override 가 없어야 프로필 값이 쓰인다"
    assert selected.profile.scheduler == "dpmpp_2m_karras"
    assert selected.supports_negative_prompt is True


def test_env_override_beats_the_profile(settings):
    overridden = settings.model_copy(update={"inference_steps": 12, "guidance_scale": 2.0})
    assert overridden.resolved_steps == 12
    assert overridden.resolved_guidance_scale == 2.0
    assert overridden.supports_negative_prompt is True


def test_all_profiles_declare_the_policy_strengths():
    for profile in PROFILES.values():
        assert set(profile.strengths) == set(STRENGTH_PRESETS.values())


def test_lightning_keeps_euler_trailing_and_others_do_not():
    """Lightning 의 공식 조건을 다른 모델에 강제하지 않는다."""
    assert get_profile("sdxl_lightning").scheduler == "euler_trailing"
    for name in ("sdxl_photoreal", "sdxl_juggernaut"):
        assert get_profile(name).scheduler != "euler_trailing"


def test_cfg_profiles_support_negative_prompt_and_lightning_does_not():
    assert get_profile("sdxl_lightning").supports_negative_prompt is False
    for name in ("sdxl_photoreal", "sdxl_juggernaut"):
        assert get_profile(name).supports_negative_prompt is True


def test_default_checkpoint_is_the_8step_unet(settings):
    """steps=9 는 8-step checkpoint 와 짝을 맞춘 값이다."""
    assert settings.lightning_checkpoint == "sdxl_lightning_8step_unet.safetensors"
